import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function ErrorState({
  title = 'Something went wrong',
  description = 'An unexpected error occurred. Try again, or contact support if this keeps happening.',
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-6 py-12 text-center',
        className,
      )}
    >
      <TriangleAlert className="size-8 text-destructive" aria-hidden />
      <div className="space-y-1">
        <p className="text-base font-medium text-foreground">{title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
