import Link from 'next/link';
import type { Metadata } from 'next';
import { Check, Mic, Phone, ShieldCheck, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildMetadata({
  title: 'Pricing · VoiceFlow',
  description:
    'Bring-your-own-key AI voice agents. Predictable monthly platform fees + flat per-call overage. No voice or telecom markup.',
  path: '/pricing',
});

const TIERS = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'no card',
    blurb: 'Kick the tires.',
    calls: '100 calls / month',
    agents: '1 agent',
    phone: false,
    overage: 'No overage — stops at 100.',
    cta: { label: 'Start free', href: '/sign-in' },
  },
  {
    key: 'starter',
    name: 'Starter',
    price: '$19',
    cadence: '/ month',
    blurb: 'Solo founders, small embed.',
    calls: '1,000 calls / month',
    agents: '3 agents',
    phone: false,
    overage: '$0.005 / call beyond plan.',
    cta: { label: 'Start with Starter', href: '/sign-in?intent=starter' },
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$49',
    cadence: '/ month',
    blurb: 'Teams that need phone.',
    calls: '5,000 calls / month',
    agents: '10 agents',
    phone: true,
    overage: '$0.005 / call beyond plan.',
    cta: { label: 'Start with Pro', href: '/sign-in?intent=pro' },
    highlight: true,
  },
  {
    key: 'business',
    name: 'Business',
    price: '$149',
    cadence: '/ month',
    blurb: 'High-volume operators.',
    calls: '25,000 calls / month',
    agents: 'Unlimited agents',
    phone: true,
    overage: '$0.005 / call beyond plan.',
    cta: { label: 'Start with Business', href: '/sign-in?intent=business' },
  },
] as const;

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-16 sm:px-6">
      <header className="mx-auto max-w-3xl space-y-4 text-center">
        <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] text-voice">
          <span className="inline-block h-px w-6 bg-voice/60" aria-hidden />
          Pricing
        </p>
        <h1 className="font-serif text-4xl tracking-tight text-foreground sm:text-5xl">
          Predictable platform fees. No voice or telecom markup.
        </h1>
        <p className="mx-auto max-w-2xl text-base leading-relaxed text-muted-foreground">
          VoiceFlow charges for orchestration. ElevenLabs is BYOK — you manage your voice plan
          directly. Twilio is BYOK on Pro and above — your phone bill is your phone bill.
        </p>
      </header>

      <section className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {TIERS.map((tier) => (
          <div
            key={tier.key}
            className={
              'flex flex-col rounded-2xl border p-6 transition ' +
              ((tier as { highlight?: boolean }).highlight
                ? 'border-voice/40 bg-voice/5 shadow-sm'
                : 'border-border/60 bg-card/40')
            }
          >
            <div className="space-y-1">
              <p className="font-serif text-xl tracking-tight">{tier.name}</p>
              <p className="text-xs text-muted-foreground">{tier.blurb}</p>
            </div>
            <p className="mt-4 font-serif text-4xl tracking-tight">
              {tier.price}
              <span className="ml-1 text-sm text-muted-foreground">{tier.cadence}</span>
            </p>
            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 text-emerald-500" />
                {tier.calls}
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 text-emerald-500" />
                {tier.agents}
              </li>
              <li className="flex items-start gap-2">
                {tier.phone ? (
                  <Check className="mt-0.5 size-4 text-emerald-500" />
                ) : (
                  <X className="mt-0.5 size-4 text-muted-foreground/70" />
                )}
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3.5" />
                  {tier.phone ? 'Phone calling (BYOK Twilio)' : 'No phone calling'}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 text-emerald-500" />
                {tier.overage}
              </li>
            </ul>
            <Link
              href={tier.cta.href}
              className={
                'mt-6 inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition ' +
                ((tier as { highlight?: boolean }).highlight
                  ? 'bg-foreground text-background hover:bg-foreground/90'
                  : 'border border-border/70 text-foreground hover:bg-foreground/5')
              }
            >
              <Sparkles className="size-4" />
              {tier.cta.label}
            </Link>
          </div>
        ))}
      </section>

      <Callouts />

      <Breakdown />

      <FeatureMatrix />

      <Faq />

      <section className="mt-16 rounded-2xl border border-border/60 bg-card/40 p-8 text-center">
        <h2 className="font-serif text-3xl tracking-tight">Start your free trial</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          Connect your ElevenLabs key, embed an agent, and pay nothing until you cross 100 calls.
        </p>
        <Link
          href="/sign-in"
          className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background transition hover:bg-foreground/90"
        >
          Start free
        </Link>
      </section>
    </main>
  );
}

function Callouts() {
  return (
    <section className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
      <CalloutCard
        title="BYOK ElevenLabs"
        body="You manage your ElevenLabs plan directly — VoiceFlow doesn't mark up voice. You only see what you actually use."
      />
      <CalloutCard
        title="BYOK Twilio (Pro+)"
        body="Bring your own Twilio account for phone calling. Your Twilio bill for telecom (~$0.014/min) + ElevenLabs for voice + VoiceFlow for orchestration. Three separate, predictable bills."
      />
      <CalloutCard
        title="Flat overage"
        body="Every paid tier has the same $0.005/call overage. Higher tiers buy more included quota and features (phone, more agents), not a cheaper meter."
      />
    </section>
  );
}

function Breakdown() {
  const parts = [
    {
      icon: SlidersHorizontal,
      label: 'VoiceFlow',
      sub: 'Platform · paid to us',
      amount: '$19–149/mo',
      highlight: true,
    },
    {
      icon: Mic,
      label: 'ElevenLabs',
      sub: 'Voice · paid to them',
      amount: '~$11–99/mo',
    },
    {
      icon: Phone,
      label: 'Twilio',
      sub: 'Phone · paid to them (Pro+)',
      amount: '~$15/mo',
    },
  ];
  return (
    <section className="mt-14">
      <h2 className="font-serif text-2xl tracking-tight">Your total, broken down</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Three separate, predictable bills — and we never mark up the other two. What you pay
        ElevenLabs and Twilio, you pay them directly.
      </p>
      <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        {parts.map((p, i) => {
          const Icon = p.icon;
          return (
            <div key={p.label} className="flex flex-1 items-center gap-3 sm:flex-col sm:text-center">
              <div
                className={
                  'flex flex-1 items-center gap-3 rounded-2xl border p-5 sm:w-full sm:flex-col ' +
                  (p.highlight ? 'border-voice/40 bg-voice/5' : 'border-border/60 bg-card/40')
                }
              >
                <span
                  className={
                    'grid size-10 place-items-center rounded-xl ' +
                    (p.highlight ? 'bg-voice/15 text-voice' : 'bg-muted text-muted-foreground')
                  }
                >
                  <Icon className="size-5" />
                </span>
                <div className="sm:mt-1">
                  <p className="font-serif text-lg tracking-tight">{p.label}</p>
                  <p className="text-xs text-muted-foreground">{p.sub}</p>
                  <p className="mt-1 font-mono text-sm tabular-nums">{p.amount}</p>
                </div>
              </div>
              {i < parts.length - 1 ? (
                <span className="hidden text-2xl text-muted-foreground sm:inline" aria-hidden>
                  +
                </span>
              ) : null}
            </div>
          );
        })}
        <span className="hidden text-2xl text-muted-foreground sm:inline" aria-hidden>
          =
        </span>
        <div className="flex-1 rounded-2xl border border-border/60 bg-card/40 p-5 text-center">
          <p className="font-serif text-lg tracking-tight">Your total</p>
          <p className="text-xs text-muted-foreground">All-in, at most</p>
          <p className="mt-1 font-serif text-2xl tracking-tight text-voice">$30–260/mo</p>
        </div>
      </div>
    </section>
  );
}

function CalloutCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
      <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] text-voice">
        <ShieldCheck className="size-3.5" />
        {title}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function FeatureMatrix() {
  const rows: Array<{ label: string; values: [string, string, string, string] }> = [
    {
      label: 'Included calls / month',
      values: ['100', '1,000', '5,000', '25,000'],
    },
    {
      label: 'Per-call overage',
      values: ['—', '$0.005', '$0.005', '$0.005'],
    },
    { label: 'Agents', values: ['1', '3', '10', 'Unlimited'] },
    { label: 'Browser embed', values: ['✓', '✓', '✓', '✓'] },
    { label: 'Phone calling (BYOK Twilio)', values: ['—', '—', '✓', '✓'] },
    { label: 'Post-call summaries', values: ['✓', '✓', '✓', '✓'] },
    { label: 'Captures (leads / bookings)', values: ['✓', '✓', '✓', '✓'] },
    { label: 'Custom domain allowlist', values: ['✓', '✓', '✓', '✓'] },
    { label: 'Email support', values: ['Community', 'Email', 'Email', 'Priority email'] },
  ];
  return (
    <section className="mt-14 overflow-hidden rounded-2xl border border-border/60">
      <div className="grid grid-cols-[1.4fr_repeat(4,1fr)] bg-card/40 px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <span>Feature</span>
        <span>Free</span>
        <span>Starter</span>
        <span>Pro</span>
        <span>Business</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-[1.4fr_repeat(4,1fr)] items-center border-t border-border/60 px-4 py-3 text-sm"
        >
          <span className="font-medium">{row.label}</span>
          {row.values.map((v, i) => (
            <span key={i} className="text-muted-foreground">
              {v}
            </span>
          ))}
        </div>
      ))}
    </section>
  );
}

function Faq() {
  const items = [
    {
      q: 'What counts as a call?',
      a: 'Each conversation, regardless of duration. A 30-second call counts the same as a 10-minute call. We chose flat per-call pricing because it makes your costs predictable as conversations get longer.',
    },
    {
      q: 'What does ElevenLabs cost separately?',
      a: 'Their Creator plan is $11/mo for ~100,000 characters (≈60 minutes of speech). Their Pro plan is $99/mo for 500,000 characters. You manage that subscription with ElevenLabs directly — VoiceFlow only stores your API key (AES-256-GCM encrypted) and never marks up usage.',
    },
    {
      q: 'What does Twilio cost separately?',
      a: 'A US phone number is roughly $1/mo. Inbound calls are about $0.014/min in the US. You manage your Twilio account directly — we store your SID and Auth Token encrypted at rest, and Twilio bills you straight.',
    },
    {
      q: 'Why BYOK?',
      a: 'Three reasons: (1) cost transparency — you see exactly what voice and telecom are costing you, (2) data ownership — every conversation lives in YOUR ElevenLabs workspace, and (3) predictable platform fees — no markups on third-party usage means no surprise invoices.',
    },
    {
      q: 'Can I switch plans anytime?',
      a: 'Yes. Upgrades are immediate. Downgrades take effect at the end of your current billing period so you don\'t lose what you already paid for. Phone calling pauses on downgrade from Pro/Business to Starter/Free.',
    },
    {
      q: 'Do you offer annual billing?',
      a: 'Monthly only at the moment. Annual billing with a discount is on the roadmap once we have stable churn data — we don\'t want to lock customers into a year of a product that\'s still evolving fast.',
    },
  ];
  return (
    <section className="mx-auto mt-16 max-w-3xl space-y-4">
      <h2 className="font-serif text-3xl tracking-tight">Questions</h2>
      <div className="divide-y divide-border/60 rounded-2xl border border-border/60 bg-card/40">
        {items.map((it) => (
          <details key={it.q} className="group px-5 py-4">
            <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
              {it.q}
              <span className="text-xs text-muted-foreground transition group-open:rotate-180">
                ▾
              </span>
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{it.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
