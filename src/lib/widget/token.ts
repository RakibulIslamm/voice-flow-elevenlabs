import 'server-only';
import { signHmac, verifyHmac } from '@/lib/hmac';
import { env } from '@/lib/env';

export type WidgetTokenPayload = {
  agentId: string;
  origin: string;
  iat: number;
  exp: number;
};

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Buffer {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function signWidgetToken(
  payload: Pick<WidgetTokenPayload, 'agentId' | 'origin'>,
  expiresInSeconds = 300,
): string {
  const now = Math.floor(Date.now() / 1000);
  const full: WidgetTokenPayload = {
    agentId: payload.agentId,
    origin: payload.origin,
    iat: now,
    exp: now + expiresInSeconds,
  };
  const body = base64UrlEncode(Buffer.from(JSON.stringify(full), 'utf8'));
  const sig = signHmac(body, env.WIDGET_SIGNING_SECRET);
  return `${body}.${sig}`;
}

export function verifyWidgetToken(token: unknown): WidgetTokenPayload | null {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  if (!verifyHmac(body, sig, env.WIDGET_SIGNING_SECRET)) return null;

  let payload: WidgetTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(body).toString('utf8')) as WidgetTokenPayload;
  } catch {
    return null;
  }

  if (
    typeof payload?.agentId !== 'string' ||
    typeof payload?.origin !== 'string' ||
    typeof payload?.iat !== 'number' ||
    typeof payload?.exp !== 'number'
  ) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;

  return payload;
}
