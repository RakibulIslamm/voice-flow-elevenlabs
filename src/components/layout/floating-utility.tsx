import { cn } from '@/lib/utils';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

type UserMenuUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

type Variant = 'dashboard' | 'admin';

/**
 * Top-right floating utility cluster. Mirrors the brand mark on the left
 * and the nav dock in the centre. Currently holds the theme toggle and
 * user menu. A command palette / search will return here in a later phase
 * once there is real content (agents, calls, captures) worth searching.
 */
export function FloatingUtility({
  variant = 'dashboard',
  user,
}: {
  variant?: Variant;
  user: UserMenuUser;
}) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-40 sm:right-6">
      <div
        className={cn(
          'pointer-events-auto inline-flex items-center gap-1 rounded-full border bg-background/70 p-1 backdrop-blur-xl',
          variant === 'admin' ? 'border-amber-500/30' : 'border-border/70',
        )}
      >
        <ThemeToggle />
        <UserMenu user={user} />
      </div>
    </div>
  );
}
