import 'server-only';
import { env } from '@/lib/env';
import { polarProvider } from './polar/provider';
import { stripeProvider } from './stripe/provider';
import type { BillingProvider } from './provider';

export type { BillingProvider, ReconciledSubscription, InvoiceVM, PaidPlanKey } from './provider';

/**
 * Resolves the active billing provider once per call. Stripe is the
 * default; `POLAR_SDK=true` flips the entire app over to Polar without
 * any other config changes.
 *
 * Kept as a function (not a module-level constant) so that test envs
 * can mutate `env.POLAR_SDK` mid-process and the next call picks up the
 * change.
 */
export function getBillingProvider(): BillingProvider {
  return env.POLAR_SDK ? polarProvider : stripeProvider;
}
