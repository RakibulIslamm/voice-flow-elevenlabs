import { env } from '@/lib/env';
import type { UserPlan } from '@/lib/db/models/user';

/**
 * Single source of truth for tier-level limits + feature gating + Stripe
 * price IDs. The `Plan` shape is the same across all tiers so the rest of
 * the app can branch on attributes (e.g. `plan.allowPhone`) rather than
 * `plan.key === 'pro' || plan.key === 'business'`.
 *
 * Pricing model: every paid tier pays a fixed monthly subscription
 * (recurring price) PLUS metered $0.005-per-call overage beyond the
 * included quota. Higher tiers buy more quota + features, never a cheaper
 * overage rate — simpler to communicate and easier to expand.
 */
export type Plan = {
  key: UserPlan;
  displayName: string;
  priceUsd: number;
  /** Stripe recurring price ID (flat monthly fee). `null` on the free tier. */
  priceId: string | null;
  /** Stripe metered price ID for per-call overage. `null` on the free tier. */
  overagePriceId: string | null;
  /**
   * Polar Product ID — one product per tier, with recurring + metered
   * prices bundled (Polar's model). `null` on the free tier.
   */
  polarProductId: string | null;
  includedCalls: number;
  /** `Infinity` represents "unmetered" for the agent quota. */
  maxAgents: number;
  allowPhone: boolean;
  allowOverage: boolean;
  overageRatePerCall: number;
};

// Strict provider gating: when POLAR_SDK is off, Polar product IDs are
// forced to `null` in the live config (and vice versa), so even leftover
// env values for the inactive provider can't be picked up by mistake.
const usePolar = env.POLAR_SDK;
const stripeId = (v: string | undefined) => (usePolar ? null : v ?? null);
const polarId = (v: string | undefined) => (usePolar ? v ?? null : null);

export const PLANS: Record<UserPlan, Plan> = {
  free: {
    key: 'free',
    displayName: 'Free',
    priceUsd: 0,
    priceId: null,
    overagePriceId: null,
    polarProductId: null,
    includedCalls: 100,
    maxAgents: 1,
    allowPhone: false,
    allowOverage: false,
    overageRatePerCall: 0,
  },
  starter: {
    key: 'starter',
    displayName: 'Starter',
    priceUsd: 19,
    priceId: stripeId(env.STRIPE_STARTER_PRICE_ID),
    overagePriceId: stripeId(env.STRIPE_STARTER_OVERAGE_PRICE_ID),
    polarProductId: polarId(env.POLAR_STARTER_PRODUCT_ID),
    includedCalls: 1000,
    maxAgents: 3,
    allowPhone: false,
    allowOverage: true,
    overageRatePerCall: 0.005,
  },
  pro: {
    key: 'pro',
    displayName: 'Pro',
    priceUsd: 49,
    priceId: stripeId(env.STRIPE_PRO_PRICE_ID),
    overagePriceId: stripeId(env.STRIPE_PRO_OVERAGE_PRICE_ID),
    polarProductId: polarId(env.POLAR_PRO_PRODUCT_ID),
    includedCalls: 5000,
    maxAgents: 10,
    allowPhone: true,
    allowOverage: true,
    overageRatePerCall: 0.005,
  },
  business: {
    key: 'business',
    displayName: 'Business',
    priceUsd: 149,
    priceId: stripeId(env.STRIPE_BUSINESS_PRICE_ID),
    overagePriceId: stripeId(env.STRIPE_BUSINESS_OVERAGE_PRICE_ID),
    polarProductId: polarId(env.POLAR_BUSINESS_PRODUCT_ID),
    includedCalls: 25_000,
    maxAgents: Number.POSITIVE_INFINITY,
    allowPhone: true,
    allowOverage: true,
    overageRatePerCall: 0.005,
  },
};

/**
 * Resolve a plan by key with a `free` fallback. Returning the fallback
 * (rather than throwing) keeps the rest of the codebase tolerant of stale
 * user docs that may carry an unrecognised plan string.
 */
export function getPlan(planName: string): Plan {
  return PLANS[planName as UserPlan] ?? PLANS.free;
}

/** The Stripe Meter event_name that the SDK reports usage under. */
export const STRIPE_METER_EVENT_NAME = 'voicecalls';

/**
 * Maps a Stripe recurring price ID back to our plan key. Used by the
 * webhook to figure out which tier a subscription line item refers to.
 * O(1) at runtime — built once on module load.
 */
const PRICE_ID_TO_PLAN = new Map<string, UserPlan>(
  (Object.values(PLANS) as Plan[])
    .filter((p): p is Plan & { priceId: string } => !!p.priceId)
    .map((p) => [p.priceId, p.key]),
);

export function planFromPriceId(priceId: string | null | undefined): UserPlan | null {
  if (!priceId) return null;
  return PRICE_ID_TO_PLAN.get(priceId) ?? null;
}

const POLAR_PRODUCT_ID_TO_PLAN = new Map<string, UserPlan>(
  (Object.values(PLANS) as Plan[])
    .filter((p): p is Plan & { polarProductId: string } => !!p.polarProductId)
    .map((p) => [p.polarProductId, p.key]),
);

export function planFromPolarProductId(productId: string | null | undefined): UserPlan | null {
  if (!productId) return null;
  return POLAR_PRODUCT_ID_TO_PLAN.get(productId) ?? null;
}
