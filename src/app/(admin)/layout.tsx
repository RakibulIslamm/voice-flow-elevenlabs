import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '~/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

/**
 * Admin shell. Mirrors the dashboard shell but uses the admin nav set and
 * a subtle amber accent on the brand. Throwing ForbiddenError here would
 * bubble to the global error UI which is jarring for a navigation event,
 * so we redirect non-admins back to /dashboard the same way the proxy
 * does for unauthenticated users.
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
    <div className="flex min-h-svh bg-background">
      <Sidebar variant="admin" isAdmin />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar variant="admin" user={session.user} isAdmin />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
