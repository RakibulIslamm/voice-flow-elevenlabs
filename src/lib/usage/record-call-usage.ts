import 'server-only';
import { connectDb } from '@/lib/db/connect';
import { User } from '@/lib/db/models/user';
import { getStripe } from '@/lib/stripe/client';
import { getPlan, STRIPE_METER_EVENT_NAME } from '@/lib/stripe/plans';
import { logError } from '@/lib/tracking/log-error';
import { trackEvent } from '@/lib/tracking/event';

/**
 * Increments the user's call counter and — if the call lands beyond the
 * plan's included quota — reports a metered event to Stripe.
 *
 * Idempotency is anchored on `callId`: Stripe uses it as the event payload
 * identifier so a webhook retry from ElevenLabs that fires `recordCallUsage`
 * twice will not double-bill. The Mongo `$inc` itself is NOT idempotent,
 * but the ElevenLabs webhook calls this handler exactly once per Call doc
 * (we look up by `externalCallId`), so the only retry vector worth
 * guarding against is the Stripe-side one.
 */
export async function recordCallUsage(userId: string, callId: string): Promise<void> {
  await connectDb();
  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { 'usage.callsThisPeriod': 1 } },
    { new: true, projection: { plan: 1, usage: 1, stripeCustomerId: 1 } },
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

  if (!plan.allowOverage) return;
  if (used <= plan.includedCalls) return;
  if (!user.stripeCustomerId) {
    // Paid plan without a Stripe customer is an inconsistent state; log
    // for an operator to backfill, but don't crash the webhook.
    void logError(new Error('Paid user has no stripeCustomerId'), {
      scope: 'usage',
      stage: 'report-meter',
      userId,
    });
    return;
  }

  try {
    const stripe = getStripe();
    // Stripe Meter Events API — sum aggregation, one unit per call.
    // `identifier` is what the SDK uses to dedupe within a 24h window:
    // resending the same identifier is a no-op, so our `callId` is a
    // clean idempotency key.
    await stripe.billing.meterEvents.create({
      event_name: STRIPE_METER_EVENT_NAME,
      identifier: callId,
      timestamp: Math.floor(Date.now() / 1000),
      payload: {
        value: '1',
        stripe_customer_id: user.stripeCustomerId,
      },
    });
    void trackEvent('usage.overage_reported', {
      userId,
      properties: { callId, used, plan: plan.key },
    });
  } catch (e) {
    // Don't propagate — failing to report a single meter event must not
    // kill the post-call webhook. Operators reconcile via the Stripe log.
    void logError(e, { scope: 'usage', stage: 'meter-event', userId, callId });
  }
}
