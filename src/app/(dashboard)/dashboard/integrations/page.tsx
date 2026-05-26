import { requireUserOrRedirect } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import { User, type ElevenLabsIntegration } from '@/lib/db/models/user';
import { PageHeader } from '@/components/layout/page-header';
import { ElevenLabsCard } from '@/components/integrations/elevenlabs-card';
import { TwilioCard } from '@/components/integrations/twilio-card';

export const metadata = { title: 'Integrations · VoiceFlow' };
export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const session = await requireUserOrRedirect('/dashboard/integrations');
  const userId = session.user.id;

  await connectDb();
  const user = await User.findById(userId)
    .select('integrations.elevenlabs.enabled integrations.elevenlabs.accountInfo.tier')
    .lean<{ integrations: { elevenlabs: ElevenLabsIntegration } } | null>();

  const integration = user?.integrations?.elevenlabs;

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Connections"
        title="Integrations"
        description="Bring your own keys. Credentials are encrypted at rest and only decrypted at the call site. Click any integration to set it up or manage it."
        showWave={true}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ElevenLabsCard
          connected={!!integration?.enabled}
          tier={integration?.accountInfo?.tier}
        />
        <TwilioCard />
      </div>
    </div>
  );
}
