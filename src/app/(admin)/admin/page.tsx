import Link from 'next/link';
import { ShieldCheck, CircleAlert, Activity, Users } from 'lucide-react';
import { connectDb } from '@/lib/db/connect';
import { ErrorLog } from '@/lib/db/models/error-log';
import { EventLog } from '@/lib/db/models/event-log';
import { User } from '@/lib/db/models/user';
import { PageHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export const metadata = { title: 'Admin · VoiceFlow' };

async function getCounts() {
  try {
    await connectDb();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [errors24h, criticalAll, events24h, users] = await Promise.all([
      ErrorLog.countDocuments({ occurredAt: { $gte: since } }),
      ErrorLog.countDocuments({ severity: 'critical' }),
      EventLog.countDocuments({ occurredAt: { $gte: since } }),
      User.countDocuments({}),
    ]);
    return { errors24h, criticalAll, events24h, users };
  } catch {
    return null;
  }
}

export default async function AdminOverviewPage() {
  const counts = await getCounts();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Overview"
        description="Operational status of the VoiceFlow control plane. These views read directly from MongoDB."
      />
      <section
        aria-label="System metrics"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Tile
          href="/admin/errors"
          icon={CircleAlert}
          label="Errors (24h)"
          value={counts ? counts.errors24h : '—'}
          accent="amber"
        />
        <Tile
          href="/admin/errors?severity=critical"
          icon={CircleAlert}
          label="Critical (all-time)"
          value={counts ? counts.criticalAll : '—'}
          accent={counts && counts.criticalAll > 0 ? 'red' : 'muted'}
        />
        <Tile
          href="/admin/events"
          icon={Activity}
          label="Events (24h)"
          value={counts ? counts.events24h : '—'}
          accent="muted"
        />
        <Tile
          href="/admin/users"
          icon={Users}
          label="Total users"
          value={counts ? counts.users : '—'}
          accent="muted"
        />
      </section>

      {!counts ? (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t reach MongoDB to fetch live counts. The tiles will populate once
          the database connection recovers.
        </p>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="size-5 text-muted-foreground" />
          <h2 className="font-serif text-xl tracking-tight">You&apos;re signed in as admin</h2>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Use the sidebar to inspect{' '}
          <Link href="/admin/errors" className="underline-offset-4 hover:underline">
            error logs
          </Link>
          ,{' '}
          <Link href="/admin/events" className="underline-offset-4 hover:underline">
            event analytics
          </Link>
          , and{' '}
          <Link href="/admin/users" className="underline-offset-4 hover:underline">
            users
          </Link>
          . All admin actions are non-destructive in this phase.
        </p>
      </section>
    </div>
  );
}

const ACCENTS: Record<string, string> = {
  muted: 'text-muted-foreground',
  amber: 'text-amber-600 dark:text-amber-400',
  red: 'text-destructive',
};

function Tile({
  href,
  icon: Icon,
  label,
  value,
  accent = 'muted',
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string | number;
  accent?: 'muted' | 'amber' | 'red';
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-foreground/20"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <Icon className={cn('size-4', ACCENTS[accent])} aria-hidden />
      </div>
      <p className="mt-4 font-serif text-3xl tracking-tight text-foreground">{value}</p>
    </Link>
  );
}
