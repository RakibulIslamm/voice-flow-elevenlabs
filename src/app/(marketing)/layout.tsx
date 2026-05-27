import { MarketingNav } from '@/components/marketing/nav';
import { MarketingFooter } from '@/components/marketing/footer';

/**
 * Shared chrome for the static marketing subpages (pricing, legal). The
 * home page at `/` composes Nav + Footer itself because it lives outside
 * this route group, but reuses the same components so they stay in sync.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
