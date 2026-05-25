import Link from 'next/link';
import { PhoneCall } from 'lucide-react';
import { Types } from 'mongoose';
import { requireUserOrRedirect } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import { Call, type CallDoc, type CallStatus } from '@/lib/db/models/call';
import { Agent, type AgentDoc } from '@/lib/db/models/agent';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { CallsTable, type CallListItem } from '@/components/calls/calls-table';

export const metadata = { title: 'Calls · VoiceFlow' };
export const dynamic = 'force-dynamic';

const VALID_STATUS: CallStatus[] = ['in-progress', 'completed', 'failed', 'abandoned'];

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireUserOrRedirect('/dashboard/calls');
  const userId = session.user.id;

  const sp = await searchParams;
  const status =
    sp.status && (VALID_STATUS as string[]).includes(sp.status)
      ? (sp.status as CallStatus)
      : undefined;

  await connectDb();
  const userObjectId = new Types.ObjectId(userId);
  const filter: Record<string, unknown> = { userId: userObjectId };
  if (status) filter.status = status;

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
  const calls = await Call.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .select(
      '_id agentId channel status startedAt durationSeconds outcome createdAt callerInfo',
    )
    .lean<LeanCall[]>();

  const agentIds = Array.from(new Set(calls.map((c) => c.agentId.toString())));
  const agents = agentIds.length
    ? await Agent.find({ _id: { $in: agentIds.map((id) => new Types.ObjectId(id)) } })
        .select('_id name businessName')
        .lean<Pick<AgentDoc, '_id' | 'name' | 'businessName'>[]>()
    : [];
  const agentMap = new Map<string, { name: string; businessName: string }>();
  for (const a of agents) {
    agentMap.set(a._id.toString(), {
      name: a.name,
      businessName: a.businessName ?? '',
    });
  }

  const items: CallListItem[] = calls.map((c) => {
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

  const totalForTabs = await Call.countDocuments({ userId: userObjectId });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Conversations"
        title="Calls"
        description="Every conversation your agents handle — browser sessions and phone calls — with transcripts, captures and outcomes."
        align="start"
      />

      {totalForTabs === 0 ? (
        <EmptyState
          icon={PhoneCall}
          title="No calls yet"
          description="Once your agents start receiving conversations, you'll see transcripts and outcomes here."
          action={
            <Link
              href="/dashboard/agents"
              className="text-sm text-voice underline-offset-4 hover:underline"
            >
              Go to your agents →
            </Link>
          }
        />
      ) : (
        <CallsTable items={items} activeStatus={status ?? 'all'} />
      )}
    </div>
  );
}
