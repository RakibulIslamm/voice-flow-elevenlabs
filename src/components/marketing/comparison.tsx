import { cn } from '@/lib/utils';
import { Section, SectionHeading } from './section';

/**
 * Cost comparison. Tells the "markup competitors are 3–5× our price at
 * scale" story. Renders as a table on desktop and stacked cards on
 * mobile (a 5-column table is unreadable on a phone).
 */

type Row = {
  option: string;
  cost: string;
  coverage: string;
  note: string;
  highlight?: boolean;
};

const ROWS: Row[] = [
  {
    option: 'Hiring a receptionist',
    cost: '$40k/yr',
    coverage: '9–5 weekdays',
    note: 'One person, one call at a time.',
  },
  {
    option: 'Intercom Fin',
    cost: '$2,000+/mo',
    coverage: 'Text only',
    note: 'No voice channel at all.',
  },
  {
    option: 'Vapi / Retell',
    cost: '~$200/mo',
    coverage: 'Voice, marked up',
    note: '$0.10–0.15/min markup on voice → ~$200/mo at 1,000 mins per agent.',
  },
  {
    option: 'VoiceFlow + BYOK',
    cost: '$30–260/mo',
    coverage: 'Web + phone',
    note: '$19–149 platform + direct ElevenLabs ~$11–99 + (optional) direct Twilio ~$15.',
    highlight: true,
  },
];

export function ComparisonSection() {
  return (
    <Section id="comparison" className="bg-card/20">
      <SectionHeading
        eyebrow="Comparison"
        title="75–85% cheaper than markup competitors at scale."
        subtitle="The same conversations, without paying a 3–5× markup on every minute of voice."
      />

      {/* Desktop table */}
      <div className="mt-12 hidden overflow-hidden rounded-2xl border border-border/60 md:block">
        <div className="grid grid-cols-[1.3fr_0.8fr_0.9fr_2fr] bg-card/50 px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <span>Option</span>
          <span>Cost</span>
          <span>Coverage</span>
          <span>Notes</span>
        </div>
        {ROWS.map((r) => (
          <div
            key={r.option}
            className={cn(
              'grid grid-cols-[1.3fr_0.8fr_0.9fr_2fr] items-center border-t border-border/60 px-5 py-4 text-sm',
              r.highlight && 'bg-voice/5',
            )}
          >
            <span className={cn('font-medium', r.highlight && 'text-voice')}>{r.option}</span>
            <span className="font-mono tabular-nums">{r.cost}</span>
            <span className="text-muted-foreground">{r.coverage}</span>
            <span className="text-muted-foreground">{r.note}</span>
          </div>
        ))}
      </div>

      {/* Mobile cards */}
      <div className="mt-10 grid grid-cols-1 gap-3 md:hidden">
        {ROWS.map((r) => (
          <div
            key={r.option}
            className={cn(
              'rounded-2xl border p-5',
              r.highlight ? 'border-voice/40 bg-voice/5' : 'border-border/60 bg-card/40',
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className={cn('font-medium', r.highlight && 'text-voice')}>{r.option}</p>
              <p className="font-mono text-sm tabular-nums">{r.cost}</p>
            </div>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
              {r.coverage}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.note}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
