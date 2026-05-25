'use client';

import { useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type EventLogRow = {
  id: string;
  name: string;
  userId?: string;
  agentId?: string;
  callId?: string;
  properties?: Record<string, unknown>;
  occurredAt: string;
};

export function EventLogTable({ rows, name }: { rows: EventLogRow[]; name: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const buildHref = useMemo(
    () => (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = value.trim();
      if (trimmed) params.set('name', trimmed);
      else params.delete('name');
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams],
  );

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const value = (data.get('name') as string | null) ?? '';
          router.push(buildHref(value));
        }}
        className="flex max-w-md items-center gap-2"
      >
        <Input
          name="name"
          placeholder="Filter by event name (e.g. capture.created)"
          defaultValue={name}
          className="h-9"
        />
        <button
          type="submit"
          className="rounded-md border border-border bg-foreground px-3 py-1.5 text-xs font-medium text-background"
        >
          Apply
        </button>
        {name ? (
          <button
            type="button"
            onClick={() => router.push(buildHref(''))}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
      </form>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[220px]">Event</TableHead>
              <TableHead>Properties</TableHead>
              <TableHead className="w-[180px] text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-12 text-center text-sm text-muted-foreground">
                  No events{name ? ` named "${name}"` : ''} in the last 30 days.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs text-foreground">{row.name}</TableCell>
                  <TableCell>
                    {row.properties && Object.keys(row.properties).length > 0 ? (
                      <pre className="max-h-24 overflow-hidden whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
                        {JSON.stringify(row.properties, null, 0)}
                      </pre>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {new Date(row.occurredAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
