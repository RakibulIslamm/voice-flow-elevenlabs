import 'server-only';
import { NextResponse, after, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { Call, type TranscriptTurn } from '@/lib/db/models/call';
import { recordCallUsage } from '@/lib/usage/record-call-usage';
import {
  verifyAndLoadContext,
  type HydratedAgent,
  type HydratedUser,
} from '@/lib/elevenlabs/webhook-context';
import { summarizeCall } from '@/lib/ai/summarize-call';
import { sendCallSummary } from '@/lib/email/send-call-summary';
import { trackEvent } from '@/lib/tracking/event';
import { logError } from '@/lib/tracking/log-error';
import type { Types } from 'mongoose';

// In-process LRU-ish dedupe. ElevenLabs occasionally retries the same
// post-call webhook (network hiccup, slow ack); we hash the raw body
// and skip duplicates that land within ~10 minutes. This is per-process
// — Vercel may spin multiple lambdas, but downstream idempotency (the
// "already summarised" check inside summarizeCall) catches anything
// that slips between processes.
const SEEN_EVENT_HASHES = new Map<string, number>();
const SEEN_TTL_MS = 10 * 60_000;
const SEEN_MAX = 500;

function isDuplicate(hash: string): boolean {
  const now = Date.now();
  // Cheap garbage sweep on every call.
  if (SEEN_EVENT_HASHES.size > SEEN_MAX) {
    for (const [k, t] of SEEN_EVENT_HASHES) {
      if (now - t > SEEN_TTL_MS) SEEN_EVENT_HASHES.delete(k);
    }
  }
  const seenAt = SEEN_EVENT_HASHES.get(hash);
  if (seenAt && now - seenAt < SEEN_TTL_MS) return true;
  SEEN_EVENT_HASHES.set(hash, now);
  return false;
}

export async function POST(req: NextRequest): Promise<Response> {
  const verified = await verifyAndLoadContext(req);
  if (!verified.ok) {
    return NextResponse.json(
      { ok: false, error: { code: verified.code, message: verified.message } },
      { status: verified.status },
    );
  }

  const { ctx } = verified;
  const eventHash = createHash('sha256').update(ctx.rawBody).digest('hex');
  if (isDuplicate(eventHash)) {
    // Acknowledge so ElevenLabs stops retrying, but don't re-process.
    return NextResponse.json({ ok: true, deduped: true });
  }

  const type = pickType(ctx.payload);
  void trackEvent('webhook.received', {
    userId: ctx.user._id.toString(),
    agentId: ctx.agent._id.toString(),
    properties: { type, conversationId: ctx.conversationId },
  });

  try {
    // Post-call payload is the only one ElevenLabs actually delivers
    // today — they bundle the entire conversation into a single event
    // rather than streaming start/message/end. We dispatch by `type`
    // so future event types (e.g. audio uploads) are easy to add.
    if (type === 'post_call_transcription' || type === 'post_call_audio') {
      await handlePostCallTranscription(ctx);
    } else {
      // Unknown event type — log so we notice ElevenLabs adding things
      // we don't yet handle, but still 200 so they don't retry forever.
      void logError(
        new Error('Unrecognised webhook type'),
        { scope: 'elevenlabs-webhook', type, conversationId: ctx.conversationId },
        { severity: 'low' },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    void logError(e, {
      scope: 'elevenlabs-webhook',
      type,
      conversationId: ctx.conversationId,
      userId: ctx.user._id.toString(),
    });
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Webhook handler failed.' } },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Post-call handler
// ---------------------------------------------------------------------------

async function handlePostCallTranscription(ctx: {
  payload: Record<string, unknown>;
  conversationId: string | null;
  agent: HydratedAgent;
  user: HydratedUser;
}): Promise<void> {
  const data = (ctx.payload.data ?? {}) as Record<string, unknown>;
  const conversationId = ctx.conversationId ?? pickString(data, 'conversation_id');
  if (!conversationId) {
    throw new Error('Missing conversation_id in post-call payload.');
  }

  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  const startUnix = pickNumber(meta, 'start_time_unix_secs');
  const durationSec = pickNumber(meta, 'call_duration_secs') ?? pickNumber(meta, 'duration_secs');
  const startedAt = startUnix ? new Date(startUnix * 1000) : undefined;
  const endedAt =
    startedAt && durationSec
      ? new Date(startedAt.getTime() + durationSec * 1000)
      : new Date();

  // 1. Find the matching Call. We first try the canonical lookup by
  //    externalCallId (which the webhook sets on first delivery), then
  //    fall back to the most-recent pending Call for this agent.
  let call =
    (await Call.findOne({ externalCallId: conversationId })) ??
    (await Call.findOne({
      agentId: ctx.agent._id,
      userId: ctx.user._id,
      externalCallId: /^pending-/,
    }).sort({ createdAt: -1 }));

  if (!call) {
    // No matching Call doc — this happens if the webhook beats Phase 10's
    // Call.create() (unlikely but possible). Create one so we don't lose
    // the data; the dashboard list will still surface it.
    call = await Call.create({
      agentId: ctx.agent._id,
      userId: ctx.user._id,
      channel: 'browser',
      externalCallId: conversationId,
      startedAt,
      status: 'in-progress',
    });
  }

  // 2. Idempotency check (defence beyond the body-hash dedupe).
  if (call.status === 'completed' && call.summary) {
    void trackEvent('webhook.duplicate_completed', {
      userId: ctx.user._id.toString(),
      agentId: ctx.agent._id.toString(),
      callId: call._id.toString(),
    });
    return;
  }

  // 3. Merge transcript. The webhook is authoritative, but the client
  //    Phase 10 path may have written partial turns already — we replace
  //    them with the webhook copy since the webhook is source of truth.
  const webhookTranscript = normaliseWebhookTranscript(data.transcript);
  if (webhookTranscript.length > 0) {
    call.transcript = webhookTranscript;
  }

  // 4. Status + timing
  call.externalCallId = conversationId; // upgrade from 'pending-...'
  if (startedAt) call.startedAt = startedAt;
  call.endedAt = endedAt;
  if (durationSec !== null && durationSec !== undefined) {
    call.durationSeconds = durationSec;
  } else if (call.startedAt) {
    call.durationSeconds = Math.round((endedAt.getTime() - call.startedAt.getTime()) / 1000);
  }
  // 'abandoned' wins over 'completed' if we genuinely got nothing.
  call.status = call.transcript.length > 0 ? 'completed' : 'abandoned';

  await call.save();

  // 5. Count this call toward the user's billing period and — if they're
  //    on a paid plan and beyond included quota — fire a Stripe Meter
  //    Event. `callId` doubles as the Stripe idempotency identifier so
  //    a webhook retry never double-bills.
  await recordCallUsage(ctx.user._id.toString(), call._id.toString());

  // 6. Kick off summary + email outside the request lifecycle so the
  //    webhook acks within ElevenLabs's timeout (~5s). `after()` runs
  //    in the same lambda after the response is flushed.
  const callId = call._id.toString();
  after(async () => {
    try {
      const summarised = await summarizeCall(callId);
      if (summarised && summarised.summary) {
        await sendCallSummary(callId);
      }
    } catch (e) {
      void logError(e, { scope: 'post-call-after', callId });
    }
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickType(payload: Record<string, unknown>): string {
  const t = payload.type;
  return typeof t === 'string' ? t : 'unknown';
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function pickNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function normaliseWebhookTranscript(raw: unknown): TranscriptTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: TranscriptTurn[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const role = e.role === 'user' || e.role === 'agent' ? e.role : null;
    const message =
      typeof e.message === 'string'
        ? e.message
        : typeof e.text === 'string'
        ? e.text
        : null;
    if (!role || !message) continue;
    const tSecs = typeof e.time_in_call_secs === 'number' ? e.time_in_call_secs : null;
    out.push({
      role: role === 'agent' ? 'assistant' : 'user',
      content: message,
      timestamp: tSecs !== null ? new Date(Date.now() - tSecs * 1000) : new Date(),
    });
  }
  return out;
}
