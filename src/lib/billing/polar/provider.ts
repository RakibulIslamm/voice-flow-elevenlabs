import 'server-only';
import { connectDb } from '@/lib/db/connect';
import { User, type UserPlan, type SubscriptionStatus } from '@/lib/db/models/user';
import { getPolar, withPolar } from './client';
import { getPlan, planFromPolarProductId } from '@/lib/billing/plans';
import { AppError, ExternalServiceError } from '@/lib/errors';
import { logError } from '@/lib/tracking/log-error';
import { trackEvent } from '@/lib/tracking/event';
import type { BillingProvider, InvoiceVM, ReconciledSubscription } from '../provider';

/** Event name used for per-call meter ingestion on Polar. */
const POLAR_CALL_EVENT_NAME = 'voicecalls';

/**
 * Polar-backed `BillingProvider`. Mirrors the Stripe provider's surface
 * exactly so the rest of the app doesn't care which one is active.
 *
 * Polar conventions we lean on:
 *   - `externalCustomerId` = our local user `_id`. Polar uses this as
 *     the cross-system anchor so we can run customer-portal sessions and
 *     ingest meter events without first round-tripping to fetch the
 *     internal Polar customer UUID.
 *   - One Polar **Product** per paid tier — Polar bundles recurring +
 *     metered prices under one product, so a single product ID maps
 *     cleanly to a plan key.
 */
export const polarProvider: BillingProvider = {
  name: 'polar',

  async createCheckoutSession({ userId, userEmail, plan, successUrl }) {
    const planCfg = getPlan(plan);
    if (!planCfg.polarProductId) {
      throw new AppError({
        code: 'PLAN_NOT_CONFIGURED',
        statusCode: 503,
        publicMessage: 'This plan is not configured yet. Please contact support.',
      });
    }

    // Polar (unlike Stripe Checkout) won't let a customer "checkout"
    // again if they already have an active subscription — it errors with
    // "You already have an active subscription". The right flow for a
    // plan change is `subscriptions.update({productId})`, which Polar
    // applies in-place with proration. We detect the existing sub and
    // route to that path; only brand-new subscribers hit the checkout.
    const existing = await findActivePolarSubscription(userId);
    if (existing) {
      if (existing.productId === planCfg.polarProductId) {
        throw new AppError({
          code: 'ALREADY_ON_PLAN',
          statusCode: 400,
          publicMessage: `You are already on the ${planCfg.displayName} plan.`,
        });
      }
      // `invoice` switches the plan immediately AND bills the prorated
      // diff right now. We use this (not `prorate`) so an upgrade from
      // Starter→Pro actually pays for the higher tier they're about to
      // use — otherwise the user gets Pro features at Starter prices
      // until the next renewal. The UI MUST show the prorated amount
      // before triggering this; the confirmation lives client-side.
      await withPolar('subscriptions.update(productId)', (polar) =>
        polar.subscriptions.update({
          id: existing.id,
          subscriptionUpdate: {
            productId: planCfg.polarProductId!,
            prorationBehavior: 'invoice',
          },
        }),
      );
      // Mirror locally so the next page render reflects the new plan
      // even before the webhook lands.
      await connectDb();
      await User.updateOne(
        { _id: userId },
        { $set: { plan: planCfg.key, cancelAtPeriodEnd: false } },
      );
      void trackEvent('billing.plan_changed', {
        userId,
        properties: { plan: planCfg.key, provider: 'polar' },
      });
      // No checkout to open — caller should refresh.
      return { url: successUrl };
    }

    const checkout = await withPolar('checkouts.create', (polar) =>
      polar.checkouts.create({
        products: [planCfg.polarProductId!],
        customerEmail: userEmail,
        externalCustomerId: userId,
        successUrl,
        metadata: { userId, plan: planCfg.key },
      }),
    );

    if (!checkout.url) {
      throw new ExternalServiceError(
        'Polar',
        'Checkout session created but returned no URL.',
        'Could not open the checkout page. Please try again.',
      );
    }
    return { url: checkout.url };
  },

  async createPortalSession({ userId, returnUrl }) {
    // Polar's customer-session URL takes the user straight into their
    // portal for the linked customer. The session token is single-use
    // and short-lived; we never persist it.
    const session = await withPolar('customerSessions.create', (polar) =>
      polar.customerSessions.create({ externalCustomerId: userId }),
    );
    const url = session.customerPortalUrl;
    if (!url) {
      throw new ExternalServiceError(
        'Polar',
        'Portal session created but returned no URL.',
        'Could not open the billing portal. Please try again.',
      );
    }
    // Polar lets us pass a return URL via query param.
    const separator = url.includes('?') ? '&' : '?';
    return { url: `${url}${separator}return_url=${encodeURIComponent(returnUrl)}` };
  },

  async scheduleCancel({ userId }) {
    await connectDb();
    const user = await User.findById(userId)
      .select('polarSubscriptionId')
      .lean<{ polarSubscriptionId?: string } | null>();
    if (!user?.polarSubscriptionId) {
      throw new AppError({
        code: 'NO_SUBSCRIPTION',
        statusCode: 400,
        publicMessage: 'You do not have an active subscription to cancel.',
      });
    }
    const updated = await withPolar('subscriptions.update(cancel)', (polar) =>
      polar.subscriptions.update({
        id: user.polarSubscriptionId!,
        subscriptionUpdate: { cancelAtPeriodEnd: true },
      }),
    );
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          cancelAtPeriodEnd: true,
          subscriptionStatus: 'active',
          'usage.periodEnd': updated.currentPeriodEnd,
        },
      },
    );
    void trackEvent('billing.cancel_scheduled', { userId, properties: { provider: 'polar' } });
  },

  async resumeSubscription({ userId }) {
    await connectDb();
    const user = await User.findById(userId)
      .select('polarSubscriptionId')
      .lean<{ polarSubscriptionId?: string } | null>();
    if (!user?.polarSubscriptionId) {
      throw new AppError({
        code: 'NO_SUBSCRIPTION',
        statusCode: 400,
        publicMessage: 'You do not have a subscription to resume.',
      });
    }
    await withPolar('subscriptions.update(resume)', (polar) =>
      polar.subscriptions.update({
        id: user.polarSubscriptionId!,
        subscriptionUpdate: { cancelAtPeriodEnd: false },
      }),
    );
    await User.updateOne(
      { _id: userId },
      { $set: { cancelAtPeriodEnd: false, subscriptionStatus: 'active' } },
    );
    void trackEvent('billing.cancel_undone', { userId, properties: { provider: 'polar' } });
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
      .select('plan polarCustomerId polarSubscriptionId subscriptionStatus cancelAtPeriodEnd')
      .lean<{
        plan?: UserPlan;
        polarCustomerId?: string;
        polarSubscriptionId?: string;
        subscriptionStatus?: SubscriptionStatus;
        cancelAtPeriodEnd?: boolean;
      } | null>();
    if (!user) return empty;

    try {
      const polar = getPolar();
      // We anchor on externalCustomerId — works even if we don't have a
      // local copy of the polarCustomerId yet (e.g. fresh post-checkout
      // before the webhook lands).
      const page = await polar.subscriptions.list({ externalCustomerId: userId });
      const subs: PolarSubscription[] = [];
      for await (const item of page) {
        for (const s of item.result.items) subs.push(s as PolarSubscription);
        if (subs.length >= 5) break;
      }

      if (subs.length === 0) {
        if (
          user.plan !== 'free' ||
          user.subscriptionStatus !== 'canceled' ||
          user.cancelAtPeriodEnd
        ) {
          await User.updateOne(
            { _id: userId },
            {
              $set: { plan: 'free', subscriptionStatus: 'canceled', cancelAtPeriodEnd: false },
              $unset: { polarSubscriptionId: 1 },
            },
          );
        }
        return { plan: 'free', status: 'canceled', cancelAtPeriodEnd: false, periodEnd: null };
      }

      const sorted = [...subs].sort(
        (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
      );
      const active = sorted.find((s) => s.status !== 'canceled' && s.status !== 'incomplete');
      const subscription = active ?? sorted[0]!;

      const plan = planFromPolarProductId(subscription.productId ?? null);
      const status = mapPolarStatus(subscription.status);
      const cancelAtPeriodEnd = !!subscription.cancelAtPeriodEnd;
      const periodEnd = subscription.currentPeriodEnd ?? null;
      const finalPlan: UserPlan = status === 'canceled' || !active ? 'free' : plan ?? 'free';

      const set: Record<string, unknown> = {
        plan: finalPlan,
        subscriptionStatus: status,
        cancelAtPeriodEnd,
        polarSubscriptionId: subscription.id,
        polarCustomerId: subscription.customerId,
      };
      const unset: Record<string, 1> = {};
      if (finalPlan === 'free') unset.polarSubscriptionId = 1;
      if (periodEnd) set['usage.periodEnd'] = periodEnd;

      await User.updateOne(
        { _id: userId },
        Object.keys(unset).length > 0 ? { $set: set, $unset: unset } : { $set: set },
      );

      return { plan: finalPlan, status, cancelAtPeriodEnd, periodEnd };
    } catch (e) {
      void logError(e, { scope: 'billing-reconcile', provider: 'polar', userId });
      return empty;
    }
  },

  async listInvoices({ userId }) {
    // Polar doesn't have a one-to-one "invoices" entity like Stripe —
    // we surface paid Orders (one per billing cycle) as invoice rows.
    // The invoice PDF lives behind a separate `orders.invoice({id})`
    // call (Polar generates it lazily), so we resolve URLs in parallel
    // for the page we display — cheap at limit=12.
    try {
      const page = await withPolar('orders.list', (polar) =>
        polar.orders.list({ externalCustomerId: userId }),
      );
      const orders: PolarOrder[] = [];
      for await (const item of page) {
        for (const order of item.result.items) orders.push(order as PolarOrder);
        if (orders.length >= 12) break;
      }
      const polar = getPolar();
      const urls = await Promise.all(
        orders.map(async (o) => {
          try {
            const invoice = await polar.orders.invoice({ id: o.id });
            return invoice.url ?? null;
          } catch {
            // Invoice may not be generated yet for free/pending orders —
            // we just skip the link rather than failing the whole list.
            return null;
          }
        }),
      );
      return orders.map((order, i) => toInvoiceVM(order, urls[i] ?? null));
    } catch (e) {
      void logError(e, { scope: 'billing-invoices', provider: 'polar', userId });
      return [];
    }
  },

  async reportCallUsage({ userId, callId }) {
    await connectDb();
    const user = await User.findById(userId)
      .select('plan usage')
      .lean<{ plan?: UserPlan; usage?: { callsThisPeriod?: number } } | null>();
    if (!user) return;
    const plan = getPlan(user.plan ?? 'free');
    const used = user.usage?.callsThisPeriod ?? 0;
    if (!plan.allowOverage) return;
    if (used <= plan.includedCalls) return;

    try {
      await getPolar().events.ingest({
        events: [
          {
            name: POLAR_CALL_EVENT_NAME,
            externalCustomerId: userId,
            externalId: callId,
            metadata: { call_id: callId },
          },
        ],
      });
      void trackEvent('usage.overage_reported', {
        userId,
        properties: { callId, used, plan: plan.key, provider: 'polar' },
      });
    } catch (e) {
      void logError(e, { scope: 'usage', stage: 'event-ingest', provider: 'polar', userId, callId });
    }
  },
};

function mapPolarStatus(status: PolarSubscription['status']): SubscriptionStatus {
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

function toInvoiceVM(order: PolarOrder, invoiceUrl: string | null): InvoiceVM {
  return {
    id: order.id,
    // Polar orders don't have a human-readable invoice number — show a
    // short prefix of the UUID so rows are visually distinguishable.
    number: order.id.slice(0, 8),
    amount: order.totalAmount ?? 0,
    currency: order.currency ?? 'usd',
    status: order.status ?? 'paid',
    createdAt: order.createdAt.toISOString(),
    pdfUrl: invoiceUrl,
    hostedUrl: invoiceUrl,
  };
}

/**
 * Returns the most recent non-canceled Polar subscription for the user,
 * or `null` if they have none. Used to decide whether a "checkout" call
 * should swap an existing sub's product instead of opening a new flow.
 */
async function findActivePolarSubscription(userId: string): Promise<PolarSubscription | null> {
  try {
    const page = await getPolar().subscriptions.list({ externalCustomerId: userId });
    let candidate: PolarSubscription | null = null;
    for await (const item of page) {
      for (const s of item.result.items) {
        const sub = s as PolarSubscription;
        if (sub.status === 'canceled' || sub.status === 'incomplete_expired') continue;
        if (!candidate || (sub.createdAt?.getTime() ?? 0) > (candidate.createdAt?.getTime() ?? 0)) {
          candidate = sub;
        }
      }
    }
    return candidate;
  } catch (e) {
    void logError(e, { scope: 'billing-checkout', stage: 'find-existing-sub', provider: 'polar', userId });
    return null;
  }
}

// Minimal local shapes — Polar's deep types aren't re-exported from the
// SDK's main entry. Kept narrow so a future SDK version change shows up
// as a clear compile error rather than a runtime drift.
type PolarSubscription = {
  id: string;
  status:
    | 'active'
    | 'trialing'
    | 'past_due'
    | 'unpaid'
    | 'canceled'
    | 'incomplete'
    | 'incomplete_expired';
  cancelAtPeriodEnd: boolean;
  productId: string | null;
  customerId: string;
  currentPeriodEnd: Date | null;
  createdAt: Date;
};

type PolarOrder = {
  id: string;
  totalAmount: number | null;
  currency: string | null;
  status: string | null;
  createdAt: Date;
};
