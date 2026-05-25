'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BreadcrumbOverride = {
  /** Path segment to match (e.g. "agents" or "[id]"). */
  segment: string;
  /** Human-readable label to display instead. */
  label: string;
};

/**
 * Auto-generates a breadcrumb trail from the current URL path.
 *
 * Each path segment becomes a clickable crumb pointing to the cumulative
 * subpath. The first segment is always the area root (e.g. /dashboard or
 * /admin). Dynamic IDs can be replaced with friendlier labels via the
 * `overrides` prop — pass `{segment: "<actualId>", label: "Friendly name"}`
 * once the detail page has loaded its data (Phase 8+).
 */
export function Breadcrumbs({
  overrides,
  className,
}: {
  overrides?: BreadcrumbOverride[];
  className?: string;
}) {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/');
    const override = overrides?.find((o) => o.segment === segment);
    const label = override?.label ?? formatSegment(segment);
    const isLast = index === segments.length - 1;
    return { href, label, isLast };
  });

  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0 flex-1', className)}>
      <ol className="flex items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => (
          <li key={crumb.href} className="flex min-w-0 items-center gap-1.5">
            {i > 0 ? (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
            ) : null}
            {crumb.isLast ? (
              <span
                aria-current="page"
                className="truncate font-medium text-foreground"
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="truncate text-muted-foreground hover:text-foreground"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function formatSegment(segment: string): string {
  // Replace dashes/underscores with spaces and capitalise each word.
  return segment
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
