import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LoadingState({
  label = 'Loading…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground',
        className,
      )}
    >
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}
