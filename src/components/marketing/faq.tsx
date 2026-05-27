import { ChevronDown } from 'lucide-react';
import { Section, SectionHeading } from './section';

/**
 * Landing FAQ. Native <details> (no JS, accessible, matches the pricing
 * page) with the eight questions that actually come up about the BYOK
 * model.
 */
const ITEMS = [
  {
    q: 'What is BYOK ElevenLabs?',
    a: 'Bring Your Own Key. You sign up at elevenlabs.io, get an API key, and paste it into VoiceFlow. We use your key to create agents in your ElevenLabs account. You control voice costs directly with them — we never mark them up.',
  },
  {
    q: 'Why BYOK instead of including voice?',
    a: 'Three reasons: (1) Voice costs vary wildly by usage — you should pay only what you use, with full visibility. (2) Your conversations stay in your ElevenLabs account, not ours. (3) We can charge a flat predictable platform fee instead of marking up your minutes 3–5× like competitors.',
  },
  {
    q: 'How does phone calling work?',
    a: "Phone requires the Pro plan and uses Twilio. Bring your own Twilio account, and we'll connect your phone number to ElevenLabs's phone integration. You pay Twilio directly for telecom (~$0.014/min inbound US, $1/mo per number).",
  },
  {
    q: 'What counts as a call?',
    a: 'Each complete conversation, regardless of duration. A 30-second call and a 10-minute call both count as 1 call.',
  },
  {
    q: 'Is my ElevenLabs API key safe?',
    a: 'Yes. We encrypt it with AES-256-GCM at rest. It is only decrypted in-memory when we need to make an ElevenLabs API call on your behalf. We never log it or expose it in plaintext.',
  },
  {
    q: 'What happens if my ElevenLabs balance runs out?',
    a: 'Calls fail at the ElevenLabs layer. We surface this in your dashboard and pause affected agents until you top up. Set balance alerts in ElevenLabs to avoid surprises.',
  },
  {
    q: 'Can I customize what my AI agent says?',
    a: 'Absolutely. The wizard generates a system prompt from your template + business info, and you can edit it directly. Power users tune it heavily.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. No contract. Cancel from the customer portal in two clicks. You keep access until the end of your billing period.',
  },
];

export function FaqSection() {
  return (
    <Section id="faq">
      <SectionHeading eyebrow="FAQ" title="Questions, answered." />
      <div className="mx-auto mt-10 max-w-3xl divide-y divide-border/60 rounded-2xl border border-border/60 bg-card/40">
        {ITEMS.map((it) => (
          <details key={it.q} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
              {it.q}
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{it.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
