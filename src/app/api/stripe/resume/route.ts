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
 * Undoes a scheduled cancel — flips `cancel_at_period_end` back to false
 * on the existing subscription so the user's plan keeps renewing.
 *
 * Used by the "Resume subscription" button that appears once a user has
 * cancelled (but before the period actually ends).
 */
export const POST = safeRoute({
  handler: async () => {
    const session = await requireUser();
    const userId = session.user.id;

    await connectDb();
    const user = await User.findById(userId)
      .select('stripeSubscriptionId')
      .lean<{ stripeSubscriptionId?: string } | null>();
    if (!user?.stripeSubscriptionId) {
      throw new AppError({
        code: 'NO_SUBSCRIPTION',
        statusCode: 400,
        publicMessage: 'You do not have a subscription to resume.',
      });
    }

    await withStripe('subscriptions.update(resume)', (stripe) =>
      stripe.subscriptions.update(user.stripeSubscriptionId!, {
        cancel_at_period_end: false,
      }),
    );

    await User.updateOne(
      { _id: userId },
      { $set: { cancelAtPeriodEnd: false, subscriptionStatus: 'active' } },
    );

    void trackEvent('billing.cancel_undone', { userId });

    return NextResponse.json({ ok: true });
  },
});
