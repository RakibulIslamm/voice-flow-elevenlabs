import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connectDb } from '@/lib/db/connect';
import { Agent, type AgentStatus } from '@/lib/db/models/agent';
import { User } from '@/lib/db/models/user';
import { TalkShell, type TalkAgent, type TalkPageState } from '@/components/voice/talk-shell';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ embed?: string }>;

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  await connectDb();
  const agent = await Agent.findOne({ 'channels.browser.publicSlug': slug })
    .select('name')
    .lean<{ name: string } | null>();
  return {
    title: agent ? `Talk to ${agent.name} · VoiceFlow` : 'Talk · VoiceFlow',
    robots: { index: false, follow: false },
  };
}

export default async function PublicTalkPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const embed = sp.embed === '1';

  await connectDb();

  type LeanAgent = {
    userId: { toString(): string };
    name: string;
    businessName?: string;
    greeting?: string;
    status: AgentStatus;
    channels?: { browser?: { enabled?: boolean } };
  };
  const agent = await Agent.findOne({ 'channels.browser.publicSlug': slug })
    .select('userId name businessName greeting status channels.browser.enabled')
    .lean<LeanAgent | null>();

  if (!agent) notFound();

  const user = await User.findById(agent.userId)
    .select('integrations.elevenlabs.enabled')
    .lean<{ integrations?: { elevenlabs?: { enabled?: boolean } } } | null>();
  const elConnected = !!user?.integrations?.elevenlabs?.enabled;

  const state = deriveState(agent, elConnected);

  // Only the fields safe to render client-side. Crucially: no system prompt,
  // no elevenLabsAgentId, no owner identity. Phase 10 will swap a signed
  // WebSocket URL in for the real call instead.
  const safeAgent: TalkAgent = {
    name: agent.name,
    businessName: agent.businessName ?? '',
    greeting: agent.greeting ?? '',
    slug,
  };

  return <TalkShell agent={safeAgent} state={state} embed={embed} />;
}

function deriveState(
  agent: { status: AgentStatus; channels?: { browser?: { enabled?: boolean } } },
  elConnected: boolean,
): TalkPageState {
  if (!agent.channels?.browser?.enabled) return 'browser-disabled';
  if (!elConnected) return 'service-issue';
  if (agent.status !== 'active') return 'paused';
  return 'ready';
}
