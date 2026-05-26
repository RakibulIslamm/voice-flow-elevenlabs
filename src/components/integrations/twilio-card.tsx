import Link from 'next/link';
import { ArrowRight, CheckCircle2, Lock, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { UserPlan } from '@/lib/db/models/user';

const PHONE_PLANS = new Set<UserPlan>(['pro', 'business']);

/**
 * Slim list-style card on the Integrations overview. Three states:
 *
 *   1. Locked (free/starter) → muted, "Pro plan" badge, links to detail
 *      which then upsells to /dashboard/billing.
 *   2. Eligible but disconnected → voice-tinted prompt, links to detail.
 *   3. Connected → emerald check, account preview, links to detail.
 */
export function TwilioCard({
  plan,
  connected,
  accountSidPreview,
}: {
  plan: UserPlan;
  connected: boolean;
  accountSidPreview?: string;
}) {
  const supported = PHONE_PLANS.has(plan);
  const state: 'locked' | 'disconnected' | 'connected' = !supported
    ? 'locked'
    : connected
      ? 'connected'
      : 'disconnected';

  return (
    <Link
      href="/dashboard/integrations/twilio"
      className={cn(
        'group relative flex items-center gap-4 overflow-hidden rounded-2xl border bg-card/30 p-5 transition sm:p-6',
        state === 'locked' && 'border-border/70 hover:border-amber-500/30 hover:bg-card/50',
        state === 'disconnected' && 'border-border/70 hover:border-voice/40 hover:bg-card/60',
        state === 'connected' && 'border-emerald-500/20 hover:border-emerald-500/40 hover:bg-card/60',
      )}
    >
      <div
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-xl ring-1',
          state === 'locked' && 'bg-muted text-muted-foreground ring-border',
          state === 'disconnected' && 'bg-voice/10 text-voice ring-voice/20',
          state === 'connected' && 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400',
        )}
      >
        <Phone className="size-5" aria-hidden />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium text-foreground">Twilio Voice</h3>
          {state === 'locked' ? (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              <Lock className="mr-1 size-2.5" />
              Pro plan
            </Badge>
          ) : state === 'connected' ? (
            <Badge className="border-emerald-500/30 bg-emerald-500/10 text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="mr-1 size-2.5" />
              Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              Not connected
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {state === 'connected' && accountSidPreview
            ? `Account ${accountSidPreview} · phone calling for your AI receptionists`
            : 'Phone calling for your AI receptionists'}
        </p>
      </div>

      <span className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground transition group-hover:text-foreground">
        {state === 'connected' ? 'Manage' : 'Details'}
        <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
