import 'server-only';
import type { UserPlan, SubscriptionStatus } from '@/lib/db/models/user';

/**
 * Shared narrow shape of a billing provider. Both the Stripe and Polar
 * adapters implement this so the rest of the app — API routes, billing
 * page, post-call usage hook — never branches on `POLAR_SDK` itself.
 *
 * Methods are deliberately userId-oriented (not customerId): each
 * provider resolves its own customer record internally from the local
 * user doc. That keeps the contract symmetrical even though the two
 * platforms use different ID shapes.
 */
export type BillingProvider = {
  /** Identifier for telemetry / debug logging. */
  readonly name: 'stripe' | 'polar';

  createCheckoutSession(args: {
    userId: string;
    userEmail: string;
    plan: PaidPlanKey;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;

  createPortalSession(args: {
    userId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;

  /** Set `cancel_at_period_end` (or equivalent). Sub stays active. */
  scheduleCancel(args: { userId: string }): Promise<void>;

  /** Undo a scheduled cancel — clears `cancel_at_period_end`. */
  resumeSubscription(args: { userId: string }): Promise<void>;

  /**
   * Pulls the live subscription from the provider and returns the
   * reconciled state. Used by the billing page on every render so the
   * UI never lies about an already-cancelled plan when webhooks lag.
   */
  reconcile(args: { userId: string }): Promise<ReconciledSubscription>;

  /** Invoice history for the billing page. */
  listInvoices(args: { userId: string }): Promise<InvoiceVM[]>;

  /**
   * Records one billable call. For Stripe → meter event; for Polar →
   * `events.ingest`. `callId` doubles as the idempotency key so a
   * webhook retry never double-bills.
   */
  reportCallUsage(args: { userId: string; callId: string }): Promise<void>;
};

export type PaidPlanKey = Exclude<UserPlan, 'free'>;

export type ReconciledSubscription = {
  plan: UserPlan | null;
  status: SubscriptionStatus | null;
  cancelAtPeriodEnd: boolean | null;
  periodEnd: Date | null;
};

export type InvoiceVM = {
  id: string;
  number: string;
  /** Smallest currency unit (cents). */
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  pdfUrl: string | null;
  hostedUrl: string | null;
};
