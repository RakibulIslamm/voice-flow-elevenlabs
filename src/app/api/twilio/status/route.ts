import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { connectDb } from '@/lib/db/connect';
import { Call, type CallStatus } from '@/lib/db/models/call';
import { Agent } from '@/lib/db/models/agent';
import { getUserTwilioCreds, validateTwilioSignature } from '@/lib/twilio/user-client';
import { logError } from '@/lib/tracking/log-error';
import { trackEvent } from '@/lib/tracking/event';

/**
 * Twilio status-callback webhook. Twilio POSTs here on every state
 * transition for an inbound call: `ringing → in-progress → completed`
 * is the happy path; `failed | busy | no-answer | canceled` are the
 * sad ones.
 *
 * We use it to:
 *   - mark `status='completed'` + write `endedAt` + `durationSeconds`
 *     so the call detail page shows the right outcome
 *   - mark `status='failed'` / `'abandoned'` on the sad-path states so
 *     the dashboard's per-status tabs are accurate
 *
 * Signature verification uses the same per-user authToken as the
 * incoming webhook. We discover the user via the Agent → callerInfo
 * round-trip (the status callback doesn't carry `agentId` in the URL).
 */
export async function POST(req: NextRequest): Promise<Response> {
  let params: Record<string, string>;
  try {
    const form = await req.formData();
    params = formDataToParams(form);
  } catch (e) {
    void logError(e, { scope: 'twilio-status', stage: 'parse-body' });
    return new NextResponse('', { status: 400 });
  }

  const callSid = params.CallSid;
  if (!callSid) {
    return new NextResponse('', { status: 400 });
  }

  await connectDb();

  // Find the Call doc by Twilio CallSid. We may also see a status update
  // for a call we never created (e.g. an unavailable response from the
  // incoming webhook) — in that case just 204 and move on.
  const call = await Call.findOne({ externalCallId: callSid });
  if (!call) {
    return new NextResponse('', { status: 204 });
  }

  // Look up the owning user via the agent so we can decrypt their authToken.
  const agent = await Agent.findById(call.agentId).select('userId');
  if (!agent) {
    return new NextResponse('', { status: 204 });
  }

  let creds: { accountSid: string; authToken: string };
  try {
    creds = await getUserTwilioCreds(agent.userId.toString());
  } catch (e) {
    void logError(e, { scope: 'twilio-status', stage: 'load-creds', callSid });
    return new NextResponse('', { status: 500 });
  }

  const signature =
    req.headers.get('x-twilio-signature') ?? req.headers.get('twilio-signature');
  const valid = validateTwilioSignature({
    authToken: creds.authToken,
    signatureHeader: signature,
    url: req.url,
    params,
  });
  if (!valid) {
    void logError(new Error('Twilio status signature verification failed'), {
      scope: 'twilio-status',
      stage: 'verify-signature',
      callSid,
    });
    return new NextResponse('', { status: 403 });
  }

  const callStatus = (params.CallStatus ?? '').toLowerCase();
  const next = mapTwilioStatus(callStatus);
  if (!next) {
    // States we don't act on (e.g. 'queued', 'initiated', 'ringing').
    return new NextResponse('', { status: 204 });
  }

  // Twilio sends CallDuration on terminal events. It's a string with
  // integer seconds — parse defensively.
  const durationSeconds = parseInt(params.CallDuration ?? '', 10);
  const endedAt = new Date();

  call.status = next.status;
  if (next.outcome) call.outcome = next.outcome;
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
    call.durationSeconds = durationSeconds;
  }
  call.endedAt = endedAt;
  await call.save();

  void trackEvent('call.phone_status', {
    userId: agent.userId.toString(),
    agentId: agent._id.toString(),
    callId: call._id.toString(),
    properties: { twilioStatus: callStatus, mappedStatus: next.status },
  });

  return new NextResponse('', { status: 204 });
}

/**
 * Translates Twilio's CallStatus values into our internal Call.status.
 * Returns null for non-terminal events we don't persist (so the handler
 * can short-circuit).
 *
 * `completed`: the call finished normally — was answered + hung up.
 * `failed`: a technical problem — Twilio couldn't connect the leg.
 * `busy` / `no-answer` / `canceled`: caller-side reasons → abandoned.
 */
function mapTwilioStatus(
  raw: string,
): { status: CallStatus; outcome?: string } | null {
  switch (raw) {
    case 'completed':
      return { status: 'completed' };
    case 'failed':
      return { status: 'failed', outcome: 'twilio_failed' };
    case 'busy':
      return { status: 'abandoned', outcome: 'busy' };
    case 'no-answer':
      return { status: 'abandoned', outcome: 'no_answer' };
    case 'canceled':
      return { status: 'abandoned', outcome: 'canceled' };
    default:
      return null;
  }
}

function formDataToParams(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}
