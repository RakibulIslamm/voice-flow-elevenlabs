import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { requireUserOrRedirect } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import {
  Call,
  type CallDoc,
  type ToolCallRecord,
  type TranscriptTurn,
} from '@/lib/db/models/call';
import { Agent, type AgentDoc } from '@/lib/db/models/agent';
import {
  Capture,
  type CaptureDoc,
  type CaptureStatus,
  type CaptureType,
} from '@/lib/db/models/capture';
import {
  CallDetail,
  type CallDetailData,
  type CallCaptureItem,
} from '@/components/calls/call-detail';

export const metadata = { title: 'Call · VoiceFlow' };
export const dynamic = 'force-dynamic';

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!OBJECT_ID_RE.test(id)) notFound();

  const session = await requireUserOrRedirect(`/dashboard/calls/${id}`);
  const userId = session.user.id;

  await connectDb();

  type LeanCall = Omit<CallDoc, 'agentId' | 'userId'> & {
    agentId: Types.ObjectId;
    userId: Types.ObjectId;
  };
  const call = await Call.findById(id).lean<LeanCall | null>();
  if (!call || call.userId.toString() !== userId) notFound();

  const [agent, captures] = await Promise.all([
    Agent.findById(call.agentId)
      .select('_id name businessName')
      .lean<Pick<AgentDoc, '_id' | 'name' | 'businessName'> | null>(),
    Capture.find({ callId: call._id })
      .sort({ createdAt: -1 })
      .lean<Pick<CaptureDoc, '_id' | 'type' | 'status' | 'code' | 'data' | 'createdAt'>[]>(),
  ]);

  const callerInfo = call.callerInfo as
    | { phone?: string; originDomain?: string; ip?: string; userAgent?: string }
    | undefined;

  const data: CallDetailData = {
    id: call._id.toString(),
    agentId: call.agentId.toString(),
    agentName: agent?.name ?? 'Unknown agent',
    businessName: agent?.businessName ?? '',
    channel: call.channel,
    status: call.status,
    externalCallId: call.externalCallId,
    startedAt: (call.startedAt ?? call.createdAt).toISOString(),
    endedAt: call.endedAt?.toISOString() ?? null,
    durationSeconds: call.durationSeconds ?? null,
    summary: call.summary ?? null,
    outcome: call.outcome ?? null,
    costUsd: call.costUsd ?? null,
    callerLabel:
      call.channel === 'phone'
        ? callerInfo?.phone ?? 'Phone caller'
        : callerInfo?.originDomain ?? 'Web caller',
    transcript: (call.transcript ?? []).map((t: TranscriptTurn) => ({
      role: t.role,
      content: t.content,
      timestamp: (t.timestamp ?? new Date()).toISOString(),
    })),
    toolCalls: (call.toolCalls ?? []).map((t: ToolCallRecord) => ({
      name: t.name,
      input: t.input,
      output: t.output,
      timestamp: (t.timestamp ?? new Date()).toISOString(),
    })),
  };

  const captureItems: CallCaptureItem[] = (captures ?? []).map((c) => ({
    id: c._id.toString(),
    type: c.type as CaptureType,
    status: (c.status ?? 'confirmed') as CaptureStatus,
    code: c.code ?? null,
    data: c.data,
    createdAt: c.createdAt.toISOString(),
  }));

  return <CallDetail call={data} captures={captureItems} />;
}
