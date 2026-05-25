import Link from 'next/link';
import { ArrowRight, Lock, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * Slim list-style card for the Integrations overview. Twilio is gated
 * behind the Pro plan (Phase 12 ships the real wiring), so the card
 * stays in a locked / muted state but is still clickable — the detail
 * page explains what it'll do once unlocked.
 */
export function TwilioCard() {
  return (
    <Link
      href="/dashboard/integrations/twilio"
      className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border/70 bg-card/30 p-5 transition hover:border-amber-500/30 hover:bg-card/50 sm:p-6"
    >
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground ring-1 ring-border">
        <Phone className="size-5" aria-hidden />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium text-foreground">Twilio Voice</h3>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
            <Lock className="mr-1 size-2.5" />
            Pro plan
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          Phone calling for your AI receptionists
        </p>
      </div>

      <span className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground transition group-hover:text-foreground">
        Details
        <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
