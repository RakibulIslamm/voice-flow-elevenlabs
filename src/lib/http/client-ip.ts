import 'server-only';
import type { NextRequest } from 'next/server';

/**
 * Best-effort client-IP extraction for public API routes.
 *
 * Reads the standard reverse-proxy headers (Vercel, Cloudflare, AWS ALB
 * all set `x-forwarded-for`); returns the literal string `'unknown'`
 * when no header is present, so callers that key a rate-limiter on
 * the result don't accidentally use an empty string for every request.
 *
 * Do NOT use this value for trust decisions — `x-forwarded-for` is
 * client-settable when the request doesn't pass through a trusted
 * proxy. Rate limiting and observability only.
 */
export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    // First entry is the original client; subsequent entries are each
    // intermediate proxy. Trim because some proxies pad with spaces.
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const xreal = req.headers.get('x-real-ip');
  if (xreal) return xreal.trim();
  return 'unknown';
}
