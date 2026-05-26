import { Types } from 'mongoose';
import { requireUser } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import { User } from '@/lib/db/models/user';
import { Agent } from '@/lib/db/models/agent';
import { getPlan, PLANS } from '@/lib/stripe/plans';
import { getStripe } from '@/lib/stripe/client';
import { PageHeader } from '@/components/layout/page-header';
import { BillingClient, type BillingViewModel } from './billing-client';

export const metadata = { title: 'Billing · VoiceFlow' };

export default async function BillingPage() {
  const session = await requireUser();
  const userId = session.user.id;

  await connectDb();

  const userDoc = await User.findById(userId)
    .select('plan stripeCustomerId stripeSubscriptionId subscriptionStatus usage')
    .lean();
  const agentCount = await Agent.countDocuments({ userId: new Types.ObjectId(userId) });

  const plan = getPlan(userDoc?.plan ?? 'free');
  const callsUsed = userDoc?.usage?.callsThisPeriod ?? 0;
  const periodEnd = userDoc?.usage?.periodEnd ?? null;

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
    subscriptionStatus: userDoc?.subscriptionStatus ?? null,
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
