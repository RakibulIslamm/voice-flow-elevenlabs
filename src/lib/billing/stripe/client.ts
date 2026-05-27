import 'server-only';
import Stripe from 'stripe';
import { env } from '@/lib/env';
import { ExternalServiceError } from '@/lib/errors';

/**
 * Process-wide Stripe singleton. We instantiate lazily on first use so
 * importing this module from a server bundle without `STRIPE_SECRET_KEY`
 * configured doesn't crash (env validation is soft — features fail at use
 * site instead). Latest API version is pinned via the SDK default so
 * we ride along with the version Stripe ships with the SDK release.
 */
let _client: Stripe | null = null;

export function getStripe(): Stripe {
  if (_client) return _client;
  if (!env.STRIPE_SECRET_KEY) {
    throw new ExternalServiceError(
      'Stripe',
      'STRIPE_SECRET_KEY is not configured',
      'Billing is not configured. Please contact support.',
    );
  }
  _client = new Stripe(env.STRIPE_SECRET_KEY, {
    typescript: true,
  });
  return _client;
}

/**
 * Wraps an arbitrary Stripe call so the rest of the app never sees raw
 * Stripe SDK errors leaking to logs / UI. The action-specific message
 * goes to dev mode + the ErrorLog; user-facing copy stays curated.
 */
export async function withStripe<T>(
  action: string,
  fn: (stripe: Stripe) => Promise<T>,
): Promise<T> {
  try {
    return await fn(getStripe());
  } catch (e) {
    if (e instanceof ExternalServiceError) throw e;
    throw new ExternalServiceError(
      'Stripe',
      e instanceof Error ? `${action}: ${e.message}` : `${action}: unknown error`,
      'Stripe request failed. Please try again.',
    );
  }
}
