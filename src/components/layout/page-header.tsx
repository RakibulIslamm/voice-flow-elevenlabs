import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Waveform } from './waveform';

/**
 * Editorial-style page header used across the dashboard. Defaults to a
 * centred layout with an eyebrow, large serif title, optional description,
 * and a thin voice waveform accent stroke that ties every screen to the
 * product identity.
 *
 * Pass `align="start"` for list pages that need a wider title area and an
 * actions slot pinned to the right.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  align = 'center',
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  align?: 'center' | 'start';
  className?: string;
}) {
  if (align === 'start') {
    return (
      <div
        className={cn(
          'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
          className,
        )}
      >
        <div className="space-y-2">
          {eyebrow ? (
            <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] text-voice">
              <span className="inline-block h-px w-6 bg-voice/60" aria-hidden />
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-serif text-4xl tracking-tight text-foreground sm:text-5xl">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
          <Waveform className="mt-3 h-5 w-40" height={20} bars={36} />
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col items-center gap-3 text-center', className)}>
      {eyebrow ? (
        <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] text-voice">
          <span className="inline-block h-px w-6 bg-voice/60" aria-hidden />
          {eyebrow}
          <span className="inline-block h-px w-6 bg-voice/60" aria-hidden />
        </p>
      ) : null}
      <h1 className="font-serif text-4xl tracking-tight text-foreground sm:text-5xl md:text-6xl">
        {title}
      </h1>
      {description ? (
        <p className="max-w-xl text-balance text-sm leading-relaxed text-muted-foreground sm:text-base">
          {description}
        </p>
      ) : null}
      <Waveform className="mt-4 h-5 w-48 sm:w-64" height={20} bars={48} />
      {actions ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
    </div>
  );
}
