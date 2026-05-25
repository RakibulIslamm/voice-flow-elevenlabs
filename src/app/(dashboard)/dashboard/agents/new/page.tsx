import { Wand2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';

export const metadata = { title: 'New Agent · VoiceFlow' };

export default function NewAgentPage() {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Create" title="New agent" />
      <EmptyState
        icon={Wand2}
        title="Wizard coming in Phase 7"
        description="The agent creation flow — voice picker, business profile, opening message and tool wiring — lands in the next phase."
      />
    </div>
  );
}
