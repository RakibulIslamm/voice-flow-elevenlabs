import { Inbox } from 'lucide-react';
import { Types } from 'mongoose';
import { requireUserOrRedirect } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import {
  Capture,
  type CaptureDoc,
  type CaptureType,
} from '@/lib/db/models/capture';
import { Agent, type AgentDoc } from '@/lib/db/models/agent';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import {
  CapturesTable,
  type CaptureListItem,
} from '@/components/captures/captures-table';

export const metadata = { title: 'Captures · VoiceFlow' };
export const dynamic = 'force-dynamic';

const VALID_TYPES: CaptureType[] = ['appointment', 'reservation', 'lead', 'callback-request'];

export default async function CapturesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const session = await requireUserOrRedirect('/dashboard/captures');
  const userId = session.user.id;

  const sp = await searchParams;
  const type =
    sp.type && (VALID_TYPES as string[]).includes(sp.type)
      ? (sp.type as CaptureType)
      : undefined;

  await connectDb();
  const userObjectId = new Types.ObjectId(userId);
  const filter: Record<string, unknown> = { userId: userObjectId };
  if (type) filter.type = type;

  type LeanCapture = Pick<
    CaptureDoc,
    '_id' | 'callId' | 'agentId' | 'type' | 'data' | 'createdAt'
  >;
  const captures = await Capture.find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .select('_id callId agentId type data createdAt')
    .lean<LeanCapture[]>();

  const agentIds = Array.from(new Set(captures.map((c) => c.agentId.toString())));
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

  const items: CaptureListItem[] = captures.map((c) => {
    const ag = agentMap.get(c.agentId.toString());
    return {
      id: c._id.toString(),
      type: c.type as CaptureType,
      data: c.data,
      callId: c.callId.toString(),
      agentName: ag?.name ?? 'Unknown agent',
      businessName: ag?.businessName ?? '',
      createdAt: c.createdAt.toISOString(),
    };
  });

  const total = await Capture.countDocuments({ userId: userObjectId });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Pipeline"
        title="Captures"
        description="Structured outcomes from your agent conversations — leads, appointments and reservations — ready to export to your CRM."
        align="start"
      />

      {total === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No captures yet"
          description="Leads, appointments and reservations captured by your agents will appear here as conversations complete."
        />
      ) : (
        <CapturesTable items={items} activeType={type ?? 'all'} />
      )}
    </div>
  );
}
