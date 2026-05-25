import 'server-only';
import { verifyHmac } from '@/lib/hmac';

/**
 * Verifies an HMAC-SHA256 signature attached by ElevenLabs to a post-call
 * webhook against a specific user's stored webhook secret.
 *
 * VoiceFlow is BYOK end-to-end. Each user generates a webhook secret in
 * their own ElevenLabs workspace (ElevenLabs creates it server-side; the
 * user can't choose the value) and then pastes that value into VoiceFlow's
 * Integrations page. We store the secret AES-256-GCM-encrypted on the
 * user document and decrypt it inside the webhook handler at request time.
 *
 * The webhook handler is responsible for:
 *   1. Reading the raw body.
 *   2. Extracting the agent_id from the payload.
 *   3. Looking up the agent → owning user → decrypting the user's secret.
 *   4. Passing that secret to this function alongside the signature header.
 *
 * Returns a boolean — callers decide the response (typically 401 on false).
 *
 * The `signature` header value MAY be wrapped (e.g. "sha256=...", "t=...,v1=...");
 * we strip common prefixes before timing-safe compare.
 */
export function verifyElevenLabsSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | null | undefined,
): boolean {
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
