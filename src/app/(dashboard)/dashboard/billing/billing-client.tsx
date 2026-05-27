'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CreditCard,
  Download,
  Gauge,
  Loader2,
  Phone,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import type { UserPlan, SubscriptionStatus } from '@/lib/db/models/user';

export type BillingViewModel = {
  currentPlanKey: UserPlan;
  subscriptionStatus: SubscriptionStatus;
  /**
   * Stripe `cancel_at_period_end` mirror. When true the subscription is
   * still `active` (and the user still gets paid features) but it will
   * auto-cancel at `periodEnd` — drives "Cancels …" copy.
   */
  cancelAtPeriodEnd: boolean;
  hasStripeCustomer: boolean;
  callsUsed: number;
  callsIncluded: number;
  overageRatePerCall: number;
  allowOverage: boolean;
  periodEnd: string | null;
  agentCount: number;
  maxAgents: number | null;
  invoices: Array<{
    id: string;
    number: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
    pdfUrl: string | null;
    hostedUrl: string | null;
  }>;
  plans: Array<{
    key: UserPlan;
    displayName: string;
    priceUsd: number;
    includedCalls: number;
    maxAgents: number | null;
    allowPhone: boolean;
    overageRatePerCall: number;
    canCheckout: boolean;
  }>;
};

export function BillingClient({ view }: { view: BillingViewModel }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
        <CurrentPlanCard view={view} />
        <CallsUsageCard view={view} />
        <AgentsCard view={view} />
      </div>
      <PastDueBanner view={view} />
      <PlanComparison view={view} />
      <InvoicesCard view={view} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Current plan
// ---------------------------------------------------------------------------

function CurrentPlanCard({ view }: { view: BillingViewModel }) {
  const current = view.plans.find((p) => p.key === view.currentPlanKey)!;
  const isPaid = current.priceUsd > 0;
  // Only render the subscription-status pill when there's a Stripe
  // customer attached. For free users (or for paid plans that were
  // manually set without going through checkout) the pill is noise.
  const statusBadge = (() => {
    if (!view.hasStripeCustomer) return null;
    // A cancel_at_period_end subscription is still Stripe-active but the
    // user has signalled intent to leave — call it out explicitly so
    // "Active" doesn't mislead them into thinking the cancel failed.
    if (view.subscriptionStatus === 'active' && view.cancelAtPeriodEnd) {
      return (
        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">
          Canceling
        </Badge>
      );
    }
    switch (view.subscriptionStatus) {
      case 'active':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
            Active
          </Badge>
        );
      case 'past_due':
        return <Badge className="bg-destructive/15 text-destructive">Past due</Badge>;
      case 'canceled':
        return <Badge variant="outline">Canceled</Badge>;
      default:
        return null;
    }
  })();

  // CTA logic — four states:
  //   1. Has a Stripe customer AND an active sub → portal + "Cancel now"
  //      (the "Cancel" inside the portal does cancel-at-period-end by
  //       default; we offer a separate immediate cancel for users who
  //       want it gone right away).
  //   2. Has a Stripe customer but no active sub → portal only.
  //   3. Free with Starter price configured → "Upgrade to Starter".
  //   4. On a paid plan but no Stripe customer (ops manually flipped the
  //      doc) → "Subscribe to {plan}".
  const hasActiveSub =
    view.subscriptionStatus === 'active' || view.subscriptionStatus === 'past_due';
  const cta = (() => {
    if (view.hasStripeCustomer) {
      return (
        <>
          <PortalButton />
          {hasActiveSub && view.cancelAtPeriodEnd ? (
            <ResumeSubscriptionButton />
          ) : hasActiveSub ? (
            <CancelSubscriptionButton />
          ) : null}
        </>
      );
    }
    if (!isPaid) {
      const starter = view.plans.find((p) => p.key === 'starter');
      if (starter?.canCheckout) {
        return (
          <CheckoutButton plan="starter" variant="default">
            Upgrade to Starter
          </CheckoutButton>
        );
      }
      return null;
    }
    if (current.canCheckout) {
      return (
        <CheckoutButton
          plan={current.key as 'starter' | 'pro' | 'business'}
          variant="default"
        >
          Subscribe to {current.displayName}
        </CheckoutButton>
      );
    }
    return null;
  })();

  return (
    <Card className="lg:col-span-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <CreditCard className="size-4 text-voice" />
          Current plan
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="font-serif text-3xl tracking-tight">{current.displayName}</p>
          <p className="text-sm text-muted-foreground">
            {isPaid ? `$${current.priceUsd}/mo` : 'Free'}
          </p>
        </div>
        {statusBadge || view.periodEnd ? (
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge}
            {view.periodEnd ? (
              <span className="text-xs text-muted-foreground">
                {view.cancelAtPeriodEnd ? 'Cancels' : 'Renews'}{' '}
                {formatDate(view.periodEnd)}
                {view.cancelAtPeriodEnd ? (
                  <span className="ml-1 text-amber-700 dark:text-amber-300">
                    · {formatDaysRemaining(view.periodEnd)}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        ) : null}
        {cta ? <div className="flex flex-wrap gap-2 pt-2">{cta}</div> : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Usage cards
// ---------------------------------------------------------------------------

function CallsUsageCard({ view }: { view: BillingViewModel }) {
  const ratio = view.callsIncluded ? view.callsUsed / view.callsIncluded : 0;
  const pct = Math.min(100, ratio * 100);
  const tone = ratio >= 1 ? 'bg-destructive' : ratio >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500';
  const isOver = view.callsUsed > view.callsIncluded;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Gauge className="size-4 text-voice" />
          Calls this period
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="font-mono text-2xl tabular-nums">
          {view.callsUsed.toLocaleString()}
          <span className="ml-1 text-base text-muted-foreground">
            / {view.callsIncluded.toLocaleString()}
          </span>
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full transition-all', tone)} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          {view.periodEnd ? `Resets ${formatDate(view.periodEnd)}` : 'No active period.'}
        </p>
        {isOver && view.allowOverage ? (
          <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
            You'll be charged ${view.overageRatePerCall.toFixed(3)} per call beyond your plan.
          </p>
        ) : null}
        {ratio > 0.8 && !view.allowOverage ? (
          <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
            Upgrade to Starter for 1,000 calls/mo and per-call overage.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AgentsCard({ view }: { view: BillingViewModel }) {
  const cap = view.maxAgents == null ? '∞' : view.maxAgents.toString();
  const atLimit = view.maxAgents != null && view.agentCount >= view.maxAgents;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Users className="size-4 text-voice" />
          Agents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="font-mono text-2xl tabular-nums">
          {view.agentCount}
          <span className="ml-1 text-base text-muted-foreground">/ {cap}</span>
        </p>
        {atLimit ? (
          <p className="text-xs text-muted-foreground">
            You've hit the cap on this plan.
          </p>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/agents/new" className="inline-flex items-center gap-1.5">
              Create agent
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Past due banner
// ---------------------------------------------------------------------------

function PastDueBanner({ view }: { view: BillingViewModel }) {
  if (view.subscriptionStatus !== 'past_due') return null;
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent className="flex items-start gap-3 pt-6">
        <AlertTriangle className="mt-0.5 size-4 text-destructive" />
        <div className="space-y-2">
          <p className="text-sm font-medium text-destructive">Payment failed</p>
          <p className="text-xs text-muted-foreground">
            Stripe could not charge your card. New calls are paused until your billing is up to date.
          </p>
          <PortalButton variant="destructive" />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Plan comparison
// ---------------------------------------------------------------------------

function PlanComparison({ view }: { view: BillingViewModel }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Plans</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {view.plans.map((p) => {
            const isCurrent = p.key === view.currentPlanKey;
            const isHighlight = p.key === 'pro';
            return (
              <div
                key={p.key}
                className={cn(
                  'flex flex-col gap-3 rounded-xl border p-4',
                  isHighlight ? 'border-voice/40 bg-voice/5' : 'border-border/60',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-serif text-xl tracking-tight">{p.displayName}</p>
                    <p className="text-sm text-muted-foreground">
                      {p.priceUsd > 0 ? `$${p.priceUsd}/mo` : 'Free'}
                    </p>
                  </div>
                  {isCurrent ? (
                    <Badge className="bg-foreground/90 text-background">Current</Badge>
                  ) : isHighlight ? (
                    <Badge className="bg-voice/15 text-voice">Most popular</Badge>
                  ) : null}
                </div>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-center gap-1.5">
                    <Check className="size-3 text-emerald-500" />
                    {p.includedCalls.toLocaleString()} calls / month
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check className="size-3 text-emerald-500" />
                    {p.maxAgents == null ? 'Unlimited' : `${p.maxAgents}`} agents
                  </li>
                  <li className="flex items-center gap-1.5">
                    {p.allowPhone ? (
                      <Check className="size-3 text-emerald-500" />
                    ) : (
                      <span className="inline-flex size-3 items-center justify-center text-muted-foreground">×</span>
                    )}
                    <Phone className="size-3" />
                    {p.allowPhone ? 'Phone (BYOK Twilio)' : 'Phone not included'}
                  </li>
                  {p.overageRatePerCall > 0 ? (
                    <li className="flex items-center gap-1.5">
                      <Check className="size-3 text-emerald-500" />
                      Then ${p.overageRatePerCall.toFixed(3)}/call
                    </li>
                  ) : null}
                </ul>
                {isCurrent ? null : p.key === 'free' ? (
                  <Button size="sm" variant="outline" disabled>
                    Free tier
                  </Button>
                ) : p.canCheckout ? (
                  <CheckoutButton plan={p.key as 'starter' | 'pro' | 'business'} variant="outline">
                    {p.priceUsd >
                    (view.plans.find((x) => x.key === view.currentPlanKey)?.priceUsd ?? 0)
                      ? 'Upgrade'
                      : 'Switch'}
                  </CheckoutButton>
                ) : (
                  <Button size="sm" variant="outline" disabled>
                    Not configured
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

function InvoicesCard({ view }: { view: BillingViewModel }) {
  if (view.invoices.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No invoices yet. They'll appear here after your first paid period.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Invoices</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border/60">
          {view.invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div>
                <p className="font-medium">{inv.number}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(inv.createdAt)} · {formatStatus(inv.status)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono tabular-nums">
                  {formatAmount(inv.amount, inv.currency)}
                </span>
                {inv.pdfUrl ? (
                  <a
                    href={inv.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground transition hover:text-foreground"
                  >
                    <Download className="size-4" />
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

function CheckoutButton({
  plan,
  variant = 'default',
  children,
}: {
  plan: 'starter' | 'pro' | 'business';
  variant?: 'default' | 'outline';
  children: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function onClick() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan }),
        });
        const data = (await res.json()) as { url?: string; error?: { message?: string } };
        if (!res.ok || !data.url) {
          toast.error(data.error?.message ?? 'Could not open checkout.');
          return;
        }
        router.push(data.url);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not open checkout.');
      }
    });
  }
  return (
    <Button onClick={onClick} variant={variant} size="sm" disabled={pending}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
      {children}
    </Button>
  );
}

function CancelSubscriptionButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function onConfirm() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/stripe/cancel', { method: 'POST' });
        const data = (await res.json()) as { ok?: boolean; error?: { message?: string } };
        if (!res.ok || !data.ok) {
          toast.error(data.error?.message ?? 'Could not cancel your subscription.');
          return;
        }
        toast.success('Cancellation scheduled. Plan stays active until the period ends.');
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not cancel your subscription.');
      }
    });
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
          <X className="size-3.5" />
          Cancel subscription
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel at end of billing period?</AlertDialogTitle>
          <AlertDialogDescription>
            Your plan stays active until the current period ends, then reverts to Free.
            You can resume the subscription any time before then.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep subscription</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Yes, cancel at period end
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ResumeSubscriptionButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function onClick() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/stripe/resume', { method: 'POST' });
        const data = (await res.json()) as { ok?: boolean; error?: { message?: string } };
        if (!res.ok || !data.ok) {
          toast.error(data.error?.message ?? 'Could not resume your subscription.');
          return;
        }
        toast.success('Subscription resumed. Your plan will keep renewing.');
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not resume your subscription.');
      }
    });
  }
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={pending}
      className="border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      Resume subscription
    </Button>
  );
}

function PortalButton({
  variant = 'outline',
}: {
  variant?: 'default' | 'outline' | 'destructive';
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function onClick() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/stripe/portal', { method: 'POST' });
        const data = (await res.json()) as { url?: string; error?: { message?: string } };
        if (!res.ok || !data.url) {
          toast.error(data.error?.message ?? 'Could not open the billing portal.');
          return;
        }
        router.push(data.url);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not open the billing portal.');
      }
    });
  }
  return (
    <Button onClick={onClick} variant={variant} size="sm" disabled={pending}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
      Manage subscription
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatDaysRemaining(iso: string): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return '';
  const diffMs = target - Date.now();
  if (diffMs <= 0) return 'ends today';
  const days = Math.ceil(diffMs / 86_400_000);
  if (days === 1) return '1 day remaining';
  return `${days} days remaining`;
}
function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}
function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

