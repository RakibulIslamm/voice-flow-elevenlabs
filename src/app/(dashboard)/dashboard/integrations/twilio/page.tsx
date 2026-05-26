import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireUserOrRedirect } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import { User, type TwilioIntegration, type UserPlan } from '@/lib/db/models/user';
import { Agent } from '@/lib/db/models/agent';
import { TwilioDetail } from '@/components/integrations/twilio-detail';

export const metadata = { title: 'Twilio · Integrations · VoiceFlow' };
export const dynamic = 'force-dynamic';

export default async function TwilioIntegrationPage() {
  const session = await requireUserOrRedirect('/dashboard/integrations/twilio');
  const userId = session.user.id;

  await connectDb();

  type LeanUser = { plan?: UserPlan; integrations?: { twilio?: TwilioIntegration } } | null;
  const [user, phoneAgentCount] = await Promise.all([
    User.findById(userId)
      .select('plan integrations.twilio')
      .lean<LeanUser>(),
    Agent.countDocuments({ userId, 'channels.phone.enabled': true }),
  ]);

  const integration = user?.integrations?.twilio;

  return (
    <div className="space-y-8">
      <Link
        href="/dashboard/integrations"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        Back to Integrations
      </Link>

      <TwilioDetail
        plan={user?.plan ?? 'free'}
        connected={!!integration?.enabled}
        accountSidPreview={integration?.accountSidPreview}
        connectedAt={integration?.connectedAt?.toISOString()}
        verifiedAt={integration?.verifiedAt?.toISOString()}
        phoneAgentCount={phoneAgentCount}
      />
    </div>
  );
}
