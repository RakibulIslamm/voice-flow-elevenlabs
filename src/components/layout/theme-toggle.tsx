'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor, type LucideIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const OPTIONS: { value: 'light' | 'dark' | 'system'; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  // `useTheme()` returns `resolvedTheme: undefined` during SSR + the first
  // client render, so we'd hydrate a Sun icon and then immediately swap to
  // a Moon if the user's theme is dark. Gate the icon swap on `mounted` so
  // the server HTML and the first client render are byte-identical.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const active = (theme ?? 'system') as 'light' | 'dark' | 'system';
  const showMoon = mounted && resolvedTheme === 'dark';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Toggle theme"
          className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
        >
          {showMoon ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => setTheme(value)}
            className="cursor-pointer"
            data-active={active === value}
          >
            <Icon className="size-3.5" />
            {label}
            {active === value ? (
              <span className="ml-auto text-xs text-muted-foreground">✓</span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
