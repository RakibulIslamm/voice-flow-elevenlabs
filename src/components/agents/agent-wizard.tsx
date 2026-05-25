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
  Loader2,
  Mic,
  Plus,
  RotateCcw,
  Stethoscope,
  Utensils,
  Sparkles,
  Wand2,
  Volume2,
  X,
  Phone,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
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

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

const TEMPLATE_OPTIONS: {
  key: TemplateKey;
  title: string;
  description: string;
  icon: typeof Stethoscope;
}[] = [
  {
    key: 'dental',
    title: 'Dental Clinic',
    description: 'Books appointments, answers FAQs, handles dental emergencies.',
    icon: Stethoscope,
  },
  {
    key: 'restaurant',
    title: 'Restaurant',
    description: 'Takes reservations, mentions menu, handles wait list.',
    icon: Utensils,
  },
  {
    key: 'lead-qualifier',
    title: 'Lead Qualifier',
    description: 'Qualifies inbound leads with 3-4 questions, captures contact.',
    icon: Sparkles,
  },
  {
    key: 'custom',
    title: 'Custom',
    description: 'Start from scratch, configure everything.',
    icon: Wand2,
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

const TOTAL_STEPS = 7;

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
  location: string;
  phone: string;
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
  location: '',
  phone: '',
  agentName: '',
  greeting: '',
  voiceId: '',
  tonePreset: 'professional',
  faq: [],
  systemPrompt: '',
  publicSlug: '',
  allowedDomains: [],
};

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
  const [submitStage, setSubmitStage] = useState<string>('');

  const update = (patch: Partial<WizardData>) => setData((d) => ({ ...d, ...patch }));

  // Auto-populate greeting when business name changes (Step 3 cue).
  useEffect(() => {
    if (!data.businessName) return;
    setData((d) =>
      d.greeting
        ? d
        : { ...d, greeting: `Hi, you've reached ${d.businessName}. How can I help you today?` },
    );
    // We only want to *seed* the greeting once when it's still empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.businessName]);

  // Generate slug client-side on first entry to step 6.
  useEffect(() => {
    if (step !== 6) return;
    if (data.publicSlug) return;
    if (!data.businessName) return;
    setData((d) => ({ ...d, publicSlug: makeSlug(d.businessName) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Stepping
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

  async function handleSubmit() {
    if (!data.template) return;
    setSubmitting(true);
    setSubmitStage('Provisioning agent in your ElevenLabs account…');

    try {
      const result = await createAgent({
        template: data.template,
        businessName: data.businessName,
        businessHours: data.businessHours,
        location: data.location || undefined,
        phone: data.phone || undefined,
        agentName: data.agentName,
        greeting: data.greeting,
        voiceId: data.voiceId,
        tonePreset: data.tonePreset,
        faq: data.faq.filter((f) => f.question.trim() && f.answer.trim()),
        systemPrompt: data.systemPrompt,
        publicSlug: data.publicSlug,
        allowedDomains: data.allowedDomains,
      });

      setSubmitStage('Saving to your dashboard…');

      if (result.ok) {
        toast.success('Agent created!');
        router.push(`/dashboard/agents/${result.data.agentId}`);
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
    <div className="relative space-y-10">
      {/* Progress + step counter */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <p className="font-medium uppercase tracking-[0.18em] text-voice">
            Step {step} of {TOTAL_STEPS}
          </p>
          <p>{stepTitle(step)}</p>
        </div>
        <Progress value={(step / TOTAL_STEPS) * 100} className="h-1" />
      </div>

      {/* Step content */}
      <div className="relative min-h-[420px]">
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

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border/70 pt-6">
        <Button variant="ghost" onClick={back} disabled={step === 1 || submitting}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        {step < TOTAL_STEPS ? (
          <Button onClick={next} disabled={!canContinue || submitting}>
            Continue
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={!canContinue || submitting}>
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

      {/* Submitting overlay */}
      {submitting ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-8 py-10 shadow-xl">
            <Loader2 className="size-8 animate-spin text-voice" />
            <p className="font-serif text-xl tracking-tight">Creating your agent</p>
            <p className="max-w-xs text-center text-sm text-muted-foreground">{submitStage}</p>
          </div>
        </div>
      ) : null}
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
    <div className="space-y-6">
      <Heading title="Pick a starting point" hint="You can change the prompt and tools later." />
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
                'group flex items-start gap-3 rounded-2xl border bg-card/60 p-5 text-left transition',
                active
                  ? 'border-voice/60 ring-2 ring-voice/30'
                  : 'border-border/70 hover:border-voice/40',
              )}
            >
              <div
                className={cn(
                  'grid size-10 shrink-0 place-items-center rounded-xl ring-1 transition',
                  active
                    ? 'bg-voice text-voice-foreground ring-voice'
                    : 'bg-voice/10 text-voice ring-voice/20',
                )}
              >
                <Icon className="size-5" aria-hidden />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">{opt.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                  {opt.description}
                </p>
              </div>
              {active ? <Check className="size-4 text-voice" aria-hidden /> : null}
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
  return (
    <div className="space-y-7">
      <Heading
        title="Tell us about the business"
        hint="The agent uses these details to answer questions and confirm bookings."
      />
      <div className="space-y-1.5">
        <Label htmlFor="businessName">Business name</Label>
        <Input
          id="businessName"
          value={data.businessName}
          maxLength={80}
          onChange={(e) => update({ businessName: e.target.value })}
          placeholder="Sunrise Dental"
        />
      </div>

      <div>
        <Label className="mb-3 block">Business hours</Label>
        <div className="space-y-2">
          {DAYS.map(({ key, label }) => {
            const day = data.businessHours[key];
            return (
              <div
                key={key}
                className="grid grid-cols-[60px_1fr_1fr_auto] items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2"
              >
                <span className="text-sm font-medium text-foreground">{label}</span>
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
                  Closed
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="location">Location (optional)</Label>
          <Input
            id="location"
            value={data.location}
            onChange={(e) => update({ location: e.target.value })}
            placeholder="123 Main St, Boston, MA"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input
            id="phone"
            value={data.phone}
            onChange={(e) => update({ phone: e.target.value })}
            placeholder="+1 555 123 4567"
          />
        </div>
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
        title="Give it a voice"
        hint="The bot name and greeting are what callers hear first. The voice picks how it sounds."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="agentName">Bot name</Label>
          <Input
            id="agentName"
            value={data.agentName}
            maxLength={40}
            onChange={(e) => update({ agentName: e.target.value })}
            placeholder="Sarah"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Tone</Label>
          <RadioGroup
            value={data.tonePreset}
            onValueChange={(v) => update({ tonePreset: v as TonePreset })}
            className="flex flex-wrap gap-3"
          >
            {(['professional', 'friendly', 'casual'] as TonePreset[]).map((t) => (
              <label
                key={t}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm capitalize transition',
                  data.tonePreset === t
                    ? 'border-voice/60 bg-voice/10 text-foreground'
                    : 'border-border/70 text-muted-foreground hover:text-foreground',
                )}
              >
                <RadioGroupItem value={t} className="size-3" />
                {t}
              </label>
            ))}
          </RadioGroup>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-end justify-between gap-2">
          <Label htmlFor="greeting">Greeting</Label>
          <span className="text-xs text-muted-foreground">{greetingLen}/200</span>
        </div>
        <Textarea
          id="greeting"
          value={data.greeting}
          maxLength={200}
          rows={3}
          onChange={(e) => update({ greeting: e.target.value })}
          placeholder={`Hi, you've reached ${data.businessName || 'your business'}. How can I help?`}
        />
      </div>

      <div className="space-y-3">
        <Label>Voice</Label>
        {voices === null ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/70 bg-card/40 px-4 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading voices from your ElevenLabs
            account…
          </div>
        ) : voices.length === 0 ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            {error ?? 'No voices available in your ElevenLabs account.'} Check your ElevenLabs
            subscription and try again.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {voices.map((v) => {
              const active = data.voiceId === v.voiceId;
              const isPlaying = playingId === v.voiceId;
              return (
                <button
                  key={v.voiceId}
                  type="button"
                  onClick={() => update({ voiceId: v.voiceId })}
                  className={cn(
                    'group flex items-start gap-3 rounded-xl border bg-card/60 p-3 text-left transition',
                    active
                      ? 'border-voice/60 ring-2 ring-voice/30'
                      : 'border-border/70 hover:border-voice/40',
                  )}
                >
                  <div
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-lg ring-1',
                      active
                        ? 'bg-voice text-voice-foreground ring-voice'
                        : 'bg-voice/10 text-voice ring-voice/20',
                    )}
                  >
                    <Mic className="size-4" aria-hidden />
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
                    <p className="text-xs text-muted-foreground">
                      {[v.accent, v.gender].filter(Boolean).join(' · ') || 'Premade voice'}
                    </p>
                  </div>
                  {v.previewUrl ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePreview(v);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          togglePreview(v);
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <Volume2 className="size-3" />
                      {isPlaying ? 'Stop' : 'Preview'}
                    </span>
                  ) : null}
                </button>
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
  // Seed empty Q&A rows the first time we land here, but never overwrite
  // what the user has already typed.
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

  const limit = 20; // Phase 13 will enforce real per-plan limits

  return (
    <div className="space-y-7">
      <Heading
        title="Knowledge & FAQ"
        hint="Common questions and the answers you want the agent to give. Skip rows you don't need."
      />
      <div className="space-y-3">
        {data.faq.map((row, i) => (
          <div key={i} className="rounded-2xl border border-border/70 bg-card/50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Question {i + 1}
              </p>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-xs text-muted-foreground hover:text-destructive"
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

  // Auto-generate ONCE on first entry to this step.
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

  return (
    <div className="space-y-6">
      <Heading
        title="System prompt"
        hint="This is the agent's brain. We've generated a starting point — edit anything you want to change."
      />
      <div className="flex items-center justify-end">
        <Button variant="ghost" size="sm" onClick={generateDefault} disabled={pending}>
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RotateCcw className="size-3.5" />
          )}
          Reset to template default
        </Button>
      </div>
      <Textarea
        value={data.systemPrompt}
        onChange={(e) => update({ systemPrompt: e.target.value })}
        rows={15}
        className="font-mono text-xs leading-relaxed"
        placeholder="Loading default…"
      />
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

  return (
    <div className="space-y-7">
      <Heading
        title="Channels"
        hint="Where your callers reach the agent. Browser is on by default; phone requires Pro."
      />

      {/* Browser */}
      <section className="rounded-2xl border border-border/70 bg-card/60 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className="size-4 text-voice" />
            <p className="font-medium">Browser</p>
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              Enabled
            </Badge>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Public URL
            </p>
            <div className="mt-1 flex items-center gap-2 rounded-md border border-border/70 bg-muted/40 px-2.5 py-1.5">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{publicUrl}</code>
              <button
                type="button"
                onClick={regenerateSlug}
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                disabled={!data.businessName}
              >
                Regenerate
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Allowed domains
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-md border border-border/70 bg-card px-2 py-1.5">
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
                className="min-w-[120px] flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Leave empty to allow any domain — strongly recommended for production to lock down
              embeds.
            </p>
          </div>
        </div>
      </section>

      {/* Phone — Pro-locked */}
      <section className="rounded-2xl border border-dashed border-border/70 bg-card/30 p-5">
        <div className="flex items-center gap-2">
          <Phone className="size-4 text-muted-foreground" />
          <p className="font-medium text-muted-foreground">Phone</p>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
            <Lock className="mr-1 size-2.5" /> Pro plan required
          </Badge>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Connect a Twilio number to take inbound calls. Phone setup lives on the agent detail
          page after creation — Phase 12.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href="/dashboard/billing">
            Upgrade to Pro
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 7 — Review
// ---------------------------------------------------------------------------

function StepReview({ data }: { data: WizardData }) {
  return (
    <div className="space-y-7">
      <Heading
        title="Review & create"
        hint="Last look before we provision this agent in your ElevenLabs account."
      />

      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-2xl border border-border/70 bg-card/50 p-5 sm:grid-cols-2">
        <Field label="Template" value={data.template ?? '—'} />
        <Field label="Business" value={data.businessName} />
        <Field label="Bot name" value={data.agentName} />
        <Field label="Tone" value={data.tonePreset} />
        <Field label="Voice ID" value={data.voiceId} mono />
        <Field label="Public URL" value={`/talk/${data.publicSlug}`} mono />
        <Field
          label="Allowed domains"
          value={data.allowedDomains.length === 0 ? 'Any (open)' : data.allowedDomains.join(', ')}
          full
        />
        <Field label="Greeting" value={data.greeting} full />
      </dl>

      <div className="flex items-start gap-3 rounded-2xl border border-voice/30 bg-voice/5 p-5">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-voice" aria-hidden />
        <p className="text-sm leading-relaxed text-foreground">
          <span className="font-medium">Heads up: </span>
          This agent is created in <span className="font-medium">your</span> ElevenLabs
          account. Voice usage (characters spoken) counts against{' '}
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
// Tiny helpers
// ---------------------------------------------------------------------------

function Heading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="font-serif text-3xl tracking-tight text-foreground">{title}</h2>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
  full = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  full?: boolean;
}) {
  return (
    <div className={cn(full && 'sm:col-span-2')}>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className={cn('mt-1 text-sm text-foreground', mono && 'font-mono text-xs')}>
        {value || '—'}
      </dd>
    </div>
  );
}

function stepTitle(step: number): string {
  return [
    'Template',
    'Business',
    'Voice & personality',
    'Knowledge',
    'System prompt',
    'Channels',
    'Review',
  ][step - 1];
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
  for (const { key, label } of DAYS) {
    const d = h[key];
    if (d.closed) {
      parts.push(`${label}: Closed`);
    } else if (d.open && d.close) {
      parts.push(`${label}: ${d.open}–${d.close}`);
    }
  }
  return parts.join(', ');
}

