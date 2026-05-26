import 'server-only';
import { Resend } from 'resend';
import { env } from '@/lib/env';
import { logError } from '@/lib/tracking/log-error';

/**
 * Lazy Resend singleton. Soft env validation means AUTH_RESEND_KEY can
 * be unset in dev — we surface a clear failure on first send rather
 * than crashing the whole module import.
 */
let _client: Resend | null = null;

function getClient(): Resend {
  if (_client) return _client;
  if (!env.AUTH_RESEND_KEY) {
    throw new Error('AUTH_RESEND_KEY is not configured. Cannot send email.');
  }
  _client = new Resend(env.AUTH_RESEND_KEY);
  return _client;
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  /** Pre-rendered HTML. Use react-email's `render()` to produce. */
  html?: string;
  /** Plain-text body. Required when `html` is omitted; recommended otherwise. */
  text?: string;
  /** Optional Reply-To. Defaults to `RESEND_FROM_EMAIL`. */
  replyTo?: string;
  /** Optional tags surfaced in Resend dashboard for filtering. */
  tags?: Array<{ name: string; value: string }>;
};

/**
 * Best-effort send. Logs failures via logError and returns
 * `{ ok: false, error }` instead of throwing — callers are typically
 * fire-and-forget paths (post-call summary, tool notifications) where
 * a transient Resend hiccup shouldn't bubble up and kill the request.
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!env.RESEND_FROM_EMAIL) {
    return { ok: false, error: 'RESEND_FROM_EMAIL not configured' };
  }
  if (!input.html && !input.text) {
    return { ok: false, error: 'Either html or text body must be provided' };
  }
  try {
    const client = getClient();
    const res = await client.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: input.to,
      subject: input.subject,
      html: input.html ?? wrapTextAsHtml(input.text ?? ''),
      text: input.text,
      replyTo: input.replyTo,
      tags: input.tags,
    });
    if (res.error) {
      void logError(new Error(res.error.message), {
        scope: 'sendEmail',
        subject: input.subject,
        resendCode: res.error.name,
      });
      return { ok: false, error: res.error.message };
    }
    return { ok: true, id: res.data?.id ?? 'unknown' };
  } catch (e) {
    void logError(e, { scope: 'sendEmail', subject: input.subject });
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}

function wrapTextAsHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<pre style="font-family:ui-sans-serif,system-ui,sans-serif;white-space:pre-wrap;font-size:14px;line-height:1.5;">${escaped}</pre>`;
}
