import Link from 'next/link';
import { ArrowRight, Mic, Plug2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Slim list-style card shown on /dashboard/integrations. Deliberately
 * minimal: identity, status, "Manage". All the setup details, connect
 * dialog, usage bar etc. live on the dedicated detail page at
 * /dashboard/integrations/elevenlabs.
 */
export function ElevenLabsCard({
  connected,
  tier,
}: {
  connected: boolean;
  tier?: string;
}) {
  return (
    <Link
      href="/dashboard/integrations/elevenlabs"
      className={cn(
        'group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-5 transition hover:border-voice/40 hover:bg-card/80 sm:p-6',
      )}
    >
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-voice/10 text-voice ring-1 ring-voice/20">
        <Mic className="size-5" aria-hidden />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium text-foreground">ElevenLabs Voice</h3>
          {connected ? (
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              Connected{tier ? ` · ${formatTier(tier)}` : ''}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <Plug2 className="mr-1 size-2.5" /> Not connected
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          Required to power AI voice agents
        </p>
      </div>

      <span className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground transition group-hover:text-foreground">
        Manage
        <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function formatTier(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}
