'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type ErrorLogRow = {
  id: string;
  message: string;
  stack?: string;
  name?: string;
  code?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, unknown>;
  occurredAt: string; // ISO string
};

const SEVERITY_OPTIONS: { value: 'all' | ErrorLogRow['severity']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const SEVERITY_BADGE: Record<ErrorLogRow['severity'], string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  medium: 'bg-muted text-foreground',
  low: 'bg-muted/60 text-muted-foreground',
};

export function ErrorLogTable({
  rows,
  severity,
}: {
  rows: ErrorLogRow[];
  severity: 'all' | ErrorLogRow['severity'];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<ErrorLogRow | null>(null);

  const filterToHref = useMemo(
    () => (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === 'all') params.delete('severity');
      else params.set('severity', value);
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Severity
        </span>
        {SEVERITY_OPTIONS.map((opt) => {
          const active = severity === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => router.push(filterToHref(opt.value))}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs font-medium transition',
                active
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Severity</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="w-[160px]">Name / Code</TableHead>
              <TableHead className="w-[170px] text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-sm text-muted-foreground">
                  No errors{severity !== 'all' ? ` at "${severity}" severity` : ''} in the last 30 days.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelected(row)}
                >
                  <TableCell>
                    <Badge className={cn('font-normal capitalize', SEVERITY_BADGE[row.severity])}>
                      {row.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[420px] truncate font-medium text-foreground">
                    {row.message}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.name ?? '—'}
                    {row.code ? <span className="opacity-60"> · {row.code}</span> : null}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatRelative(row.occurredAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="font-serif text-2xl tracking-tight">
              {selected?.name ?? 'Error'}
            </SheetTitle>
            <SheetDescription>
              {selected ? new Date(selected.occurredAt).toLocaleString() : ''}
            </SheetDescription>
          </SheetHeader>
          {selected ? (
            <div className="space-y-5 px-4 pb-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Message
                </p>
                <p className="mt-1 text-sm text-foreground">{selected.message}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className={cn('capitalize', SEVERITY_BADGE[selected.severity])}>
                  {selected.severity}
                </Badge>
                {selected.code ? (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {selected.code}
                  </Badge>
                ) : null}
              </div>
              {selected.stack ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Stack
                  </p>
                  <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                    {selected.stack}
                  </pre>
                </div>
              ) : null}
              {selected.context ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Context
                  </p>
                  <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                    {JSON.stringify(selected.context, null, 2)}
                  </pre>
                </div>
              ) : null}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  ID
                </p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {selected.id}
                </p>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
