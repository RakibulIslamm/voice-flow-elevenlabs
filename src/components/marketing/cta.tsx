import { Sparkles } from 'lucide-react';
import { CtaLink } from './section';

/** Closing call-to-action banner. */
export function FinalCta() {
  return (
    <section className="px-4 py-20 sm:px-6 sm:py-28">
      <div
        className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-3xl border border-voice/30 bg-card/50 px-6 py-16 text-center sm:px-12"
        style={{
          backgroundImage:
            'radial-gradient(70% 80% at 50% 0%, color-mix(in oklch, var(--voice) 12%, transparent), transparent 65%)',
        }}
      >
        <h2 className="mx-auto max-w-2xl font-serif text-4xl leading-tight tracking-tight text-foreground sm:text-5xl">
          Your AI receptionist is 60 seconds away.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
          Bring your ElevenLabs key, get 100 free platform calls, and launch on web or phone today.
        </p>
        <div className="mt-8 flex justify-center">
          <CtaLink href="/sign-up">
            <Sparkles className="size-4" />
            Start free — bring your ElevenLabs key
          </CtaLink>
        </div>
      </div>
    </section>
  );
}
