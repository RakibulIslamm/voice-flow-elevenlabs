import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireUserOrRedirect } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import { User, type ElevenLabsIntegration } from '@/lib/db/models/user';
import { Agent } from '@/lib/db/models/agent';
import { env } from '@/lib/env';
import { ElevenLabsDetail } from '@/components/integrations/elevenlabs-detail';

export const metadata = { title: 'ElevenLabs · Integrations · VoiceFlow' };
export const dynamic = 'force-dynamic';

export default async function ElevenLabsIntegrationPage() {
  const session = await requireUserOrRedirect('/dashboard/integrations/elevenlabs');
  const userId = session.user.id;

  await connectDb();
  const [user, agentCount] = await Promise.all([
    User.findById(userId)
      .select('integrations.elevenlabs')
      .lean<{ integrations: { elevenlabs: ElevenLabsIntegration } } | null>(),
    Agent.countDocuments({ userId }),
  ]);

  const integration = user?.integrations?.elevenlabs;

  // `||` (not `??`) so an empty-string NEXT_PUBLIC_APP_URL also falls back —
  // empty strings are the common case in dev where the var was never set
  // but soft env validation lets the app boot anyway.
  const baseUrl = (env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const webhookUrl = `${baseUrl}/api/elevenlabs/webhooks`;

  return (
    <div className="space-y-8">
      <Link
        href="/dashboard/integrations"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        Back to Integrations
      </Link>

      <ElevenLabsDetail
        connected={!!integration?.enabled}
        apiKeyPreview={integration?.apiKeyPreview}
        connectedAt={integration?.connectedAt?.toISOString()}
        verifiedAt={integration?.verifiedAt?.toISOString()}
        tier={integration?.accountInfo?.tier}
        characterLimit={integration?.accountInfo?.characterLimit}
        charactersUsed={integration?.accountInfo?.charactersUsed}
        agentCount={agentCount}
        webhookUrl={webhookUrl}
        webhookConfigured={!!integration?.encryptedWebhookSecret}
        webhookSecretPreview={integration?.webhookSecretPreview}
        webhookConfiguredAt={integration?.webhookConfiguredAt?.toISOString()}
      />
    </div>
  );
}
