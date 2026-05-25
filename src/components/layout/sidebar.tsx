'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, ShieldCheck } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { SidebarNav } from './sidebar-nav';
import {
  DASHBOARD_MAIN_NAV,
  DASHBOARD_FOOTER_NAV,
  ADMIN_NAV,
  type NavItem,
} from './nav-config';

type Variant = 'dashboard' | 'admin';

const ADMIN_ITEM: NavItem = {
  label: 'Admin',
  href: '/admin',
  icon: ShieldCheck,
};

// Nav config lives in a `.ts` file (no 'use client'), so when these client
// components import it directly the icon components are bundled into the
// client chunk and never cross the server/client boundary. The server-side
// caller passes only serialisable props (variant, isAdmin) — never icons.
function pickNav(
  variant: Variant,
  isAdmin: boolean,
): { main: NavItem[]; footer: NavItem[] } {
  if (variant === 'admin') {
    return { main: ADMIN_NAV, footer: [] };
  }
  const footer = isAdmin ? [...DASHBOARD_FOOTER_NAV, ADMIN_ITEM] : DASHBOARD_FOOTER_NAV;
  return { main: DASHBOARD_MAIN_NAV, footer };
}

export function Sidebar({
  variant = 'dashboard',
  isAdmin = false,
}: {
  variant?: Variant;
  isAdmin?: boolean;
}) {
  const { main, footer } = pickNav(variant, isAdmin);

  return (
    <aside
      className={cn(
        'hidden w-[240px] shrink-0 flex-col border-r border-border bg-background lg:flex',
      )}
      aria-label="Main navigation"
    >
      <SidebarBrand variant={variant} />
      <Separator />
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
        <SidebarNav items={main} />
      </div>
      <Separator />
      <div className="px-3 py-4">
        <SidebarNav items={footer} />
      </div>
    </aside>
  );
}

export function SidebarMobileTrigger({
  variant = 'dashboard',
  isAdmin = false,
}: {
  variant?: Variant;
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { main, footer } = pickNav(variant, isAdmin);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="text-left">
            <BrandText variant={variant} />
          </SheetTitle>
        </SheetHeader>
        <div className="flex h-full flex-col">
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <SidebarNav items={main} onNavigate={close} />
          </div>
          <Separator />
          <div className="px-3 py-4">
            <SidebarNav items={footer} onNavigate={close} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SidebarBrand({ variant }: { variant: Variant }) {
  return (
    <Link
      href={variant === 'admin' ? '/admin' : '/dashboard'}
      className="flex h-14 items-center px-5"
    >
      <BrandText variant={variant} />
    </Link>
  );
}

function BrandText({ variant }: { variant: Variant }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="font-serif text-xl tracking-tight text-foreground">VoiceFlow</span>
      {variant === 'admin' ? (
        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          Admin
        </span>
      ) : null}
    </span>
  );
}
