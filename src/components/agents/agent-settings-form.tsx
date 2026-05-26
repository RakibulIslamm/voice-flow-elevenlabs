'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  AtSign,
  Building2,
  Check,
  ChevronDown,
  CircleDot,
  Clock,
  Globe2,
  IdCard,
  Info,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  Pause,
  Phone,
  Plus,
  Save,
  ShieldAlert,
  Sparkle,
  Trash2,
  Undo2,
  Wand2,
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

const TONE_OPTIONS: {
  key: AgentTonePreset;
  title: string;
  description: string;
}[] = [
  {
    key: 'professional',
    title: 'Professional',
    description: 'Polite, concise, proper grammar.',
  },
  {
    key: 'friendly',
    title: 'Friendly',
    description: 'Warm, personable, uses caller&apos;s name.',
  },
  {
    key: 'casual',
    title: 'Casual',
    description: 'Speaks like a friend would.',
  },
];

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Istanbul',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Dhaka',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
] as const;

const emptyHours: BusinessHours = {
  mon: { open: '09:00', close: '17:00', closed: false },
  tue: { open: '09:00', close: '17:00', closed: false },
  wed: { open: '09:00', close: '17:00', closed: false },
  thu: { open: '09:00', close: '17:00', closed: false },
  fri: { open: '09:00', close: '17:00', closed: false },
  sat: { open: '10:00', close: '14:00', closed: false },
  sun: { open: '', close: '', closed: true },
};

type SectionKey =
  | 'status'
  | 'profile'
  | 'hours'
  | 'voice'
  | 'prompt'
  | 'faq'
  | 'danger';

const SECTIONS: {
  key: SectionKey;
  label: string;
  hash: string;
  icon: typeof Building2;
}[] = [
  { key: 'status', label: 'Status', hash: 'status', icon: CircleDot },
  { key: 'profile', label: 'Business profile', hash: 'profile', icon: Building2 },
  { key: 'hours', label: 'Business hours', hash: 'hours', icon: Clock },
  { key: 'voice', label: 'Voice & personality', hash: 'voice', icon: Mic },
  { key: 'prompt', label: 'System prompt', hash: 'prompt', icon: Wand2 },
  { key: 'faq', label: 'Knowledge & FAQ', hash: 'faq', icon: MessageSquare },
  { key: 'danger', label: 'Danger zone', hash: 'danger', icon: ShieldAlert },
];

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

  const dirtyFields = useMemo(() => diffFields(form, initial), [form, initial]);
  const dirty = dirtyFields.size > 0;
  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function onSave() {
    startTransition(async () => {
      type UpdatePayload = {
        agentId: string;
        name?: string;
        businessName?: string;
        businessAddress?: string;
        businessPhone?: string;
        businessWebsite?: string;
        businessTimezone?: string;
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
      if (form.businessAddress !== initial.businessAddress)
        payload.businessAddress = form.businessAddress.trim();
      if (form.businessPhone !== initial.businessPhone)
        payload.businessPhone = form.businessPhone.trim();
      if (form.businessWebsite !== initial.businessWebsite)
        payload.businessWebsite = form.businessWebsite.trim();
      if (form.businessTimezone !== initial.businessTimezone)
        payload.businessTimezone = form.businessTimezone;
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
              [
                'name',
                'greeting',
                'systemPrompt',
                'expressiveMode',
                'businessTimezone',
              ].includes(k),
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

  const sectionDirty: Record<SectionKey, boolean> = {
    status: false,
    profile:
      dirtyFields.has('name') ||
      dirtyFields.has('businessName') ||
      dirtyFields.has('businessAddress') ||
      dirtyFields.has('businessPhone') ||
      dirtyFields.has('businessWebsite') ||
      dirtyFields.has('businessTimezone'),
    hours: dirtyFields.has('businessHours'),
    voice:
      dirtyFields.has('tonePreset') ||
      dirtyFields.has('expressiveMode') ||
      dirtyFields.has('greeting'),
    prompt: dirtyFields.has('systemPrompt'),
    faq: dirtyFields.has('faq'),
    danger: false,
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
      <SectionNavMobile sectionDirty={sectionDirty} />

      <div className="min-w-0 space-y-6 pb-32 lg:pb-24">
        {/* Status */}
        <Section
          id="status"
          icon={CircleDot}
          accent="muted"
          title="Status"
          description="Paused agents don't accept new calls. Re-activating verifies the agent still exists in your ElevenLabs account."
        >
          <StatusPanel
            agent={agent}
            context={context}
            statusLocked={statusLocked}
            statusPending={statusPending}
            onToggleStatus={onToggleStatus}
          />
        </Section>

        {/* Business profile */}
        <Section
          id="profile"
          icon={Building2}
          accent="voice"
          title="Business profile"
          description={
            <>
              Name, contact, and location details the agent can read back to callers. Timezone
              grounds &ldquo;today&rdquo; and &ldquo;tomorrow&rdquo; for bookings — set it to where
              you actually operate.
            </>
          }
          dirty={sectionDirty.profile}
        >
          <div className="space-y-6">
            <SubSection
              icon={IdCard}
              title="Identity"
              description="What the agent and your dashboard refer to this by."
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormRow label="Bot name" required>
                  <Input
                    value={form.name}
                    maxLength={40}
                    placeholder="Sarah"
                    onChange={(e) => update('name', e.target.value)}
                    className="h-10"
                  />
                </FormRow>
                <FormRow label="Business name" required>
                  <IconInput
                    icon={Building2}
                    value={form.businessName}
                    maxLength={80}
                    placeholder="Sunrise Dental"
                    onChange={(e) => update('businessName', e.target.value)}
                  />
                </FormRow>
              </div>
            </SubSection>

            <SubSection
              icon={AtSign}
              title="Contact"
              description="Surfaced by the get_business_info tool when callers ask."
            >
              <div className="space-y-4">
                <FormRow label="Address">
                  <IconInput
                    icon={MapPin}
                    value={form.businessAddress}
                    maxLength={200}
                    placeholder="123 Main St, Boston, MA"
                    onChange={(e) => update('businessAddress', e.target.value)}
                  />
                </FormRow>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormRow label="Phone">
                    <IconInput
                      icon={Phone}
                      type="tel"
                      inputMode="tel"
                      value={form.businessPhone}
                      maxLength={40}
                      placeholder="+1 555 123 4567"
                      onChange={(e) => update('businessPhone', e.target.value)}
                    />
                  </FormRow>
                  <FormRow
                    label="Website"
                    hint={
                      form.businessWebsite &&
                      !/^https?:\/\//i.test(form.businessWebsite.trim()) &&
                      form.businessWebsite.trim() !== ''
                        ? 'Will be saved as https:// when you save.'
                        : undefined
                    }
                  >
                    <IconInput
                      icon={Globe2}
                      type="url"
                      inputMode="url"
                      value={form.businessWebsite}
                      maxLength={200}
                      placeholder="example.com"
                      onChange={(e) => update('businessWebsite', e.target.value)}
                      onBlur={() => {
                        const trimmed = form.businessWebsite.trim();
                        if (trimmed && !/^https?:\/\//i.test(trimmed)) {
                          update('businessWebsite', `https://${trimmed}`);
                        }
                      }}
                    />
                  </FormRow>
                </div>
              </div>
            </SubSection>

            <SubSection
              icon={Clock}
              title="Locale"
              description="Grounds relative dates and times the caller says."
            >
              <FormRow
                label="Timezone"
                trailing={
                  <span className="rounded-md bg-muted/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {currentLocalTime(form.businessTimezone)}
                  </span>
                }
              >
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                    <Clock className="size-3.5" />
                  </span>
                  <select
                    value={form.businessTimezone}
                    onChange={(e) => update('businessTimezone', e.target.value)}
                    className="h-10 w-full appearance-none rounded-md border border-input bg-background pl-9 pr-9 py-1 text-sm shadow-sm transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    {COMMON_TIMEZONES.includes(
                      form.businessTimezone as (typeof COMMON_TIMEZONES)[number],
                    ) ? null : (
                      <option value={form.businessTimezone}>
                        {form.businessTimezone} (current)
                      </option>
                    )}
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute inset-y-0 right-3 my-auto size-3.5 text-muted-foreground" />
                </div>
              </FormRow>
            </SubSection>
          </div>
        </Section>

        {/* Business hours */}
        <Section
          id="hours"
          icon={Clock}
          accent="emerald"
          title="Business hours"
          description="When the agent answers callers as 'open'. Toggle a day to closed if you don't operate that day."
          dirty={sectionDirty.hours}
          actions={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => update('businessHours', emptyHours)}
            >
              <Undo2 className="size-3.5" />
              Reset to default
            </Button>
          }
        >
          <div className="space-y-1.5">
            {DAYS.map(({ key, label, short }) => {
              const day = form.businessHours[key];
              return (
                <div
                  key={key}
                  className={cn(
                    'grid grid-cols-[64px_1fr_auto_1fr_auto] items-center gap-2 rounded-xl border bg-card/40 px-3 py-2 transition sm:grid-cols-[110px_1fr_auto_1fr_auto] sm:gap-3',
                    day.closed
                      ? 'border-border/30 bg-muted/30 opacity-70'
                      : 'border-border/70',
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
                  <button
                    type="button"
                    onClick={() =>
                      update('businessHours', {
                        ...form.businessHours,
                        [key]: { ...day, closed: !day.closed },
                      })
                    }
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition',
                      day.closed
                        ? 'border-border/60 bg-card/40 text-muted-foreground hover:bg-muted'
                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300',
                    )}
                  >
                    <CircleDot className="size-3" />
                    {day.closed ? 'Closed' : 'Open'}
                  </button>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Voice & personality */}
        <Section
          id="voice"
          icon={Mic}
          accent="voice"
          title="Voice & personality"
          description="What callers hear. Voice itself is fixed at creation — to change it, create a new agent."
          dirty={sectionDirty.voice}
        >
          <div className="space-y-5">
            <FormRow label="Voice">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex h-11 items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-3 text-sm">
                    <div className="grid size-7 place-items-center rounded-md bg-voice/10 text-voice ring-1 ring-voice/20">
                      <Mic className="size-3.5" />
                    </div>
                    <span className="font-mono text-xs text-foreground">{agent.voiceId}</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Info className="size-3" /> Fixed
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Voice can&apos;t be changed after creation. To use a different voice, create a new
                  agent.
                </TooltipContent>
              </Tooltip>
            </FormRow>

            <FormRow label="Tone" hint="Sets how the agent's voice carries the message.">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {TONE_OPTIONS.map((t) => {
                  const active = form.tonePreset === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => update('tonePreset', t.key)}
                      className={cn(
                        'group rounded-xl border bg-card/40 px-3 py-3 text-left transition',
                        active
                          ? 'border-voice/60 bg-voice/5 ring-2 ring-voice/20'
                          : 'border-border/70 hover:border-voice/40 hover:bg-card/70',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t.title}</span>
                        <span
                          className={cn(
                            'grid size-4 place-items-center rounded-full border transition',
                            active
                              ? 'border-voice bg-voice text-background'
                              : 'border-border/70 bg-card',
                          )}
                          aria-hidden
                        >
                          {active ? <Check className="size-2.5" /> : null}
                        </span>
                      </div>
                      <p
                        className="mt-1 text-[11px] leading-snug text-muted-foreground"
                        dangerouslySetInnerHTML={{ __html: t.description }}
                      />
                    </button>
                  );
                })}
              </div>
            </FormRow>

            <FormRow label="Expressive Mode">
              {/* Outer wrapper is a div, not a button — the inner <Switch> is
                  itself a <button>, and nesting buttons triggers a hydration
                  error in React. The div uses role="button" + keyboard
                  handlers so it stays operable from the keyboard. */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => update('expressiveMode', !form.expressiveMode)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    update('expressiveMode', !form.expressiveMode);
                  }
                }}
                className={cn(
                  'flex w-full cursor-pointer items-start gap-3 rounded-xl border bg-card/40 p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                  form.expressiveMode
                    ? 'border-voice/60 ring-2 ring-voice/20'
                    : 'border-border/70 hover:border-voice/40',
                )}
              >
                <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-voice/10 text-voice ring-1 ring-voice/20">
                  <Sparkle className="size-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Emotion-aware delivery</span>
                    <span className="rounded-full bg-voice/10 px-1.5 py-0.5 text-[10px] font-medium text-voice ring-1 ring-voice/20">
                      New
                    </span>
                  </div>
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
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </FormRow>

            <FormRow
              label="Greeting"
              hint="First line the agent says when the call connects."
              trailing={
                <span className="text-xs tabular-nums text-muted-foreground">
                  {form.greeting.length}/200
                </span>
              }
            >
              <Textarea
                value={form.greeting}
                maxLength={200}
                rows={3}
                onChange={(e) => update('greeting', e.target.value)}
              />
            </FormRow>
          </div>
        </Section>

        {/* System prompt */}
        <Section
          id="prompt"
          icon={Wand2}
          accent="amber"
          title="System prompt"
          description="Behaviour, persona, hard rules. Edit carefully — this is the agent's brief."
          dirty={sectionDirty.prompt}
          actions={
            <span className="text-xs tabular-nums text-muted-foreground">
              {form.systemPrompt.length.toLocaleString()} chars · {countLines(form.systemPrompt)} lines
            </span>
          }
        >
          <Textarea
            value={form.systemPrompt}
            rows={16}
            onChange={(e) => update('systemPrompt', e.target.value)}
            className="font-mono text-xs leading-relaxed"
          />
        </Section>

        {/* FAQ */}
        <Section
          id="faq"
          icon={MessageSquare}
          accent="emerald"
          title="Knowledge & FAQ"
          description="Q&A the agent can reference during calls. Empty rows are dropped on save."
          dirty={sectionDirty.faq}
          actions={
            <span className="text-xs text-muted-foreground">
              {form.faq.length} {form.faq.length === 1 ? 'entry' : 'entries'}
            </span>
          }
        >
          <div className="space-y-2">
            {form.faq.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-card/30 py-8 text-center">
                <MessageSquare className="mb-2 size-6 text-muted-foreground" />
                <p className="text-sm font-medium">No Q&amp;A yet</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  Add common questions you want the agent to answer consistently.
                </p>
              </div>
            ) : (
              form.faq.map((row, i) => (
                <FaqRow
                  key={i}
                  index={i}
                  question={row.question}
                  answer={row.answer}
                  onChange={(q, a) =>
                    update(
                      'faq',
                      form.faq.map((r, idx) =>
                        idx === i ? { question: q, answer: a } : r,
                      ),
                    )
                  }
                  onRemove={() =>
                    update(
                      'faq',
                      form.faq.filter((_, idx) => idx !== i),
                    )
                  }
                />
              ))
            )}
            <Button
              variant="outline"
              type="button"
              onClick={() => update('faq', [...form.faq, { question: '', answer: '' }])}
              className="w-full"
            >
              <Plus className="size-4" />
              Add Q&amp;A
            </Button>
          </div>
        </Section>

        {/* Danger zone */}
        <Section
          id="danger"
          icon={ShieldAlert}
          accent="destructive"
          title="Danger zone"
          description="Permanently remove this agent from VoiceFlow and your ElevenLabs account."
        >
          <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Delete agent</p>
              <p className="text-xs text-muted-foreground">
                Removes the agent doc, ElevenLabs agent, all linked tools, calls, and captures. This
                cannot be undone.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={onDeleteClick}
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" />
              Delete agent
            </Button>
          </div>
        </Section>
      </div>

      <SectionNavDesktop sectionDirty={sectionDirty} />

      {/* Sticky save bar */}
      <SaveBar
        dirty={dirty}
        dirtyCount={dirtyFields.size}
        pending={pending}
        onDiscard={() => setForm(initial)}
        onSave={onSave}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section nav
// ---------------------------------------------------------------------------

/**
 * Right-rail sticky section nav for desktop. Placed AFTER the content
 * column in the DOM so the grid renders it on the right (`lg:grid-cols-[1fr_220px]`)
 * while keeping the scroll-spy anchors functional via native `#hash` links.
 * Hidden on mobile — see `SectionNavMobile` for the small-screen variant.
 */
function SectionNavDesktop({
  sectionDirty,
}: {
  sectionDirty: Record<SectionKey, boolean>;
}) {
  return (
    <aside className="hidden lg:block">
      <nav className="sticky top-24 space-y-0.5 rounded-xl border border-border/60 bg-card/40 p-2">
        <p className="px-3 pb-2 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          On this page
        </p>
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const isDirty = sectionDirty[s.key];
          const isDanger = s.key === 'danger';
          return (
            <a
              key={s.key}
              href={`#${s.hash}`}
              className={cn(
                'group flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition',
                isDanger
                  ? 'text-muted-foreground hover:bg-destructive/5 hover:text-destructive'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" />
              <span className="flex-1 truncate">{s.label}</span>
              {isDirty ? (
                <span
                  aria-label="Unsaved changes"
                  className="size-1.5 shrink-0 rounded-full bg-voice"
                />
              ) : null}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}

/**
 * Horizontal section pill bar shown above the content on mobile. Desktop
 * gets the vertical right-rail variant above; this stays out of the way
 * with `lg:hidden`.
 */
function SectionNavMobile({
  sectionDirty,
}: {
  sectionDirty: Record<SectionKey, boolean>;
}) {
  return (
    <div className="-mx-2 overflow-x-auto px-2 lg:hidden">
      <div className="flex min-w-max gap-1 rounded-xl border border-border/60 bg-card/40 p-1">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const isDirty = sectionDirty[s.key];
          return (
            <a
              key={s.key}
              href={`#${s.hash}`}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-background hover:text-foreground"
            >
              <Icon className="size-3.5" />
              {s.label}
              {isDirty ? <span className="size-1.5 rounded-full bg-voice" /> : null}
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

type SectionAccent = 'voice' | 'emerald' | 'amber' | 'destructive' | 'muted';

function Section({
  id,
  icon: Icon,
  accent,
  title,
  description,
  dirty,
  actions,
  children,
}: {
  id: string;
  icon: typeof Building2;
  accent: SectionAccent;
  title: string;
  description?: React.ReactNode;
  dirty?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const accentClasses: Record<SectionAccent, string> = {
    voice: 'bg-voice/10 text-voice ring-voice/20',
    emerald:
      'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400',
    amber:
      'bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400',
    destructive:
      'bg-destructive/10 text-destructive ring-destructive/20',
    muted: 'bg-muted/60 text-muted-foreground ring-border/60',
  };
  return (
    <Card
      id={id}
      className={cn('scroll-mt-24', accent === 'destructive' && 'border-destructive/30')}
    >
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg ring-1',
                accentClasses[accent],
              )}
            >
              <Icon className="size-4" />
            </div>
            <div className="space-y-1">
              <CardTitle
                className={cn(
                  'flex items-center gap-2 text-sm font-medium',
                  accent === 'destructive' && 'text-destructive',
                )}
              >
                {title}
                {dirty ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-voice/10 px-1.5 py-0.5 text-[10px] font-medium text-voice ring-1 ring-voice/20">
                    <span className="size-1 rounded-full bg-voice" />
                    Unsaved
                  </span>
                ) : null}
              </CardTitle>
              {description ? (
                <CardDescription className="max-w-2xl text-xs leading-relaxed">
                  {description}
                </CardDescription>
              ) : null}
            </div>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Status panel
// ---------------------------------------------------------------------------

function StatusPanel({
  agent,
  context,
  statusLocked,
  statusPending,
  onToggleStatus,
}: {
  agent: AgentDetailData;
  context: AgentDetailContext;
  statusLocked: boolean;
  statusPending: boolean;
  onToggleStatus: (checked: boolean) => void;
}) {
  const { label, hint, tone } = describeStatus(agent.status, context.elConnected);
  const toneStyles =
    tone === 'good'
      ? 'border-emerald-500/30 bg-emerald-500/5'
      : tone === 'warn'
        ? 'border-amber-500/30 bg-amber-500/5'
        : 'border-destructive/30 bg-destructive/5';
  const iconStyles =
    tone === 'good'
      ? 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300'
      : tone === 'warn'
        ? 'bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300'
        : 'bg-destructive/15 text-destructive ring-destructive/30';
  const Icon = tone === 'good' ? Check : tone === 'warn' ? Pause : AlertTriangle;
  return (
    <div
      className={cn(
        'flex flex-col items-start justify-between gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center',
        toneStyles,
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn('grid size-9 place-items-center rounded-full ring-1', iconStyles)}>
          <Icon className="size-4" />
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
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
  );
}

function describeStatus(
  status: AgentDetailData['status'],
  elConnected: boolean,
): { label: string; hint: string; tone: 'good' | 'warn' | 'bad' } {
  if (status === 'error') {
    return {
      label: 'Error',
      hint: 'This agent no longer exists in your ElevenLabs account.',
      tone: 'bad',
    };
  }
  if (status === 'paused' && !elConnected) {
    return {
      label: 'Paused',
      hint: 'Reconnect ElevenLabs to re-activate.',
      tone: 'warn',
    };
  }
  if (status === 'paused') {
    return {
      label: 'Paused',
      hint: 'Toggle on to start accepting calls again.',
      tone: 'warn',
    };
  }
  return {
    label: 'Active',
    hint: 'Toggle off to stop accepting new calls.',
    tone: 'good',
  };
}

// ---------------------------------------------------------------------------
// FAQ row (collapsible)
// ---------------------------------------------------------------------------

function FaqRow({
  index,
  question,
  answer,
  onChange,
  onRemove,
}: {
  index: number;
  question: string;
  answer: string;
  onChange: (question: string, answer: string) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(!question && !answer);
  const preview = question.trim() || `Question ${index + 1}`;
  return (
    <div className="rounded-xl border border-border/70 bg-card/40 transition hover:border-voice/40">
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Row toggle — a button containing only static content. The delete
            button sits OUTSIDE this toggle to avoid nested-button hydration
            errors. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
          aria-label={`Toggle question ${index + 1}`}
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted/60 text-[10px] font-medium text-muted-foreground">
            {index + 1}
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm',
              question ? 'text-foreground' : 'text-muted-foreground italic',
            )}
          >
            {preview}
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Remove question ${index + 1}`}
        >
          <X className="size-3.5" />
        </button>
      </div>
      {open ? (
        <div className="space-y-2 border-t border-border/60 p-3">
          <Input
            value={question}
            onChange={(e) => onChange(e.target.value, answer)}
            placeholder="What are your hours?"
          />
          <Textarea
            value={answer}
            rows={2}
            onChange={(e) => onChange(question, e.target.value)}
            placeholder="We're open Mon–Fri 9 to 5."
          />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save bar (fixed bottom)
// ---------------------------------------------------------------------------

function SaveBar({
  dirty,
  dirtyCount,
  pending,
  onDiscard,
  onSave,
}: {
  dirty: boolean;
  dirtyCount: number;
  pending: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 transition-all duration-200',
        dirty || pending ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      )}
      aria-hidden={!dirty && !pending}
    >
      <div className="pointer-events-auto flex w-full max-w-3xl items-center gap-3 rounded-2xl border border-border/70 bg-card/95 px-4 py-3 shadow-2xl shadow-black/10 backdrop-blur-lg">
        <span className="grid size-8 place-items-center rounded-full bg-voice/10 text-voice ring-1 ring-voice/20">
          <Save className="size-3.5" />
        </span>
        <p className="flex-1 text-sm text-foreground">
          {pending ? (
            'Saving…'
          ) : dirtyCount > 0 ? (
            <>
              <span className="font-medium">{dirtyCount}</span>{' '}
              <span className="text-muted-foreground">
                {dirtyCount === 1 ? 'change' : 'changes'} ready to save
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">All changes saved</span>
          )}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDiscard}
          disabled={!dirty || pending}
        >
          <Undo2 className="size-3.5" />
          Discard
        </Button>
        <Button size="sm" onClick={onSave} disabled={!dirty || pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FormRow + utility helpers
// ---------------------------------------------------------------------------

function FormRow({
  label,
  required,
  hint,
  trailing,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
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
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Visually groups related fields inside a Section. Renders a small
 * icon-led header and a left rule to make the grouping scannable
 * without adding a second card-in-card aesthetic.
 */
function SubSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Building2;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="grid size-6 place-items-center rounded-md bg-muted/60 text-muted-foreground ring-1 ring-border/60">
          <Icon className="size-3" />
        </div>
        <div className="flex flex-1 items-baseline gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
            {title}
          </h3>
          {description ? (
            <p className="hidden text-[11px] text-muted-foreground sm:block">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="ml-2.75 border-l border-dashed border-border/60 pl-5">{children}</div>
    </div>
  );
}

/**
 * Input with a leading icon glyph. Mirrors the shadcn Input styling
 * but reserves space on the left for an icon prefix and bumps height
 * to 40px so the icon doesn't feel cramped.
 */
function IconInput({
  icon: Icon,
  className,
  ...props
}: React.ComponentProps<'input'> & { icon: typeof Building2 }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <input
        {...props}
        className={cn(
          'h-10 w-full rounded-md border border-input bg-input/20 pl-9 pr-3 py-1 text-sm shadow-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
          className,
        )}
      />
    </div>
  );
}

/**
 * Formats the current wall-clock time in the given IANA timezone.
 * Returns a short HH:MM string + zone abbreviation; falls back to '—'
 * if the timezone is invalid (defensive — the picker only emits known
 * values, but operator-pasted custom values could be malformed).
 */
function currentLocalTime(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date());
  } catch {
    return '—';
  }
}

function countLines(s: string): number {
  if (!s) return 0;
  return s.split('\n').length;
}

function diffFields(
  a: ReturnType<typeof hydrateForm>,
  b: ReturnType<typeof hydrateForm>,
): Set<string> {
  const out = new Set<string>();
  if (a.name !== b.name) out.add('name');
  if (a.businessName !== b.businessName) out.add('businessName');
  if (a.businessAddress !== b.businessAddress) out.add('businessAddress');
  if (a.businessPhone !== b.businessPhone) out.add('businessPhone');
  if (a.businessWebsite !== b.businessWebsite) out.add('businessWebsite');
  if (a.businessTimezone !== b.businessTimezone) out.add('businessTimezone');
  if (a.greeting !== b.greeting) out.add('greeting');
  if (a.systemPrompt !== b.systemPrompt) out.add('systemPrompt');
  if (a.tonePreset !== b.tonePreset) out.add('tonePreset');
  if (a.expressiveMode !== b.expressiveMode) out.add('expressiveMode');
  if (!shallowEqualHours(a.businessHours, b.businessHours)) out.add('businessHours');
  if (!shallowEqualFaq(a.faq, b.faq)) out.add('faq');
  return out;
}

function hydrateForm(agent: AgentDetailData) {
  return {
    name: agent.name,
    businessName: agent.businessName,
    businessAddress: agent.businessAddress,
    businessPhone: agent.businessPhone,
    businessWebsite: agent.businessWebsite,
    businessTimezone: agent.businessTimezone,
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
