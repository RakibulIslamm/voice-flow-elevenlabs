import 'server-only';
import type Stripe from 'stripe';
import { connectDb } from '@/lib/db/connect';
import { User, type UserPlan, type SubscriptionStatus } from '@/lib/db/models/user';
import { getStripe, withStripe } from './client';
import { getPlan, planFromPriceId, STRIPE_METER_EVENT_NAME } from '@/lib/billing/plans';
import { AppError, ExternalServiceError } from '@/lib/errors';
import { logError } from '@/lib/tracking/log-error';
import { trackEvent } from '@/lib/tracking/event';
import type { BillingProvider, InvoiceVM, ReconciledSubscription } from '../provider';

/**
 * Stripe-backed `BillingProvider`. Pure wrapper around the existing
 * Stripe SDK calls — no behavior changes vs. pre-abstraction code.
 */
export const stripeProvider: BillingProvider = {
  name: 'stripe',

  async createCheckoutSession({ userId, userEmail, plan, successUrl, cancelUrl }) {
    const planCfg = getPlan(plan);
    if (!planCfg.priceId || !planCfg.overagePriceId) {
      throw new AppError({
        code: 'PLAN_NOT_CONFIGURED',
        statusCode: 503,
        publicMessage: 'This plan is not configured yet. Please contact support.',
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

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const created = await withStripe('customers.create', (stripe) =>
        stripe.customers.create({ email: userEmail, metadata: { userId } }),
      );
      customerId = created.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    const checkout = await withStripe('checkout.sessions.create', (stripe) =>
      stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [
          { price: planCfg.priceId!, quantity: 1 },
          { price: planCfg.overagePriceId! },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { userId, plan: planCfg.key },
        subscription_data: { metadata: { userId, plan: planCfg.key } },
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
    return { url: checkout.url };
  },

  async createPortalSession({ userId, returnUrl }) {
    await connectDb();
    const user = await User.findById(userId)
      .select('stripeCustomerId')
      .lean<{ stripeCustomerId?: string } | null>();
    if (!user?.stripeCustomerId) {
      throw new AppError({
        code: 'NO_STRIPE_CUSTOMER',
        statusCode: 400,
        publicMessage: 'You do not have an active subscription yet.',
      });
    }
    const portal = await withStripe('billingPortal.sessions.create', (stripe) =>
      stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId!,
        return_url: returnUrl,
      }),
    );
    if (!portal.url) {
      throw new ExternalServiceError(
        'Stripe',
        'Portal session created but returned no URL.',
        'Could not open the billing portal. Please try again.',
      );
    }
    return { url: portal.url };
  },

  async scheduleCancel({ userId }) {
    await connectDb();
    const user = await User.findById(userId)
      .select('stripeSubscriptionId')
      .lean<{ stripeSubscriptionId?: string } | null>();
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
          subscriptionStatus: 'active',
          ...(periodEnd ? { 'usage.periodEnd': new Date(periodEnd * 1000) } : {}),
        },
      },
    );
    void trackEvent('billing.cancel_scheduled', { userId, properties: { provider: 'stripe' } });
  },

  async resumeSubscription({ userId }) {
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
    void trackEvent('billing.cancel_undone', { userId, properties: { provider: 'stripe' } });
  },

  async reconcile({ userId }) {
    const empty: ReconciledSubscription = {
      plan: null,
      status: null,
      cancelAtPeriodEnd: null,
      periodEnd: null,
    };
    await connectDb();
    const user = await User.findById(userId)
      .select('plan stripeCustomerId stripeSubscriptionId subscriptionStatus cancelAtPeriodEnd')
      .lean<{
        plan?: UserPlan;
        stripeCustomerId?: string;
        stripeSubscriptionId?: string;
        subscriptionStatus?: SubscriptionStatus;
        cancelAtPeriodEnd?: boolean;
      } | null>();
    if (!user?.stripeCustomerId) return empty;

    try {
      const stripe = getStripe();
      const subs = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: 'all',
        limit: 5,
      });
      if (subs.data.length === 0) {
        if (
          user.plan !== 'free' ||
          user.subscriptionStatus !== 'canceled' ||
          user.cancelAtPeriodEnd
        ) {
          await User.updateOne(
            { _id: userId },
            {
              $set: { plan: 'free', subscriptionStatus: 'canceled', cancelAtPeriodEnd: false },
              $unset: { stripeSubscriptionId: 1 },
            },
          );
        }
        return {
          plan: 'free',
          status: 'canceled',
          cancelAtPeriodEnd: false,
          periodEnd: null,
        };
      }

      const sorted = [...subs.data].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
      const active = sorted.find(
        (s) => s.status !== 'canceled' && s.status !== 'incomplete_expired',
      );
      const subscription = active ?? sorted[0]!;

      let plan: UserPlan | null = null;
      for (const item of subscription.items.data) {
        const candidate = planFromPriceId(item.price?.id ?? null);
        if (candidate) {
          plan = candidate;
          break;
        }
      }
      const status = mapStripeStatus(subscription.status);
      const cancelAtPeriodEnd = !!subscription.cancel_at_period_end;
      const raw = subscription as unknown as { current_period_end?: number };
      const periodEnd = raw.current_period_end ? new Date(raw.current_period_end * 1000) : null;
      const finalPlan: UserPlan = status === 'canceled' || !active ? 'free' : plan ?? 'free';

      const set: Record<string, unknown> = {
        plan: finalPlan,
        subscriptionStatus: status,
        cancelAtPeriodEnd,
        stripeSubscriptionId: subscription.id,
      };
      const unset: Record<string, 1> = {};
      if (finalPlan === 'free') unset.stripeSubscriptionId = 1;
      if (periodEnd) set['usage.periodEnd'] = periodEnd;

      await User.updateOne(
        { _id: userId },
        Object.keys(unset).length > 0 ? { $set: set, $unset: unset } : { $set: set },
      );

      return { plan: finalPlan, status, cancelAtPeriodEnd, periodEnd };
    } catch (e) {
      void logError(e, { scope: 'billing-reconcile', provider: 'stripe', userId });
      return empty;
    }
  },

  async listInvoices({ userId }) {
    await connectDb();
    const user = await User.findById(userId)
      .select('stripeCustomerId')
      .lean<{ stripeCustomerId?: string } | null>();
    if (!user?.stripeCustomerId) return [];
    try {
      const list = await getStripe().invoices.list({
        customer: user.stripeCustomerId,
        limit: 12,
      });
      return list.data.map(toInvoiceVM);
    } catch (e) {
      void logError(e, { scope: 'billing-invoices', provider: 'stripe', userId });
      return [];
    }
  },

  async reportCallUsage({ userId, callId }) {
    await connectDb();
    const user = await User.findById(userId)
      .select('plan usage stripeCustomerId')
      .lean<{
        plan?: UserPlan;
        usage?: { callsThisPeriod?: number };
        stripeCustomerId?: string;
      } | null>();
    if (!user) return;
    const plan = getPlan(user.plan ?? 'free');
    const used = user.usage?.callsThisPeriod ?? 0;
    if (!plan.allowOverage) return;
    if (used <= plan.includedCalls) return;
    if (!user.stripeCustomerId) {
      void logError(new Error('Paid user has no stripeCustomerId'), {
        scope: 'usage',
        stage: 'report-meter',
        userId,
      });
      return;
    }
    try {
      await getStripe().billing.meterEvents.create({
        event_name: STRIPE_METER_EVENT_NAME,
        identifier: callId,
        timestamp: Math.floor(Date.now() / 1000),
        payload: { value: '1', stripe_customer_id: user.stripeCustomerId },
      });
      void trackEvent('usage.overage_reported', {
        userId,
        properties: { callId, used, plan: plan.key, provider: 'stripe' },
      });
    } catch (e) {
      void logError(e, { scope: 'usage', stage: 'meter-event', provider: 'stripe', userId, callId });
    }
  },
};

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return null;
  }
}

function toInvoiceVM(inv: Stripe.Invoice): InvoiceVM {
  return {
    id: inv.id ?? 'unknown',
    number: inv.number ?? inv.id ?? 'invoice',
    amount: inv.amount_paid ?? inv.amount_due ?? 0,
    currency: inv.currency,
    status: inv.status ?? 'open',
    createdAt: new Date((inv.created ?? 0) * 1000).toISOString(),
    pdfUrl: inv.invoice_pdf ?? null,
    hostedUrl: inv.hosted_invoice_url ?? null,
  };
}
