import type { ReactNode } from 'react';
import { Breadcrumbs, type BreadcrumbOverride } from './breadcrumbs';
import { ThemeToggle } from './theme-toggle';
import { CommandPaletteTrigger } from './command-palette';
import { UserMenu } from './user-menu';
import { SidebarMobileTrigger } from './sidebar';

type UserMenuUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

type Variant = 'dashboard' | 'admin';

/**
 * Server-rendered topbar. Only passes serialisable props (`variant`,
 * `isAdmin`, plain user object) down to the client mobile trigger /
 * menu / palette. Nav arrays with Lucide icon components are imported
 * inside the client components themselves so the icon functions never
 * cross the RSC boundary.
 */
export function Topbar({
  variant = 'dashboard',
  user,
  isAdmin = false,
  breadcrumbOverrides,
  rightSlot,
}: {
  variant?: Variant;
  user: UserMenuUser;
  isAdmin?: boolean;
  breadcrumbOverrides?: BreadcrumbOverride[];
  rightSlot?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
      <SidebarMobileTrigger variant={variant} isAdmin={isAdmin} />
      <Breadcrumbs overrides={breadcrumbOverrides} />
      <div className="ml-auto flex items-center gap-1.5">
        {rightSlot}
        {variant === 'dashboard' ? <CommandPaletteTrigger /> : null}
        <ThemeToggle />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
