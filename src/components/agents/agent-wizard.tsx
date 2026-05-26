'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Globe2,
  Loader2,
  Mic,
  Plus,
  RotateCcw,
  Stethoscope,
  Utensils,
  Sparkles,
  Wand2,
  X,
  Phone,
  Lock,
  ExternalLink,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  Wand,
  Building2,
  MessageCircleQuestion,
  ScrollText,
  Radio,
  ClipboardCheck,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { reportClientError } from '@/lib/tracking/client-report';
import { createAgent, buildTemplateDefaults } from '@/server/actions/agents';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type TemplateKey = 'dental' | 'restaurant' | 'lead-qualifier' | 'custom';
type TonePreset = 'professional' | 'friendly' | 'casual';

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
type DayHours = { open?: string; close?: string; closed: boolean };
type BusinessHours = Record<DayKey, DayHours>;

const DAYS: { key: DayKey; label: string; short: string }[] = [
  { key: 'mon', label: 'Monday', short: 'Mon' },
  { key: 'tue', label: 'Tuesday', short: 'Tue' },
  { key: 'wed', label: 'Wednesday', short: 'Wed' },
  { key: 'thu', label: 'Thursday', short: 'Thu' },
  { key: 'fri', label: 'Friday', short: 'Fri' },
  { key: 'sat', label: 'Saturday', short: 'Sat' },
  { key: 'sun', label: 'Sunday', short: 'Sun' },
];

const TEMPLATE_OPTIONS: {
  key: TemplateKey;
  title: string;
  description: string;
  icon: typeof Stethoscope;
  badge?: string;
  examples: string[];
}[] = [
  {
    key: 'dental',
    title: 'Dental Clinic',
    description: 'Books appointments, handles emergencies, and answers care questions.',
    icon: Stethoscope,
    badge: 'Popular',
    examples: ['Book a cleaning', 'Office hours', 'Emergency triage'],
  },
  {
    key: 'restaurant',
    title: 'Restaurant',
    description: 'Takes reservations, mentions the menu, and runs a wait list.',
    icon: Utensils,
    examples: ['Reservations', 'Menu Q&A', 'Wait list'],
  },
  {
    key: 'lead-qualifier',
    title: 'Lead Qualifier',
    description: 'Qualifies inbound leads with a few sharp questions, captures contact.',
    icon: Sparkles,
    examples: ['Discovery', 'Budget check', 'Hand-off'],
  },
  {
    key: 'custom',
    title: 'Custom',
    description: 'Start from scratch and configure everything yourself.',
    icon: Wand2,
    examples: ['Anything', 'Anywhere', 'Anytime'],
  },
];

const TONE_OPTIONS: { key: TonePreset; title: string; description: string }[] = [
  {
    key: 'professional',
    title: 'Professional',
    description: 'Polite and concise. Clean grammar, no filler.',
  },
  {
    key: 'friendly',
    title: 'Friendly',
    description: 'Warm and personable. A touch of humour.',
  },
  {
    key: 'casual',
    title: 'Casual',
    description: 'Speaks like a friend. Contractions, short sentences.',
  },
];

type Voice = {
  voiceId: string;
  name: string;
  category?: string;
  accent?: string;
  gender?: string;
  description?: string;
  previewUrl?: string;
  isCustom: boolean;
};

const STEPS: { label: string; short: string; icon: typeof Wand }[] = [
  { label: 'Template', short: 'Template', icon: Wand },
  { label: 'Business', short: 'Business', icon: Building2 },
  { label: 'Voice', short: 'Voice', icon: Mic },
  { label: 'Knowledge', short: 'Knowledge', icon: MessageCircleQuestion },
  { label: 'Prompt', short: 'Prompt', icon: ScrollText },
  { label: 'Channels', short: 'Channels', icon: Radio },
  { label: 'Review', short: 'Review', icon: ClipboardCheck },
];

const TOTAL_STEPS = STEPS.length;

const PUBLIC_APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(
  /\/$/,
  '',
);

const defaultBusinessHours: BusinessHours = {
  mon: { open: '09:00', close: '17:00', closed: false },
  tue: { open: '09:00', close: '17:00', closed: false },
  wed: { open: '09:00', close: '17:00', closed: false },
  thu: { open: '09:00', close: '17:00', closed: false },
  fri: { open: '09:00', close: '17:00', closed: false },
  sat: { open: '10:00', close: '14:00', closed: false },
  sun: { open: '', close: '', closed: true },
};

type WizardData = {
  template?: TemplateKey;
  businessName: string;
  businessHours: BusinessHours;
  businessTimezone: string;
  location: string;
  phone: string;
  website: string;
  agentName: string;
  greeting: string;
  voiceId: string;
  tonePreset: TonePreset;
  faq: { question: string; answer: string }[];
  systemPrompt: string;
  publicSlug: string;
  allowedDomains: string[];
};

const emptyData: WizardData = {
  template: undefined,
  businessName: '',
  businessHours: defaultBusinessHours,
  businessTimezone: detectInitialTimezone(),
  location: '',
  phone: '',
  website: '',
  agentName: '',
  greeting: '',
  voiceId: '',
  tonePreset: 'professional',
  faq: [],
  systemPrompt: '',
  publicSlug: '',
  allowedDomains: [],
};

function detectInitialTimezone(): string {
  if (typeof Intl === 'undefined') return 'UTC';
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

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

// ---------------------------------------------------------------------------
// Slide variants
// ---------------------------------------------------------------------------

const slide = {
  enter: (dir: 1 | -1) => ({ x: dir * 24, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: 1 | -1) => ({ x: dir * -24, opacity: 0 }),
};

// ---------------------------------------------------------------------------
// Top-level wizard
// ---------------------------------------------------------------------------

export function AgentWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [data, setData] = useState<WizardData>(emptyData);
  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<'provisioning' | 'saving' | 'done'>(
    'provisioning',
  );

  const update = (patch: Partial<WizardData>) => setData((d) => ({ ...d, ...patch }));

  useEffect(() => {
    if (!data.businessName) return;
    setData((d) =>
      d.greeting
        ? d
        : { ...d, greeting: `Hi, you've reached ${d.businessName}. How can I help you today?` },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.businessName]);

  useEffect(() => {
    if (step !== 6) return;
    if (data.publicSlug) return;
    if (!data.businessName) return;
    setData((d) => ({ ...d, publicSlug: makeSlug(d.businessName) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const canContinue = useMemo(() => validateStep(step, data), [step, data]);

  const next = () => {
    if (!canContinue) return;
    setDirection(1);
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };
  const back = () => {
    setDirection(-1);
    setStep((s) => Math.max(1, s - 1));
  };
  const jumpTo = (n: number) => {
    if (n >= step) return;
    setDirection(-1);
    setStep(n);
  };

  async function handleSubmit() {
    if (!data.template) return;
    setSubmitting(true);
    setSubmitStage('provisioning');

    try {
      const result = await createAgent({
        template: data.template,
        businessName: data.businessName,
        businessHours: data.businessHours,
        businessTimezone: data.businessTimezone,
        location: data.location || undefined,
        phone: data.phone || undefined,
        website: data.website || undefined,
        agentName: data.agentName,
        greeting: data.greeting,
        voiceId: data.voiceId,
        tonePreset: data.tonePreset,
        faq: data.faq.filter((f) => f.question.trim() && f.answer.trim()),
        systemPrompt: data.systemPrompt,
        publicSlug: data.publicSlug,
        allowedDomains: data.allowedDomains,
      });

      setSubmitStage('saving');

      if (result.ok) {
        setSubmitStage('done');
        toast.success('Agent created!');
        // Tiny delay so the user gets a beat of the success state.
        setTimeout(() => router.push(`/dashboard/agents/${result.data.agentId}`), 450);
      } else {
        toast.error(result.error.message, {
          description: 'Try again, or check Integrations if your ElevenLabs status changed.',
        });
        void reportClientError({
          message: `createAgent failed: ${result.error.code}`,
          name: 'CreateAgentError',
          context: { code: result.error.code, fields: result.error.fields },
        });
        setSubmitting(false);
      }
    } catch (e) {
      toast.error('Something went wrong. Please try again.');
      void reportClientError({
        message: `createAgent threw: ${e instanceof Error ? e.message : 'unknown'}`,
        name: 'CreateAgentError',
        stack: e instanceof Error ? e.stack : undefined,
      });
      setSubmitting(false);
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-4xl space-y-10 pb-24">
      {/* Page header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard/agents"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to agents
          </Link>
          <p className="text-xs text-muted-foreground">
            <span className="hidden sm:inline">Press </span>
            <kbd className="rounded border border-border/70 bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              Esc
            </kbd>{' '}
            anytime to cancel
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-voice">
            Create agent
          </p>
          <h1 className="mt-1.5 font-serif text-3xl tracking-tight sm:text-4xl">
            Build your AI receptionist
          </h1>
        </div>
      </div>

      {/* Stepper */}
      <Stepper step={step} onJump={jumpTo} />

      {/* Step content */}
      <div className="relative min-h-[440px]">
        <AnimatePresence custom={direction} mode="wait" initial={false}>
          <motion.div
            key={step}
            custom={direction}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {step === 1 && <StepTemplate data={data} update={update} />}
            {step === 2 && <StepBusiness data={data} update={update} />}
            {step === 3 && <StepVoice data={data} update={update} />}
            {step === 4 && <StepFaq data={data} update={update} />}
            {step === 5 && <StepPrompt data={data} update={update} />}
            {step === 6 && <StepChannels data={data} update={update} />}
            {step === 7 && <StepReview data={data} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-4 z-10 mt-auto rounded-2xl border border-border/70 bg-card/80 px-4 py-3 shadow-[0_8px_30px_color-mix(in_oklch,var(--background)_50%,transparent)] backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={back}
            disabled={step === 1 || submitting}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <p className="hidden text-[11px] text-muted-foreground sm:block">
            {step === TOTAL_STEPS
              ? 'Last step — ready when you are.'
              : `Step ${step} of ${TOTAL_STEPS} · ${STEPS[step - 1].label}`}
          </p>
          {step < TOTAL_STEPS ? (
            <Button onClick={next} disabled={!canContinue || submitting} size="lg">
              Continue
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!canContinue || submitting} size="lg">
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  Create Agent
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {submitting ? <SubmittingOverlay stage={submitStage} /> : null}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

function Stepper({ step, onJump }: { step: number; onJump: (n: number) => void }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-4">
      <ol className="flex items-center gap-1 sm:gap-2">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const done = n < step;
          const current = n === step;
          const last = i === STEPS.length - 1;
          const Icon = s.icon;
          return (
            <li key={s.label} className="flex flex-1 items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => done && onJump(n)}
                disabled={!done}
                className={cn(
                  'group flex shrink-0 flex-col items-center gap-1.5 outline-none transition',
                  done && 'cursor-pointer',
                )}
                aria-label={`Step ${n}: ${s.label}`}
                aria-current={current ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'grid size-8 place-items-center rounded-full text-[11px] font-semibold transition group-focus-visible:ring-2 group-focus-visible:ring-voice/50',
                    done && 'bg-voice text-voice-foreground shadow-sm group-hover:opacity-90',
                    current && 'bg-voice/15 text-voice ring-2 ring-voice/40',
                    !done && !current && 'bg-muted text-muted-foreground/70',
                  )}
                >
                  {done ? (
                    <Check className="size-4" aria-hidden />
                  ) : current ? (
                    <Icon className="size-4" aria-hidden />
                  ) : (
                    n
                  )}
                </span>
                <span
                  className={cn(
                    'hidden text-[10px] font-medium uppercase tracking-[0.14em] transition sm:block',
                    current
                      ? 'text-foreground'
                      : done
                      ? 'text-foreground/70'
                      : 'text-muted-foreground/60',
                  )}
                >
                  {s.short}
                </span>
              </button>
              {!last ? (
                <span
                  aria-hidden
                  className={cn(
                    'mb-4 h-px flex-1 transition sm:mb-5',
                    done ? 'bg-voice/50' : 'bg-border/60',
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Template
// ---------------------------------------------------------------------------

function StepTemplate({
  data,
  update,
}: {
  data: WizardData;
  update: (p: Partial<WizardData>) => void;
}) {
  return (
    <div className="space-y-7">
      <Heading
        eyebrow="Step 1"
        title="Pick a starting point"
        hint="We'll seed the prompt, tools, and FAQ for you. You can change everything later."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TEMPLATE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = data.template === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => update({ template: opt.key })}
              className={cn(
                'group relative flex flex-col gap-4 overflow-hidden rounded-2xl border bg-card/60 p-5 text-left transition',
                active
                  ? 'border-voice/60 shadow-[0_0_0_4px_color-mix(in_oklch,var(--voice)_15%,transparent)]'
                  : 'border-border/70 hover:-translate-y-0.5 hover:border-voice/40',
              )}
            >
              {active ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-voice/70 to-transparent"
                />
              ) : null}
              <div className="flex items-start justify-between">
                <div
                  className={cn(
                    'grid size-11 place-items-center rounded-xl ring-1 transition',
                    active
                      ? 'bg-voice text-voice-foreground ring-voice'
                      : 'bg-voice/10 text-voice ring-voice/20 group-hover:bg-voice/15',
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </div>
                <div className="flex items-center gap-2">
                  {opt.badge ? (
                    <Badge variant="outline" className="border-voice/40 text-[10px] text-voice">
                      {opt.badge}
                    </Badge>
                  ) : null}
                  {active ? (
                    <span className="grid size-6 place-items-center rounded-full bg-voice text-voice-foreground">
                      <Check className="size-3.5" aria-hidden />
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="font-medium text-foreground">{opt.title}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{opt.description}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {opt.examples.map((ex) => (
                  <span
                    key={ex}
                    className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
                  >
                    {ex}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Business info
// ---------------------------------------------------------------------------

function StepBusiness({
  data,
  update,
}: {
  data: WizardData;
  update: (p: Partial<WizardData>) => void;
}) {
  function copyMonFriToWeekday() {
    const ref = data.businessHours.mon;
    update({
      businessHours: {
        ...data.businessHours,
        tue: { ...ref },
        wed: { ...ref },
        thu: { ...ref },
        fri: { ...ref },
      },
    });
  }

  return (
    <div className="space-y-7">
      <Heading
        eyebrow="Step 2"
        title="Tell us about the business"
        hint="The agent uses these to answer questions and confirm bookings."
      />

      <SectionCard>
        <FieldGroup label="Business name" required>
          <Input
            id="businessName"
            value={data.businessName}
            maxLength={80}
            onChange={(e) => update({ businessName: e.target.value })}
            placeholder="Sunrise Dental"
            className="h-11"
          />
        </FieldGroup>
      </SectionCard>

      <SectionCard>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Label className="text-sm">Business hours</Label>
          <button
            type="button"
            onClick={copyMonFriToWeekday}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Apply Monday to all weekdays
          </button>
        </div>
        <div className="space-y-1.5">
          {DAYS.map(({ key, label, short }) => {
            const day = data.businessHours[key];
            return (
              <div
                key={key}
                className={cn(
                  'grid grid-cols-[80px_1fr_auto_1fr_auto] items-center gap-3 rounded-xl border bg-card/40 px-3 py-2 transition sm:grid-cols-[120px_1fr_auto_1fr_auto]',
                  day.closed
                    ? 'border-border/40 opacity-60'
                    : 'border-border/60 hover:border-border',
                )}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    <span className="sm:hidden">{short}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </span>
                </div>
                <Input
                  type="time"
                  value={day.open ?? ''}
                  disabled={day.closed}
                  onChange={(e) =>
                    update({
                      businessHours: {
                        ...data.businessHours,
                        [key]: { ...day, open: e.target.value },
                      },
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
                    update({
                      businessHours: {
                        ...data.businessHours,
                        [key]: { ...day, close: e.target.value },
                      },
                    })
                  }
                  className="h-9"
                />
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={day.closed}
                    onCheckedChange={(checked) =>
                      update({
                        businessHours: {
                          ...data.businessHours,
                          [key]: { ...day, closed: checked },
                        },
                      })
                    }
                  />
                  <span className="hidden sm:inline">Closed</span>
                </label>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SectionCard>
          <FieldGroup label="Location (optional)" hint="Used when callers ask 'where are you?'">
            <Input
              id="location"
              value={data.location}
              onChange={(e) => update({ location: e.target.value })}
              placeholder="123 Main St, Boston, MA"
              className="h-11"
            />
          </FieldGroup>
        </SectionCard>
        <SectionCard>
          <FieldGroup label="Phone (optional)" hint="For human-transfer fallback.">
            <Input
              id="phone"
              value={data.phone}
              onChange={(e) => update({ phone: e.target.value })}
              placeholder="+1 555 123 4567"
              className="h-11"
            />
          </FieldGroup>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SectionCard>
          <FieldGroup label="Website (optional)" hint="Shared when the caller asks for your URL.">
            <Input
              id="website"
              type="url"
              value={data.website}
              onChange={(e) => update({ website: e.target.value })}
              placeholder="https://example.com"
              className="h-11"
            />
          </FieldGroup>
        </SectionCard>
        <SectionCard>
          <FieldGroup
            label="Timezone"
            hint="Grounds 'today' and 'tomorrow' for the agent. Pre-filled from your browser."
          >
            <select
              id="businessTimezone"
              value={data.businessTimezone}
              onChange={(e) => update({ businessTimezone: e.target.value })}
              className="h-11 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {COMMON_TIMEZONES.includes(
                data.businessTimezone as (typeof COMMON_TIMEZONES)[number],
              ) ? null : (
                <option value={data.businessTimezone}>{data.businessTimezone} (detected)</option>
              )}
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </FieldGroup>
        </SectionCard>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Voice & personality
// ---------------------------------------------------------------------------

function StepVoice({
  data,
  update,
}: {
  data: WizardData;
  update: (p: Partial<WizardData>) => void;
}) {
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/elevenlabs/voices', { cache: 'no-store' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as { voices?: Voice[] };
        if (!cancelled) setVoices(json.voices ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load voices.');
          setVoices([]);
        }
        void reportClientError({
          message: `Failed to load voices: ${e instanceof Error ? e.message : 'unknown'}`,
          name: 'VoiceLoadError',
        });
      }
    })();
    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
  }, []);

  function togglePreview(voice: Voice) {
    if (!voice.previewUrl) return;
    if (playingId === voice.voiceId) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const a = new Audio(voice.previewUrl);
    audioRef.current = a;
    a.onended = () => setPlayingId(null);
    a.onerror = () => setPlayingId(null);
    void a.play().then(() => setPlayingId(voice.voiceId)).catch(() => setPlayingId(null));
  }

  const greetingLen = data.greeting.length;

  return (
    <div className="space-y-7">
      <Heading
        eyebrow="Step 3"
        title="Give it a voice"
        hint="Bot name and greeting are what callers hear first. Pick a voice that fits."
      />

      <SectionCard>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FieldGroup label="Bot name" required>
            <Input
              id="agentName"
              value={data.agentName}
              maxLength={40}
              onChange={(e) => update({ agentName: e.target.value })}
              placeholder="Sarah"
              className="h-11"
            />
          </FieldGroup>
          <FieldGroup label="Tone">
            <div className="grid grid-cols-3 gap-1.5">
              {TONE_OPTIONS.map((t) => {
                const active = data.tonePreset === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => update({ tonePreset: t.key })}
                    className={cn(
                      'flex flex-col items-start gap-0.5 rounded-xl border bg-card/50 px-3 py-2.5 text-left transition',
                      active
                        ? 'border-voice/60 ring-2 ring-voice/20'
                        : 'border-border/70 hover:border-voice/40',
                    )}
                  >
                    <span
                      className={cn(
                        'text-sm font-medium',
                        active ? 'text-foreground' : 'text-foreground/80',
                      )}
                    >
                      {t.title}
                    </span>
                    <span className="hidden text-[10px] leading-tight text-muted-foreground sm:block">
                      {t.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </FieldGroup>
        </div>

        <div className="mt-5">
          <FieldGroup
            label="Greeting"
            required
            trailing={
              <span className="text-xs text-muted-foreground">
                {greetingLen}/200
              </span>
            }
          >
            <Textarea
              id="greeting"
              value={data.greeting}
              maxLength={200}
              rows={3}
              onChange={(e) => update({ greeting: e.target.value })}
              placeholder={`Hi, you've reached ${data.businessName || 'your business'}. How can I help?`}
              className="leading-relaxed"
            />
          </FieldGroup>
        </div>
      </SectionCard>

      <div className="space-y-3">
        <div className="flex items-end justify-between gap-2">
          <Label className="text-sm">Voice</Label>
          {voices && voices.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {voices.length} voice{voices.length === 1 ? '' : 's'} in your ElevenLabs account
            </p>
          ) : null}
        </div>
        {voices === null ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[70px] animate-pulse rounded-xl border border-dashed border-border/60 bg-card/30"
              />
            ))}
          </div>
        ) : voices.length === 0 ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            {error ?? 'No voices available in your ElevenLabs account.'} Check your ElevenLabs
            subscription and try again.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {voices.map((v) => {
              const active = data.voiceId === v.voiceId;
              const isPlaying = playingId === v.voiceId;
              return (
                <div
                  key={v.voiceId}
                  className={cn(
                    'group flex items-center gap-3 rounded-xl border bg-card/60 p-3 transition',
                    active
                      ? 'border-voice/60 shadow-[0_0_0_3px_color-mix(in_oklch,var(--voice)_12%,transparent)]'
                      : 'border-border/70 hover:border-voice/40',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => update({ voiceId: v.voiceId })}
                    className="flex flex-1 items-center gap-3 text-left"
                    aria-pressed={active}
                  >
                    <div
                      className={cn(
                        'grid size-10 shrink-0 place-items-center rounded-lg ring-1 transition',
                        active
                          ? 'bg-voice text-voice-foreground ring-voice'
                          : 'bg-voice/10 text-voice ring-voice/20 group-hover:bg-voice/15',
                      )}
                    >
                      {active ? <Check className="size-4" /> : <Mic className="size-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-foreground">{v.name}</p>
                        {v.isCustom ? (
                          <Badge variant="outline" className="text-[10px]">
                            Custom
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {[v.accent, v.gender].filter(Boolean).join(' · ') || 'Premade voice'}
                      </p>
                    </div>
                  </button>
                  {v.previewUrl ? (
                    <button
                      type="button"
                      onClick={() => togglePreview(v)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition',
                        isPlaying
                          ? 'border-voice/40 bg-voice/10 text-voice'
                          : 'border-border/70 bg-background text-muted-foreground hover:text-foreground',
                      )}
                      aria-label={isPlaying ? 'Stop preview' : 'Play preview'}
                    >
                      {isPlaying ? (
                        <PauseCircle className="size-3.5" />
                      ) : (
                        <PlayCircle className="size-3.5" />
                      )}
                      {isPlaying ? 'Stop' : 'Preview'}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — FAQ
// ---------------------------------------------------------------------------

function StepFaq({
  data,
  update,
}: {
  data: WizardData;
  update: (p: Partial<WizardData>) => void;
}) {
  useEffect(() => {
    if (data.faq.length > 0) return;
    update({
      faq: [
        { question: '', answer: '' },
        { question: '', answer: '' },
        { question: '', answer: '' },
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setRow(i: number, patch: Partial<{ question: string; answer: string }>) {
    update({
      faq: data.faq.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    });
  }
  function add() {
    update({ faq: [...data.faq, { question: '', answer: '' }] });
  }
  function remove(i: number) {
    update({ faq: data.faq.filter((_, idx) => idx !== i) });
  }

  const limit = 20;
  const filled = data.faq.filter((r) => r.question.trim() && r.answer.trim()).length;

  return (
    <div className="space-y-7">
      <Heading
        eyebrow="Step 4 · optional"
        title="Knowledge & FAQ"
        hint="Common questions and the answers you want the agent to give. Skip rows you don't need."
      />

      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 px-4 py-2.5 text-xs">
        <span className="text-muted-foreground">
          {filled} of {data.faq.length} filled
        </span>
        <span className="text-muted-foreground">{limit - data.faq.length} more slots available</span>
      </div>

      <div className="space-y-3">
        {data.faq.map((row, i) => (
          <div
            key={i}
            className="group rounded-2xl border border-border/70 bg-card/50 p-4 transition hover:border-border"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <span className="grid size-5 place-items-center rounded-full bg-voice/15 text-[10px] font-semibold text-voice">
                  {i + 1}
                </span>
                Question {i + 1}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Remove question ${i + 1}`}
              >
                <X className="size-3.5" />
              </button>
            </div>
            <Input
              value={row.question}
              onChange={(e) => setRow(i, { question: e.target.value })}
              placeholder="What are your hours?"
              className="mt-2"
            />
            <Textarea
              value={row.answer}
              onChange={(e) => setRow(i, { answer: e.target.value })}
              placeholder="We're open Mon-Fri 9 to 5."
              rows={2}
              className="mt-2"
            />
          </div>
        ))}
        {data.faq.length < limit ? (
          <Button variant="outline" onClick={add} className="w-full">
            <Plus className="size-4" />
            Add Q&amp;A
          </Button>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            Free plan limit ({limit}) reached. Higher tiers unlock more.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — System prompt
// ---------------------------------------------------------------------------

function StepPrompt({
  data,
  update,
}: {
  data: WizardData;
  update: (p: Partial<WizardData>) => void;
}) {
  const [pending, startTransition] = useTransition();

  async function generateDefault() {
    if (!data.template) return;
    const hoursText = renderHoursText(data.businessHours);
    startTransition(async () => {
      const result = await buildTemplateDefaults({
        template: data.template!,
        businessInfo: {
          name: data.businessName || 'the business',
          agentName: data.agentName || undefined,
          hours: hoursText || undefined,
          address: data.location || undefined,
          humanPhone: data.phone || undefined,
        },
        tonePreset: data.tonePreset,
      });
      if (result.ok) {
        update({ systemPrompt: result.data.systemPrompt });
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (data.systemPrompt) {
      seededRef.current = true;
      return;
    }
    seededRef.current = true;
    void generateDefault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const charCount = data.systemPrompt.length;
  const wordCount = data.systemPrompt.trim() ? data.systemPrompt.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-6">
      <Heading
        eyebrow="Step 5"
        title="System prompt"
        hint="The agent's brain. We've generated a starting point — edit anything you want to change."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_240px]">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Prompt
            </span>
            <Button variant="ghost" size="sm" onClick={generateDefault} disabled={pending}>
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RotateCcw className="size-3.5" />
              )}
              Reset to template default
            </Button>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/40 p-1.5">
            <Textarea
              value={data.systemPrompt}
              onChange={(e) => update({ systemPrompt: e.target.value })}
              rows={18}
              className="resize-y border-0 bg-transparent font-mono text-xs leading-relaxed shadow-none focus-visible:ring-0"
              placeholder="Loading default…"
            />
            <div className="flex items-center justify-between border-t border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground">
              <span>
                {wordCount.toLocaleString()} words · {charCount.toLocaleString()} chars
              </span>
              <span>{charCount > 10_000 ? 'Long prompts cost more latency' : 'Looks good'}</span>
            </div>
          </div>
        </div>

        <aside className="space-y-3 self-start rounded-2xl border border-border/60 bg-card/40 p-4 text-xs leading-relaxed">
          <div className="flex items-center gap-2 text-foreground">
            <Sparkles className="size-3.5 text-voice" />
            <span className="font-medium">Prompt tips</span>
          </div>
          <ul className="space-y-2 text-muted-foreground">
            <li>• Open with a one-line identity ("You are Sarah, …").</li>
            <li>• Spell out tone, pace, and brevity rules.</li>
            <li>• List the exact tools the agent can use.</li>
            <li>• End with edge cases — what to do when unsure.</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 6 — Channels
// ---------------------------------------------------------------------------

function StepChannels({
  data,
  update,
}: {
  data: WizardData;
  update: (p: Partial<WizardData>) => void;
}) {
  const [domainInput, setDomainInput] = useState('');
  const [copied, setCopied] = useState(false);

  function regenerateSlug() {
    update({ publicSlug: makeSlug(data.businessName) });
  }

  function addDomain() {
    const v = domainInput.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!v) return;
    if (data.allowedDomains.includes(v)) {
      setDomainInput('');
      return;
    }
    update({ allowedDomains: [...data.allowedDomains, v] });
    setDomainInput('');
  }
  function removeDomain(d: string) {
    update({ allowedDomains: data.allowedDomains.filter((x) => x !== d) });
  }

  const publicUrl = `${PUBLIC_APP_URL}/talk/${data.publicSlug || 'your-slug'}`;

  async function copyPublicUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error('Could not copy. Select and copy manually.');
    }
  }

  return (
    <div className="space-y-7">
      <Heading
        eyebrow="Step 6"
        title="Channels"
        hint="Where your callers reach the agent. Browser is on by default; phone requires Pro."
      />

      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/60">
        <div className="flex items-center justify-between border-b border-border/60 bg-card/40 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-voice/10 text-voice ring-1 ring-voice/20">
              <Globe2 className="size-4" />
            </div>
            <div>
              <p className="text-sm font-medium">Browser</p>
              <p className="text-[11px] text-muted-foreground">
                A public page anyone can talk to from a browser
              </p>
            </div>
          </div>
          <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
            <CheckCircle2 className="mr-1 size-3" />
            Enabled
          </Badge>
        </div>

        <div className="space-y-5 px-5 py-4">
          <FieldGroup
            label="Public URL"
            hint="Share this link with your audience. We'll generate a short, friendly slug."
            trailing={
              <button
                type="button"
                onClick={regenerateSlug}
                disabled={!data.businessName}
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-60"
              >
                Regenerate
              </button>
            }
          >
            <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{publicUrl}</code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={copyPublicUrl}
                className="h-7 gap-1.5 px-2 text-xs"
              >
                {copied ? (
                  <Check className="size-3.5 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </FieldGroup>

          <FieldGroup
            label="Allowed domains"
            hint="Where the agent embed can be loaded from. Leave empty to allow any domain — strongly recommended in production to lock down embeds."
          >
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2 py-1.5 transition focus-within:border-voice/50">
              {data.allowedDomains.map((d) => (
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
                  }
                }}
                onBlur={addDomain}
                placeholder="example.com, mysite.com…"
                className="min-w-[140px] flex-1 bg-transparent py-1 text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
          </FieldGroup>
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-border/70 bg-card/30 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border/60">
              <Phone className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground">Phone</p>
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                  <Lock className="mr-1 size-2.5" /> Pro
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Connect a Twilio number to take inbound calls. Set up after agent creation.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/billing">
              Upgrade
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 7 — Review
// ---------------------------------------------------------------------------

function StepReview({ data }: { data: WizardData }) {
  const templateLabel =
    TEMPLATE_OPTIONS.find((t) => t.key === data.template)?.title ?? data.template ?? '—';
  const toneLabel = TONE_OPTIONS.find((t) => t.key === data.tonePreset)?.title ?? data.tonePreset;
  const hoursSummary = renderHoursText(data.businessHours) || '—';
  const filledFaqs = data.faq.filter((r) => r.question.trim() && r.answer.trim()).length;

  return (
    <div className="space-y-7">
      <Heading
        eyebrow="Step 7"
        title="Review & create"
        hint="Last look before we provision this agent in your ElevenLabs account."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReviewCard icon={Wand} title="Template & tone">
          <ReviewRow label="Template" value={templateLabel} />
          <ReviewRow label="Tone" value={toneLabel} />
        </ReviewCard>

        <ReviewCard icon={Building2} title="Business">
          <ReviewRow label="Name" value={data.businessName} />
          <ReviewRow label="Hours" value={hoursSummary} />
          {data.location ? <ReviewRow label="Location" value={data.location} /> : null}
          {data.phone ? <ReviewRow label="Phone" value={data.phone} /> : null}
        </ReviewCard>

        <ReviewCard icon={Mic} title="Voice">
          <ReviewRow label="Bot name" value={data.agentName} />
          <ReviewRow label="Voice ID" value={data.voiceId} mono />
          <ReviewRow label="Greeting" value={data.greeting} />
        </ReviewCard>

        <ReviewCard icon={MessageCircleQuestion} title="Knowledge">
          <ReviewRow
            label="FAQ entries"
            value={`${filledFaqs} filled${filledFaqs === 0 ? ' (none, OK)' : ''}`}
          />
          <ReviewRow
            label="Prompt"
            value={`${data.systemPrompt.length.toLocaleString()} chars`}
          />
        </ReviewCard>

        <ReviewCard icon={Globe2} title="Channels" className="lg:col-span-2">
          <ReviewRow label="Public URL" value={`/talk/${data.publicSlug}`} mono />
          <ReviewRow
            label="Allowed domains"
            value={
              data.allowedDomains.length === 0 ? 'Any (open)' : data.allowedDomains.join(', ')
            }
          />
        </ReviewCard>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-voice/30 bg-voice/5 p-5">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-voice" aria-hidden />
        <p className="text-sm leading-relaxed text-foreground">
          <span className="font-medium">Heads up: </span>
          This agent is created in <span className="font-medium">your</span> ElevenLabs account.
          Voice usage (characters spoken) counts against{' '}
          <span className="font-medium">your</span> ElevenLabs subscription. VoiceFlow charges
          only a flat platform fee — see{' '}
          <Link
            href="/dashboard/billing"
            className="font-medium text-voice underline-offset-4 hover:underline"
          >
            Billing
          </Link>{' '}
          for details.{' '}
          <a
            href="https://elevenlabs.io/app/subscription"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Manage ElevenLabs plan <ExternalLink className="size-3" />
          </a>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Submitting overlay
// ---------------------------------------------------------------------------

function SubmittingOverlay({ stage }: { stage: 'provisioning' | 'saving' | 'done' }) {
  const steps: { key: typeof stage; label: string }[] = [
    { key: 'provisioning', label: 'Provisioning in ElevenLabs' },
    { key: 'saving', label: 'Saving to your dashboard' },
    { key: 'done', label: 'Ready to go' },
  ];
  const stageIdx = steps.findIndex((s) => s.key === stage);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.96, y: 8, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-7 shadow-xl"
      >
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-full bg-voice/10 text-voice ring-1 ring-voice/20">
            {stage === 'done' ? (
              <Check className="size-5" />
            ) : (
              <Loader2 className="size-5 animate-spin" />
            )}
          </div>
          <div>
            <p className="font-serif text-xl tracking-tight">
              {stage === 'done' ? 'Agent created' : 'Creating your agent'}
            </p>
            <p className="text-xs text-muted-foreground">
              {stage === 'done'
                ? 'Redirecting to your new agent…'
                : 'Hang tight — this takes a few seconds.'}
            </p>
          </div>
        </div>
        <ol className="mt-5 space-y-2.5">
          {steps.map((s, i) => {
            const isDone = stageIdx > i || stage === 'done';
            const isCurrent = stageIdx === i && stage !== 'done';
            return (
              <li
                key={s.key}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-2 py-1 text-sm',
                  isCurrent && 'bg-voice/5',
                )}
              >
                <span
                  className={cn(
                    'grid size-5 place-items-center rounded-full',
                    isDone && 'bg-voice text-voice-foreground',
                    isCurrent && 'bg-voice/20 text-voice',
                    !isDone && !isCurrent && 'bg-muted text-muted-foreground/60',
                  )}
                >
                  {isDone ? (
                    <Check className="size-3" />
                  ) : isCurrent ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <span className="text-[10px]">{i + 1}</span>
                  )}
                </span>
                <span
                  className={cn(
                    isCurrent && 'text-foreground',
                    isDone && 'text-foreground/80',
                    !isDone && !isCurrent && 'text-muted-foreground/70',
                  )}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

function Heading({
  eyebrow,
  title,
  hint,
}: {
  eyebrow?: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      {eyebrow ? (
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-voice">{eyebrow}</p>
      ) : null}
      <h2 className="font-serif text-2xl tracking-tight text-foreground sm:text-3xl">{title}</h2>
      {hint ? (
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/40 p-5">{children}</div>
  );
}

function FieldGroup({
  label,
  hint,
  required,
  trailing,
  children,
}: {
  label: string;
  hint?: string;
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
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ReviewCard({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: typeof Wand;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-2xl border border-border/70 bg-card/50 p-5', className)}>
      <div className="mb-3 flex items-center gap-2">
        <div className="grid size-7 place-items-center rounded-md bg-voice/10 text-voice ring-1 ring-voice/20">
          <Icon className="size-3.5" />
        </div>
        <p className="text-sm font-medium">{title}</p>
      </div>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3 text-sm">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'min-w-0 break-words text-foreground',
          mono && 'font-mono text-xs',
        )}
      >
        {value || '—'}
      </dd>
    </div>
  );
}

function validateStep(step: number, data: WizardData): boolean {
  switch (step) {
    case 1:
      return !!data.template;
    case 2:
      return data.businessName.trim().length > 0;
    case 3:
      return (
        data.agentName.trim().length > 0 &&
        data.greeting.trim().length > 0 &&
        data.voiceId.trim().length > 0
      );
    case 4:
      return true;
    case 5:
      return data.systemPrompt.trim().length > 0;
    case 6:
      return /^[a-z0-9-]{3,80}$/.test(data.publicSlug);
    case 7:
      return true;
    default:
      return false;
  }
}

function makeSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  const tail = Math.random().toString(36).slice(2, 6);
  return base ? `${base}-${tail}` : `agent-${tail}`;
}

function renderHoursText(h: BusinessHours): string {
  const parts: string[] = [];
  for (const { key, short } of DAYS) {
    const d = h[key];
    if (d.closed) {
      parts.push(`${short}: Closed`);
    } else if (d.open && d.close) {
      parts.push(`${short}: ${d.open}–${d.close}`);
    }
  }
  return parts.join(', ');
}
