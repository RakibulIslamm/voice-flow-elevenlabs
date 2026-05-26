import Link from 'next/link';
import { Bot, PhoneCall, Inbox, Gauge, ArrowUpRight } from 'lucide-react';
import { Types } from 'mongoose';
import { requireUserOrRedirect } from '@/lib/auth/guards';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { connectDb } from '@/lib/db/connect';
import { Call, type CallDoc } from '@/lib/db/models/call';
import { Agent, type AgentDoc } from '@/lib/db/models/agent';
import { loadDashboardStats } from '@/lib/stats/dashboard-stats';
import { CallsTable, type CallListItem } from '@/components/calls/calls-table';
import type { LucideIcon } from 'lucide-react';

export const metadata = { title: 'Overview · VoiceFlow' };
export const dynamic = 'force-dynamic';

const RECENT_CALL_LIMIT = 5;

export default async function DashboardOverviewPage() {
  const session = await requireUserOrRedirect('/dashboard');
  const displayName = session.user.name?.split(' ')[0] ?? 'there';

  const stats = await loadDashboardStats(session.user.id);

  await connectDb();
  const userObjectId = new Types.ObjectId(session.user.id);

  type LeanCall = Pick<
    CallDoc,
    | '_id'
    | 'agentId'
    | 'channel'
    | 'status'
    | 'startedAt'
    | 'durationSeconds'
    | 'outcome'
    | 'createdAt'
    | 'callerInfo'
  >;
  const recentCalls = await Call.find({ userId: userObjectId })
    .sort({ createdAt: -1 })
    .limit(RECENT_CALL_LIMIT)
    .select('_id agentId channel status startedAt durationSeconds outcome createdAt callerInfo')
    .lean<LeanCall[]>();

  const agentIds = Array.from(new Set(recentCalls.map((c) => c.agentId.toString())));
  const agentDocs = agentIds.length
    ? await Agent.find({ _id: { $in: agentIds.map((id) => new Types.ObjectId(id)) } })
        .select('_id name businessName')
        .lean<Pick<AgentDoc, '_id' | 'name' | 'businessName'>[]>()
    : [];
  const agentMap = new Map<string, { name: string; businessName: string }>();
  for (const a of agentDocs) {
    agentMap.set(a._id.toString(), { name: a.name, businessName: a.businessName ?? '' });
  }

  const recentItems: CallListItem[] = recentCalls.map((c) => {
    const agentInfo = agentMap.get(c.agentId.toString());
    const caller = c.callerInfo as { phone?: string; originDomain?: string } | undefined;
    return {
      id: c._id.toString(),
      agentId: c.agentId.toString(),
      agentName: agentInfo?.name ?? 'Unknown agent',
      businessName: agentInfo?.businessName ?? '',
      channel: c.channel,
      status: c.status,
      startedAtIso: (c.startedAt ?? c.createdAt).toISOString(),
      durationSeconds: c.durationSeconds ?? null,
      outcome: c.outcome ?? null,
      callerLabel:
        c.channel === 'phone'
          ? caller?.phone ?? 'Phone caller'
          : caller?.originDomain ?? 'Web caller',
    };
  });

  return (
    <div className="space-y-16">
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${displayName}.`}
        description="Your AI receptionists, recent conversations, and pipeline at a glance. Live data lights up as soon as your first agent goes online."
        showWave={true}
      />

      <section aria-label="Key metrics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Bot}
          label="Active agents"
          hint={
            stats.totalAgents === 0
              ? 'Create your first agent to begin.'
              : stats.activeAgents === stats.totalAgents
                ? 'All agents online and accepting calls.'
                : `${stats.totalAgents - stats.activeAgents} paused or in error.`
          }
          value={stats.activeAgents}
          subValue={stats.totalAgents > 0 ? `of ${stats.totalAgents}` : undefined}
        />
        <StatCard
          icon={PhoneCall}
          label="Calls"
          hint="This billing period"
          value={stats.callsThisMonth}
        />
        <StatCard
          icon={Inbox}
          label="Captures"
          hint="Leads · appointments · reservations"
          value={stats.capturesThisMonth}
        />
        <StatCard
          icon={Gauge}
          label="Voice minutes"
          hint={
            stats.minutesQuota
              ? `${formatMinutes(stats.minutesUsed)} / ${stats.minutesQuota.toLocaleString()} this period`
              : 'Unmetered plan'
          }
          value={formatMinutes(stats.minutesUsed)}
          progress={
            stats.minutesQuota
              ? Math.min(100, (stats.minutesUsed / stats.minutesQuota) * 100)
              : null
          }
        />
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

        {recentItems.length === 0 ? (
          <EmptyConversation />
        ) : (
          <CallsTable items={recentItems} activeStatus="all" hideTabs />
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  hint,
  value,
  subValue,
  progress,
  className,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  value?: number | string;
  subValue?: string;
  /** 0-100 — renders a progress bar under the value. */
  progress?: number | null;
  className?: string;
}) {
  const hasValue = value !== undefined && value !== null;
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-5 shadow-[0_1px_0_0_rgba(255,255,255,0.04)] backdrop-blur-sm transition hover:border-voice/40',
        className,
      )}
    >
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
      <div className="relative mt-6 flex items-baseline gap-2">
        <p className="font-serif text-4xl tracking-tight text-foreground tabular-nums">
          {hasValue ? value : <span className="text-muted-foreground/40">—</span>}
        </p>
        {subValue ? <span className="text-xs text-muted-foreground">{subValue}</span> : null}
      </div>
      {progress !== undefined && progress !== null ? (
        <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              progress >= 90 ? 'bg-destructive' : progress >= 70 ? 'bg-amber-500' : 'bg-voice',
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
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

function formatMinutes(m: number): string {
  if (m === 0) return '0';
  if (m < 1) return m.toFixed(1);
  if (m < 10) return m.toFixed(1);
  return Math.round(m).toLocaleString();
}
