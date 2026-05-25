import Link from 'next/link';
import { ChevronLeft, Lock, Phone, ArrowRight, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Twilio · Integrations · VoiceFlow' };

/**
 * Twilio integration lands in Phase 12. Until then the detail page is a
 * marketing/explainer for what the integration WILL do — same shape as
 * the ElevenLabs page so the IA stays consistent.
 */
export default function TwilioIntegrationPage() {
  return (
    <div className="space-y-8">
      <Link
        href="/dashboard/integrations"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        Back to Integrations
      </Link>

      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/40 p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border">
            <Phone className="size-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-3xl tracking-tight text-foreground">
                Twilio Voice
              </h1>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                <Lock className="mr-1 size-2.5" /> Pro plan required
              </Badge>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Bring your own Twilio account and assign a phone number to an agent. Inbound
              calls are bridged through Twilio Media Streams into your ElevenLabs agent —
              same voice, same prompt, same captures, just over the phone.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-end gap-2">
          <Button asChild>
            <Link href="/dashboard/billing">
              Upgrade to Pro
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-3xl border border-border/70 bg-card/40 p-6 sm:p-8">
          <h2 className="font-serif text-xl tracking-tight">What it will do</h2>
          <ul className="mt-6 space-y-4 text-sm leading-relaxed text-muted-foreground">
            <Li>
              <b className="text-foreground">Inbound calls</b> — assign a Twilio number to an
              agent and answers route through Twilio Media Streams to ElevenLabs in real time.
            </Li>
            <Li>
              <b className="text-foreground">Same agent, two channels</b> — the agent you build
              for the browser also takes phone calls without a separate config.
            </Li>
            <Li>
              <b className="text-foreground">Bring your own number</b> — buy through Twilio,
              keep your existing area code, no per-minute markup from us.
            </Li>
          </ul>
        </section>

        <section className="rounded-3xl border border-border/70 bg-card/30 p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-voice" aria-hidden />
            <h2 className="font-serif text-xl tracking-tight">Why BYOK?</h2>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Same reason as ElevenLabs: numbers, billing, and compliance stay in your name. If
            you ever leave VoiceFlow, your numbers come with you. We store credentials
            AES-256-GCM encrypted and only decrypt server-side at the call site.
          </p>
        </section>
      </div>
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-2 inline-block size-1.5 shrink-0 rounded-full bg-voice/60" aria-hidden />
      <span>{children}</span>
    </li>
  );
}
