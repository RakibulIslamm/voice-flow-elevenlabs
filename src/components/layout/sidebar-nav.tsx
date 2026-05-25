'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isActivePath, type NavItem } from './nav-config';

export function SidebarNav({
  items,
  onNavigate,
  className,
}: {
  items: NavItem[];
  /** Called after a link is clicked (used to close mobile Sheet). */
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <nav className={cn('flex flex-col gap-0.5', className)} aria-label="Primary">
      {items.map(({ label, href, icon: Icon, exact }) => {
        const active = isActivePath(pathname, href, exact);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition',
              active
                ? 'bg-foreground/90 text-background'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon
              className={cn(
                'size-4 shrink-0 transition',
                active ? 'opacity-100' : 'opacity-80 group-hover:opacity-100',
              )}
              aria-hidden
            />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
