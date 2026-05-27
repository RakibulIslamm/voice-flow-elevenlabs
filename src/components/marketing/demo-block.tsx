'use client';

import { useState } from 'react';
import { Mic, PhoneCall } from 'lucide-react';
import { Section, SectionHeading } from './section';

/**
 * Live demo. Embeds the real talk widget via the existing
 * `/talk/{slug}?embed=1` route in an iframe — same code path real
 * customers' visitors hit, so the demo can never drift from production.
 *
 * The iframe is click-to-load: nothing (no ElevenLabs SDK, no mic
 * prompt) loads until the visitor opts in. Keeps the landing page fast
 * and avoids a surprise permission prompt.
 *
 * SETUP: create a "VoiceFlow Demo" agent in your own VoiceFlow account
 * (powered by your ElevenLabs key), allowlist your production domain,
 * then set `NEXT_PUBLIC_DEMO_AGENT_SLUG` (or edit the constant below).
 */
const DEMO_AGENT_SLUG = process.env.NEXT_PUBLIC_DEMO_AGENT_SLUG ?? 'voiceflow-demo';

export function DemoBlock() {
  const [loaded, setLoaded] = useState(false);

  return (
    <Section id="demo">
      <SectionHeading
        eyebrow="Live demo"
        title="Try VoiceFlow now — talk to our demo agent"
        subtitle="A real conversation, running on the exact widget your visitors would use."
      />

      <div className="mx-auto mt-10 w-full max-w-md">
        <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/60 shadow-[0_24px_70px_-30px_color-mix(in_oklch,var(--voice)_35%,transparent)]">
          {loaded ? (
            <iframe
              title="VoiceFlow demo agent"
              src={`/talk/${DEMO_AGENT_SLUG}?embed=1`}
              loading="lazy"
              allow="microphone"
              className="h-150 w-full border-0 bg-surface"
            />
          ) : (
            <button
              type="button"
              onClick={() => setLoaded(true)}
              className="group flex h-150 w-full flex-col items-center justify-center gap-5 bg-surface px-8 text-center transition"
            >
              <span className="relative grid size-20 place-items-center rounded-full bg-voice/15 text-voice transition group-hover:scale-105">
                <PhoneCall className="size-8" />
                <span className="absolute inset-0 animate-ping rounded-full bg-voice/20" />
              </span>
              <span className="space-y-1.5">
                <span className="block font-serif text-2xl tracking-tight">Start the demo call</span>
                <span className="block text-sm text-muted-foreground">
                  Tap to connect — you&apos;ll be asked for microphone access.
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition group-hover:bg-foreground/90">
                <Mic className="size-4" />
                Connect &amp; talk
              </span>
            </button>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          This demo runs on our ElevenLabs account. Yours will run on yours.
        </p>
      </div>
    </Section>
  );
}
