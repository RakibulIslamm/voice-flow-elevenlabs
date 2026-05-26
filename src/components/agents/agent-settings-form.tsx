'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  Info,
  Loader2,
  Mic,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  setAgentStatus,
  updateAgent,
} from '@/server/actions/agents';
import { reportClientError } from '@/lib/tracking/client-report';
import type { AgentTonePreset } from '@/lib/db/models/agent';
import type { AgentDetailContext, AgentDetailData } from './agent-detail';

const DAYS: { key: DayKey; label: string; short: string }[] = [
  { key: 'mon', label: 'Monday', short: 'Mon' },
  { key: 'tue', label: 'Tuesday', short: 'Tue' },
  { key: 'wed', label: 'Wednesday', short: 'Wed' },
  { key: 'thu', label: 'Thursday', short: 'Thu' },
  { key: 'fri', label: 'Friday', short: 'Fri' },
  { key: 'sat', label: 'Saturday', short: 'Sat' },
  { key: 'sun', label: 'Sunday', short: 'Sun' },
];

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
type DayHours = { open?: string; close?: string; closed: boolean };
type BusinessHours = Record<DayKey, DayHours>;

const TONE_OPTIONS: { key: AgentTonePreset; title: string }[] = [
  { key: 'professional', title: 'Professional' },
  { key: 'friendly', title: 'Friendly' },
  { key: 'casual', title: 'Casual' },
];

const emptyHours: BusinessHours = {
  mon: { open: '09:00', close: '17:00', closed: false },
  tue: { open: '09:00', close: '17:00', closed: false },
  wed: { open: '09:00', close: '17:00', closed: false },
  thu: { open: '09:00', close: '17:00', closed: false },
  fri: { open: '09:00', close: '17:00', closed: false },
  sat: { open: '10:00', close: '14:00', closed: false },
  sun: { open: '', close: '', closed: true },
};

export function AgentSettingsForm({
  agent,
  context,
  onDeleteClick,
}: {
  agent: AgentDetailData;
  context: AgentDetailContext;
  onDeleteClick: () => void;
}) {
  const router = useRouter();
  const initial = useMemo(() => hydrateForm(agent), [agent]);
  const [form, setForm] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [statusPending, startStatusTransition] = useTransition();

  const dirty = useMemo(() => !shallowEqualForm(form, initial), [form, initial]);
  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function onSave() {
    startTransition(async () => {
      type UpdatePayload = {
        agentId: string;
        name?: string;
        businessName?: string;
        businessHours?: BusinessHours;
        greeting?: string;
        systemPrompt?: string;
        tonePreset?: AgentTonePreset;
        expressiveMode?: boolean;
        faq?: { question: string; answer: string }[];
      };
      const payload: UpdatePayload = { agentId: agent.id };
      if (form.name !== initial.name) payload.name = form.name.trim();
      if (form.businessName !== initial.businessName)
        payload.businessName = form.businessName.trim();
      if (!shallowEqualHours(form.businessHours, initial.businessHours))
        payload.businessHours = form.businessHours;
      if (form.greeting !== initial.greeting) payload.greeting = form.greeting.trim();
      if (form.systemPrompt !== initial.systemPrompt)
        payload.systemPrompt = form.systemPrompt.trim();
      if (form.tonePreset !== initial.tonePreset) payload.tonePreset = form.tonePreset;
      if (form.expressiveMode !== initial.expressiveMode)
        payload.expressiveMode = form.expressiveMode;
      if (!shallowEqualFaq(form.faq, initial.faq))
        payload.faq = form.faq.filter((row) => row.question.trim() && row.answer.trim());

      const keys = Object.keys(payload).filter((k) => k !== 'agentId');
      if (keys.length === 0) {
        toast.message('Nothing to save.');
        return;
      }

      const result = await updateAgent(payload);
      if (result.ok) {
        toast.success('Saved.', {
          description:
            keys.some((k) =>
              ['name', 'greeting', 'systemPrompt', 'expressiveMode'].includes(k),
            )
              ? 'Changes synced to ElevenLabs.'
              : undefined,
        });
        router.refresh();
      } else {
        toast.error(result.error.message);
        void reportClientError({
          message: `updateAgent: ${result.error.code}`,
          name: 'UpdateAgentError',
          context: { fields: result.error.fields },
        });
      }
    });
  }

  function onToggleStatus(checked: boolean) {
    const nextStatus = checked ? 'active' : 'paused';
    startStatusTransition(async () => {
      const result = await setAgentStatus({ agentId: agent.id, status: nextStatus });
      if (result.ok) {
        toast.success(checked ? 'Agent re-activated.' : 'Agent paused.');
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const statusLocked =
    agent.status === 'error' ||
    (agent.status === 'paused' && !context.elConnected);

  return (
    <div className="space-y-6">
      {/* Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Status</CardTitle>
          <CardDescription>
            Paused agents don&apos;t accept new calls. Re-activating verifies the agent still
            exists in your ElevenLabs account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 px-4 py-3">
            <div>
              <p className="text-sm font-medium">
                {agent.status === 'active' ? 'Active' : agent.status === 'error' ? 'Error' : 'Paused'}
              </p>
              <p className="text-xs text-muted-foreground">
                {agent.status === 'error'
                  ? 'This agent no longer exists in your ElevenLabs account.'
                  : agent.status === 'paused' && !context.elConnected
                  ? 'Reconnect ElevenLabs to re-activate.'
                  : agent.status === 'paused'
                  ? 'Toggle on to start accepting calls again.'
                  : 'Toggle off to stop accepting new calls.'}
              </p>
            </div>
            {statusLocked ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-block">
                    <Switch checked={false} disabled aria-label="Status" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {agent.status === 'error'
                    ? 'Cannot re-activate — agent is missing from ElevenLabs.'
                    : 'Reconnect ElevenLabs first.'}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Switch
                checked={agent.status === 'active'}
                onCheckedChange={onToggleStatus}
                disabled={statusPending}
                aria-label="Toggle agent status"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Basic info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Basic info</CardTitle>
          <CardDescription>
            Internal labels for this agent. The bot name is what ElevenLabs sees.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormRow label="Bot name" required>
            <Input
              value={form.name}
              maxLength={40}
              onChange={(e) => update('name', e.target.value)}
            />
          </FormRow>
          <FormRow label="Business name" required>
            <Input
              value={form.businessName}
              maxLength={80}
              onChange={(e) => update('businessName', e.target.value)}
            />
          </FormRow>
        </CardContent>
      </Card>

      {/* Business hours */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Business hours</CardTitle>
          <CardDescription>The agent answers callers using these hours.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {DAYS.map(({ key, label, short }) => {
              const day = form.businessHours[key];
              return (
                <div
                  key={key}
                  className={cn(
                    'grid grid-cols-[60px_1fr_auto_1fr_auto] items-center gap-2 rounded-xl border bg-card/40 px-3 py-2 sm:grid-cols-[100px_1fr_auto_1fr_auto] sm:gap-3',
                    day.closed
                      ? 'border-border/40 opacity-60'
                      : 'border-border/60',
                  )}
                >
                  <span className="text-sm font-medium">
                    <span className="sm:hidden">{short}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </span>
                  <Input
                    type="time"
                    value={day.open ?? ''}
                    disabled={day.closed}
                    onChange={(e) =>
                      update('businessHours', {
                        ...form.businessHours,
                        [key]: { ...day, open: e.target.value },
                      })
                    }
                    className="h-9"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="time"
                    value={day.close ?? ''}
                    disabled={day.closed}
                    onChange={(e) =>
                      update('businessHours', {
                        ...form.businessHours,
                        [key]: { ...day, close: e.target.value },
                      })
                    }
                    className="h-9"
                  />
                  <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={day.closed}
                      onCheckedChange={(checked) =>
                        update('businessHours', {
                          ...form.businessHours,
                          [key]: { ...day, closed: checked },
                        })
                      }
                    />
                    <span className="hidden sm:inline">Closed</span>
                  </label>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Voice & personality */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Voice &amp; personality</CardTitle>
          <CardDescription>
            What callers hear. Voice itself is fixed at creation — to change it, create a new
            agent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <FormRow label="Voice">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex h-10 items-center gap-2 rounded-md border border-border/70 bg-muted/40 px-3 text-sm text-muted-foreground">
                  <Mic className="size-4 text-voice" />
                  <span className="font-mono text-xs">{agent.voiceId}</span>
                  <Info className="ml-auto size-3.5" />
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Voice can&apos;t be changed after creation. To use a different voice, create a new
                agent.
              </TooltipContent>
            </Tooltip>
          </FormRow>

          <FormRow label="Tone">
            <div className="grid grid-cols-3 gap-2">
              {TONE_OPTIONS.map((t) => {
                const active = form.tonePreset === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => update('tonePreset', t.key)}
                    className={cn(
                      'rounded-xl border bg-card/50 px-3 py-2 text-sm transition',
                      active
                        ? 'border-voice/60 text-foreground ring-2 ring-voice/20'
                        : 'border-border/70 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t.title}
                  </button>
                );
              })}
            </div>
          </FormRow>

          <FormRow label="Expressive Mode">
            <div className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-card/40 px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium">
                  Emotion-aware delivery{' '}
                  <span className="ml-1 rounded-full bg-voice/10 px-1.5 py-0.5 text-[10px] font-medium text-voice ring-1 ring-voice/20">
                    New
                  </span>
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Uses{' '}
                  <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[10px]">
                    eleven_v3_conversational
                  </code>{' '}
                  — adapts tone and emphasis to caller emotion. Doesn&apos;t fully preserve
                  Professional Voice Clones.
                </p>
              </div>
              <Switch
                checked={form.expressiveMode}
                onCheckedChange={(v) => update('expressiveMode', v)}
                aria-label="Toggle Expressive Mode"
              />
            </div>
          </FormRow>

          <FormRow
            label="Greeting"
            trailing={<span className="text-xs text-muted-foreground">{form.greeting.length}/200</span>}
          >
            <Textarea
              value={form.greeting}
              maxLength={200}
              rows={3}
              onChange={(e) => update('greeting', e.target.value)}
            />
          </FormRow>

          <FormRow
            label="System prompt"
            trailing={
              <span className="text-xs text-muted-foreground">
                {form.systemPrompt.length.toLocaleString()} chars
              </span>
            }
          >
            <Textarea
              value={form.systemPrompt}
              rows={14}
              onChange={(e) => update('systemPrompt', e.target.value)}
              className="font-mono text-xs leading-relaxed"
            />
          </FormRow>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Knowledge &amp; FAQ</CardTitle>
          <CardDescription>
            Q&amp;A the agent can reference during calls. Empty rows are dropped on save.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.faq.map((row, i) => (
            <div
              key={i}
              className="space-y-2 rounded-xl border border-border/70 bg-card/40 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Question {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    update(
                      'faq',
                      form.faq.filter((_, idx) => idx !== i),
                    )
                  }
                  className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Remove question ${i + 1}`}
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <Input
                value={row.question}
                onChange={(e) =>
                  update(
                    'faq',
                    form.faq.map((r, idx) => (idx === i ? { ...r, question: e.target.value } : r)),
                  )
                }
                placeholder="What are your hours?"
              />
              <Textarea
                value={row.answer}
                rows={2}
                onChange={(e) =>
                  update(
                    'faq',
                    form.faq.map((r, idx) => (idx === i ? { ...r, answer: e.target.value } : r)),
                  )
                }
                placeholder="We're open Mon–Fri 9 to 5."
              />
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() => update('faq', [...form.faq, { question: '', answer: '' }])}
            className="w-full"
          >
            <Plus className="size-4" />
            Add Q&amp;A
          </Button>
        </CardContent>
      </Card>

      {/* Sticky save bar */}
      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-2 rounded-2xl border border-border/70 bg-card/85 px-4 py-3 shadow-[0_8px_30px_color-mix(in_oklch,var(--background)_50%,transparent)] backdrop-blur-md">
        <p className="mr-auto text-xs text-muted-foreground">
          {dirty ? 'Unsaved changes' : 'All changes saved'}
        </p>
        <Button
          variant="ghost"
          onClick={() => setForm(initial)}
          disabled={!dirty || pending}
        >
          Discard
        </Button>
        <Button onClick={onSave} disabled={!dirty || pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save changes
        </Button>
      </div>

      {/* Danger zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="size-4" />
            Danger zone
          </CardTitle>
          <CardDescription>
            Permanently remove this agent from VoiceFlow and your ElevenLabs account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={onDeleteClick}
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
            Delete agent
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function FormRow({
  label,
  required,
  trailing,
  children,
}: {
  label: string;
  required?: boolean;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-2">
        <Label className="text-sm">
          {label}
          {required ? <span className="ml-0.5 text-voice">*</span> : null}
        </Label>
        {trailing}
      </div>
      {children}
    </div>
  );
}

function hydrateForm(agent: AgentDetailData) {
  return {
    name: agent.name,
    businessName: agent.businessName,
    businessHours: normaliseHours(agent.businessHours),
    greeting: agent.greeting,
    systemPrompt: agent.systemPrompt,
    tonePreset: agent.tonePreset,
    expressiveMode: agent.expressiveMode,
    faq: agent.faq.map((row) => ({ question: row.question, answer: row.answer })),
  };
}

function normaliseHours(input: AgentDetailData['businessHours']): BusinessHours {
  if (!input) return emptyHours;
  const out: BusinessHours = { ...emptyHours };
  for (const { key } of DAYS) {
    const d = (input as Partial<BusinessHours>)[key];
    if (d) out[key] = { open: d.open ?? '', close: d.close ?? '', closed: !!d.closed };
  }
  return out;
}

function shallowEqualForm(a: ReturnType<typeof hydrateForm>, b: ReturnType<typeof hydrateForm>) {
  return (
    a.name === b.name &&
    a.businessName === b.businessName &&
    a.greeting === b.greeting &&
    a.systemPrompt === b.systemPrompt &&
    a.tonePreset === b.tonePreset &&
    a.expressiveMode === b.expressiveMode &&
    shallowEqualHours(a.businessHours, b.businessHours) &&
    shallowEqualFaq(a.faq, b.faq)
  );
}

function shallowEqualHours(a: BusinessHours, b: BusinessHours) {
  for (const { key } of DAYS) {
    if (a[key].open !== b[key].open) return false;
    if (a[key].close !== b[key].close) return false;
    if (a[key].closed !== b[key].closed) return false;
  }
  return true;
}

function shallowEqualFaq(
  a: { question: string; answer: string }[],
  b: { question: string; answer: string }[],
) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].question !== b[i].question || a[i].answer !== b[i].answer) return false;
  }
  return true;
}
