import Link from 'next/link';
import { Compass } from 'lucide-react';
import { cn } from '@/lib/utils';

export function NotFoundState({
  title = 'Page not found',
  description = "We couldn't find what you were looking for.",
  homeHref = '/',
  homeLabel = 'Back to home',
  className,
}: {
  title?: string;
  description?: string;
  homeHref?: string;
  homeLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center',
        className,
      )}
    >
      <Compass className="size-10 text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <p className="font-serif text-3xl text-foreground sm:text-4xl">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Link
        href={homeHref}
        className="inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        {homeLabel}
      </Link>
    </div>
  );
}
