'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { DASHBOARD_MAIN_NAV, ADMIN_NAV, isActivePath, type NavItem } from './nav-config';

type Variant = 'dashboard' | 'admin';

/**
 * Top-centre floating nav. Pill-shaped, frosted glass, hovers above the
 * content rather than carving out a sidebar column. Hidden on small screens
 * — the mobile Sheet trigger lives in <FloatingBrandMobile />.
 */
export function FloatingDock({ variant = 'dashboard' }: { variant?: Variant }) {
  const pathname = usePathname();
  const items: NavItem[] = variant === 'admin' ? ADMIN_NAV : DASHBOARD_MAIN_NAV;

  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 top-4 z-40 hidden justify-center md:flex"
    >
      <ul
        className={cn(
          'pointer-events-auto flex items-center gap-0.5 rounded-full border bg-background/70 p-1 shadow-[0_6px_30px_-12px_rgba(0,0,0,0.18)] backdrop-blur-xl',
          variant === 'admin'
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-border/70',
        )}
      >
        {items.map(({ label, href, icon: Icon, exact }) => {
          const active = isActivePath(pathname, href, exact);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-voice/60',
                  active
                    ? 'bg-voice text-voice-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
