import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { safeRoute } from '@/lib/safe-route';
import { requireUser } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import { User } from '@/lib/db/models/user';
import { getStripe, withStripe } from '@/lib/stripe/client';
import { getPlan } from '@/lib/stripe/plans';
import { env } from '@/lib/env';
import { AppError, ExternalServiceError } from '@/lib/errors';

const inputSchema = z.object({
  plan: z.enum(['starter', 'pro', 'business']),
});

/**
 * Spins up a Stripe Checkout session for the user to subscribe to one of
 * the paid tiers. The session always contains TWO line items:
 *
 *   1. A fixed recurring price — the monthly subscription fee.
 *   2. A usage-based metered price — Stripe bills on top via our Meter
 *      events. No initial quantity; we report 1 unit per call beyond
 *      included quota.
 *
 * On success the user is redirected to /dashboard/billing which renders
 * the new state once the webhook (`checkout.session.completed`) has
 * promoted the user doc. (We don't trust the redirect alone — the
 * webhook is the source of truth.)
 */
export const POST = safeRoute({
  schema: inputSchema,
  handler: async ({ input }) => {
    const session = await requireUser();
    const userId = session.user.id;
    const email = session.user.email ?? '';

    const plan = getPlan(input.plan);
    if (!plan.priceId || !plan.overagePriceId) {
      throw new AppError({
        code: 'PLAN_NOT_CONFIGURED',
        statusCode: 503,
        publicMessage:
          'This plan is not configured yet. Please contact support.',
      });
    }

    await connectDb();
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError({
        code: 'USER_NOT_FOUND',
        statusCode: 404,
        publicMessage: 'Account not found.',
      });
    }

    // Reuse the existing Stripe customer if we've seen one; otherwise
    // mint one now so subsequent portal sessions don't drift.
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const created = await withStripe('customers.create', (stripe) =>
        stripe.customers.create({
          email,
          metadata: { userId },
        }),
      );
      customerId = created.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    const baseUrl = (env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

    const checkout = await withStripe('checkout.sessions.create', (stripe) =>
      stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [
          { price: plan.priceId!, quantity: 1 },
          // No quantity for metered — Stripe bills based on Meter events.
          { price: plan.overagePriceId! },
        ],
        success_url: `${baseUrl}/dashboard/billing?success=true`,
        cancel_url: `${baseUrl}/dashboard/billing?canceled=true`,
        // Forward the userId into both checkout metadata AND subscription
        // metadata so the webhook can locate the right user fast even if
        // Stripe customer indexing lags by a beat.
        metadata: { userId, plan: plan.key },
        subscription_data: {
          metadata: { userId, plan: plan.key },
        },
        allow_promotion_codes: true,
      }),
    );

    if (!checkout.url) {
      throw new ExternalServiceError(
        'Stripe',
        'Checkout session created but returned no URL.',
        'Could not open the checkout page. Please try again.',
      );
    }

    return NextResponse.json({ ok: true, url: checkout.url });
  },
});
