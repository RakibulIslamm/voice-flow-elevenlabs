import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { connectDb } from '@/lib/db/connect';
import { User, type UserPlan, type SubscriptionStatus } from '@/lib/db/models/user';
import { BillingEvent } from '@/lib/db/models/billing-event';
import { getStripe } from '@/lib/billing/stripe/client';
import { planFromPriceId } from '@/lib/billing/plans';
import { resetUsagePeriod } from '@/lib/usage/reset-period';
import { sendEmail } from '@/lib/email/resend';
import { env } from '@/lib/env';
import { logError } from '@/lib/tracking/log-error';
import { trackEvent } from '@/lib/tracking/event';

/**
 * Stripe webhook endpoint. Notable departures from the rest of the API:
 *   - Raw body is required for signature verification — we read it via
 *     `await req.text()` and never let Next parse it as JSON.
 *   - We do NOT use `safeRoute` (it consumes the body via .json()).
 *   - Signature verification with `stripe.webhooks.constructEvent` —
 *     failure returns 401 immediately, no log noise.
 *   - Idempotency anchored on `BillingEvent.stripeEventId` unique index:
 *     Stripe retries the same event on 5xx; if we've already inserted it
 *     we 200 the retry without re-running the handler.
 *
 * Latency budget: Stripe times out the request after 30 s but treats
 * anything over a few seconds as suspicious — keep the handler tight.
 */
export async function POST(req: NextRequest): Promise<Response> {
  // Hard gate — when POLAR_SDK is on, this route is dormant. Returning
  // 404 (not 500) keeps the inactive provider invisible to scanners and
  // prevents accidental side-effects if Stripe is still pointed at us.
  if (env.POLAR_SDK) {
    return new NextResponse('Not found', { status: 404 });
  }
  if (!env.STRIPE_WEBHOOK_SECRET) {
    void logError(new Error('STRIPE_WEBHOOK_SECRET is not configured'), {
      scope: 'stripe-webhook',
      stage: 'config',
    });
    return new NextResponse('Webhook misconfigured', { status: 500 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new NextResponse('Missing signature', { status: 401 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    void logError(e, { scope: 'stripe-webhook', stage: 'verify-signature' });
    return new NextResponse('Invalid signature', { status: 401 });
  }

  await connectDb();

  // Idempotency — record FIRST, then process. If the insert collides on
  // the unique index, we've seen this event before; 200 silently.
  try {
    await BillingEvent.create({ stripeEventId: event.id, type: event.type, data: event.data });
  } catch (e: unknown) {
    if (isDuplicateKeyError(e)) {
      return NextResponse.json({ received: true, deduped: true });
    }
    void logError(e, { scope: 'stripe-webhook', stage: 'ledger', stripeEventId: event.id });
    // Continue anyway — losing the ledger row is recoverable, dropping
    // the event is not.
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event);
        break;
      default:
        // Ignore — we don't subscribe to other events in test mode but
        // Stripe occasionally fires the same family.
        break;
    }
  } catch (e) {
    // Any handler-level throw is a 500 so Stripe retries. The original
    // error lives in the ErrorLog for an operator to investigate.
    void logError(e, {
      scope: 'stripe-webhook',
      stage: `handle:${event.type}`,
      stripeEventId: event.id,
    });
    return new NextResponse('Handler error', { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.metadata?.userId as string | undefined;
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  if (!userId || !customerId || !subscriptionId) return;

  // Pull the subscription back so we can read the plan + current period.
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  const { plan, periodStart, periodEnd } = readSubscriptionContext(subscription);

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        plan: plan ?? 'starter',
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus: 'active' as SubscriptionStatus,
        cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
        'usage.callsThisPeriod': 0,
        'usage.periodStart': periodStart,
        'usage.periodEnd': periodEnd,
      },
    },
  );

  void trackEvent('billing.subscription_started', {
    userId,
    properties: { plan, subscriptionId },
  });
}

async function handleSubscriptionUpdated(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const userId = await findUserIdForSubscription(subscription);
  if (!userId) return;
  const { plan, status, periodStart, periodEnd } = readSubscriptionContext(subscription);

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        plan: plan ?? 'free',
        subscriptionStatus: status,
        stripeSubscriptionId: subscription.id,
        // Cancel-at-period-end is the path the Customer Portal "cancel"
        // button takes — the subscription stays `active` until the
        // period ends. We mirror the flag so the UI can render the
        // right copy ("Cancels …" instead of "Renews …").
        cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
        ...(periodStart ? { 'usage.periodStart': periodStart } : {}),
        ...(periodEnd ? { 'usage.periodEnd': periodEnd } : {}),
      },
    },
  );
}

async function handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const userId = await findUserIdForSubscription(subscription);
  if (!userId) return;

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        plan: 'free',
        subscriptionStatus: 'canceled' as SubscriptionStatus,
        cancelAtPeriodEnd: false,
      },
      $unset: { stripeSubscriptionId: 1 },
    },
  );
  void trackEvent('billing.subscription_canceled', { userId });
}

async function handleInvoicePaid(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const userId = await findUserIdForInvoice(invoice);
  if (!userId) return;

  const periodStart = pickInvoicePeriod(invoice, 'start');
  const periodEnd = pickInvoicePeriod(invoice, 'end');
  if (periodStart && periodEnd) {
    await resetUsagePeriod(userId, periodStart, periodEnd);
  }
  // Promote out of past_due on a successful payment.
  await User.updateOne(
    { _id: userId },
    { $set: { subscriptionStatus: 'active' as SubscriptionStatus } },
  );
}

async function handleInvoicePaymentFailed(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const userId = await findUserIdForInvoice(invoice);
  if (!userId) return;

  await User.updateOne(
    { _id: userId },
    { $set: { subscriptionStatus: 'past_due' as SubscriptionStatus } },
  );

  const user = await User.findById(userId).select('email').lean<{ email?: string } | null>();
  if (user?.email) {
    const baseUrl = (env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    void sendEmail({
      to: user.email,
      subject: 'VoiceFlow — payment failed',
      text: [
        'Hi,',
        '',
        'We could not process your latest VoiceFlow invoice. New calls have been paused until your billing is up to date.',
        '',
        `Update your payment method here: ${baseUrl}/dashboard/billing`,
        '',
        'Reply to this email if you need help.',
      ].join('\n'),
    });
  }

  void trackEvent('billing.payment_failed', { userId, properties: { invoiceId: invoice.id } });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSubscriptionContext(subscription: Stripe.Subscription): {
  plan: UserPlan | null;
  status: SubscriptionStatus;
  periodStart: Date | undefined;
  periodEnd: Date | undefined;
} {
  // Find the FIXED recurring price ID across all line items — the metered
  // overage line item won't map to a plan key.
  let plan: UserPlan | null = null;
  for (const item of subscription.items.data) {
    const candidate = planFromPriceId(item.price?.id ?? null);
    if (candidate) {
      plan = candidate;
      break;
    }
  }
  const status = mapStatus(subscription.status);
  // Stripe's typings call these snake_case on the wire — pull defensively.
  const raw = subscription as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  const periodStart = raw.current_period_start
    ? new Date(raw.current_period_start * 1000)
    : undefined;
  const periodEnd = raw.current_period_end
    ? new Date(raw.current_period_end * 1000)
    : undefined;
  return { plan, status, periodStart, periodEnd };
}

function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
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

async function findUserIdForSubscription(subscription: Stripe.Subscription): Promise<string | null> {
  const metaUserId = (subscription.metadata as Record<string, string> | undefined)?.userId;
  if (metaUserId) return metaUserId;
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  if (!customerId) return null;
  const user = await User.findOne({ stripeCustomerId: customerId }).select('_id').lean();
  return user?._id?.toString() ?? null;
}

async function findUserIdForInvoice(invoice: Stripe.Invoice): Promise<string | null> {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) return null;
  const user = await User.findOne({ stripeCustomerId: customerId }).select('_id').lean();
  return user?._id?.toString() ?? null;
}

function pickInvoicePeriod(invoice: Stripe.Invoice, edge: 'start' | 'end'): Date | undefined {
  // Period sits on each line item; we use the *recurring* line (not the
  // metered one) since both should agree but the recurring is canonical.
  for (const line of invoice.lines?.data ?? []) {
    const period = (line as unknown as { period?: { start?: number; end?: number } }).period;
    const ts = edge === 'start' ? period?.start : period?.end;
    if (ts) return new Date(ts * 1000);
  }
  return undefined;
}

function isDuplicateKeyError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const code = (e as { code?: unknown }).code;
  return code === 11000 || code === 11001;
}
