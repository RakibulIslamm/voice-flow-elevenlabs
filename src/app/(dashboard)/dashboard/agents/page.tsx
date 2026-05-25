import Link from 'next/link';
import { Bot, Plug2, Plus } from 'lucide-react';
import { requireUserOrRedirect } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import { User, type ElevenLabsIntegration } from '@/lib/db/models/user';
import { Agent } from '@/lib/db/models/agent';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';

export const metadata = { title: 'Agents · VoiceFlow' };
export const dynamic = 'force-dynamic';

export default async function AgentsPage() {
  const session = await requireUserOrRedirect('/dashboard/agents');
  const userId = session.user.id;

  await connectDb();

  const [user, agentCount] = await Promise.all([
    User.findById(userId)
      .select('integrations.elevenlabs.enabled')
      .lean<{ integrations: { elevenlabs: ElevenLabsIntegration } } | null>(),
    Agent.countDocuments({ userId }),
  ]);

  const connected = !!user?.integrations?.elevenlabs?.enabled;
  const hasAgents = agentCount > 0;

  return (
    <div className="space-y-12">
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

      {hasAgents ? (
        <p className="text-sm text-muted-foreground">
          {agentCount} agent{agentCount === 1 ? '' : 's'} — full list lands in Phase 8.
        </p>
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
