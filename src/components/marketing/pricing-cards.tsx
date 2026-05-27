import Link from 'next/link';
import { ArrowRight, Check, Phone, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Section, SectionHeading, CtaLink } from './section';

/**
 * Pricing teaser. Static tier summary on the home page; the full matrix
 * + BYOK FAQ live on /pricing. Tiers mirror the Stripe/Polar plan
 * config — kept literal here so the marketing page has no server deps.
 */
type Tier = {
  name: string;
  price: string;
  calls: string;
  agents: string;
  phone: boolean;
  highlight?: boolean;
};

const TIERS: Tier[] = [
  { name: 'Free', price: '$0', calls: '100 calls/mo', agents: '1 agent', phone: false },
  { name: 'Starter', price: '$19', calls: '1,000 calls/mo', agents: '3 agents', phone: false },
  { name: 'Pro', price: '$49', calls: '5,000 calls/mo', agents: '10 agents', phone: true, highlight: true },
  { name: 'Business', price: '$149', calls: '25,000 calls/mo', agents: 'Unlimited agents', phone: true },
];

export function PricingCards() {
  return (
    <Section id="pricing">
      <SectionHeading
        eyebrow="Pricing"
        title="Flat platform fees. No voice markup."
        subtitle="Every paid tier shares the same $0.005/call overage — higher tiers buy more quota and features, not a pricier meter."
      />

      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TIERS.map((t) => (
          <div
            key={t.name}
            className={cn(
              'flex flex-col rounded-2xl border p-6',
              t.highlight ? 'border-voice/40 bg-voice/5 shadow-sm' : 'border-border/60 bg-card/40',
            )}
          >
            <div className="flex items-center justify-between">
              <p className="font-serif text-xl tracking-tight">{t.name}</p>
              {t.highlight ? (
                <span className="rounded-full bg-voice/15 px-2.5 py-1 text-[11px] font-medium text-voice">
                  Most popular
                </span>
              ) : null}
            </div>
            <p className="mt-3 font-serif text-4xl tracking-tight">
              {t.price}
              {t.price !== '$0' ? (
                <span className="ml-1 text-sm text-muted-foreground">/mo</span>
              ) : null}
            </p>
            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 text-emerald-500" />
                {t.calls}
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 text-emerald-500" />
                {t.agents}
              </li>
              <li className="flex items-start gap-2">
                {t.phone ? (
                  <Check className="mt-0.5 size-4 text-emerald-500" />
                ) : (
                  <X className="mt-0.5 size-4 text-muted-foreground/70" />
                )}
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3.5" />
                  {t.phone ? 'Phone (BYOK Twilio)' : 'No phone'}
                </span>
              </li>
            </ul>
            <CtaLink
              href="/sign-up"
              variant={t.highlight ? 'primary' : 'secondary'}
              size="md"
              className="mt-6 w-full"
            >
              {t.name === 'Free' ? 'Start free' : `Choose ${t.name}`}
            </CtaLink>
          </div>
        ))}
      </div>

      <div className="mt-8 text-center">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-voice underline-offset-4 hover:underline"
        >
          View full pricing
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </Section>
  );
}
