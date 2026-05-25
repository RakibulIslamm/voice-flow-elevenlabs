import { Bot } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';

export const metadata = { title: 'Agent · VoiceFlow' };

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Agent" title={`Agent ${id}`} />
      <EmptyState
        icon={Bot}
        title="Agent detail coming in Phase 8"
        description="Live agent configuration, voice preview, tool bindings and channel setup will live here."
      />
    </div>
  );
}
