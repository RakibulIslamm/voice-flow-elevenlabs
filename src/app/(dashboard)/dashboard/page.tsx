import { Bot, PhoneCall, Inbox, Gauge } from 'lucide-react';
import { auth } from '~/auth';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Overview · VoiceFlow' };

export default async function DashboardOverviewPage() {
  const session = await auth();
  const displayName = session?.user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${displayName}`}
        description="Your agents, calls and captures appear here as soon as activity starts."
      />

      <section
        aria-label="Key metrics"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard icon="agents" label="Active Agents" />
        <StatCard icon="calls" label="Calls This Month" />
        <StatCard icon="captures" label="Captures This Month" />
        <StatCard icon="usage" label="Plan Usage" />
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-xl tracking-tight">Recent Calls</h2>
        <EmptyState
          icon={PhoneCall}
          title="No calls yet"
          description="Once your agent starts taking conversations, the latest ones will appear here with summaries and outcomes."
        />
      </section>
    </div>
  );
}

const ICONS = {
  agents: Bot,
  calls: PhoneCall,
  captures: Inbox,
  usage: Gauge,
} as const;

function StatCard({
  icon,
  label,
  className,
}: {
  icon: keyof typeof ICONS;
  label: string;
  className?: string;
}) {
  const Icon = ICONS[icon];
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-foreground/10',
        className,
      )}
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <p className="text-xs font-medium uppercase tracking-wider">{label}</p>
        <Icon className="size-4" aria-hidden />
      </div>
      <Skeleton className="mt-4 h-7 w-20" />
      <Skeleton className="mt-2 h-3 w-32" />
    </div>
  );
}
