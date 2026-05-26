import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { requireUserOrRedirect } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import {
  Agent,
  type AgentBrowserChannel,
  type AgentDoc,
  type AgentFaqEntry,
  type AgentPhoneChannel,
  type AgentStatus,
  type AgentTemplate,
  type AgentTonePreset,
} from '@/lib/db/models/agent';
import { Call, type CallDoc } from '@/lib/db/models/call';
import {
  Capture,
  type CaptureDoc,
  type CaptureStatus,
  type CaptureType,
} from '@/lib/db/models/capture';
import { User, type ElevenLabsIntegration, type UserPlan } from '@/lib/db/models/user';
import {
  AgentDetail,
  type AgentDetailContext,
  type AgentDetailData,
} from '@/components/agents/agent-detail';
import type { CallListItem } from '@/components/calls/calls-table';
import type { CaptureListItem } from '@/components/captures/captures-table';
import { loadAgentStats } from '@/lib/stats/dashboard-stats';
import { env } from '@/lib/env';

export const metadata = { title: 'Agent · VoiceFlow' };
export const dynamic = 'force-dynamic';

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!OBJECT_ID_RE.test(id)) notFound();

  const session = await requireUserOrRedirect(`/dashboard/agents/${id}`);
  const userId = session.user.id;

  await connectDb();

  type LeanAgent = Omit<AgentDoc, 'userId'> & { userId: Types.ObjectId };
  type LeanUser = {
    plan?: UserPlan;
    integrations?: {
      elevenlabs?: ElevenLabsIntegration;
      twilio?: { enabled?: boolean };
    };
  } | null;

  const [agent, user] = await Promise.all([
    Agent.findById(id).lean<LeanAgent | null>(),
    User.findById(userId)
      .select('plan integrations.elevenlabs.enabled integrations.twilio.enabled')
      .lean<LeanUser>(),
  ]);

  if (!agent || agent.userId.toString() !== userId) notFound();

  const agentObjectId = new Types.ObjectId(id);

  // Load stats + recent activity for the agent's own tabs. These are
  // cheap counts/finds against indexed fields; running them in parallel
  // keeps the page first-paint snappy even on Cold-start.
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
  type LeanCapture = Pick<
    CaptureDoc,
    '_id' | 'callId' | 'agentId' | 'type' | 'status' | 'code' | 'data' | 'createdAt'
  >;
  const [stats, recentCalls, recentCaptures] = await Promise.all([
    loadAgentStats(id),
    Call.find({ agentId: agentObjectId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select(
        '_id agentId channel status startedAt durationSeconds outcome createdAt callerInfo',
      )
      .lean<LeanCall[]>(),
    Capture.find({ agentId: agentObjectId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('_id callId agentId type status code data createdAt')
      .lean<LeanCapture[]>(),
  ]);

  const data: AgentDetailData = serialiseAgent(agent);
  const context: AgentDetailContext = {
    elConnected: !!user?.integrations?.elevenlabs?.enabled,
    twilioConnected: !!user?.integrations?.twilio?.enabled,
    plan: (user?.plan ?? 'free') as UserPlan,
  };
  const appUrl = (env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

  const callItems: CallListItem[] = recentCalls.map((c) => {
    const caller = c.callerInfo as { phone?: string; originDomain?: string } | undefined;
    return {
      id: c._id.toString(),
      agentId: c.agentId.toString(),
      agentName: data.name,
      businessName: data.businessName,
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

  const captureItems: CaptureListItem[] = recentCaptures.map((c) => ({
    id: c._id.toString(),
    type: c.type as CaptureType,
    status: (c.status ?? 'confirmed') as CaptureStatus,
    code: c.code ?? null,
    data: c.data,
    callId: c.callId.toString(),
    agentName: data.name,
    businessName: data.businessName,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <AgentDetail
      agent={data}
      context={context}
      appUrl={appUrl}
      stats={stats}
      calls={callItems}
      captures={captureItems}
    />
  );
}

function serialiseAgent(
  doc: Omit<AgentDoc, 'userId'> & { userId: Types.ObjectId },
): AgentDetailData {
  return {
    id: doc._id.toString(),
    name: doc.name,
    template: doc.template as AgentTemplate,
    businessName: doc.businessName ?? '',
    businessAddress: doc.businessAddress ?? '',
    businessPhone: doc.businessPhone ?? '',
    businessWebsite: doc.businessWebsite ?? '',
    businessTimezone: doc.businessTimezone || 'UTC',
    businessHours: (doc.businessHours ?? null) as AgentDetailData['businessHours'],
    bookingConfig: doc.bookingConfig
      ? {
          slotDurationMinutes: doc.bookingConfig.slotDurationMinutes,
          capacityPerSlot: doc.bookingConfig.capacityPerSlot,
          leadTimeMinutes: doc.bookingConfig.leadTimeMinutes,
          maxDaysAhead: doc.bookingConfig.maxDaysAhead,
        }
      : null,
    faq: (doc.faq ?? []) as AgentFaqEntry[],
    voiceId: doc.voiceId,
    greeting: doc.greeting ?? '',
    systemPrompt: doc.systemPrompt ?? '',
    tonePreset: doc.tonePreset as AgentTonePreset,
    expressiveMode: doc.expressiveMode ?? false,
    status: doc.status as AgentStatus,
    channels: {
      browser: {
        enabled: doc.channels?.browser?.enabled ?? true,
        publicSlug: doc.channels?.browser?.publicSlug ?? '',
        allowedDomains: doc.channels?.browser?.allowedDomains ?? [],
      } satisfies AgentBrowserChannel,
      phone: {
        enabled: doc.channels?.phone?.enabled ?? false,
        twilioPhoneNumber: doc.channels?.phone?.twilioPhoneNumber,
        twilioPhoneNumberSid: doc.channels?.phone?.twilioPhoneNumberSid,
      } satisfies AgentPhoneChannel,
    },
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}
