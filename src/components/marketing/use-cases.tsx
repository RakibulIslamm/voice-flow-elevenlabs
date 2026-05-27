'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Section, SectionHeading } from './section';

/**
 * Use-case explorer. A custom tab switcher (the design-system Tabs are
 * tuned for dense dashboard rows) showing a mocked transcript + the
 * benefits that matter for each vertical.
 */

type Turn = { role: 'assistant' | 'user'; text: string };
type UseCase = {
  key: string;
  label: string;
  transcript: Turn[];
  benefits: string[];
};

const CASES: UseCase[] = [
  {
    key: 'dental',
    label: 'Dental',
    transcript: [
      { role: 'user', text: "Hi, do you have anything available this week for a cleaning?" },
      { role: 'assistant', text: 'We do! I can offer Wednesday at 3pm or Friday at 11am.' },
      { role: 'user', text: "Friday at 11 works." },
      { role: 'assistant', text: "Great — booked under your name. You'll get a text confirmation shortly." },
    ],
    benefits: [
      'Books, reschedules, and cancels appointments 24/7',
      'Answers insurance and procedure FAQs in your words',
      'Captures new-patient details and routes urgent cases',
    ],
  },
  {
    key: 'restaurant',
    label: 'Restaurant',
    transcript: [
      { role: 'user', text: "Table for four tonight around 7?" },
      { role: 'assistant', text: 'I can seat four at 7:15 — would that work?' },
      { role: 'user', text: 'Perfect.' },
      { role: 'assistant', text: "You're booked for 7:15. Any allergies we should note for the kitchen?" },
    ],
    benefits: [
      'Takes reservations and party-size details hands-free',
      'Answers hours, menu, and dietary questions instantly',
      'Never drops a call during the dinner rush',
    ],
  },
  {
    key: 'real-estate',
    label: 'Real Estate',
    transcript: [
      { role: 'user', text: "I saw the listing on Maple Street — is it still available?" },
      { role: 'assistant', text: "It is! It's a 3-bed, 2-bath at $540k. Want to schedule a viewing?" },
      { role: 'user', text: 'Yes, Saturday morning?' },
      { role: 'assistant', text: "Saturday at 10am is open — I'll text you the address and confirmation." },
    ],
    benefits: [
      'Qualifies buyers and books viewings around the clock',
      'Answers listing details, price, and neighborhood questions',
      'Captures lead contact info straight into your pipeline',
    ],
  },
  {
    key: 'saas',
    label: 'SaaS Lead Qualifier',
    transcript: [
      { role: 'user', text: "We're a 50-person team — does your plan cover SSO?" },
      { role: 'assistant', text: 'Yes, SSO is on our Business tier. How many seats are you sizing for?' },
      { role: 'user', text: 'Around 50 to start.' },
      { role: 'assistant', text: "Perfect fit. I'll route you to an AE and send a tailored quote by email." },
    ],
    benefits: [
      'Qualifies inbound leads against your criteria',
      'Answers pricing, security, and integration questions',
      'Routes hot leads to sales and logs the rest',
    ],
  },
  {
    key: 'custom',
    label: 'Custom',
    transcript: [
      { role: 'user', text: "What are your support hours and how do I reset my device?" },
      { role: 'assistant', text: "We're here 8am–8pm daily. To reset, hold the power button for 10 seconds." },
      { role: 'user', text: 'That worked, thanks!' },
      { role: 'assistant', text: "Glad to help. I've logged this in case you need a follow-up." },
    ],
    benefits: [
      'Start from a blank template and write your own prompt',
      'Wire in your FAQ, tone, and business rules',
      'Same voice quality and capture tools as every template',
    ],
  },
];

export function UseCasesSection() {
  const [active, setActive] = useState(CASES[0]!.key);
  const current = CASES.find((c) => c.key === active) ?? CASES[0]!;

  return (
    <Section id="use-cases">
      <SectionHeading eyebrow="Use cases" title="One platform, every front desk." />

      <div className="mt-10 flex flex-wrap justify-center gap-2">
        {CASES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setActive(c.key)}
            aria-pressed={active === c.key}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-medium transition',
              active === c.key
                ? 'border-voice/40 bg-voice/10 text-voice'
                : 'border-border/60 text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mx-auto mt-10 grid w-full max-w-4xl grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Transcript */}
        <div className="flex flex-col gap-2.5 rounded-2xl border border-border/60 bg-card/40 p-6">
          {current.transcript.map((t, i) => (
            <div
              key={i}
              className={
                t.role === 'assistant'
                  ? 'max-w-[88%] self-start rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-sm'
                  : 'max-w-[88%] self-end rounded-2xl rounded-br-sm bg-voice/15 px-3.5 py-2 text-sm'
              }
            >
              {t.text}
            </div>
          ))}
        </div>

        {/* Benefits */}
        <div className="flex flex-col justify-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-6">
          {current.benefits.map((b) => (
            <p key={b} className="flex items-start gap-2.5 text-sm leading-relaxed">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              {b}
            </p>
          ))}
        </div>
      </div>
    </Section>
  );
}
