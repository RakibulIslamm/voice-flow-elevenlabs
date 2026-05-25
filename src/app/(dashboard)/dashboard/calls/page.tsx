import { PhoneCall } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';

export const metadata = { title: 'Calls · VoiceFlow' };

export default function CallsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Conversations"
        title="Calls"
        description="Every conversation your agents handle — browser sessions and phone calls — with transcripts, captures and outcomes."
      />
      <EmptyState
        icon={PhoneCall}
        title="No calls yet"
        description="Your agent conversations will appear here. Use the test caller on the agent page once Phase 8 is live to drive your first one."
      />
    </div>
  );
}
