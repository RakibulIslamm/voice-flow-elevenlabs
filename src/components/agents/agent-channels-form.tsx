'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Globe2,
  Loader2,
  Lock,
  Phone,
  PhoneOff,
  PlugZap,
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
  disablePhoneChannel,
  enablePhoneChannel,
  listPhoneChannelOptions,
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
          ) : agent.channels.phone.enabled ? (
            <Badge className="border-emerald-500/30 bg-emerald-500/10 text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="mr-1 size-2.5" />
              Live
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              Not assigned
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {!phoneSupported ? (
            <PhoneLockedCard />
          ) : !context.twilioConnected ? (
            <PhoneConnectTwilioCard />
          ) : (
            <PhoneChannelManager agent={agent} />
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

type PhonePickerNumber = {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  capabilities: { voice: boolean; sms: boolean; mms: boolean; fax: boolean };
};

type PhonePickerOptions = {
  assigned: PhonePickerNumber | null;
  available: PhonePickerNumber[];
  assignedElsewhere: Array<PhonePickerNumber & { agentId: string; agentName: string }>;
};

/**
 * Per-agent phone picker. Holds the Twilio number list in component
 * state and refetches via the server action — we deliberately don't
 * load on mount (Twilio rate-limits, and most users won't open this tab)
 * so users hit "Load numbers" to opt in to the round-trip.
 */
function PhoneChannelManager({ agent }: { agent: AgentDetailData }) {
  const router = useRouter();
  const [options, setOptions] = useState<PhonePickerOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSid, setSelectedSid] = useState<string>('');
  const [refreshPending, startRefreshTransition] = useTransition();
  const [enablePending, startEnableTransition] = useTransition();
  const [disablePending, startDisableTransition] = useTransition();

  const enabled = agent.channels.phone.enabled;
  const currentNumber = agent.channels.phone.twilioPhoneNumber;

  function loadOptions() {
    startRefreshTransition(async () => {
      setError(null);
      try {
        const result = await listPhoneChannelOptions({ agentId: agent.id });
        if (result.ok) {
          setOptions({
            assigned: result.data.assigned,
            available: result.data.available,
            assignedElsewhere: result.data.assignedElsewhere,
          });
          if (result.data.available.length === 0 && !result.data.assigned) {
            toast.info('No voice-enabled numbers available. Buy or release one in Twilio.');
          }
        } else {
          setError(result.error.message);
          toast.error(result.error.message);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setError(msg);
        toast.error('Could not fetch phone numbers.');
      }
    });
  }

  function onAssign() {
    if (!selectedSid) return;
    startEnableTransition(async () => {
      try {
        const result = await enablePhoneChannel({
          agentId: agent.id,
          twilioPhoneNumberSid: selectedSid,
        });
        if (result.ok) {
          toast.success(`Phone enabled · ${result.data.phoneNumber}`);
          setSelectedSid('');
          setOptions(null); // force a fresh fetch on next load
          router.refresh();
        } else {
          toast.error(result.error.message);
          void reportClientError({
            message: `enablePhoneChannel failed: ${result.error.code}`,
            name: 'EnablePhoneChannelError',
          });
        }
      } catch (e) {
        toast.error('Something went wrong assigning the number.');
        void reportClientError({
          message: `enablePhoneChannel threw: ${e instanceof Error ? e.message : 'unknown'}`,
          name: 'EnablePhoneChannelError',
        });
      }
    });
  }

  function onUnassign() {
    startDisableTransition(async () => {
      try {
        const result = await disablePhoneChannel({ agentId: agent.id });
        if (result.ok) {
          toast.success('Phone channel disabled.');
          setOptions(null);
          router.refresh();
        } else {
          toast.error(result.error.message);
        }
      } catch {
        toast.error('Something went wrong unassigning the number.');
      }
    });
  }

  // CASE 1: Phone is already assigned — show the current number + unassign.
  if (enabled && currentNumber) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/30 dark:text-emerald-400">
              <Phone className="size-5" />
            </div>
            <div>
              <p className="font-mono text-sm font-medium">{currentNumber}</p>
              <p className="text-xs text-muted-foreground">
                Inbound calls route to this agent automatically.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onUnassign}
            disabled={disablePending}
          >
            {disablePending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <PhoneOff className="size-3.5" />
            )}
            Unassign
          </Button>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Unassigning clears the Twilio webhook but keeps the phone-side ElevenLabs agent in
          your account, so re-assigning later is instant.
        </p>
      </div>
    );
  }

  // CASE 2: Phone is NOT assigned yet — show picker.
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-border/70 bg-card/30 p-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium">Assign a phone number</p>
          <p className="text-xs text-muted-foreground">
            We&apos;ll point the Twilio number at this agent and provision a phone-side
            ElevenLabs agent on first assign.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadOptions} disabled={refreshPending}>
          {refreshPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="size-3.5" />
          )}
          {options === null ? 'Load numbers' : 'Refresh'}
        </Button>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {options === null ? null : options.available.length === 0 &&
        options.assignedElsewhere.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-card/30 p-5 text-center text-sm text-muted-foreground">
          No voice-enabled numbers found in your Twilio account.
          <div className="mt-3">
            <Button asChild size="sm" variant="outline">
              <a
                href="https://console.twilio.com/us1/develop/phone-numbers/manage/search"
                target="_blank"
                rel="noopener noreferrer"
              >
                Buy a number
                <ExternalLink className="size-3" />
              </a>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {options.available.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Available
              </legend>
              {options.available.map((n) => (
                <label
                  key={n.sid}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl border bg-card/40 p-3 transition hover:border-voice/40',
                    selectedSid === n.sid
                      ? 'border-voice/60 ring-2 ring-voice/20'
                      : 'border-border/70',
                  )}
                >
                  <input
                    type="radio"
                    name="twilio-number"
                    value={n.sid}
                    checked={selectedSid === n.sid}
                    onChange={() => setSelectedSid(n.sid)}
                    className="size-4 accent-voice"
                  />
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted/60 text-muted-foreground">
                    <Phone className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-medium">{n.phoneNumber}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {n.friendlyName}
                    </p>
                  </div>
                </label>
              ))}
            </fieldset>
          ) : null}

          {options.assignedElsewhere.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Already assigned to another agent
              </legend>
              {options.assignedElsewhere.map((n) => (
                <div
                  key={n.sid}
                  className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 p-3 opacity-70"
                >
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <Phone className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm">{n.phoneNumber}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      Assigned to{' '}
                      <Link
                        href={`/dashboard/agents/${n.agentId}`}
                        className="underline-offset-4 hover:text-foreground hover:underline"
                      >
                        {n.agentName}
                      </Link>
                    </p>
                  </div>
                </div>
              ))}
            </fieldset>
          ) : null}

          <div className="flex justify-end pt-1">
            <Button
              onClick={onAssign}
              disabled={!selectedSid || enablePending}
            >
              {enablePending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PlugZap className="size-4" />
              )}
              Assign to this agent
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function shallowEqualArrays(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
