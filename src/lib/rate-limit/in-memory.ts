import 'server-only';

/**
 * Tiny in-memory rate limiter for the widget init endpoint.
 *
 * Scope: single Node process. Multi-instance deployments will see each
 * pod enforce its own limit independently — fine for MVP since the
 * cost of letting a determined attacker through is just "burn a few
 * extra ElevenLabs-key seconds" rather than account takeover.
 *
 * Phase 14 swaps in Upstash Redis behind the same interface.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Lazy sweep to keep the Map from leaking unbounded keys under heavy
// abuse. Runs at most every 10 minutes and only walks the Map once per
// pass — cheap even at 100k keys.
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 10 * 60_000;

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Returns `{ allowed: false }` if `key` has exceeded `max` hits inside
 * the current `windowMs`. Each call counts; rejected calls also count
 * (so an attacker pounding the endpoint stays rejected through the
 * whole window rather than being un-rate-limited after a reset).
 */
export function rateLimit(
  key: string,
  opts: { max: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const next: Bucket = { count: 1, resetAt: now + opts.windowMs };
    buckets.set(key, next);
    return { allowed: true, remaining: opts.max - 1, resetAt: next.resetAt };
  }

  existing.count += 1;
  const remaining = Math.max(0, opts.max - existing.count);
  return {
    allowed: existing.count <= opts.max,
    remaining,
    resetAt: existing.resetAt,
  };
}

/**
 * Resets a key — useful for tests. Not used in production code paths.
 */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
