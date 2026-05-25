import 'server-only';
import { env } from '@/lib/env';
import { verifyHmac } from '@/lib/hmac';

/**
 * Verifies an HMAC-SHA256 signature attached by ElevenLabs to a post-call
 * webhook. The platform-wide `ELEVENLABS_WEBHOOK_SECRET` is configured by
 * every user in their ElevenLabs account during onboarding — so a single
 * secret verifies webhooks regardless of which user the agent belongs to.
 *
 * Returns a boolean (callers decide the response — typically a 401).
 *
 * The `signature` header value MAY be wrapped (e.g. "sha256=...", "t=...,v1=...");
 * we strip common prefixes before timing-safe compare. If your ElevenLabs
 * webhook payload format adds a new wrapper, extend `extractSignature()`.
 */
export function verifyElevenLabsSignature(
  rawBody: string,
  signature: string | null | undefined,
): boolean {
  const secret = env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signature) return false;

  const candidate = extractSignature(signature);
  if (!candidate) return false;

  return verifyHmac(rawBody, candidate, secret);
}

/**
 * Pulls a bare hex HMAC out of common signature header formats:
 *   - "abc123..."             (raw)
 *   - "sha256=abc123..."      (Stripe / GitHub style)
 *   - "t=1700000000,v1=abc…"  (timestamped — we take the v1 segment)
 * Returns null if no plausible hex digest is present.
 */
function extractSignature(header: string): string | null {
  const trimmed = header.trim();

  // "sha256=<hex>"
  const eq = trimmed.indexOf('=');
  if (eq !== -1 && !trimmed.includes(',')) {
    const value = trimmed.slice(eq + 1).trim();
    return isHex(value) ? value : null;
  }

  // "t=…,v1=<hex>"
  if (trimmed.includes(',')) {
    for (const part of trimmed.split(',')) {
      const [k, v] = part.split('=', 2);
      if (!k || !v) continue;
      const key = k.trim().toLowerCase();
      const val = v.trim();
      if ((key === 'v1' || key === 'sha256') && isHex(val)) return val;
    }
    return null;
  }

  return isHex(trimmed) ? trimmed : null;
}

function isHex(s: string): boolean {
  return /^[0-9a-f]+$/i.test(s) && s.length >= 32;
}
