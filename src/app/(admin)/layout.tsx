import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '~/auth';
import { FloatingBrand } from '@/components/layout/floating-brand';
import { FloatingDock } from '@/components/layout/floating-dock';
import { FloatingUtility } from '@/components/layout/floating-utility';

/**
 * Admin shell. Same floating-dock geometry as the dashboard with an
 * amber-bordered variant on every floating element to make the
 * elevated-privilege context unmistakable.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect('/sign-in?callbackUrl=%2Fadmin');
  }
  if (!session.user.isAdmin) {
    redirect('/dashboard');
  }

  return (
    <div className="relative min-h-svh bg-surface text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-120"
        style={{
          backgroundImage:
            'radial-gradient(60% 60% at 50% 0%, color-mix(in oklch, var(--voice) 18%, transparent), transparent 70%)',
        }}
      />
      <FloatingBrand variant="admin" isAdmin />
      <FloatingDock variant="admin" />
      <FloatingUtility variant="admin" user={session.user} />
      <main className="px-4 pb-20 pt-28 sm:px-6 md:pt-32 lg:px-10">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
