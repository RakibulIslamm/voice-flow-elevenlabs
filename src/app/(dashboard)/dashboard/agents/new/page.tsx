import Link from 'next/link';
import { Mic, Plug, ArrowRight } from 'lucide-react';
import { requireUserOrRedirect } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import { User, type ElevenLabsIntegration } from '@/lib/db/models/user';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { AgentWizard } from '@/components/agents/agent-wizard';

export const metadata = { title: 'New Agent · VoiceFlow' };
export const dynamic = 'force-dynamic';

export default async function NewAgentPage() {
  const session = await requireUserOrRedirect('/dashboard/agents/new');
  const userId = session.user.id;

  await connectDb();
  const user = await User.findById(userId)
    .select('integrations.elevenlabs.enabled')
    .lean<{ integrations: { elevenlabs: ElevenLabsIntegration } } | null>();

  const connected = !!user?.integrations?.elevenlabs?.enabled;

  if (!connected) {
    return <ConnectFirst />;
  }

  return <AgentWizard />;
}

function ConnectFirst() {
  return (
    <div className="space-y-12">
      <PageHeader eyebrow="Create" title="New agent" />
      <div className="relative mx-auto max-w-xl overflow-hidden rounded-3xl border border-dashed border-border/70 bg-card/40 px-6 py-16 text-center backdrop-blur-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            backgroundImage:
              'radial-gradient(45% 60% at 50% 100%, color-mix(in oklch, var(--voice) 10%, transparent), transparent 70%)',
          }}
        />
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-voice/10 text-voice ring-1 ring-voice/20">
          <Mic className="size-6" aria-hidden />
        </div>
        <h2 className="mt-5 font-serif text-3xl tracking-tight">Connect ElevenLabs first</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          VoiceFlow uses your ElevenLabs account to power AI voice agents. Connect your API key
          in Integrations to get started — your agent will live in your ElevenLabs dashboard
          and billing.
        </p>
        <Button asChild className="mt-7">
          <Link href="/dashboard/integrations">
            <Plug className="size-4" />
            Go to Integrations
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
