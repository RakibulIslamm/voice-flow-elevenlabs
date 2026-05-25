import { Inbox } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';

export const metadata = { title: 'Captures · VoiceFlow' };

export default function CapturesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Pipeline"
        title="Captures"
        description="Structured outcomes from your agent conversations — leads, appointments and reservations — ready to export to your CRM."
      />
      <EmptyState
        icon={Inbox}
        title="No captures yet"
        description="Leads, appointments and reservations captured by your agents will appear here as conversations complete."
      />
    </div>
  );
}
