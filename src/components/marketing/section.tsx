import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Shared marketing layout primitives. Every landing section reuses the
 * same max-width container, vertical rhythm, anchor offset (so the
 * sticky nav doesn't clip headings), and the eyebrow → title → subtitle
 * heading stack. Keeping them here means the whole page reads with one
 * consistent voice instead of each component reinventing spacing.
 */

export function Section({
  id,
  className,
  containerClassName,
  children,
}: {
  id?: string;
  className?: string;
  containerClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn('scroll-mt-24 px-4 py-20 sm:px-6 sm:py-28', className)}
    >
      <div className={cn('mx-auto w-full max-w-6xl', containerClassName)}>{children}</div>
    </section>
  );
}

/**
 * Marketing-scale CTA. The design system's `Button` is intentionally
 * compact (h-7) for dense dashboard UIs — too small for a hero. This
 * mirrors the pricing page's hand-rolled Link button at a size that
 * reads as a primary marketing action.
 */
export function CtaLink({
  href,
  children,
  variant = 'primary',
  size = 'lg',
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  size?: 'md' | 'lg';
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition active:translate-y-px',
        size === 'lg' ? 'px-5 py-2.5 text-sm' : 'px-4 py-2 text-sm',
        variant === 'primary'
          ? 'bg-foreground text-background hover:bg-foreground/90'
          : 'border border-border/70 text-foreground hover:bg-foreground/5',
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] text-voice',
        className,
      )}
    >
      <span className="inline-block h-px w-6 bg-voice/60" aria-hidden />
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'center',
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: 'center' | 'start';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'space-y-4',
        align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl',
        className,
      )}
    >
      {eyebrow ? (
        <Eyebrow className={align === 'center' ? 'justify-center' : undefined}>{eyebrow}</Eyebrow>
      ) : null}
      <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">{title}</h2>
      {subtitle ? (
        <p
          className={cn(
            'text-base leading-relaxed text-muted-foreground',
            align === 'center' && 'mx-auto max-w-2xl',
          )}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
