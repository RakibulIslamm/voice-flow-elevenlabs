'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Globe2,
  Loader2,
  Lock,
  Phone,
  RefreshCcw,
  Save,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { CopyButton } from '@/components/integrations/copy-button';
import {
  regenerateAgentSlug,
  updateAllowedDomains,
} from '@/server/actions/agents';
import { reportClientError } from '@/lib/tracking/client-report';
import type { AgentDetailContext, AgentDetailData } from './agent-detail';

const PHONE_PLANS = new Set(['pro', 'business']);

export function AgentChannelsForm({
  agent,
  context,
  appUrl,
}: {
  agent: AgentDetailData;
  context: AgentDetailContext;
  appUrl: string;
}) {
  const router = useRouter();

  // Allowed domains — local edits with save action.
  const initialDomains = agent.channels.browser.allowedDomains;
  const [domains, setDomains] = useState<string[]>(initialDomains);
  const [domainInput, setDomainInput] = useState('');
  const [domainsPending, startDomainsTransition] = useTransition();
  const domainsDirty = useMemo(
    () => !shallowEqualArrays(domains, initialDomains),
    [domains, initialDomains],
  );

  // Regenerate-slug confirmation
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenPending, startRegenTransition] = useTransition();

  const publicUrl = `${appUrl}/talk/${agent.channels.browser.publicSlug}`;

  function addDomain() {
    const v = domainInput
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .toLowerCase();
    if (!v) return;
    if (domains.includes(v)) {
      setDomainInput('');
      return;
    }
    setDomains([...domains, v]);
    setDomainInput('');
  }

  function removeDomain(d: string) {
    setDomains(domains.filter((x) => x !== d));
  }

  function saveDomains() {
    startDomainsTransition(async () => {
      const result = await updateAllowedDomains({ agentId: agent.id, domains });
      if (result.ok) {
        toast.success('Allowed domains saved.');
        router.refresh();
      } else {
        toast.error(result.error.message, {
          description: result.error.fields
            ? Object.values(result.error.fields).join(' ')
            : undefined,
        });
        void reportClientError({
          message: `updateAllowedDomains: ${result.error.code}`,
          name: 'UpdateAllowedDomainsError',
          context: { fields: result.error.fields },
        });
      }
    });
  }

  function regenerate() {
    startRegenTransition(async () => {
      const result = await regenerateAgentSlug({ agentId: agent.id });
      if (result.ok) {
        toast.success('Slug regenerated. Update any existing embeds.');
        setRegenOpen(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const phoneSupported = PHONE_PLANS.has(context.plan);

  return (
    <div className="space-y-6">
      {/* Browser channel */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div className="flex items-start gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-voice/10 text-voice ring-1 ring-voice/20">
              <Globe2 className="size-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-medium">Browser</CardTitle>
              <CardDescription>
                A public page anyone can talk to from a browser.
              </CardDescription>
            </div>
          </div>
          <Badge
            className={cn(
              agent.channels.browser.enabled
                ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300'
                : 'bg-muted text-muted-foreground hover:bg-muted',
            )}
          >
            {agent.channels.browser.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Public slug */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Public URL
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{publicUrl}</code>
              <CopyButton value={publicUrl} />
              <Button asChild variant="ghost" size="sm" className="h-7 px-2">
                <Link href={publicUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3.5" />
                  Open
                </Link>
              </Button>
            </div>
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                The slug is the last segment of the URL.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRegenOpen(true)}
                className="h-7"
              >
                <RefreshCcw className="size-3.5" />
                Regenerate slug
              </Button>
            </div>
          </div>

          {/* Allowed domains */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Allowed domains
            </p>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2 py-1.5 transition focus-within:border-voice/50">
              {domains.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  {d}
                  <button
                    type="button"
                    onClick={() => removeDomain(d)}
                    aria-label={`Remove ${d}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addDomain();
                  } else if (e.key === 'Backspace' && !domainInput && domains.length > 0) {
                    removeDomain(domains[domains.length - 1]);
                  }
                }}
                onBlur={addDomain}
                placeholder={domains.length === 0 ? 'example.com, mysite.com…' : 'Add another…'}
                className="min-w-[140px] flex-1 bg-transparent py-1 text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {domains.length === 0 ? (
                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="size-3.5" />
                  Empty list = any domain can embed this widget (less secure).
                </span>
              ) : (
                <>Only these origins may load the embed script.</>
              )}
            </p>
            <div className="flex items-center justify-end pt-2">
              <Button
                onClick={saveDomains}
                disabled={!domainsDirty || domainsPending}
                size="sm"
              >
                {domainsPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                Save domains
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Phone channel */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div className="flex items-start gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border/60">
              <Phone className="size-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-medium">Phone</CardTitle>
              <CardDescription>
                Inbound phone calls via Twilio (BYOK).
              </CardDescription>
            </div>
          </div>
          {!phoneSupported ? (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              <Lock className="mr-1 size-2.5" />
              Pro plan
            </Badge>
          ) : !context.twilioConnected ? (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              Twilio not connected
            </Badge>
          ) : (
            <Badge className="bg-muted text-muted-foreground hover:bg-muted">
              Setup pending
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {!phoneSupported ? (
            <PhoneLockedCard />
          ) : !context.twilioConnected ? (
            <PhoneConnectTwilioCard />
          ) : (
            <PhoneSetupComingSoonCard />
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-2xl border border-voice/30 bg-voice/5 p-5">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-voice" />
        <p className="text-sm leading-relaxed text-foreground">
          <span className="font-medium">Security tip:</span> set allowed domains above so only
          your sites can load this agent&apos;s embed script. Anyone with the public URL can still
          hit the standalone page — protect with a slug rotate if it&apos;s leaked.
        </p>
      </div>

      {/* Regenerate confirmation */}
      <AlertDialog open={regenOpen} onOpenChange={setRegenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl tracking-tight">
              Regenerate slug?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The new URL takes effect immediately. Anything embedded against the old slug will
              stop working until you update the embed code with the new value.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={regenPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                regenerate();
              }}
              disabled={regenPending}
            >
              {regenPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCcw className="size-4" />
              )}
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PhoneLockedCard() {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Phone calling requires Pro plan or above. BYOK Twilio means you bring your own Twilio
        account and we connect it to your ElevenLabs phone agent.
      </p>
      <Button asChild>
        <Link href="/dashboard/billing">
          Upgrade to Pro
          <ArrowRight className="size-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function PhoneConnectTwilioCard() {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Connect Twilio in Integrations to enable phone calling for this agent.
      </p>
      <Button asChild variant="outline">
        <Link href="/dashboard/integrations">
          Connect Twilio
          <ArrowRight className="size-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function PhoneSetupComingSoonCard() {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-card/30 p-5 text-sm leading-relaxed text-muted-foreground">
      Phone number picker, webhook routing and per-agent call billing land with Phase 12. Twilio
      is connected — you&apos;ll be able to assign a number here as soon as that ships.
    </div>
  );
}

function shallowEqualArrays(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
