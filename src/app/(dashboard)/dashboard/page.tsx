import { requireUserOrRedirect } from '@/lib/auth/guards';
import { UserMenu } from '@/components/layout/user-menu';

export default async function DashboardPage() {
  const session = await requireUserOrRedirect('/dashboard');

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4 sm:px-10">
        <h1 className="font-serif text-2xl tracking-tight">VoiceFlow</h1>
        <UserMenu user={session.user} />
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Dashboard
        </p>
        <h2 className="mt-2 font-serif text-4xl tracking-tight text-foreground">
          Welcome, {session.user.name ?? session.user.email}
        </h2>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Your agents, calls, and analytics land here in Phase 5. For now this is a
          placeholder confirming that auth, middleware, and the session pipeline are wired
          end-to-end.
        </p>

        <dl className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <DataPoint label="Plan" value={session.user.plan} />
          <DataPoint label="Role" value={session.user.isAdmin ? 'Admin' : 'Member'} />
          <DataPoint label="User ID" value={session.user.id} mono />
        </dl>
      </main>
    </div>
  );
}

function DataPoint({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 truncate text-sm text-foreground ${mono ? 'font-mono text-xs' : 'font-medium'}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
