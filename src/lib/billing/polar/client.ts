import 'server-only';
import { Polar } from '@polar-sh/sdk';
import { env } from '@/lib/env';
import { ExternalServiceError } from '@/lib/errors';

/**
 * Lazy Polar SDK singleton. Mirrors `getStripe()` from the Stripe side
 * — env validation is soft so importing this module without the access
 * token configured doesn't crash; only first use throws.
 */
let _client: Polar | null = null;

export function getPolar(): Polar {
  if (_client) return _client;
  if (!env.POLAR_ACCESS_TOKEN) {
    throw new ExternalServiceError(
      'Polar',
      'POLAR_ACCESS_TOKEN is not configured',
      'Billing is not configured. Please contact support.',
    );
  }
  _client = new Polar({
    accessToken: env.POLAR_ACCESS_TOKEN,
    // `env.POLAR_SERVER` is validated as 'sandbox' | 'production' upstream.
    server: env.POLAR_SERVER,
  });
  return _client;
}

export async function withPolar<T>(
  action: string,
  fn: (polar: Polar) => Promise<T>,
): Promise<T> {
  try {
    return await fn(getPolar());
  } catch (e) {
    if (e instanceof ExternalServiceError) throw e;
    throw new ExternalServiceError(
      'Polar',
      e instanceof Error ? `${action}: ${e.message}` : `${action}: unknown error`,
      'Polar request failed. Please try again.',
    );
  }
}
