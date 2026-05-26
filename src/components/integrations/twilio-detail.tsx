'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Globe2,
  Loader2,
  Lock,
  MessageSquareText,
  Phone,
  PhoneIncoming,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TwilioConnectDialog } from './twilio-connect-dialog';
import { TwilioDisconnectDialog } from './twilio-disconnect-dialog';
import {
  listTwilioPhoneNumbers,
  testTwilioConnection,
} from '@/server/actions/integrations';
import { reportClientError } from '@/lib/tracking/client-report';
import type { UserPlan } from '@/lib/db/models/user';

type PhoneNumber = {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  capabilities: { voice: boolean; sms: boolean; mms: boolean; fax: boolean };
  voiceUrl: string | null;
  voiceMethod: string | null;
  assignedAgent: { id: string; name: string } | null;
};

export type TwilioDetailProps = {
  plan: UserPlan;
  connected: boolean;
  accountSidPreview?: string;
  connectedAt?: string;
  verifiedAt?: string;
  phoneAgentCount: number;
};

const PHONE_PLANS = new Set<UserPlan>(['pro', 'business']);

export function TwilioDetail({
  plan,
  connected,
  accountSidPreview,
  connectedAt,
  verifiedAt,
  phoneAgentCount,
}: TwilioDetailProps) {
  const planSupports = PHONE_PLANS.has(plan);

  if (!planSupports) {
    return <LockedView />;
  }

  if (!connected) {
    return <ConnectView />;
  }

  return (
    <ConnectedView
      accountSidPreview={accountSidPreview}
      connectedAt={connectedAt}
      verifiedAt={verifiedAt}
      phoneAgentCount={phoneAgentCount}
    />
  );
}

// ---------------------------------------------------------------------------
// Locked: free/starter plan
// ---------------------------------------------------------------------------

function LockedView() {
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/40 p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border">
            <Phone className="size-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-3xl tracking-tight text-foreground">Twilio Voice</h1>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                <Lock className="mr-1 size-2.5" /> Pro plan required
              </Badge>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Phone calling requires Pro plan or above. BYOK Twilio means you bring your own
              Twilio account and we connect it to your ElevenLabs phone agent.
            </p>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-end gap-2">
          <Button asChild>
            <Link href="/dashboard/billing">
              Upgrade to Pro
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connect: pro/business, not yet connected
// ---------------------------------------------------------------------------

function ConnectView() {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/40 p-6 sm:p-8">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid size-12 place-items-center rounded-2xl bg-voice/10 text-voice ring-1 ring-voice/20">
              <Phone className="size-6" aria-hidden />
            </div>
            <div>
              <h1 className="font-serif text-3xl tracking-tight">Twilio Voice</h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Bring your own Twilio account to enable phone calling on your AI receptionists.
                Your Twilio account pays for telecom; VoiceFlow only orchestrates the AI.
              </p>
            </div>
          </div>
          <Button onClick={() => setOpen(true)}>
            <PlugZap className="size-4" />
            Connect Twilio
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Setup guide</CardTitle>
          <CardDescription>
            Takes about 5 minutes. You&apos;ll need a credit card on file at Twilio for the phone
            number purchase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-4 text-sm leading-relaxed">
            <Step n={1}>
              Sign up at{' '}
              <a
                href="https://twilio.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-voice underline-offset-4 hover:underline"
              >
                twilio.com
                <ExternalLink className="size-3" />
              </a>{' '}
              and complete account verification.
            </Step>
            <Step n={2}>
              Buy a phone number from{' '}
              <a
                href="https://console.twilio.com/us1/develop/phone-numbers/manage/search"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-voice underline-offset-4 hover:underline"
              >
                Phone Numbers → Buy a Number
                <ExternalLink className="size-3" />
              </a>{' '}
              (~$1/month).
            </Step>
            <Step n={3}>
              Find your <span className="font-medium">Account SID</span> and{' '}
              <span className="font-medium">Auth Token</span> in{' '}
              <a
                href="https://console.twilio.com/us1/account/keys-credentials/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-voice underline-offset-4 hover:underline"
              >
                Console → Account → API keys &amp; tokens
                <ExternalLink className="size-3" />
              </a>
              .
            </Step>
            <Step n={4}>
              Paste them into the <span className="font-medium">Connect Twilio</span> dialog above.
              We verify against Twilio before saving, then encrypt at rest.
            </Step>
          </ol>
        </CardContent>
      </Card>

      <BillingNote />

      <TwilioConnectDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-voice/10 text-[11px] font-semibold text-voice ring-1 ring-voice/20">
        {n}
      </span>
      <span className="text-muted-foreground">{children}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Connected: numbers list + actions
// ---------------------------------------------------------------------------

function ConnectedView({
  accountSidPreview,
  connectedAt,
  verifiedAt,
  phoneAgentCount,
}: {
  accountSidPreview?: string;
  connectedAt?: string;
  verifiedAt?: string;
  phoneAgentCount: number;
}) {
  const router = useRouter();
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [testPending, startTestTransition] = useTransition();
  const [numbers, setNumbers] = useState<PhoneNumber[] | null>(null);
  const [numbersError, setNumbersError] = useState<string | null>(null);
  const [refreshPending, startRefreshTransition] = useTransition();

  function onTest() {
    startTestTransition(async () => {
      try {
        const result = await testTwilioConnection(undefined);
        if (result.ok) {
          toast.success('Twilio connection verified.');
          router.refresh();
        } else {
          toast.error(result.error.message);
          void reportClientError({
            message: `testTwilioConnection failed: ${result.error.code}`,
            name: 'TestTwilioError',
          });
        }
      } catch (e) {
        toast.error('Could not reach Twilio.');
        void reportClientError({
          message: `testTwilioConnection threw: ${e instanceof Error ? e.message : 'unknown'}`,
          name: 'TestTwilioError',
        });
      }
    });
  }

  function onRefresh() {
    startRefreshTransition(async () => {
      setNumbersError(null);
      try {
        const result = await listTwilioPhoneNumbers(undefined);
        if (result.ok) {
          setNumbers(result.data.numbers);
          if (result.data.numbers.length === 0) {
            toast.info(
              'No phone numbers found in your Twilio account. Buy one in the Twilio console.',
            );
          }
        } else {
          setNumbersError(result.error.message);
          toast.error(result.error.message);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setNumbersError(msg);
        toast.error('Could not fetch phone numbers.');
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/40 p-6 sm:p-8">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid size-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/30 dark:text-emerald-400">
              <Phone className="size-6" aria-hidden />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-3xl tracking-tight">Twilio Voice</h1>
                <Badge className="border-emerald-500/30 bg-emerald-500/10 text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="mr-1 size-2.5" /> Connected
                </Badge>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Account{' '}
                <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px]">
                  {accountSidPreview ?? '...'}
                </code>{' '}
                · {phoneAgentCount}{' '}
                {phoneAgentCount === 1 ? 'agent uses' : 'agents use'} phone calling
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={onTest} disabled={testPending}>
              {testPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="size-3.5" />
              )}
              Test connection
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDisconnectOpen(true)}
            >
              <XCircle className="size-3.5" />
              Disconnect
            </Button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Meta label="Account SID" value={accountSidPreview ?? '—'} mono />
          <Meta label="Connected" value={formatDate(connectedAt)} />
          <Meta label="Last verified" value={formatDate(verifiedAt)} />
        </div>
      </section>

      {/* Phone numbers */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-medium">Phone numbers</CardTitle>
            <CardDescription>
              Numbers in your Twilio account. Assign one to an agent from the agent&apos;s
              Channels tab.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshPending}>
            {refreshPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {numbers === null ? 'Load numbers' : 'Refresh'}
          </Button>
        </CardHeader>
        <CardContent>
          {numbersError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {numbersError}
            </p>
          ) : numbers === null ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-card/30 p-6 text-center">
              <PhoneIncoming className="mx-auto size-6 text-muted-foreground/70" />
              <p className="mt-3 text-sm font-medium">Click &ldquo;Load numbers&rdquo;</p>
              <p className="mt-1 text-xs text-muted-foreground">
                We don&apos;t auto-fetch — Twilio rate-limits and we don&apos;t want surprise
                charges on stale renders.
              </p>
            </div>
          ) : numbers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-card/30 p-6 text-center">
              <PhoneIncoming className="mx-auto size-6 text-muted-foreground/70" />
              <p className="mt-3 text-sm font-medium">No numbers in your Twilio account.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Buy one in the Twilio console, then click &ldquo;Refresh&rdquo;.
              </p>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="mt-4"
              >
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
          ) : (
            <ul className="space-y-2">
              {numbers.map((n) => (
                <NumberRow key={n.sid} number={n} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <BillingNote />

      <TwilioDisconnectDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        phoneAgentCount={phoneAgentCount}
      />
    </div>
  );
}

function NumberRow({ number }: { number: PhoneNumber }) {
  const caps = [
    number.capabilities.voice && { label: 'Voice', icon: Phone, key: 'voice' },
    number.capabilities.sms && { label: 'SMS', icon: MessageSquareText, key: 'sms' },
    number.capabilities.mms && { label: 'MMS', icon: MessageSquareText, key: 'mms' },
  ].filter(Boolean) as Array<{ label: string; icon: typeof Phone; key: string }>;

  return (
    <li className="rounded-xl border border-border/70 bg-card/40 p-4 transition hover:border-voice/40">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted/60 text-muted-foreground">
            <Phone className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-sm font-medium">{number.phoneNumber}</p>
            <p className="truncate text-xs text-muted-foreground">{number.friendlyName}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {caps.map((c) => (
            <Badge
              key={c.key}
              variant="outline"
              className="gap-1 text-[10px] uppercase tracking-wider"
            >
              <c.icon className="size-2.5" />
              {c.label}
            </Badge>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3 text-xs">
        {number.assignedAgent ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
            <Sparkles className="size-3" />
            Assigned to{' '}
            <Link
              href={`/dashboard/agents/${number.assignedAgent.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {number.assignedAgent.name}
            </Link>
          </span>
        ) : (
          <span className="text-muted-foreground">Available · not assigned</span>
        )}
        <span className="font-mono text-[10px] text-muted-foreground/70">{number.sid}</span>
      </div>
    </li>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-0.5 text-sm', mono && 'font-mono text-xs')}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared billing note
// ---------------------------------------------------------------------------

function BillingNote() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-voice/20 bg-voice/5 p-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2">
          <Globe2 className="size-4 text-voice" />
          <span className="text-sm font-medium">BYOK billing model</span>
        </div>
        <ChevronDown
          className={cn(
            'size-4 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open ? (
        <div className="mt-4 space-y-2 text-xs leading-relaxed text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">You pay Twilio directly</span> for
            phone numbers (~$1/mo each) and inbound minutes (~$0.014/min US).
          </p>
          <p>
            <span className="font-medium text-foreground">VoiceFlow charges only</span> for AI
            orchestration via your VoiceFlow plan.
          </p>
          <p>
            <span className="font-medium text-foreground">No markup.</span> Full visibility on
            both invoices.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}
