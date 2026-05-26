import 'server-only';
import { connectDb } from '@/lib/db/connect';
import { User, type UserDoc } from '@/lib/db/models/user';
import { getPlan } from '@/lib/stripe/plans';

export type CallQuotaCheck =
  | { allowed: true; willCharge?: number; remainingIncluded?: number }
  | { allowed: false; reason: string };

/**
 * Decides whether a brand-new call can start for this user. Called from
 * two distinct paths:
 *   - Browser: `/api/voice/signed-url` before minting the ElevenLabs URL.
 *   - Phone: `/api/twilio/incoming` before bridging the call into ElevenLabs.
 *
 * The check NEVER mutates state — it only reads. Actual usage increment
 * happens after the call completes (see `record-call-usage.ts`).
 */
export async function checkCanStartCall(userId: string): Promise<CallQuotaCheck> {
  await connectDb();
  const user = await User.findById(userId)
    .select('plan usage subscriptionStatus')
    .lean<Pick<UserDoc, '_id' | 'plan' | 'usage' | 'subscriptionStatus'> | null>();
  if (!user) {
    return { allowed: false, reason: 'Account not found.' };
  }

  // Past-due wins over everything else — Stripe failed to charge the user
  // and they need to update payment before we serve more calls.
  if (user.subscriptionStatus === 'past_due') {
    return {
      allowed: false,
      reason: 'Subscription payment failed. Please update your payment method.',
    };
  }

  const plan = getPlan(user.plan);
  const used = user.usage?.callsThisPeriod ?? 0;

  if (used < plan.includedCalls) {
    return { allowed: true, remainingIncluded: plan.includedCalls - used };
  }
  if (!plan.allowOverage) {
    return {
      allowed: false,
      reason: `You've used your ${plan.includedCalls} free calls this month. Upgrade to Starter for 1,000/month.`,
    };
  }
  return { allowed: true, willCharge: plan.overageRatePerCall };
}
