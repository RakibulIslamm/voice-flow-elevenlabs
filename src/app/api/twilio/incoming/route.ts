import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { connectDb } from '@/lib/db/connect';
import { Agent } from '@/lib/db/models/agent';
import { User, type UserDoc } from '@/lib/db/models/user';
import { Call } from '@/lib/db/models/call';
import { getSignedConversationUrl } from '@/lib/elevenlabs/agents';
import { getUserTwilioCreds, validateTwilioSignature } from '@/lib/twilio/user-client';
import {
  buildBridgeToElevenLabsTwiml,
  buildUnavailableTwiml,
} from '@/lib/twilio/twiml';
import { logError } from '@/lib/tracking/log-error';
import { trackEvent } from '@/lib/tracking/event';

/**
 * Twilio inbound voice webhook.
 *
 * Flow:
 *   1. Parse the form-encoded body Twilio always POSTs.
 *   2. Read `?agentId={our internal id}` from the URL — that's how we
 *      route a number to the right agent without trusting any field
 *      Twilio sends.
 *   3. Look up the agent + owner; verify the request's HMAC against the
 *      owner's stored Twilio authToken. On any failure, return 403 with
 *      empty body — Twilio retries are NOT useful here.
 *   4. If the agent isn't active, the user disconnected ElevenLabs, or
 *      phone isn't enabled — return graceful TwiML that plays a brief
 *      "unavailable" message and hangs up. We do NOT create a Call doc
 *      in that case because nothing actually happens.
 *   5. Otherwise: create the Call doc, mint a signed ElevenLabs phone
 *      URL, and return TwiML that bridges via `<Connect><Stream>`.
 *
 * Returns `Content-Type: text/xml` as Twilio expects.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const agentId = url.searchParams.get('agentId');
  if (!agentId || !Types.ObjectId.isValid(agentId)) {
    return xmlResponse(buildUnavailableTwiml('This number is not configured.'), 200);
  }

  // Twilio sends application/x-www-form-urlencoded — pull all params
  // into a plain Record<string,string> so we can both feed them to the
  // signature validator AND extract Caller / CallSid for our Call doc.
  let params: Record<string, string>;
  try {
    const form = await req.formData();
    params = formDataToParams(form);
  } catch (e) {
    void logError(e, { scope: 'twilio-incoming', stage: 'parse-body', agentId });
    return xmlResponse(buildUnavailableTwiml(), 200);
  }

  await connectDb();

  // Load agent + user in one trip.
  const agent = await Agent.findById(agentId);
  if (!agent) {
    return xmlResponse(buildUnavailableTwiml('This agent is no longer available.'), 200);
  }

  let creds: { accountSid: string; authToken: string };
  try {
    creds = await getUserTwilioCreds(agent.userId.toString());
  } catch (e) {
    void logError(e, {
      scope: 'twilio-incoming',
      stage: 'load-creds',
      agentId,
    });
    return xmlResponse(buildUnavailableTwiml(), 200);
  }

  // Signature verification — Twilio signs over the full URL incl. query
  // string and all form params. Our `req.url` already includes the
  // agentId query param, so we pass it through verbatim.
  const signature =
    req.headers.get('x-twilio-signature') ?? req.headers.get('twilio-signature');
  const valid = validateTwilioSignature({
    authToken: creds.authToken,
    signatureHeader: signature,
    url: req.url,
    params,
  });
  if (!valid) {
    void logError(new Error('Twilio signature verification failed'), {
      scope: 'twilio-incoming',
      stage: 'verify-signature',
      agentId,
    });
    // 403 with empty body — Twilio surfaces this to the caller as a
    // generic failure and stops retrying.
    return new NextResponse('', { status: 403 });
  }

  // Owner sanity check (rare race — agent.userId is part of the doc we
  // loaded, but creds came from User.findById internally).
  const user = await User.findById(agent.userId)
    .select('plan integrations.elevenlabs.enabled integrations.twilio.enabled')
    .lean<Pick<UserDoc, '_id' | 'plan'> & {
      integrations?: { elevenlabs?: { enabled?: boolean }; twilio?: { enabled?: boolean } };
    } | null>();

  // Graceful-unavailable conditions. Each emits the same TwiML; the
  // distinct reason goes to ErrorLog for the operator to debug.
  const unavailableReason = pickUnavailableReason(agent, user);
  if (unavailableReason) {
    void trackEvent('call.phone_unavailable', {
      userId: agent.userId.toString(),
      agentId: agent._id.toString(),
      properties: { reason: unavailableReason, callerNumber: params.From },
    });
    return xmlResponse(buildUnavailableTwiml(), 200);
  }

  const callSid = params.CallSid;
  const from = params.From;
  const to = params.To;

  // Mint the bridge URL FIRST so we don't create a Call record that ends
  // up orphaned if ElevenLabs is unreachable.
  if (!agent.elevenLabsPhoneAgentId) {
    void logError(new Error('Phone-enabled agent missing elevenLabsPhoneAgentId'), {
      scope: 'twilio-incoming',
      stage: 'no-phone-agent-id',
      agentId,
    });
    return xmlResponse(buildUnavailableTwiml(), 200);
  }

  let signedUrl: string;
  try {
    const res = await getSignedConversationUrl(
      agent.userId.toString(),
      agent.elevenLabsPhoneAgentId,
    );
    signedUrl = res.signedUrl;
  } catch (e) {
    void logError(e, {
      scope: 'twilio-incoming',
      stage: 'get-signed-url',
      agentId,
    });
    return xmlResponse(buildUnavailableTwiml(), 200);
  }

  // Create the Call doc only after we know the bridge is wired. Don't
  // block on it — `await` keeps the order deterministic but a Mongo
  // hiccup here shouldn't drop the call.
  try {
    await Call.create({
      agentId: agent._id,
      userId: agent.userId,
      channel: 'phone',
      externalCallId: callSid || `pending-${Date.now()}`,
      status: 'in-progress',
      startedAt: new Date(),
      transcript: [],
      toolCalls: [],
      callerInfo: {
        phone: from,
        toNumber: to,
        twilioCallSid: callSid,
      },
    });
  } catch (e) {
    void logError(e, { scope: 'twilio-incoming', stage: 'create-call', agentId, callSid });
    // Continue regardless — bridging the call is more important than
    // logging it. The status webhook will fill gaps.
  }

  void trackEvent('call.phone_started', {
    userId: agent.userId.toString(),
    agentId: agent._id.toString(),
    properties: { callerNumber: from, callSid },
  });

  return xmlResponse(buildBridgeToElevenLabsTwiml(signedUrl), 200);
}

function pickUnavailableReason(
  agent: { status: string; channels?: { phone?: { enabled?: boolean } } },
  user:
    | (Pick<UserDoc, '_id' | 'plan'> & {
        integrations?: { elevenlabs?: { enabled?: boolean }; twilio?: { enabled?: boolean } };
      })
    | null,
): string | null {
  if (!user) return 'OWNER_NOT_FOUND';
  if (agent.status !== 'active') return 'AGENT_NOT_ACTIVE';
  if (!agent.channels?.phone?.enabled) return 'PHONE_NOT_ENABLED';
  if (!user.integrations?.elevenlabs?.enabled) return 'ELEVENLABS_DISCONNECTED';
  if (!user.integrations?.twilio?.enabled) return 'TWILIO_DISCONNECTED';
  return null;
}

function formDataToParams(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

function xmlResponse(body: string, status: number): Response {
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}
