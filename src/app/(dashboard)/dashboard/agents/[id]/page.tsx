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
import { User, type ElevenLabsIntegration, type UserPlan } from '@/lib/db/models/user';
import {
  AgentDetail,
  type AgentDetailContext,
  type AgentDetailData,
} from '@/components/agents/agent-detail';
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

  const data: AgentDetailData = serialiseAgent(agent);
  const context: AgentDetailContext = {
    elConnected: !!user?.integrations?.elevenlabs?.enabled,
    twilioConnected: !!user?.integrations?.twilio?.enabled,
    plan: (user?.plan ?? 'free') as UserPlan,
  };
  const appUrl = (env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

  return <AgentDetail agent={data} context={context} appUrl={appUrl} />;
}

function serialiseAgent(
  doc: Omit<AgentDoc, 'userId'> & { userId: Types.ObjectId },
): AgentDetailData {
  return {
    id: doc._id.toString(),
    name: doc.name,
    template: doc.template as AgentTemplate,
    businessName: doc.businessName ?? '',
    businessHours: (doc.businessHours ?? null) as AgentDetailData['businessHours'],
    faq: (doc.faq ?? []) as AgentFaqEntry[],
    voiceId: doc.voiceId,
    greeting: doc.greeting ?? '',
    systemPrompt: doc.systemPrompt ?? '',
    tonePreset: doc.tonePreset as AgentTonePreset,
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
