import { KeyRound, Rocket, SlidersHorizontal } from 'lucide-react';
import { Section, SectionHeading } from './section';

/** Three-step "how it works". Numbered, connected on desktop. */
const STEPS = [
  {
    icon: KeyRound,
    title: 'Connect ElevenLabs',
    body: 'Paste your API key. We encrypt it with AES-256-GCM. (Optional) connect Twilio for phone on the Pro plan.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Configure your agent',
    body: 'Pick a template, set your business info + FAQ, and choose a voice from your ElevenLabs library.',
  },
  {
    icon: Rocket,
    title: 'Embed or call',
    body: 'Paste one line of code on your site, or assign a Twilio number for phone calling.',
  },
];

export function HowSection() {
  return (
    <Section id="how" className="bg-card/20">
      <SectionHeading eyebrow="How it works" title="Live in 60 seconds." />
      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <div
              key={s.title}
              className="relative flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/40 p-6"
            >
              <div className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-xl bg-voice/15 text-voice">
                  <Icon className="size-5" />
                </span>
                <span className="font-serif text-4xl tracking-tight text-foreground/15">
                  {i + 1}
                </span>
              </div>
              <h3 className="font-serif text-xl tracking-tight">{s.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
