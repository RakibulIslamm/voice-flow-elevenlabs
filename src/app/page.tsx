import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import { MarketingNav } from '@/components/marketing/nav';
import { MarketingFooter } from '@/components/marketing/footer';
import { Hero } from '@/components/marketing/hero';
import { ByokSection } from '@/components/marketing/byok';
import { DemoBlock } from '@/components/marketing/demo-block';
import { WhySection } from '@/components/marketing/why';
import { HowSection } from '@/components/marketing/how';
import { UseCasesSection } from '@/components/marketing/use-cases';
import { ComparisonSection } from '@/components/marketing/comparison';
import { PricingCards } from '@/components/marketing/pricing-cards';
import { FaqSection } from '@/components/marketing/faq';
import { FinalCta } from '@/components/marketing/cta';

export const metadata: Metadata = buildMetadata({ path: '/' });

export default function HomePage() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">
        <Hero />
        <ByokSection />
        {/* <DemoBlock /> */}
        <WhySection />
        <HowSection />
        <UseCasesSection />
        <ComparisonSection />
        <PricingCards />
        <FaqSection />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}
