import { Types } from 'mongoose';
import { requireUser } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import { User, type UserPlan } from '@/lib/db/models/user';
import { Agent } from '@/lib/db/models/agent';
import { getPlan, PLANS } from '@/lib/billing/plans';
import { getBillingProvider } from '@/lib/billing';
import { PageHeader } from '@/components/layout/page-header';
import { BillingClient, type BillingViewModel } from './billing-client';

export const metadata = { title: 'Billing · VoiceFlow' };

export default async function BillingPage() {
  const session = await requireUser();
  const userId = session.user.id;

  await connectDb();

  const userDoc = await User.findById(userId)
    .select(
      'plan stripeCustomerId stripeSubscriptionId polarCustomerId polarSubscriptionId subscriptionStatus cancelAtPeriodEnd usage',
    )
    .lean();
  const agentCount = await Agent.countDocuments({ userId: new Types.ObjectId(userId) });

  // The active provider's `reconcile()` pulls live state from Stripe or
  // Polar (depending on `POLAR_SDK`) and patches the local doc inline,
  // so webhooks being late / dropped / unconfigured can't cause the
  // dashboard to lie about an already-cancelled plan.
  const provider = getBillingProvider();
  const [live, invoices] = await Promise.all([
    provider.reconcile({ userId }),
    provider.listInvoices({ userId }),
  ]);

  const planKey = live.plan ?? (userDoc?.plan as UserPlan) ?? 'free';
  const plan = getPlan(planKey);
  const subscriptionStatus = live.status ?? userDoc?.subscriptionStatus ?? null;
  const cancelAtPeriodEnd = live.cancelAtPeriodEnd ?? !!userDoc?.cancelAtPeriodEnd;
  const callsUsed = userDoc?.usage?.callsThisPeriod ?? 0;
  const periodEnd = live.periodEnd ?? userDoc?.usage?.periodEnd ?? null;
  const periodStart = userDoc?.usage?.periodStart ?? null;

  // "Has a billing customer" is provider-agnostic — Stripe customer OR
  // Polar customer counts.
  const hasBillingCustomer =
    provider.name === 'polar'
      ? !!userDoc?.polarCustomerId
      : !!userDoc?.stripeCustomerId;

  const view: BillingViewModel = {
    currentPlanKey: plan.key,
    subscriptionStatus,
    cancelAtPeriodEnd,
    hasBillingCustomer,
    callsUsed,
    callsIncluded: plan.includedCalls,
    overageRatePerCall: plan.overageRatePerCall,
    allowOverage: plan.allowOverage,
    periodStart: periodStart?.toISOString() ?? null,
    periodEnd: periodEnd?.toISOString() ?? null,
    agentCount,
    maxAgents: Number.isFinite(plan.maxAgents) ? plan.maxAgents : null,
    invoices,
    provider: provider.name,
    plans: Object.values(PLANS).map((p) => ({
      key: p.key,
      displayName: p.displayName,
      priceUsd: p.priceUsd,
      includedCalls: p.includedCalls,
      maxAgents: Number.isFinite(p.maxAgents) ? p.maxAgents : null,
      allowPhone: p.allowPhone,
      overageRatePerCall: p.overageRatePerCall,
      // Whether the active provider has this tier configured. Polar
      // mode uses polarProductId; Stripe mode uses priceId.
      canCheckout:
        provider.name === 'polar' ? !!p.polarProductId : !!p.priceId,
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
