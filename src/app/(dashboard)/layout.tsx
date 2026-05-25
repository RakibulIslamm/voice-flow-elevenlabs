import type { ReactNode } from 'react';
import { requireUserOrRedirect } from '@/lib/auth/guards';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireUserOrRedirect();
  const isAdmin = !!session.user.isAdmin;

  return (
    <div className="flex min-h-svh bg-background">
      <Sidebar variant="dashboard" isAdmin={isAdmin} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar variant="dashboard" user={session.user} isAdmin={isAdmin} />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
