import { requireUserOrRedirect } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import {
  User,
  type ElevenLabsIntegration,
  type TwilioIntegration,
  type UserPlan,
} from '@/lib/db/models/user';
import { PageHeader } from '@/components/layout/page-header';
import { ElevenLabsCard } from '@/components/integrations/elevenlabs-card';
import { TwilioCard } from '@/components/integrations/twilio-card';

export const metadata = { title: 'Integrations · VoiceFlow' };
export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const session = await requireUserOrRedirect('/dashboard/integrations');
  const userId = session.user.id;

  await connectDb();
  type LeanUser = {
    plan?: UserPlan;
    integrations?: { elevenlabs?: ElevenLabsIntegration; twilio?: TwilioIntegration };
  } | null;
  const user = await User.findById(userId)
    .select(
      'plan integrations.elevenlabs.enabled integrations.elevenlabs.accountInfo.tier integrations.twilio.enabled integrations.twilio.accountSidPreview',
    )
    .lean<LeanUser>();

  const elIntegration = user?.integrations?.elevenlabs;
  const twilioIntegration = user?.integrations?.twilio;

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Connections"
        title="Integrations"
        description="Bring your own keys. Credentials are encrypted at rest and only decrypted at the call site. Click any integration to set it up or manage it."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ElevenLabsCard
          connected={!!elIntegration?.enabled}
          tier={elIntegration?.accountInfo?.tier}
        />
        <TwilioCard
          plan={user?.plan ?? 'free'}
          connected={!!twilioIntegration?.enabled}
          accountSidPreview={twilioIntegration?.accountSidPreview}
        />
      </div>
    </div>
  );
}
