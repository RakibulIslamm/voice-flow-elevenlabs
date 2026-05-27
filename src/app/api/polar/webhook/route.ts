import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';
import { connectDb } from '@/lib/db/connect';
import { User, type SubscriptionStatus } from '@/lib/db/models/user';
import { BillingEvent } from '@/lib/db/models/billing-event';
import { planFromPolarProductId } from '@/lib/billing/plans';
import { resetUsagePeriod } from '@/lib/usage/reset-period';
import { sendEmail } from '@/lib/email/resend';
import { env } from '@/lib/env';
import { logError } from '@/lib/tracking/log-error';
import { trackEvent } from '@/lib/tracking/event';

/**
 * Polar webhook endpoint. Same shape as the Stripe webhook: read the raw
 * body, verify the signature with the SDK helper, write a `BillingEvent`
 * row first for idempotency (`stripeEventId` doubles as the unique key
 * for any provider — we put Polar's event id there), then dispatch to
 * per-type handlers.
 *
 * Polar event types we care about:
 *   - `subscription.created` / `subscription.updated` — keep plan + flags
 *     in sync. `subscription.canceled` is delivered as an update with
 *     `cancelAtPeriodEnd: true` (period-end cancel) and a separate
 *     `subscription.revoked` for immediate.
 *   - `order.paid` — billing-cycle invoice equivalent; resets quota.
 */
export async function POST(req: NextRequest): Promise<Response> {
  // Hard gate — when POLAR_SDK is off, this route is dormant. Mirror
  // the Stripe webhook's 404 so the inactive provider is invisible.
  if (!env.POLAR_SDK) {
    return new NextResponse('Not found', { status: 404 });
  }
  if (!env.POLAR_WEBHOOK_SECRET) {
    void logError(new Error('POLAR_WEBHOOK_SECRET is not configured'), {
      scope: 'polar-webhook',
      stage: 'config',
    });
    return new NextResponse('Webhook misconfigured', { status: 500 });
  }

  const rawBody = await req.text();
  // Polar's validator takes the bag of headers as a plain record — pull
  // them out of NextRequest in the shape it expects.
  const headers: Record<string, string> = {};
  for (const [k, v] of req.headers) headers[k] = v;

  let event: PolarWebhookEvent;
  try {
    event = validateEvent(rawBody, headers, env.POLAR_WEBHOOK_SECRET) as PolarWebhookEvent;
  } catch (e) {
    if (e instanceof WebhookVerificationError) {
      return new NextResponse('Invalid signature', { status: 401 });
    }
    void logError(e, { scope: 'polar-webhook', stage: 'verify-signature' });
    return new NextResponse('Invalid signature', { status: 401 });
  }

  await connectDb();

  const eventId = pickEventId(event, rawBody);
  try {
    await BillingEvent.create({
      stripeEventId: `polar_${eventId}`,
      type: event.type,
      data: event.data,
    });
  } catch (e: unknown) {
    if (isDuplicateKeyError(e)) {
      return NextResponse.json({ received: true, deduped: true });
    }
    void logError(e, { scope: 'polar-webhook', stage: 'ledger', eventId });
  }

  try {
    switch (event.type) {
      case 'subscription.created':
      case 'subscription.updated':
      case 'subscription.active':
        await handleSubscriptionMutation(event);
        break;
      case 'subscription.canceled':
        await handleSubscriptionCanceled(event);
        break;
      case 'subscription.revoked':
        await handleSubscriptionRevoked(event);
        break;
      case 'subscription.uncanceled':
        await handleSubscriptionUncanceled(event);
        break;
      case 'order.paid':
      case 'order.created':
        await handleOrderPaid(event);
        break;
      case 'order.refunded':
        await handleOrderRefunded(event);
        break;
      default:
        // Ignore — we only act on the subset above.
        break;
    }
  } catch (e) {
    void logError(e, {
      scope: 'polar-webhook',
      stage: `handle:${event.type}`,
      eventId,
    });
    return new NextResponse('Handler error', { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleSubscriptionMutation(event: PolarWebhookEvent): Promise<void> {
  const sub = event.data as PolarSubscription;
  const userId = await findUserIdForSubscription(sub);
  if (!userId) return;
  const plan = planFromPolarProductId(sub.productId ?? null);
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        plan: plan ?? 'free',
        subscriptionStatus: 'active' as SubscriptionStatus,
        cancelAtPeriodEnd: !!sub.cancelAtPeriodEnd,
        polarSubscriptionId: sub.id,
        polarCustomerId: sub.customerId,
        ...(sub.currentPeriodEnd
          ? { 'usage.periodEnd': new Date(sub.currentPeriodEnd) }
          : {}),
        ...(sub.currentPeriodStart
          ? { 'usage.periodStart': new Date(sub.currentPeriodStart) }
          : {}),
      },
    },
  );
  void trackEvent('billing.subscription_started', {
    userId,
    properties: { plan, provider: 'polar' },
  });
}

async function handleSubscriptionCanceled(event: PolarWebhookEvent): Promise<void> {
  // Polar's `subscription.canceled` is the period-end cancel flag. The
  // sub is still active until `currentPeriodEnd`.
  const sub = event.data as PolarSubscription;
  const userId = await findUserIdForSubscription(sub);
  if (!userId) return;
  await User.updateOne(
    { _id: userId },
    { $set: { cancelAtPeriodEnd: true, subscriptionStatus: 'active' as SubscriptionStatus } },
  );
}

async function handleSubscriptionRevoked(event: PolarWebhookEvent): Promise<void> {
  const sub = event.data as PolarSubscription;
  const userId = await findUserIdForSubscription(sub);
  if (!userId) return;
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        plan: 'free',
        subscriptionStatus: 'canceled' as SubscriptionStatus,
        cancelAtPeriodEnd: false,
      },
      $unset: { polarSubscriptionId: 1 },
    },
  );
  void trackEvent('billing.subscription_canceled', { userId, properties: { provider: 'polar' } });
}

async function handleSubscriptionUncanceled(event: PolarWebhookEvent): Promise<void> {
  const sub = event.data as PolarSubscription;
  const userId = await findUserIdForSubscription(sub);
  if (!userId) return;
  await User.updateOne(
    { _id: userId },
    { $set: { cancelAtPeriodEnd: false, subscriptionStatus: 'active' as SubscriptionStatus } },
  );
}

async function handleOrderPaid(event: PolarWebhookEvent): Promise<void> {
  const order = event.data as PolarOrder;
  const userId = await findUserIdForOrder(order);
  if (!userId) return;
  // Orders carry the billing period range too.
  const start = order.subscription?.currentPeriodStart;
  const end = order.subscription?.currentPeriodEnd;
  if (start && end) {
    await resetUsagePeriod(userId, new Date(start), new Date(end));
  }
  await User.updateOne(
    { _id: userId },
    { $set: { subscriptionStatus: 'active' as SubscriptionStatus } },
  );
}

async function handleOrderRefunded(event: PolarWebhookEvent): Promise<void> {
  const order = event.data as PolarOrder;
  const userId = await findUserIdForOrder(order);
  if (!userId) return;
  const user = await User.findById(userId).select('email').lean<{ email?: string } | null>();
  if (user?.email) {
    void sendEmail({
      to: user.email,
      subject: 'VoiceFlow — refund processed',
      text: 'A refund has been issued for your latest invoice. Reply if anything looks off.',
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findUserIdForSubscription(sub: PolarSubscription): Promise<string | null> {
  // Polar copies our externalCustomerId through to the subscription
  // (set during checkout). Fall back to the customer lookup if missing.
  const externalId = sub.customer?.externalId ?? sub.metadata?.userId;
  if (externalId) return String(externalId);
  if (sub.customerId) {
    const user = await User.findOne({ polarCustomerId: sub.customerId }).select('_id').lean();
    return user?._id?.toString() ?? null;
  }
  return null;
}

async function findUserIdForOrder(order: PolarOrder): Promise<string | null> {
  const externalId = order.customer?.externalId ?? order.metadata?.userId;
  if (externalId) return String(externalId);
  if (order.customerId) {
    const user = await User.findOne({ polarCustomerId: order.customerId }).select('_id').lean();
    return user?._id?.toString() ?? null;
  }
  return null;
}

function pickEventId(event: PolarWebhookEvent, rawBody: string): string {
  // Polar attaches an `id` on the webhook envelope; fall back to a hash
  // of the body for the rare case where the SDK strips it.
  if (typeof event.id === 'string' && event.id) return event.id;
  // Cheap stable identifier — first 32 hex chars are enough for dedupe.
  return require('node:crypto').createHash('sha256').update(rawBody).digest('hex').slice(0, 32);
}

function isDuplicateKeyError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const code = (e as { code?: unknown }).code;
  return code === 11000 || code === 11001;
}

// ---------------------------------------------------------------------------
// Local types — narrow shapes of the Polar webhook payloads we touch.
// ---------------------------------------------------------------------------

type PolarWebhookEvent = {
  id?: string;
  type: string;
  data: unknown;
};

type PolarSubscription = {
  id: string;
  customerId: string;
  productId?: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart?: string | Date | null;
  currentPeriodEnd?: string | Date | null;
  metadata?: { userId?: string } | null;
  customer?: { externalId?: string | null } | null;
};

type PolarOrder = {
  id: string;
  customerId: string;
  metadata?: { userId?: string } | null;
  customer?: { externalId?: string | null } | null;
  subscription?: {
    currentPeriodStart?: string | Date | null;
    currentPeriodEnd?: string | Date | null;
  } | null;
};
