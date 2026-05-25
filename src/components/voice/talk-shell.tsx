'use client';

import Link from 'next/link';
import { AlertTriangle, Clock, Globe2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VoiceUI } from './voice-ui';

export type TalkAgent = {
  name: string;
  businessName: string;
  greeting: string;
  slug: string;
};

export type TalkPageState = 'ready' | 'paused' | 'service-issue' | 'browser-disabled';

export function TalkShell({
  agent,
  state,
  embed,
}: {
  agent: TalkAgent;
  state: TalkPageState;
  embed: boolean;
}) {
  return (
    <div
      className={cn(
        'relative min-h-svh bg-surface text-foreground',
        embed ? 'p-0' : 'flex items-center justify-center p-4 sm:p-8',
      )}
    >
      {/* Soft amber radial accent so the page reads on-brand even with no chrome. */}
      {!embed ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            backgroundImage:
              'radial-gradient(60% 50% at 50% 0%, color-mix(in oklch, var(--voice) 14%, transparent), transparent 60%), radial-gradient(40% 40% at 50% 100%, color-mix(in oklch, var(--voice) 8%, transparent), transparent 60%)',
          }}
        />
      ) : null}

      <div
        className={cn(
          'relative flex w-full flex-col overflow-hidden',
          embed
            ? 'h-svh'
            : // Fixed-height card so the orb + transcript layout doesn't
              // jump as messages stream in. On mobile we fill the viewport;
              // on desktop the card is portrait-ish and capped to the
              // viewport with a small margin so the page stays scrollable
              // on tiny windows.
              'mx-auto h-svh max-h-svh w-full max-w-md rounded-none border-0 bg-card/80 shadow-[0_20px_60px_-20px_color-mix(in_oklch,var(--voice)_25%,transparent)] backdrop-blur-md sm:h-180 sm:max-h-[calc(100svh-3rem)] sm:rounded-3xl sm:border sm:border-border/70',
        )}
      >
        {state === 'ready' ? (
          <ReadyCard agent={agent} embed={embed} />
        ) : (
          <UnavailableCard agent={agent} state={state} embed={embed} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ready — full voice UI
// ---------------------------------------------------------------------------

function ReadyCard({ agent, embed }: { agent: TalkAgent; embed: boolean }) {
  return (
    <div
      className={cn(
        // `min-h-0` is the magic — without it, a flex child happily blows
        // past its parent and breaks the inner `overflow-y-auto` on the
        // transcript pane.
        'flex h-full min-h-0 flex-1 flex-col gap-5 p-6 sm:p-8',
        embed && 'p-5',
      )}
    >
      <Header agent={agent} embed={embed} />
      <VoiceUI agent={agent} />
      {!embed ? <PoweredByFooter /> : null}
    </div>
  );
}

function Header({ agent, embed }: { agent: TalkAgent; embed: boolean }) {
  return (
    <header className="space-y-1.5 text-center">
      {agent.businessName ? (
        <p
          className={cn(
            'text-xs font-medium uppercase tracking-[0.22em] text-voice',
            embed && 'text-[10px]',
          )}
        >
          {agent.businessName}
        </p>
      ) : null}
      <h1
        className={cn(
          'font-serif tracking-tight text-foreground',
          embed ? 'text-2xl' : 'text-3xl sm:text-4xl',
        )}
      >
        {agent.name}
      </h1>
      {!embed && agent.greeting ? (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{agent.greeting}</p>
      ) : null}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Unavailable states — friendly messaging only
// ---------------------------------------------------------------------------

function UnavailableCard({
  agent,
  state,
  embed,
}: {
  agent: TalkAgent;
  state: Exclude<TalkPageState, 'ready'>;
  embed: boolean;
}) {
  const config = UNAVAILABLE_COPY[state];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex flex-1 flex-col gap-6 p-6 text-center sm:p-8',
        embed && 'min-h-svh justify-center p-5',
      )}
    >
      <div className="space-y-4">
        <div
          className={cn(
            'mx-auto grid place-items-center rounded-2xl ring-1',
            config.tone === 'warn'
              ? 'bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300'
              : 'bg-muted text-muted-foreground ring-border/60',
            'size-12',
          )}
        >
          <Icon className="size-6" aria-hidden />
        </div>
        <div className="space-y-2">
          {agent.businessName ? (
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
              {agent.businessName}
            </p>
          ) : null}
          <h1 className="font-serif text-2xl tracking-tight">{config.title}</h1>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
            {config.description}
          </p>
        </div>
      </div>
      {!embed ? <PoweredByFooter className="mt-auto" /> : null}
    </div>
  );
}

const UNAVAILABLE_COPY: Record<
  Exclude<TalkPageState, 'ready'>,
  {
    icon: typeof AlertTriangle;
    title: string;
    description: string;
    tone: 'warn' | 'neutral';
  }
> = {
  paused: {
    icon: Clock,
    title: 'Currently unavailable',
    description:
      'This agent is currently unavailable. Please check back later or reach out to the site owner directly.',
    tone: 'neutral',
  },
  'service-issue': {
    icon: AlertTriangle,
    title: 'Temporarily unavailable',
    description:
      'This agent is temporarily unavailable due to a service issue. Please contact the site owner.',
    tone: 'warn',
  },
  'browser-disabled': {
    icon: Globe2,
    title: 'Web access disabled',
    description:
      'This agent has disabled web access. Please contact the site owner for another way to get in touch.',
    tone: 'neutral',
  },
};

// ---------------------------------------------------------------------------
// Powered-by footer
// ---------------------------------------------------------------------------

function PoweredByFooter({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        'pt-2 text-center text-[11px] text-muted-foreground/80',
        className,
      )}
    >
      <Link
        href="/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"
      >
        <Sparkles className="size-3 text-voice" aria-hidden />
        <span>
          Powered by <span className="font-medium text-foreground/90">VoiceFlow</span>
        </span>
      </Link>
    </p>
  );
}

