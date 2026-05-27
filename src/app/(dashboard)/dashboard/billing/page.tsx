import { Types } from 'mongoose';
import type Stripe from 'stripe';
import { requireUser } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import { User, type SubscriptionStatus, type UserPlan } from '@/lib/db/models/user';
import { Agent } from '@/lib/db/models/agent';
import { getPlan, PLANS, planFromPriceId } from '@/lib/stripe/plans';
import { getStripe } from '@/lib/stripe/client';
import { PageHeader } from '@/components/layout/page-header';
import { logError } from '@/lib/tracking/log-error';
import { BillingClient, type BillingViewModel } from './billing-client';

export const metadata = { title: 'Billing · VoiceFlow' };

export default async function BillingPage() {
  const session = await requireUser();
  const userId = session.user.id;

  await connectDb();

  const userDoc = await User.findById(userId)
    .select('plan stripeCustomerId stripeSubscriptionId subscriptionStatus cancelAtPeriodEnd usage')
    .lean();
  const agentCount = await Agent.countDocuments({ userId: new Types.ObjectId(userId) });

  // Reconcile against Stripe — webhooks can be late, dropped, or unconfigured
  // in dev. We pull the live subscription state on every render so the
  // dashboard never lies about an already-cancelled plan. The local DB is
  // patched inline so subsequent reads / quota checks see the same truth.
  const live = await reconcileWithStripe(userId, userDoc);

  const planKey = live.plan ?? (userDoc?.plan as UserPlan) ?? 'free';
  const plan = getPlan(planKey);
  const subscriptionStatus = live.subscriptionStatus ?? userDoc?.subscriptionStatus ?? null;
  const cancelAtPeriodEnd = live.cancelAtPeriodEnd ?? !!userDoc?.cancelAtPeriodEnd;
  const callsUsed = userDoc?.usage?.callsThisPeriod ?? 0;
  const periodEnd = live.periodEnd ?? userDoc?.usage?.periodEnd ?? null;

  // Invoices come from Stripe directly — never the local copy. Fail soft
  // when no customer exists yet (free users) or Stripe errors.
  let invoices: BillingViewModel['invoices'] = [];
  if (userDoc?.stripeCustomerId) {
    try {
      const list = await getStripe().invoices.list({
        customer: userDoc.stripeCustomerId,
        limit: 12,
      });
      invoices = list.data.map((inv) => ({
        id: inv.id ?? 'unknown',
        number: inv.number ?? inv.id ?? 'invoice',
        amount: inv.amount_paid ?? inv.amount_due ?? 0,
        currency: inv.currency,
        status: inv.status ?? 'open',
        createdAt: new Date((inv.created ?? 0) * 1000).toISOString(),
        pdfUrl: inv.invoice_pdf ?? null,
        hostedUrl: inv.hosted_invoice_url ?? null,
      }));
    } catch {
      invoices = [];
    }
  }

  const view: BillingViewModel = {
    currentPlanKey: plan.key,
    subscriptionStatus,
    cancelAtPeriodEnd,
    hasStripeCustomer: !!userDoc?.stripeCustomerId,
    callsUsed,
    callsIncluded: plan.includedCalls,
    overageRatePerCall: plan.overageRatePerCall,
    allowOverage: plan.allowOverage,
    periodEnd: periodEnd?.toISOString() ?? null,
    agentCount,
    maxAgents: Number.isFinite(plan.maxAgents) ? plan.maxAgents : null,
    invoices,
    plans: Object.values(PLANS).map((p) => ({
      key: p.key,
      displayName: p.displayName,
      priceUsd: p.priceUsd,
      includedCalls: p.includedCalls,
      maxAgents: Number.isFinite(p.maxAgents) ? p.maxAgents : null,
      allowPhone: p.allowPhone,
      overageRatePerCall: p.overageRatePerCall,
      canCheckout: !!p.priceId,
    })),
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Account"
        title="Billing"
        description="Plan, usage, and invoices."
        align="start"
      />
      <BillingClient view={view} />
    </div>
  );
}

type ReconciledStripeState = {
  plan: UserPlan | null;
  subscriptionStatus: SubscriptionStatus | null;
  cancelAtPeriodEnd: boolean | null;
  periodEnd: Date | null;
};

/**
 * Pulls the authoritative subscription state from Stripe, patches the
 * local user doc inline, and returns the reconciled values. Designed to
 * make local Mongo state catch up with Stripe whenever the billing page
 * is loaded — even without a `stripe listen` forwarder running.
 *
 * Behaviour:
 *   - No `stripeCustomerId` → no-op, returns nulls.
 *   - Customer exists but no subscriptions → user is on Free; we clear
 *     any stale paid-plan fields on the doc.
 *   - Customer with one+ subscriptions → use the most recent one. Map
 *     its status, `cancel_at_period_end`, and `current_period_end` into
 *     our schema.
 *
 * Errors are swallowed (`logError`) so a Stripe outage never blocks the
 * billing page from rendering — the local doc's last-known-good values
 * are used as a fallback in the caller.
 */
async function reconcileWithStripe(
  userId: string,
  userDoc: {
    plan?: UserPlan;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscriptionStatus?: SubscriptionStatus;
    cancelAtPeriodEnd?: boolean;
  } | null,
): Promise<ReconciledStripeState> {
  const empty: ReconciledStripeState = {
    plan: null,
    subscriptionStatus: null,
    cancelAtPeriodEnd: null,
    periodEnd: null,
  };
  if (!userDoc?.stripeCustomerId) return empty;

  try {
    const stripe = getStripe();
    const subs = await stripe.subscriptions.list({
      customer: userDoc.stripeCustomerId,
      status: 'all',
      limit: 5,
    });

    // No subscriptions in Stripe → user is on Free. Heal the local doc
    // if it still thinks otherwise.
    if (subs.data.length === 0) {
      if (
        userDoc.plan !== 'free' ||
        userDoc.subscriptionStatus !== 'canceled' ||
        userDoc.cancelAtPeriodEnd
      ) {
        await User.updateOne(
          { _id: userId },
          {
            $set: {
              plan: 'free',
              subscriptionStatus: 'canceled',
              cancelAtPeriodEnd: false,
            },
            $unset: { stripeSubscriptionId: 1 },
          },
        );
      }
      return {
        plan: 'free',
        subscriptionStatus: 'canceled',
        cancelAtPeriodEnd: false,
        periodEnd: null,
      };
    }

    // Pick the most-recently-created non-trash subscription. Stripe
    // sometimes keeps stale `canceled` rows around alongside an active
    // one if the customer churned and resubscribed.
    const sorted = [...subs.data].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
    const active = sorted.find((s) => s.status !== 'canceled' && s.status !== 'incomplete_expired');
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

    // If Stripe is canceled (no active sub at all), revert to Free.
    const effectivePlan: UserPlan = status === 'canceled' || !active ? plan ?? 'free' : plan ?? 'free';
    const finalPlan: UserPlan = status === 'canceled' || !active ? 'free' : effectivePlan;

    // Patch the local doc inline so quota checks elsewhere see the same
    // truth on the very next request.
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

    return {
      plan: finalPlan,
      subscriptionStatus: status,
      cancelAtPeriodEnd,
      periodEnd,
    };
  } catch (e) {
    void logError(e, { scope: 'billing-reconcile', userId });
    return empty;
  }
}

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
