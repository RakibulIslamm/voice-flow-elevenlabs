import 'server-only';
import { NextResponse } from 'next/server';
import { safeRoute } from '@/lib/safe-route';
import { requireUser } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import { User } from '@/lib/db/models/user';
import { withStripe } from '@/lib/stripe/client';
import { AppError } from '@/lib/errors';
import { trackEvent } from '@/lib/tracking/event';

/**
 * Cancel-at-period-end — wraps Stripe's
 *   POST /v1/subscriptions/:id  with cancel_at_period_end: true
 *
 * We intentionally do NOT hard-cancel (`stripe.subscriptions.cancel()`).
 * Hard cancel deletes the subscription from Stripe entirely, which means:
 *   - The Customer Portal "Manage subscription" page has nothing left to
 *     show (no row to manage).
 *   - The user can't undo without going through full checkout again.
 *
 * cancel_at_period_end leaves the subscription Active until `periodEnd`,
 * keeps it visible in both Stripe's portal and our dashboard, and lets
 * the user resume by clearing the flag (see `/api/stripe/resume`).
 *
 * Local user doc is patched inline so the UI's "Canceling / Cancels …"
 * copy lands on the very next render — the webhook arrival later is
 * idempotent against the resulting state.
 */
export const POST = safeRoute({
  handler: async () => {
    const session = await requireUser();
    const userId = session.user.id;

    await connectDb();
    const user = await User.findById(userId)
      .select('stripeSubscriptionId stripeCustomerId')
      .lean<{ stripeSubscriptionId?: string; stripeCustomerId?: string } | null>();
    if (!user?.stripeSubscriptionId) {
      throw new AppError({
        code: 'NO_SUBSCRIPTION',
        statusCode: 400,
        publicMessage: 'You do not have an active subscription to cancel.',
      });
    }

    const updated = await withStripe('subscriptions.update(cancel_at_period_end)', (stripe) =>
      stripe.subscriptions.update(user.stripeSubscriptionId!, {
        cancel_at_period_end: true,
      }),
    );

    const periodEnd = (updated as unknown as { current_period_end?: number })
      .current_period_end;

    await User.updateOne(
      { _id: userId },
      {
        $set: {
          cancelAtPeriodEnd: true,
          // Status stays 'active' — the sub is still Stripe-active, just
          // flagged to auto-cancel at the period boundary.
          subscriptionStatus: 'active',
          ...(periodEnd ? { 'usage.periodEnd': new Date(periodEnd * 1000) } : {}),
        },
      },
    );

    void trackEvent('billing.cancel_scheduled', { userId });

    return NextResponse.json({ ok: true });
  },
});
