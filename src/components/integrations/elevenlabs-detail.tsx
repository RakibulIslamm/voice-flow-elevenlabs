'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  CheckCircle2,
  ExternalLink,
  Key,
  Loader2,
  Mic,
  Plug2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Webhook,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ElevenLabsConnectDialog } from './elevenlabs-connect-dialog';
import { ElevenLabsDisconnectDialog } from './elevenlabs-disconnect-dialog';
import { ElevenLabsWebhookDialog } from './elevenlabs-webhook-dialog';
import { CopyButton } from './copy-button';
import {
  testElevenLabsConnection,
  removeElevenLabsWebhookSecret,
} from '@/server/actions/integrations';
import { reportClientError } from '@/lib/tracking/client-report';
import { cn } from '@/lib/utils';

export type ElevenLabsDetailProps = {
  connected: boolean;
  apiKeyPreview?: string;
  connectedAt?: string;
  verifiedAt?: string;
  tier?: string;
  characterLimit?: number;
  charactersUsed?: number;
  agentCount: number;
  webhookUrl: string;
  webhookConfigured: boolean;
  webhookSecretPreview?: string;
  webhookConfiguredAt?: string;
};

export function ElevenLabsDetail(props: ElevenLabsDetailProps) {
  const [connectOpen, setConnectOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);

  return (
    <div className="space-y-10">
      <StatusHero
        {...props}
        onConnect={() => setConnectOpen(true)}
        onDisconnect={() => setDisconnectOpen(true)}
      />

      {props.connected && props.agentCount > 0 ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            You have {props.agentCount} agent{props.agentCount === 1 ? '' : 's'} using this
            ElevenLabs account. Disconnecting will pause all of them — their config stays so
            they can be restored on reconnect.
          </span>
        </div>
      ) : null}

      {/* Section A — API key setup */}
      <section className="space-y-4">
        <SectionHeader
          icon={Key}
          title="1 — Connect your API key"
          subtitle="Lets VoiceFlow create agents, list voices, and use your ElevenLabs subscription on your behalf."
        />
        <ApiSetupCard />
      </section>

      {/* Section B — Webhook setup */}
      <section className="space-y-4">
        <SectionHeader
          icon={Webhook}
          title="2 — Configure post-call webhook"
          subtitle="Lets ElevenLabs deliver transcripts and call summaries to VoiceFlow so we can save them to your dashboard."
        />
        <WebhookSetupCard
          webhookUrl={props.webhookUrl}
          webhookConfigured={props.webhookConfigured}
          webhookSecretPreview={props.webhookSecretPreview}
          webhookConfiguredAt={props.webhookConfiguredAt}
          canManage={props.connected}
          onPasteSecret={() => setWebhookOpen(true)}
        />
      </section>

      <AboutCard />

      <ElevenLabsConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
      <ElevenLabsDisconnectDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        agentCount={props.agentCount}
      />
      <ElevenLabsWebhookDialog open={webhookOpen} onOpenChange={setWebhookOpen} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status hero
// ---------------------------------------------------------------------------

function StatusHero(
  props: ElevenLabsDetailProps & {
    onConnect: () => void;
    onDisconnect: () => void;
  },
) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/60 p-6 sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            'radial-gradient(60% 60% at 50% 0%, color-mix(in oklch, var(--voice) 10%, transparent), transparent 70%)',
        }}
      />
      <div className="flex items-start gap-4">
        <div className="grid size-12 place-items-center rounded-2xl bg-voice/10 text-voice ring-1 ring-voice/20">
          <Mic className="size-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-3xl tracking-tight text-foreground">
              ElevenLabs Voice
            </h1>
            {props.connected ? (
              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="mr-1 size-3" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                <Plug2 className="mr-1 size-2.5" /> Not connected
              </Badge>
            )}
            {props.connected ? (
              props.webhookConfigured ? (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="mr-1 size-3" /> Webhook ready
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-500/40 text-amber-700 dark:text-amber-300"
                >
                  Webhook pending
                </Badge>
              )
            ) : null}
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Your ElevenLabs account powers every agent on VoiceFlow. You manage the plan
            directly — we just orchestrate. Keys are encrypted with AES-256-GCM and only
            decrypted in-memory at the call site.
          </p>
        </div>
      </div>

      {props.connected ? (
        <ConnectedDetails {...props} />
      ) : (
        <div className="mt-6 flex items-center justify-end">
          <Button size="lg" onClick={props.onConnect}>
            <Plug2 className="size-4" />
            Connect ElevenLabs
          </Button>
        </div>
      )}
    </section>
  );
}

function ConnectedDetails(
  props: ElevenLabsDetailProps & { onConnect: () => void; onDisconnect: () => void },
) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const percent = usagePercent(props.charactersUsed, props.characterLimit);

  function handleRefresh() {
    startRefresh(async () => {
      try {
        const result = await testElevenLabsConnection(undefined);
        if (result.ok) {
          toast.success('Connection verified', {
            description: `Tier: ${result.data.accountInfo.tier}`,
          });
          router.refresh();
        } else {
          toast.error(result.error.message);
          void reportClientError({
            message: `testElevenLabsConnection failed: ${result.error.code}`,
            name: 'TestElevenLabsConnectionError',
            context: { code: result.error.code },
          });
        }
      } catch (e) {
        toast.error('Could not verify connection.');
        void reportClientError({
          message: `testElevenLabsConnection threw: ${e instanceof Error ? e.message : 'unknown'}`,
          name: 'TestElevenLabsConnectionError',
          stack: e instanceof Error ? e.stack : undefined,
        });
      }
    });
  }

  return (
    <div className="mt-8 space-y-6">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Field label="API key" value={props.apiKeyPreview ?? '—'} mono />
        <Field
          label="Tier"
          value={props.tier ? props.tier.charAt(0).toUpperCase() + props.tier.slice(1) : '—'}
        />
        <Field
          label="Connected"
          value={props.connectedAt ? new Date(props.connectedAt).toLocaleDateString() : '—'}
        />
        <Field label="Last verified" value={relativeTime(props.verifiedAt)} />
      </dl>

      {typeof props.characterLimit === 'number' && typeof props.charactersUsed === 'number' ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Characters this period</span>
            <span className="font-mono text-foreground">
              {props.charactersUsed.toLocaleString()} /{' '}
              {props.characterLimit.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full transition-all',
                percent > 90 ? 'bg-destructive' : percent > 70 ? 'bg-amber-500' : 'bg-voice',
              )}
              style={{ width: `${percent}%` }}
              aria-label={`${percent}% used`}
            />
          </div>
        </div>
      ) : null}

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Reconnecting overwrites your stored key with the new one.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Refresh status
          </Button>
          <Button variant="outline" size="sm" onClick={props.onConnect}>
            Replace key
          </Button>
          <Button variant="destructive" size="sm" onClick={props.onDisconnect}>
            Disconnect
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section A — API key setup
// ---------------------------------------------------------------------------

function ApiSetupCard() {
  return (
    <div className="rounded-3xl border border-border/70 bg-card/40 p-6 sm:p-8">
      <ol className="space-y-5">
        <Step n={1}>
          <p>
            Sign up at{' '}
            <ExternalLinkInline href="https://elevenlabs.io">elevenlabs.io</ExternalLinkInline>
            . VoiceFlow uses ElevenLabs&apos; <b>Conversational AI</b>, which requires a paid
            plan — the <b>Creator plan</b> ($22/month at the time of writing) is enough to
            test, and most production use cases land on Pro or higher.
          </p>
          <p className="text-xs text-muted-foreground">
            Free-tier accounts can browse the catalog but cannot create Conversational AI
            agents.
          </p>
        </Step>

        <Step n={2}>
          <p>
            Open{' '}
            <ExternalLinkInline href="https://elevenlabs.io/app/settings/api-keys">
              Profile → API Keys
            </ExternalLinkInline>{' '}
            and click <b>+ New API Key</b>. Name it something like{' '}
            <code className="font-mono text-xs">VoiceFlow</code> and give it the default
            scope. Copy the key the moment it appears — ElevenLabs only shows it once.
          </p>
          <p className="text-xs text-muted-foreground">
            If you lost the key, delete it from this page and create a new one. Keys can be
            rotated anytime; VoiceFlow will accept the latest value.
          </p>
        </Step>

        <Step n={3}>
          <p>
            Paste the key into <b>Connect ElevenLabs</b> at the top of this page. We verify
            it against ElevenLabs before saving, then encrypt it AES-256-GCM at rest.
          </p>
        </Step>
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section B — Webhook setup
// ---------------------------------------------------------------------------

function WebhookSetupCard({
  webhookUrl,
  webhookConfigured,
  webhookSecretPreview,
  webhookConfiguredAt,
  canManage,
  onPasteSecret,
}: {
  webhookUrl: string;
  webhookConfigured: boolean;
  webhookSecretPreview?: string;
  webhookConfiguredAt?: string;
  canManage: boolean;
  onPasteSecret: () => void;
}) {
  const router = useRouter();
  const [removing, startRemove] = useTransition();

  function handleRemove() {
    startRemove(async () => {
      try {
        const result = await removeElevenLabsWebhookSecret(undefined);
        if (result.ok) {
          toast.success('Webhook secret removed');
          router.refresh();
        } else {
          toast.error(result.error.message);
        }
      } catch (e) {
        toast.error('Could not remove webhook secret.');
        void reportClientError({
          message: `removeElevenLabsWebhookSecret threw: ${e instanceof Error ? e.message : 'unknown'}`,
          name: 'RemoveWebhookSecretError',
        });
      }
    });
  }

  return (
    <div className="rounded-3xl border border-border/70 bg-card/40 p-6 sm:p-8">
      {!canManage ? (
        <p className="rounded-lg border border-dashed border-border/70 bg-muted/40 px-4 py-3 mb-3 text-sm text-muted-foreground">
          Connect your API key first (Section 1) — webhook setup needs an active ElevenLabs
          workspace.
        </p>
      ) : null}

      <ol className={cn('space-y-5', !canManage && 'opacity-60')}>
        <Step n={1}>
          <p>
            In the ElevenLabs dashboard, open{' '}
            <ExternalLinkInline href="https://elevenlabs.io/app/agents/settings">
              Conversational AI → Settings
            </ExternalLinkInline>{' '}
            (sometimes labelled <b>Agents Platform settings</b>). Scroll to the{' '}
            <b>Post-Call Webhook</b> section.
          </p>
          <p className="text-xs text-muted-foreground">
            On some ElevenLabs plans, this lives under{' '}
            <ExternalLinkInline href="https://elevenlabs.io/app/developers/webhooks">
              Developers → Webhooks
            </ExternalLinkInline>{' '}
            instead. Both reach the same configuration.
          </p>
        </Step>

        <Step n={2}>
          <p>
            Click <b>+ Add webhook</b> (or <b>Create webhook</b>) and paste this URL into the{' '}
            <b>URL</b> field:
          </p>
          <CodeRow value={webhookUrl} />
          <p className="text-xs text-muted-foreground">
            This is YOUR VoiceFlow instance&apos;s webhook endpoint. ElevenLabs will POST
            transcripts and call analysis here after every conversation.
          </p>
        </Step>

        <Step n={3}>
          <p>
            Subscribe the webhook to the <b>post_call_transcription</b> event (the
            checkbox/toggle is shown in the same dialog). Skip <b>post_call_audio</b> and{' '}
            <b>call_initiation_failure</b> for now — we don&apos;t use them yet.
          </p>
        </Step>

        <Step n={4}>
          <p>
            Click <b>Save</b>. ElevenLabs will now display the <b>webhook secret</b> — a long
            random string starting with something like <code className="font-mono text-xs">wsec_</code>
            . <b>Copy this value immediately</b>. ElevenLabs only shows it once; if you lose
            it you&apos;ll have to delete the webhook and recreate it.
          </p>
        </Step>

        <Step n={5}>
          <p>
            Come back here and click <b>Save webhook secret</b> below. We&apos;ll encrypt the
            secret AES-256-GCM and use it to verify the HMAC signature on every incoming
            webhook so no one can spoof calls from your account.
          </p>
        </Step>
      </ol>

      <Separator className="my-6" />

      {webhookConfigured ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Webhook secret
            </p>
            <p className="font-mono text-sm text-foreground">
              {webhookSecretPreview ?? '...'}
            </p>
            <p className="text-xs text-muted-foreground">
              Saved {relativeTime(webhookConfiguredAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onPasteSecret} disabled={!canManage}>
              Replace secret
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={removing || !canManage}
              className="text-muted-foreground hover:text-destructive"
            >
              {removing ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            No webhook secret saved yet. Post-call transcripts won&apos;t appear in VoiceFlow
            until you complete steps 1-5 above.
          </p>
          <Button onClick={onPasteSecret} disabled={!canManage}>
            Save webhook secret
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// About BYOK
// ---------------------------------------------------------------------------

function AboutCard() {
  return (
    <section className="rounded-3xl border border-border/70 bg-card/30 p-6 sm:p-8">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-voice" aria-hidden />
        <h2 className="font-serif text-xl tracking-tight">About BYOK</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Why VoiceFlow asks you to bring your own ElevenLabs account.
      </p>
      <ul className="mt-6 grid grid-cols-1 gap-4 text-sm leading-relaxed text-muted-foreground sm:grid-cols-2">
        <Li>
          <b className="text-foreground">You own the relationship.</b> Voice agents live in your
          ElevenLabs dashboard. If you ever leave VoiceFlow they don&apos;t go anywhere.
        </Li>
        <Li>
          <b className="text-foreground">You control the spend.</b> Character usage counts
          against your ElevenLabs subscription — no opaque markup from us.
        </Li>
        <Li>
          <b className="text-foreground">We never see the key in plaintext.</b> AES-256-GCM at
          rest, decrypted only in memory at the moment of an API call.
        </Li>
        <Li>
          <b className="text-foreground">Disconnect anytime.</b> Pausing the key pauses your
          agents — config stays so you can restore them later.
        </Li>
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-voice/10 text-voice ring-1 ring-voice/20">
        <Icon className="size-4" aria-hidden />
      </div>
      <div>
        <h2 className="font-serif text-xl tracking-tight">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-sm">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground/5 font-mono text-[11px] font-medium text-muted-foreground">
        {n}
      </span>
      <div className="flex-1 space-y-2 leading-relaxed text-foreground/90">{children}</div>
    </li>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-2 inline-block size-1.5 shrink-0 rounded-full bg-voice/60" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

function CodeRow({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/40 px-2.5 py-1.5">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{value}</code>
      <CopyButton value={value} />
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className={cn('mt-1 text-sm text-foreground', mono && 'truncate font-mono text-xs')}>
        {value}
      </dd>
    </div>
  );
}

function ExternalLinkInline({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-4 hover:underline"
    >
      {children}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}

function usagePercent(used?: number, limit?: number): number {
  if (!used || !limit || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function relativeTime(iso?: string): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
