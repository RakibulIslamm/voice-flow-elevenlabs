import Link from 'next/link';
import { Bot, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';

export const metadata = { title: 'Agents · VoiceFlow' };

export default function AgentsPage() {
  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Agents"
        title="Your AI receptionists"
        description="Configure voice agents that answer your website chat and phone calls."
        align="start"
        actions={
          <Button asChild size="sm">
            <Link href="/dashboard/agents/new">
              <Plus className="size-4" />
              Create agent
            </Link>
          </Button>
        }
      />
      <EmptyState
        icon={Bot}
        title="No agents yet"
        description="Connect ElevenLabs in Integrations, then configure your first AI receptionist in 60 seconds."
        action={
          <Button asChild>
            <Link href="/dashboard/integrations">Connect ElevenLabs</Link>
          </Button>
        }
      />
    </div>
  );
}
