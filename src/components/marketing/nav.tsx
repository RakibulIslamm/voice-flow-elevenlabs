'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { CtaLink } from './section';

/**
 * Sticky marketing nav. Anchor links use the `/#id` form so they scroll
 * smoothly on the home page AND route home-then-scroll from subpages
 * (pricing/legal). Goes translucent + bordered once the user scrolls,
 * so the hero reads clean at the top.
 */
const LINKS = [
  { label: 'How it works', href: '/#how' },
  { label: 'Why BYOK', href: '/#why-byok' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'FAQ', href: '/#faq' },
];

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Lock body scroll while the mobile sheet is open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-colors',
        scrolled
          ? 'border-b border-border/60 bg-background/80 backdrop-blur-md'
          : 'border-b border-transparent',
      )}
    >
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <span className="grid size-7 place-items-center rounded-lg bg-voice text-sm font-bold text-voice-foreground">
            V
          </span>
          <span className="font-serif text-xl tracking-tight">VoiceFlow</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <Link
            href="/sign-in"
            className="rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
          >
            Sign in
          </Link>
          <CtaLink href="/sign-up" size="md">
            <Sparkles className="size-3.5" />
            Start free
          </CtaLink>
        </div>

        {/* Mobile */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </nav>

      {open ? (
        <div className="border-t border-border/60 bg-background/95 backdrop-blur-md md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm text-foreground transition hover:bg-foreground/5"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-3">
              <CtaLink
                href="/sign-in"
                variant="secondary"
                className="w-full"
              >
                Sign in
              </CtaLink>
              <CtaLink href="/sign-up" className="w-full">
                <Sparkles className="size-4" />
                Start free
              </CtaLink>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
