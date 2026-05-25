'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { DASHBOARD_MAIN_NAV, DASHBOARD_FOOTER_NAV } from './nav-config';

const NAVIGATE_ITEMS = [...DASHBOARD_MAIN_NAV, ...DASHBOARD_FOOTER_NAV];

export function CommandPaletteTrigger() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isPaletteKey = e.key === 'k' && (e.metaKey || e.ctrlKey);
      if (!isPaletteKey) return;
      e.preventDefault();
      setOpen((v) => !v);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open command palette"
        className="inline-flex h-8 items-center gap-2 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
      >
        <Search className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden items-center gap-0.5 rounded-md border border-border/60 bg-muted/60 px-1 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
          <span>⌘</span>K
        </kbd>
      </button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}

function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();

  const go = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [router, onOpenChange],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {NAVIGATE_ITEMS.map(({ label, href, icon: Icon }) => (
            <CommandItem
              key={href}
              value={`${label} ${href}`}
              onSelect={() => go(href)}
            >
              <Icon className="size-4" />
              <span>{label}</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {href}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Create">
          <CommandItem
            value="New Agent"
            onSelect={() => go('/dashboard/agents/new')}
          >
            <Plus className="size-4" />
            <span>New Agent</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
