import type { ReactNode } from 'react';
import { requireUserOrRedirect } from '@/lib/auth/guards';
import { FloatingBrand } from '@/components/layout/floating-brand';
import { FloatingDock } from '@/components/layout/floating-dock';
import { FloatingUtility } from '@/components/layout/floating-utility';
import { TooltipProvider } from '@/components/ui/tooltip';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireUserOrRedirect();
  const isAdmin = !!session.user.isAdmin;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative min-h-svh bg-surface text-foreground">
        {/* Soft amber radial accent — anchors the warm identity without being loud. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-120"
          style={{
            backgroundImage:
              'radial-gradient(60% 60% at 50% 0%, color-mix(in oklch, var(--voice) 14%, transparent), transparent 70%)',
          }}
        />
        <FloatingBrand variant="dashboard" isAdmin={isAdmin} />
        <FloatingDock variant="dashboard" />
        <FloatingUtility variant="dashboard" user={session.user} />
        <main className="px-4 pb-20 pt-28 sm:px-6 md:pt-32 lg:px-10">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </TooltipProvider>
  );
}
