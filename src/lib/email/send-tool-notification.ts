import 'server-only';
import { render } from '@react-email/render';
import { env } from '@/lib/env';
import { sendEmail } from './resend';
import {
  ToolNotificationEmail,
  type ToolNotificationKind,
} from './templates/tool-notification';
import { trackEvent } from '@/lib/tracking/event';

export type ToolEmailContext = {
  kind: ToolNotificationKind;
  to: string;
  agentName: string;
  businessName: string;
  callId: string;
  userId: string;
  agentId: string;
  rows: Array<{ label: string; value: string }>;
  urgent?: boolean;
};

/**
 * Per-tool inbound notification. Used by book_appointment,
 * book_reservation, log_lead, and transfer_to_human handlers.
 */
export async function sendToolNotification(ctx: ToolEmailContext): Promise<void> {
  const appUrl = (env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const html = await render(
    ToolNotificationEmail({
      appUrl,
      kind: ctx.kind,
      agentName: ctx.agentName,
      businessName: ctx.businessName,
      callId: ctx.callId,
      rows: ctx.rows,
      urgent: ctx.urgent,
    }),
  );

  const subjectPrefix = ctx.urgent ? '[VoiceFlow] URGENT' : '[VoiceFlow]';
  const subject =
    ctx.kind === 'transfer'
      ? `${subjectPrefix} Call transfer requested — ${ctx.businessName || ctx.agentName}`
      : `${subjectPrefix} New ${ctx.kind} — ${ctx.businessName || ctx.agentName}`;

  const text = ctx.rows.map((r) => `${r.label}: ${r.value}`).join('\n');

  const result = await sendEmail({
    to: ctx.to,
    subject,
    html,
    text: `${text}\n\nFull call: ${appUrl}/dashboard/calls/${ctx.callId}`,
    tags: [
      { name: 'kind', value: `tool-${ctx.kind}` },
      { name: 'urgent', value: ctx.urgent ? 'true' : 'false' },
    ],
  });

  void trackEvent(`email.${ctx.kind}.${result.ok ? 'sent' : 'failed'}`, {
    userId: ctx.userId,
    agentId: ctx.agentId,
    callId: ctx.callId,
    properties: result.ok ? { resendId: result.id } : { error: result.error },
  });
}
