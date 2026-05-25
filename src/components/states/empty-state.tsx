import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: Icon = Inbox,
  title = 'Nothing here yet',
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-3xl border border-dashed border-border/70 bg-card/40 px-6 py-16 text-center backdrop-blur-sm',
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            'radial-gradient(45% 60% at 50% 100%, color-mix(in oklch, var(--voice) 7%, transparent), transparent 70%)',
        }}
      />
      <Icon className="size-7 text-voice/80" aria-hidden />
      <div className="space-y-1.5">
        <p className="font-serif text-2xl tracking-tight text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
