import Link from 'next/link';
import { Bot, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Agent not found · VoiceFlow',
  robots: { index: false, follow: false },
};

export default function TalkNotFound() {
  return (
    <div className="relative flex min-h-svh items-center justify-center bg-surface p-4 sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            'radial-gradient(60% 50% at 50% 0%, color-mix(in oklch, var(--voice) 14%, transparent), transparent 60%)',
        }}
      />
      <div className="relative mx-auto w-full max-w-md rounded-3xl border border-border/70 bg-card/80 p-8 text-center shadow-[0_20px_60px_-20px_color-mix(in_oklch,var(--voice)_25%,transparent)] backdrop-blur-md">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-voice/10 text-voice ring-1 ring-voice/20">
          <Bot className="size-6" aria-hidden />
        </div>
        <h1 className="mt-5 font-serif text-3xl tracking-tight">Agent not found</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          This agent isn&apos;t available. The link may be wrong, or the agent may have been
          removed. Double-check the URL or reach out to the site owner.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">
            <Home className="size-4" />
            Go to VoiceFlow
          </Link>
        </Button>
      </div>
    </div>
  );
}
