import { Plug } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';

export const metadata = { title: 'Integrations · VoiceFlow' };

export default function IntegrationsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Connections"
        title="Integrations"
        description="Bring your own keys for ElevenLabs and Twilio. We never share or proxy your credentials."
      />
      <EmptyState
        icon={Plug}
        title="No integrations connected"
        description="Connect ElevenLabs to start building agents (required for voice). Connect Twilio on the Pro plan to enable phone calling."
      />
    </div>
  );
}
