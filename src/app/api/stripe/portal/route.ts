import 'server-only';
import { NextResponse } from 'next/server';
import { safeRoute } from '@/lib/safe-route';
import { requireUser } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import { User } from '@/lib/db/models/user';
import { withStripe } from '@/lib/stripe/client';
import { env } from '@/lib/env';
import { AppError, ExternalServiceError } from '@/lib/errors';

/**
 * Mints a Stripe Customer Portal session so the user can manage their
 * subscription (update payment method, cancel, download invoices) without
 * us re-implementing those flows. The portal is configured in the Stripe
 * Dashboard — return URL points back to /dashboard/billing.
 */
export const POST = safeRoute({
  handler: async () => {
    const session = await requireUser();
    const userId = session.user.id;

    await connectDb();
    const user = await User.findById(userId).select('stripeCustomerId').lean<{
      stripeCustomerId?: string;
    } | null>();
    if (!user?.stripeCustomerId) {
      throw new AppError({
        code: 'NO_STRIPE_CUSTOMER',
        statusCode: 400,
        publicMessage: 'You do not have an active subscription yet.',
      });
    }

    const baseUrl = (env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const portal = await withStripe('billingPortal.sessions.create', (stripe) =>
      stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId!,
        return_url: `${baseUrl}/dashboard/billing`,
      }),
    );

    if (!portal.url) {
      throw new ExternalServiceError(
        'Stripe',
        'Portal session created but returned no URL.',
        'Could not open the billing portal. Please try again.',
      );
    }

    return NextResponse.json({ ok: true, url: portal.url });
  },
});
