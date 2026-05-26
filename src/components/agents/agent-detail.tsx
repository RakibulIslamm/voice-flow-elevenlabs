'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  CircleDot,
  Code2,
  ExternalLink,
  Eye,
  Globe2,
  Inbox,
  Loader2,
  Pencil,
  PhoneCall,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Workflow,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { CopyButton } from '@/components/integrations/copy-button';
import { EmptyState } from '@/components/states/empty-state';
import {
  deleteAgent,
  reactivateAgent,
  resyncAgentSettings,
  resyncAgentTools,
  updateAgent,
} from '@/server/actions/agents';
import type {
  AgentBrowserChannel,
  AgentFaqEntry,
  AgentPhoneChannel,
  AgentStatus,
  AgentTemplate,
  AgentTonePreset,
} from '@/lib/db/models/agent';
import type { UserPlan } from '@/lib/db/models/user';
import { reportClientError } from '@/lib/tracking/client-report';
import { AgentSettingsForm } from './agent-settings-form';
import { AgentChannelsForm } from './agent-channels-form';

// ---------------------------------------------------------------------------
// Public types — shared with the server page that hydrates this component.
// ---------------------------------------------------------------------------

export type AgentDetailData = {
  id: string;
  name: string;
  template: AgentTemplate;
  businessName: string;
  businessHours: Record<string, { open?: string; close?: string; closed: boolean }> | null;
  faq: AgentFaqEntry[];
  voiceId: string;
  greeting: string;
  systemPrompt: string;
  tonePreset: AgentTonePreset;
  status: AgentStatus;
  channels: {
    browser: AgentBrowserChannel;
    phone: AgentPhoneChannel;
  };
  createdAt: string;
  updatedAt: string;
};

export type AgentDetailContext = {
  elConnected: boolean;
  twilioConnected: boolean;
  plan: UserPlan;
};

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

export function AgentDetail({
  agent,
  context,
  appUrl,
}: {
  agent: AgentDetailData;
  context: AgentDetailContext;
  appUrl: string;
}) {
  const [tab, setTab] = useState('overview');
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const publicUrl = `${appUrl}/talk/${agent.channels.browser.publicSlug}`;
  const needsAttention =
    (agent.status === 'paused' && !context.elConnected) || agent.status === 'error';

  return (
    <div className="space-y-8 pb-16">
      <Header
        agent={agent}
        context={context}
        publicUrl={publicUrl}
        onRename={() => setRenameOpen(true)}
      />

      {agent.status !== 'active' ? (
        <StatusBanner agent={agent} context={context} />
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap gap-1 bg-card/40 p-1">
          <TabTrigger value="overview" label="Overview" />
          <TabTrigger value="test" label="Test" />
          <TabTrigger value="embed" label="Embed" />
          <TabTrigger value="calls" label="Calls" />
          <TabTrigger value="captures" label="Captures" />
          <TabTrigger value="settings" label="Settings" />
          <TabTrigger value="channels" label="Channels" />
          <TabTrigger value="analytics" label="Analytics" />
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <OverviewTab
            agent={agent}
            context={context}
            publicUrl={publicUrl}
            needsAttention={needsAttention}
          />
        </TabsContent>

        <TabsContent value="test" className="space-y-6">
          <TestTab agent={agent} publicUrl={publicUrl} appUrl={appUrl} />
        </TabsContent>

        <TabsContent value="embed" className="space-y-6">
          <EmbedTab agent={agent} appUrl={appUrl} publicUrl={publicUrl} />
        </TabsContent>

        <TabsContent value="calls" className="space-y-6">
          <PlaceholderTab
            icon={PhoneCall}
            title="Calls"
            description="Per-agent call history with transcripts, durations, and outcomes. Arrives in Phase 11."
          />
        </TabsContent>

        <TabsContent value="captures" className="space-y-6">
          <PlaceholderTab
            icon={Inbox}
            title="Captures"
            description="Structured data the agent captured during calls (bookings, leads, requests). Arrives in Phase 11."
          />
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <AgentSettingsForm
            agent={agent}
            context={context}
            onDeleteClick={() => setDeleteOpen(true)}
          />
        </TabsContent>

        <TabsContent value="channels" className="space-y-6">
          <AgentChannelsForm agent={agent} context={context} appUrl={appUrl} />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <PlaceholderTab
            icon={Workflow}
            title="Analytics"
            description="Call volume, capture rate, tool-usage breakdowns, and trend charts. Arrives in Phase 13."
            stats
          />
        </TabsContent>
      </Tabs>

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        agent={agent}
      />
      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        agent={agent}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({
  agent,
  context,
  publicUrl,
  onRename,
}: {
  agent: AgentDetailData;
  context: AgentDetailContext;
  publicUrl: string;
  onRename: () => void;
}) {
  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/agents"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to agents
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-voice">
            Agent
          </p>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">{agent.name}</h1>
            <button
              type="button"
              onClick={onRename}
              aria-label="Rename agent"
              className="grid size-8 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Pencil className="size-3.5" />
            </button>
          </div>
          {agent.businessName ? (
            <p className="text-sm text-muted-foreground">{agent.businessName}</p>
          ) : null}
          <div className="pt-1">
            <StatusBadge status={agent.status} elConnected={context.elConnected} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={publicUrl} target="_blank" rel="noopener noreferrer">
              <Sparkles className="size-4" />
              Quick test
              <ExternalLink className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  elConnected,
}: {
  status: AgentStatus;
  elConnected: boolean;
}) {
  if (status === 'error') {
    return (
      <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15">
        <AlertTriangle className="mr-1 size-3" />
        Error
      </Badge>
    );
  }
  if (status === 'paused' && !elConnected) {
    return (
      <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">
        <AlertTriangle className="mr-1 size-3" />
        Needs attention
      </Badge>
    );
  }
  if (status === 'paused') {
    return (
      <Badge className="bg-muted text-muted-foreground hover:bg-muted">
        <CircleDot className="mr-1 size-3" />
        Paused
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
      <Check className="mr-1 size-3" />
      Active
    </Badge>
  );
}

function StatusBanner({
  agent,
  context,
}: {
  agent: AgentDetailData;
  context: AgentDetailContext;
}) {
  if (agent.status === 'error') {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium text-foreground">
            Agent no longer exists in your ElevenLabs account
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Someone deleted this agent from ElevenLabs directly. Delete it from VoiceFlow and
            create a new one to take new calls.
          </p>
        </div>
      </div>
    );
  }

  if (agent.status === 'paused' && !context.elConnected) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium text-foreground">
            Paused — ElevenLabs is disconnected
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Re-connect ElevenLabs in Integrations to re-activate this agent.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/dashboard/integrations/elevenlabs">Reconnect</Link>
        </Button>
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tabs trigger styling
// ---------------------------------------------------------------------------

function TabTrigger({ value, label }: { value: string; label: string }) {
  return (
    <TabsTrigger
      value={value}
      className="data-[state=active]:bg-background data-[state=active]:shadow-sm"
    >
      {label}
    </TabsTrigger>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({
  agent,
  context,
  publicUrl,
  needsAttention,
}: {
  agent: AgentDetailData;
  context: AgentDetailContext;
  publicUrl: string;
  needsAttention: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Calls (this month)" value="0" hint="Real data lands Phase 11" />
        <StatCard label="Avg duration" value="—" hint="Per-call analytics in Phase 13" />
        <StatCard label="Capture rate" value="—" hint="Booking & lead conversion" />
        <StatCard
          label="Status"
          value={statusLabel(agent.status, context.elConnected)}
          tone={agent.status === 'active' ? 'good' : 'warn'}
        />
      </div>

      {agent.status === 'paused' && context.elConnected ? (
        <ReactivateCard agentId={agent.id} />
      ) : null}

      {context.elConnected ? <ResyncToolsCard agentId={agent.id} /> : null}

      {needsAttention && agent.status === 'paused' ? null : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Public URL</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
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
          <p className="text-xs text-muted-foreground">
            Share this link with your audience or paste it into the Embed tab to add a widget to
            your site.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Recent calls</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            Phase 11
          </Badge>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={PhoneCall}
            title="No calls yet"
            description="When this agent answers calls, the last 5 will show up here."
          />
        </CardContent>
      </Card>
    </>
  );
}

function statusLabel(status: AgentStatus, elConnected: boolean): string {
  if (status === 'error') return 'Error';
  if (status === 'paused' && !elConnected) return 'Needs attention';
  if (status === 'paused') return 'Paused';
  return 'Active';
}

function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/50 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-2 font-serif text-2xl tracking-tight',
          tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'warn' && 'text-amber-600 dark:text-amber-400',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ResyncToolsCard({ agentId }: { agentId: string }) {
  const [toolsPending, startToolsTransition] = useTransition();
  const [settingsPending, startSettingsTransition] = useTransition();

  function onResyncTools() {
    startToolsTransition(async () => {
      const result = await resyncAgentTools({ agentId });
      if (result.ok) {
        toast.success(`Re-synced ${result.data.toolCount} tools to ElevenLabs.`);
      } else {
        toast.error(result.error.message);
        void reportClientError({
          message: `resyncAgentTools: ${result.error.code}`,
          name: 'ResyncAgentToolsError',
        });
      }
    });
  }

  function onResyncSettings() {
    startSettingsTransition(async () => {
      const result = await resyncAgentSettings({ agentId });
      if (result.ok) {
        toast.success('Re-synced system prompt + timezone to ElevenLabs.');
      } else {
        toast.error(result.error.message);
        void reportClientError({
          message: `resyncAgentSettings: ${result.error.code}`,
          name: 'ResyncAgentSettingsError',
        });
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-card/40 p-5">
      <div className="flex items-start gap-3">
        <Workflow className="mt-0.5 size-4 shrink-0 text-voice" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">ElevenLabs sync</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Push the latest tool catalog and the date-grounded system prompt to ElevenLabs. Run
            both after any major upgrade — existing agents won&apos;t pick up changes automatically.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button onClick={onResyncSettings} disabled={settingsPending} variant="outline">
          {settingsPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Re-sync settings
        </Button>
        <Button onClick={onResyncTools} disabled={toolsPending} variant="outline">
          {toolsPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Re-sync tools
        </Button>
      </div>
    </div>
  );
}

function ReactivateCard({ agentId }: { agentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await reactivateAgent({ agentId });
      if (result.ok) {
        toast.success('Agent re-activated.');
        router.refresh();
      } else {
        toast.error(result.error.message);
        void reportClientError({
          message: `reactivateAgent: ${result.error.code}`,
          name: 'ReactivateAgentError',
        });
      }
    });
  }

  return (
    <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-voice/30 bg-voice/5 p-5 sm:flex-row sm:items-center">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-voice" />
        <div>
          <p className="text-sm font-medium text-foreground">This agent is paused</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Re-activate to start handling calls again.
          </p>
        </div>
      </div>
      <Button onClick={onClick} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        Re-activate
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Test tab
// ---------------------------------------------------------------------------

function TestTab({
  agent,
  publicUrl,
}: {
  agent: AgentDetailData;
  publicUrl: string;
  appUrl: string;
}) {
  const blocked = agent.status !== 'active';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">Test your agent</CardTitle>
        <p className="text-sm text-muted-foreground">
          Open a live call in a new tab — your voice goes through your ElevenLabs account.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {blocked ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p>
              The agent is {agent.status === 'error' ? 'in an error state' : 'paused'}. Test calls
              will not connect until you {agent.status === 'error' ? 'recreate it' : 'reactivate it'}.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border/70 bg-card/40 px-6 py-10 text-center">
          <div className="grid size-12 place-items-center rounded-2xl bg-voice/10 text-voice ring-1 ring-voice/20">
            <Bot className="size-6" />
          </div>
          <div className="space-y-1">
            <p className="font-serif text-xl tracking-tight">Open test call</p>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Make sure your microphone permission is enabled. Calls last under a minute usually
              count for a few hundred characters in your ElevenLabs usage.
            </p>
          </div>
          <Button asChild size="lg">
            <Link href={publicUrl} target="_blank" rel="noopener noreferrer">
              <Play className="size-4" />
              Open test call
              <ExternalLink className="size-3.5" />
            </Link>
          </Button>
        </div>

        <div className="rounded-xl border border-border/70 bg-card/40 px-4 py-3 text-sm">
          <p className="font-medium">Or embed on your site</p>
          <p className="mt-1 text-muted-foreground">
            Grab the &lt;script&gt; or &lt;iframe&gt; snippet from the{' '}
            <span className="font-medium text-foreground">Embed</span> tab.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Embed tab
// ---------------------------------------------------------------------------

function EmbedTab({
  agent,
  appUrl,
  publicUrl,
}: {
  agent: AgentDetailData;
  appUrl: string;
  publicUrl: string;
}) {
  const slug = agent.channels.browser.publicSlug;
  const scriptEmbed = `<script src="${appUrl}/widget.js" data-agent-slug="${slug}" async></script>`;
  const iframeEmbed = `<iframe src="${appUrl}/talk/${slug}?embed=1" width="380" height="600" frameborder="0" allow="microphone"></iframe>`;

  return (
    <>
      <div className="flex items-start gap-3 rounded-2xl border border-voice/30 bg-voice/5 p-5">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-voice" />
        <p className="text-sm leading-relaxed text-foreground">
          <span className="font-medium">Protect this embed code.</span>{' '}
          Set <span className="font-medium">Allowed domains</span> in the{' '}
          <span className="font-medium">Channels</span> tab so only your sites can load this
          widget.
        </p>
      </div>

      <EmbedCard
        icon={Globe2}
        title="Public URL"
        description="Share with your audience or open as a standalone page."
        snippet={publicUrl}
        previewHref={publicUrl}
        language="url"
      />

      <EmbedCard
        icon={Code2}
        title="Script embed"
        description="Drop this in your site's <head> or before </body>. The widget renders an overlay button on every page."
        snippet={scriptEmbed}
        previewHref={`/embed-test/${slug}`}
        previewLabel="Test embed in new tab"
        language="html"
      />

      <EmbedCard
        icon={Eye}
        title="iframe embed"
        description="Embed a fixed-size frame inside any page. Microphone access requires the allow attribute."
        snippet={iframeEmbed}
        previewHref={publicUrl}
        language="html"
      />
    </>
  );
}

function EmbedCard({
  icon: Icon,
  title,
  description,
  snippet,
  previewHref,
  previewLabel = 'Preview',
  language,
}: {
  icon: typeof Globe2;
  title: string;
  description: string;
  snippet: string;
  previewHref: string;
  previewLabel?: string;
  language: 'html' | 'url';
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex items-start gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-voice/10 text-voice ring-1 ring-voice/20">
            <Icon className="size-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <pre className="overflow-x-auto rounded-lg border border-border/70 bg-muted/40 px-3 py-2 font-mono text-[11px] leading-relaxed">
          <code className={cn(language === 'url' && 'whitespace-nowrap')}>{snippet}</code>
        </pre>
        <div className="flex items-center justify-end gap-2">
          <Button asChild variant="ghost" size="sm" className="h-7 px-2">
            <Link href={previewHref} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-3.5" />
              {previewLabel}
            </Link>
          </Button>
          <CopyButton value={snippet} />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Placeholder tabs (Calls, Captures, Analytics)
// ---------------------------------------------------------------------------

function PlaceholderTab({
  icon,
  title,
  description,
  stats = false,
}: {
  icon: typeof PhoneCall;
  title: string;
  description: string;
  stats?: boolean;
}) {
  return (
    <div className="space-y-6">
      {stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Calls (this month)" value="—" />
          <StatCard label="Avg duration" value="—" />
          <StatCard label="Capture rate" value="—" />
          <StatCard label="Tool calls" value="—" />
        </div>
      ) : null}
      <Card>
        <CardContent className="py-12">
          <EmptyState icon={icon} title={title} description={description} />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rename dialog
// ---------------------------------------------------------------------------

function RenameDialog({
  open,
  onOpenChange,
  agent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agent: AgentDetailData;
}) {
  const router = useRouter();
  const [name, setName] = useState(agent.name);
  const [pending, startTransition] = useTransition();

  function onSave() {
    if (!name.trim() || name.trim() === agent.name) {
      onOpenChange(false);
      return;
    }
    startTransition(async () => {
      const result = await updateAgent({ agentId: agent.id, name: name.trim() });
      if (result.ok) {
        toast.success('Agent renamed.');
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif text-xl tracking-tight">Rename agent</DialogTitle>
          <DialogDescription>
            Internal name only — your callers never see this. The corresponding ElevenLabs agent
            name will update too.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="rename-input">Agent name</Label>
          <Input
            id="rename-input"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={pending || !name.trim() || name.trim() === agent.name}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete dialog (type-to-confirm)
// ---------------------------------------------------------------------------

function DeleteDialog({
  open,
  onOpenChange,
  agent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agent: AgentDetailData;
}) {
  const router = useRouter();
  const [confirmName, setConfirmName] = useState('');
  const [pending, startTransition] = useTransition();

  const match = confirmName.trim() === agent.name;

  function onConfirm() {
    if (!match) return;
    startTransition(async () => {
      const result = await deleteAgent({ agentId: agent.id, confirmName });
      if (result.ok) {
        toast.success('Agent deleted.');
        router.push('/dashboard/agents');
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setConfirmName('');
        onOpenChange(v);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-serif text-xl tracking-tight">
            Delete this agent?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm leading-relaxed">
              <p>
                This removes the agent from VoiceFlow and from your ElevenLabs account. Past calls
                and captures stay archived but lose their link to this agent.
              </p>
              <p>
                Type <span className="font-mono text-foreground">{agent.name}</span> to confirm.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={agent.name}
            autoFocus
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={!match || pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Delete agent
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
