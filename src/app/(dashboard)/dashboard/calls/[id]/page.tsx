import { PhoneCall } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';

export const metadata = { title: 'Call · VoiceFlow' };

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Call" title={`Call ${id}`} />
      <EmptyState
        icon={PhoneCall}
        title="Call detail coming in Phase 11"
        description="Transcript, audio playback, captured data and AI summary will appear on this page."
      />
    </div>
  );
}
