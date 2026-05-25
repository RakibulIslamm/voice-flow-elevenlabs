import Link from 'next/link';
import { Bot, PhoneCall, Inbox, Gauge, ArrowUpRight } from 'lucide-react';
import { auth } from '~/auth';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export const metadata = { title: 'Overview · VoiceFlow' };

export default async function DashboardOverviewPage() {
  const session = await auth();
  const displayName = session?.user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="space-y-16">
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${displayName}.`}
        description="Your AI receptionists, recent conversations, and pipeline at a glance. Live data lights up as soon as your first agent goes online."
      />

      <section aria-label="Key metrics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Bot} label="Active agents" hint="Online and accepting calls" />
        <StatCard icon={PhoneCall} label="Calls" hint="This billing period" />
        <StatCard icon={Inbox} label="Captures" hint="Leads · appointments · reservations" />
        <StatCard icon={Gauge} label="Plan usage" hint="Voice-minutes consumed" />
      </section>

      <section className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-voice">Activity</p>
            <h2 className="mt-1 font-serif text-2xl tracking-tight">Recent conversations</h2>
          </div>
          <Link
            href="/dashboard/calls"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            View all
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

        <EmptyConversation />
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  hint,
  className,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-5 shadow-[0_1px_0_0_rgba(255,255,255,0.04)] backdrop-blur-sm transition hover:border-voice/40',
        className,
      )}
    >
      {/* Hover wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(120% 70% at 0% 0%, color-mix(in oklch, var(--voice) 10%, transparent), transparent 70%)',
        }}
      />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <Icon className="size-4 text-muted-foreground/70 transition group-hover:text-voice" aria-hidden />
      </div>
      <p className="relative mt-6 font-serif text-4xl tracking-tight text-foreground">
        <span className="text-muted-foreground/40">—</span>
      </p>
      <p className="relative mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function EmptyConversation() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-dashed border-border/70 bg-card/40 px-6 py-16 text-center backdrop-blur-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            'radial-gradient(45% 60% at 50% 100%, color-mix(in oklch, var(--voice) 8%, transparent), transparent 70%)',
        }}
      />
      <PhoneCall className="mx-auto size-7 text-voice/80" />
      <h3 className="mt-4 font-serif text-2xl tracking-tight">No calls yet</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Once an agent picks up its first conversation, you&apos;ll see summaries, captures and audio replay land here in real time.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button asChild size="sm">
          <Link href="/dashboard/agents">Create your first agent</Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href="/dashboard/integrations">Connect ElevenLabs</Link>
        </Button>
      </div>
    </div>
  );
}
