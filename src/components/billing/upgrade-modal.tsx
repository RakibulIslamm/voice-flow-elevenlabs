'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Loader2, Phone, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Compact 3-tier comparison surfaced from any "you've hit a quota" or
 * "this needs Pro" point in the app. Highlight prop drives the visual
 * accent so we can call out the specific tier that unblocks the user
 * (e.g. "Pro unlocks phone calling").
 */
export type UpgradeReason = 'calls' | 'agents' | 'phone' | 'generic';

const TIERS: Array<{
  key: 'starter' | 'pro' | 'business';
  displayName: string;
  priceUsd: number;
  includedCalls: number;
  maxAgents: string;
  allowPhone: boolean;
  overage: number;
}> = [
  {
    key: 'starter',
    displayName: 'Starter',
    priceUsd: 19,
    includedCalls: 1000,
    maxAgents: '3 agents',
    allowPhone: false,
    overage: 0.005,
  },
  {
    key: 'pro',
    displayName: 'Pro',
    priceUsd: 49,
    includedCalls: 5000,
    maxAgents: '10 agents',
    allowPhone: true,
    overage: 0.005,
  },
  {
    key: 'business',
    displayName: 'Business',
    priceUsd: 149,
    includedCalls: 25000,
    maxAgents: 'Unlimited',
    allowPhone: true,
    overage: 0.005,
  },
];

export function UpgradeModal({
  open,
  onOpenChange,
  reason = 'generic',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason?: UpgradeReason;
}) {
  const highlight: 'starter' | 'pro' | 'business' =
    reason === 'phone' ? 'pro' : reason === 'agents' ? 'pro' : 'starter';

  const headline = (() => {
    switch (reason) {
      case 'calls':
        return 'Out of calls';
      case 'agents':
        return 'Agent cap reached';
      case 'phone':
        return 'Phone needs Pro';
      default:
        return 'Upgrade your plan';
    }
  })();

  const subhead = (() => {
    switch (reason) {
      case 'calls':
        return 'Pick a paid plan to keep your visitors talking — overage stays at $0.005/call.';
      case 'agents':
        return 'Higher tiers ship more agents per workspace.';
      case 'phone':
        return 'Bring your own Twilio account; we orchestrate the bridge into ElevenLabs.';
      default:
        return 'All paid tiers share a flat $0.005/call overage — higher tiers buy more included quota and features.';
    }
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl tracking-tight">{headline}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {subhead}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {TIERS.map((t) => {
            const isHighlight = t.key === highlight;
            return (
              <div
                key={t.key}
                className={cn(
                  'flex flex-col gap-2 rounded-xl border p-3 text-sm',
                  isHighlight ? 'border-voice/40 bg-voice/5' : 'border-border/60',
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="font-serif text-lg tracking-tight">{t.displayName}</p>
                  {isHighlight ? <Badge className="bg-voice/15 text-voice">Recommended</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">${t.priceUsd}/mo</p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  <li className="flex items-center gap-1.5">
                    <Check className="size-3 text-emerald-500" />
                    {t.includedCalls.toLocaleString()} calls / month
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check className="size-3 text-emerald-500" />
                    {t.maxAgents}
                  </li>
                  <li className="flex items-center gap-1.5">
                    {t.allowPhone ? (
                      <Check className="size-3 text-emerald-500" />
                    ) : (
                      <span className="inline-flex size-3 items-center justify-center text-muted-foreground">×</span>
                    )}
                    <Phone className="size-3" />
                    {t.allowPhone ? 'Phone (BYOK Twilio)' : 'No phone'}
                  </li>
                </ul>
                <CheckoutButton plan={t.key} highlight={isHighlight} />
              </div>
            );
          })}
        </div>
        <DialogFooter className="text-xs text-muted-foreground">
          BYOK ElevenLabs and (Pro+) Twilio — pay them directly. VoiceFlow only charges for
          orchestration.
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckoutButton({
  plan,
  highlight,
}: {
  plan: 'starter' | 'pro' | 'business';
  highlight: boolean;
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
    <Button onClick={onClick} size="sm" variant={highlight ? 'default' : 'outline'} disabled={pending}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
      Upgrade
    </Button>
  );
}
