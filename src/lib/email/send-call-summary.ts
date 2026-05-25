import 'server-only';
import { render } from '@react-email/render';
import { connectDb } from '@/lib/db/connect';
import { Call } from '@/lib/db/models/call';
import { Agent } from '@/lib/db/models/agent';
import { User } from '@/lib/db/models/user';
import { Capture, type CaptureDoc, type CaptureType } from '@/lib/db/models/capture';
import { env } from '@/lib/env';
import { sendEmail } from './resend';
import { CallSummaryEmail } from './templates/call-summary';
import { trackEvent } from '@/lib/tracking/event';
import { logError } from '@/lib/tracking/log-error';

/**
 * Wraps the post-call email send. Idempotency note: callers should fire
 * this exactly once per call, typically right after `summarizeCall`
 * resolves. Calling twice will deliver the email twice — Resend has no
 * de-dupe at the API level.
 */
export async function sendCallSummary(callId: string): Promise<void> {
  await connectDb();
  const call = await Call.findById(callId).lean();
  if (!call) return;

  // No summary yet — nothing to email. Caller should run summarizeCall
  // first; we don't synthesise one here to keep email and summary
  // generation independently testable.
  if (!call.summary || !call.outcome) return;

  const [agent, user, captures] = await Promise.all([
    Agent.findById(call.agentId)
      .select('name businessName')
      .lean<{ name: string; businessName?: string } | null>(),
    User.findById(call.userId)
      .select('email name')
      .lean<{ email?: string; name?: string } | null>(),
    Capture.find({ callId: call._id })
      .select('type data')
      .lean<Array<Pick<CaptureDoc, 'type' | 'data'>>>(),
  ]);
  if (!agent || !user?.email) return;

  const appUrl = (env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const callerLabel = renderCallerLabel(call);
  const durationLabel = formatDuration(call.durationSeconds);
  const captureRows = (captures ?? []).map((c) => ({
    type: c.type as CaptureType,
    details: renderCaptureDetails(c.type as CaptureType, c.data),
  }));

  const html = await render(
    CallSummaryEmail({
      appUrl,
      agentName: agent.name,
      businessName: agent.businessName ?? '',
      channel: call.channel,
      callerLabel,
      durationLabel,
      outcome: call.outcome,
      summary: call.summary,
      callId: call._id.toString(),
      captures: captureRows,
    }),
  );

  const subject = `[VoiceFlow] Call summary — ${agent.businessName || agent.name} (${durationLabel})`;
  const result = await sendEmail({
    to: user.email,
    subject,
    html,
    text: `${call.outcome}\n\n${call.summary}\n\nFull call: ${appUrl}/dashboard/calls/${call._id}`,
    tags: [
      { name: 'kind', value: 'call-summary' },
      { name: 'channel', value: call.channel },
    ],
  });

  if (result.ok) {
    void trackEvent('email.call_summary.sent', {
      userId: call.userId.toString(),
      agentId: call.agentId.toString(),
      callId: call._id.toString(),
      properties: { resendId: result.id },
    });
  } else {
    void logError(new Error('Call summary email failed'), {
      scope: 'sendCallSummary',
      callId,
      error: result.error,
    });
  }
}

function renderCallerLabel(call: {
  channel: 'browser' | 'phone';
  callerInfo?: unknown;
}): string {
  if (call.channel === 'browser') return 'Web caller';
  const info = call.callerInfo as { phone?: string } | undefined;
  return info?.phone ? `Phone: ${info.phone}` : 'Phone caller';
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds < 1) return '< 1s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function renderCaptureDetails(type: CaptureType, data: unknown): string {
  if (!data || typeof data !== 'object') return '—';
  const d = data as Record<string, unknown>;
  switch (type) {
    case 'appointment':
      return [d.caller_name, d.date, d.time, d.reason ? `(${d.reason})` : null]
        .filter(Boolean)
        .join(' · ');
    case 'reservation':
      return [d.caller_name, d.date, d.time, d.party_size ? `party of ${d.party_size}` : null]
        .filter(Boolean)
        .join(' · ');
    case 'lead':
      return [d.name, d.company, d.email, d.use_case]
        .filter(Boolean)
        .join(' · ');
    case 'callback-request':
      return [d.name, d.phone, d.preferred_time].filter(Boolean).join(' · ');
    default:
      return JSON.stringify(d);
  }
}
