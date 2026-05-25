import Link from 'next/link';
import { Bot, Plug2, Plus } from 'lucide-react';
import { requireUserOrRedirect } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import { User, type ElevenLabsIntegration } from '@/lib/db/models/user';
import { Agent, type AgentDoc } from '@/lib/db/models/agent';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { AgentsGrid, type AgentListItem } from '@/components/agents/agents-grid';
import { env } from '@/lib/env';

export const metadata = { title: 'Agents · VoiceFlow' };
export const dynamic = 'force-dynamic';

export default async function AgentsPage() {
  const session = await requireUserOrRedirect('/dashboard/agents');
  const userId = session.user.id;

  await connectDb();

  const [user, agents] = await Promise.all([
    User.findById(userId)
      .select('integrations.elevenlabs.enabled')
      .lean<{ integrations: { elevenlabs: ElevenLabsIntegration } } | null>(),
    Agent.find({ userId })
      .sort({ updatedAt: -1 })
      .select(
        '_id name businessName template status channels.browser.publicSlug channels.browser.enabled channels.phone.enabled updatedAt',
      )
      .lean<Pick<AgentDoc, '_id' | 'name' | 'businessName' | 'template' | 'status' | 'channels' | 'updatedAt'>[]>(),
  ]);

  const connected = !!user?.integrations?.elevenlabs?.enabled;
  const items: AgentListItem[] = (agents ?? []).map((a) => ({
    id: a._id.toString(),
    name: a.name,
    businessName: a.businessName ?? '',
    template: a.template,
    status: a.status,
    publicSlug: a.channels?.browser?.publicSlug ?? '',
    browserEnabled: a.channels?.browser?.enabled ?? true,
    phoneEnabled: a.channels?.phone?.enabled ?? false,
    updatedAt: a.updatedAt?.toISOString() ?? new Date().toISOString(),
  }));

  const appUrl = (env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Agents"
        title="Your AI receptionists"
        description="Configure voice agents that answer your website chat and phone calls."
        align="start"
        actions={
          connected ? (
            <Button asChild size="sm">
              <Link href="/dashboard/agents/new">
                <Plus className="size-4" />
                Create agent
              </Link>
            </Button>
          ) : null
        }
      />

      {items.length > 0 ? (
        <AgentsGrid agents={items} elConnected={connected} appUrl={appUrl} />
      ) : connected ? (
        <EmptyState
          icon={Bot}
          title="No agents yet"
          description="You're connected to ElevenLabs. Spin up your first AI receptionist in about 60 seconds — pick a template, voice, and you're live."
          action={
            <Button asChild>
              <Link href="/dashboard/agents/new">
                <Plus className="size-4" />
                Create your first agent
              </Link>
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={Plug2}
          title="Connect ElevenLabs to start"
          description="VoiceFlow uses your ElevenLabs account to power voice agents. Connect your API key in Integrations, then come back here to build your first one."
          action={
            <Button asChild>
              <Link href="/dashboard/integrations/elevenlabs">Connect ElevenLabs</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
