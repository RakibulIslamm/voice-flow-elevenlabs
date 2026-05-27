import { KeyRound, Sparkles, Wifi } from 'lucide-react';
import { Section, SectionHeading } from './section';

/** Three reasons-to-believe cards. */
const CARDS = [
  {
    icon: Sparkles,
    title: 'Sounds genuinely human',
    body: 'Powered by ElevenLabs Conversational AI, the most natural-sounding voice tech available. Indistinguishable from a real receptionist in blind tests.',
  },
  {
    icon: KeyRound,
    title: 'You own your voice account',
    body: 'BYOK means no markups, no hidden fees, no surprises. You see exactly what voice costs. Your conversations stay in your accounts.',
  },
  {
    icon: Wifi,
    title: 'Web + phone, one platform',
    body: 'One agent, two channels. Pro tier unlocks BYOK Twilio for phone. Same brain, same voice, same FAQ — both channels.',
  },
];

export function WhySection() {
  return (
    <Section id="why">
      <SectionHeading
        eyebrow="Why VoiceFlow"
        title="Human-quality voice, on your terms."
      />
      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.title}
              className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/40 p-6"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-voice/15 text-voice">
                <Icon className="size-5" />
              </span>
              <h3 className="font-serif text-xl tracking-tight">{c.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{c.body}</p>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
