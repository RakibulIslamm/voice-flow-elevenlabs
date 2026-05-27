import 'server-only';
import { connectDb } from '@/lib/db/connect';
import { User } from '@/lib/db/models/user';
import { getBillingProvider } from '@/lib/billing';
import { getPlan } from '@/lib/billing/plans';
import { logError } from '@/lib/tracking/log-error';
import { trackEvent } from '@/lib/tracking/event';

/**
 * Increments the user's call counter and — when the call lands beyond
 * the plan's included quota — fires a metered event via whichever
 * billing provider is active (`POLAR_SDK` flips it).
 *
 * Idempotency is anchored on `callId`: both providers accept it as the
 * dedupe identifier (Stripe → meter event `identifier`; Polar →
 * `externalId` on the event ingest). The Mongo `$inc` itself is NOT
 * idempotent, but the ElevenLabs webhook calls this exactly once per
 * Call doc (looked up by `externalCallId`), so the only retry vector we
 * need to guard against is the billing-provider-side one.
 */
export async function recordCallUsage(userId: string, callId: string): Promise<void> {
  await connectDb();
  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { 'usage.callsThisPeriod': 1 } },
    { new: true, projection: { plan: 1, usage: 1 } },
  ).lean();

  if (!user) {
    void logError(new Error(`recordCallUsage: user ${userId} not found`), {
      scope: 'usage',
      stage: 'increment',
      userId,
    });
    return;
  }

  const plan = getPlan(user.plan);
  const used = user.usage?.callsThisPeriod ?? 0;

  void trackEvent('usage.call_counted', {
    userId,
    properties: { callId, used, plan: plan.key, included: plan.includedCalls },
  });

  // The provider's own `reportCallUsage` handles the rest: skip-if-free,
  // skip-if-under-quota, talk to the right billing backend, log errors.
  await getBillingProvider().reportCallUsage({ userId, callId });
}
