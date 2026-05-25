'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, ShieldCheck } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
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

const ADMIN_FOOTER_ITEM: NavItem = {
  label: 'Admin',
  href: '/admin',
  icon: ShieldCheck,
};

function pickNav(variant: Variant, isAdmin: boolean) {
  if (variant === 'admin') {
    return { main: ADMIN_NAV, footer: [] as NavItem[] };
  }
  const footer = isAdmin
    ? [...DASHBOARD_FOOTER_NAV, ADMIN_FOOTER_ITEM]
    : DASHBOARD_FOOTER_NAV;
  return { main: DASHBOARD_MAIN_NAV, footer };
}

/**
 * Top-left floating brand mark. Doubles as the mobile menu trigger.
 *
 * - md+ : renders as a small frosted pill linking to /dashboard.
 * - <md : renders a hamburger pill that opens a left-side Sheet
 *         containing the full nav. The dashboard footer nav (Billing,
 *         Settings, optionally Admin) lives only in the mobile sheet.
 */
export function FloatingBrand({
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
    <div className="pointer-events-none fixed left-4 top-4 z-40 sm:left-6">
      {/* Desktop brand pill */}
      <Link
        href={variant === 'admin' ? '/admin' : '/dashboard'}
        className={cn(
          'pointer-events-auto hidden items-center gap-2 rounded-full border bg-background/70 px-3.5 py-1.5 backdrop-blur-xl transition hover:bg-background/85 md:inline-flex',
          variant === 'admin' ? 'border-amber-500/30' : 'border-border/70',
        )}
        aria-label={variant === 'admin' ? 'Admin home' : 'VoiceFlow home'}
      >
        <VoiceMark className="size-3.5 text-voice" />
        <span className="font-serif text-base tracking-tight text-foreground">
          VoiceFlow
        </span>
        {variant === 'admin' ? (
          <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Admin
          </span>
        ) : null}
      </Link>

      {/* Mobile menu pill */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Open navigation"
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 backdrop-blur-xl transition hover:bg-background md:hidden"
          >
            <Menu className="size-4" />
            <span className="font-serif text-sm tracking-tight">VoiceFlow</span>
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] p-0">
          <SheetHeader className="border-b border-border px-5 py-4">
            <SheetTitle className="text-left">
              <span className="inline-flex items-center gap-2">
                <VoiceMark className="size-4 text-voice" />
                <span className="font-serif text-xl tracking-tight">VoiceFlow</span>
                {variant === 'admin' ? (
                  <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    Admin
                  </span>
                ) : null}
              </span>
            </SheetTitle>
          </SheetHeader>
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <SidebarNav items={main} onNavigate={close} />
            </div>
            {footer.length > 0 ? (
              <>
                <Separator />
                <div className="px-3 py-4">
                  <SidebarNav items={footer} onNavigate={close} />
                </div>
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Tiny voice-waveform mark used in the brand pill. */
function VoiceMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
      className={className}
    >
      <line x1="4" y1="7" x2="4" y2="13" />
      <line x1="8" y1="4" x2="8" y2="16" />
      <line x1="12" y1="6" x2="12" y2="14" />
      <line x1="16" y1="9" x2="16" y2="11" />
    </svg>
  );
}
