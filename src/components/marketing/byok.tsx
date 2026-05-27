import { Mic, Phone, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Section, SectionHeading } from './section';

/**
 * BYOK positioning — the core differentiator. Three columns make the
 * "we sell orchestration, not voice" model legible: VoiceFlow is the
 * platform you pay us for; ElevenLabs and Twilio are accounts you own
 * and pay directly, with no markup in between.
 */

type Column = {
  badge: string;
  label: string;
  icon: typeof Mic;
  price: string;
  body: string;
  highlight?: boolean;
};

const COLUMNS: Column[] = [
  {
    badge: 'VoiceFlow',
    label: 'Platform',
    icon: SlidersHorizontal,
    price: '$19–149/mo',
    body: 'Agent dashboard, AI configuration, secure widgets, call history, captures, BYOK Twilio for phone, and post-call summaries written by Claude.',
    highlight: true,
  },
  {
    badge: 'ElevenLabs',
    label: 'Voice · yours',
    icon: Mic,
    price: 'Your plan, your bill',
    body: 'Industry-leading TTS voices. Connect once with an API key. You control voice costs directly with them — we never mark them up. Your conversations live in your account.',
  },
  {
    badge: 'Twilio',
    label: 'Phone · yours, optional',
    icon: Phone,
    price: 'Your plan, your bill',
    body: '~$1/mo per number + ~$0.014/min inbound US. Required only for phone calling on Pro+. Bring it, we connect it.',
  },
];

export function ByokSection() {
  return (
    <Section id="why-byok" className="bg-card/20">
      <SectionHeading
        eyebrow="Why BYOK"
        title="Bring your own voice. Keep the savings."
        subtitle="Most AI voice platforms mark up voice costs 3–5×. VoiceFlow doesn't sell voice — we sell orchestration."
      />

      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const Icon = col.icon;
          return (
            <div
              key={col.badge}
              className={cn(
                'flex flex-col gap-4 rounded-2xl border p-6',
                col.highlight ? 'border-voice/40 bg-voice/5' : 'border-border/60 bg-card/40',
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'grid size-10 place-items-center rounded-xl',
                    col.highlight ? 'bg-voice/15 text-voice' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="font-serif text-lg tracking-tight">{col.badge}</p>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {col.label}
                  </p>
                </div>
              </div>
              <p
                className={cn(
                  'font-mono text-sm tabular-nums',
                  col.highlight ? 'text-voice' : 'text-foreground/80',
                )}
              >
                {col.price}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">{col.body}</p>
            </div>
          );
        })}
      </div>

      {/* Cost-at-scale callout */}
      <div className="mt-6 rounded-2xl border border-voice/40 bg-voice/5 p-6 text-center sm:p-8">
        <p className="text-sm leading-relaxed text-foreground sm:text-base">
          <span className="font-medium">Result at 1,000 minutes/month:</span>{' '}
          <span className="text-muted-foreground">
            Vapi ~$200/mo · Retell ~$180/mo · VoiceFlow + ElevenLabs Creator:
          </span>{' '}
          <span className="font-mono tabular-nums">$19 + $11 ={' '}</span>
          <span className="font-serif text-xl tracking-tight text-voice sm:text-2xl">$30/mo</span>.{' '}
          <span className="font-medium">85% cheaper at scale.</span>
        </p>
      </div>
    </Section>
  );
}
