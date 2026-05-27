'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PhoneCall, Sparkles } from 'lucide-react';
import { CtaLink } from './section';

/**
 * Hero. Left column carries the pitch + CTAs; right column is a looping
 * "incoming call → transcript materializing" animation built with Framer
 * Motion. The loop is purely decorative, so it collapses to a static
 * render under `prefers-reduced-motion`.
 */

type Line = { role: 'assistant' | 'user'; text: string };

const TRANSCRIPT: Line[] = [
  { role: 'assistant', text: 'Thanks for calling Bright Smile Dental — how can I help?' },
  { role: 'user', text: "Hi, I'd like to book a cleaning." },
  { role: 'assistant', text: 'I can do Tuesday at 2pm or Thursday at 10am. Which works?' },
  { role: 'user', text: 'Thursday at 10 is perfect.' },
  { role: 'assistant', text: "Booked — you'll get a text confirmation. 🎉" },
];

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20">
      {/* Soft amber glow behind the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            'radial-gradient(55% 45% at 70% 10%, color-mix(in oklch, var(--voice) 12%, transparent), transparent 60%)',
        }}
      />
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6 text-center lg:text-left">
          <p className="inline-flex items-center gap-2 rounded-full border border-voice/30 bg-voice/5 px-3 py-1 text-xs font-medium text-voice">
            <Sparkles className="size-3.5" />
            BYOK ElevenLabs · Web + Phone
          </p>
          <h1 className="font-serif text-5xl leading-[1.05] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            AI receptionists that sound human.
          </h1>
          <p className="mx-auto max-w-xl text-lg leading-relaxed text-muted-foreground lg:mx-0">
            Bring your ElevenLabs account, paste an API key, configure your agent in 60 seconds.
            We orchestrate. You own the voice.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <CtaLink href="/sign-up" className="w-full sm:w-auto">
              <Sparkles className="size-4" />
              Start free
            </CtaLink>
            <CtaLink href="#demo" variant="secondary" className="w-full sm:w-auto">
              <PhoneCall className="size-4" />
              Listen to a demo
            </CtaLink>
          </div>
          <p className="text-xs text-muted-foreground">
            100 free platform calls · No credit card · BYOK ElevenLabs
          </p>
        </div>

        <CallAnimation />
      </div>
    </section>
  );
}

function CallAnimation() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(reduce ? TRANSCRIPT.length : 0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => {
      setStep((s) => (s >= TRANSCRIPT.length ? 0 : s + 1));
    }, 1400);
    return () => clearInterval(id);
  }, [reduce]);

  const visible = TRANSCRIPT.slice(0, step);

  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="rounded-3xl border border-border/70 bg-card/70 p-5 shadow-[0_24px_70px_-30px_color-mix(in_oklch,var(--voice)_40%,transparent)] backdrop-blur-sm">
        {/* Call header */}
        <div className="flex items-center gap-3 border-b border-border/60 pb-4">
          <div className="relative grid size-11 place-items-center rounded-full bg-voice/15 text-voice">
            <PhoneCall className="size-5" />
            {!reduce ? (
              <motion.span
                className="absolute inset-0 rounded-full ring-2 ring-voice/40"
                animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-base tracking-tight">Bright Smile Dental</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
              Live · AI receptionist
            </p>
          </div>
          <Waveform reduce={!!reduce} />
        </div>

        {/* Transcript */}
        <div className="flex min-h-[260px] flex-col gap-2.5 pt-4">
          <AnimatePresence mode="popLayout">
            {visible.map((line, i) => (
              <motion.div
                key={`${step === 0 ? 'r' : ''}${i}-${line.text}`}
                layout
                initial={reduce ? false : { opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className={
                  line.role === 'assistant'
                    ? 'max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-sm text-foreground'
                    : 'max-w-[85%] self-end rounded-2xl rounded-br-sm bg-voice/15 px-3.5 py-2 text-sm text-foreground'
                }
              >
                {line.text}
              </motion.div>
            ))}
          </AnimatePresence>
          {!reduce && step < TRANSCRIPT.length ? <TypingDots /> : null}
        </div>
      </div>
    </div>
  );
}

function Waveform({ reduce }: { reduce: boolean }) {
  const bars = [0, 1, 2, 3, 4];
  return (
    <div className="flex items-center gap-0.5" aria-hidden>
      {bars.map((b) => (
        <motion.span
          key={b}
          className="w-0.5 rounded-full bg-voice"
          style={{ height: 6 }}
          animate={reduce ? { height: 10 } : { height: [6, 16, 9, 18, 6] }}
          transition={
            reduce
              ? undefined
              : { duration: 1, repeat: Infinity, ease: 'easeInOut', delay: b * 0.12 }
          }
        />
      ))}
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 self-start rounded-2xl rounded-bl-sm bg-muted px-3 py-2.5">
      {[0, 1, 2].map((d) => (
        <motion.span
          key={d}
          className="size-1.5 rounded-full bg-muted-foreground/60"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15 }}
        />
      ))}
    </div>
  );
}
