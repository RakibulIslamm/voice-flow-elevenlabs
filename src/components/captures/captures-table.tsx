'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CaptureType } from '@/lib/db/models/capture';

export type CaptureListItem = {
  id: string;
  type: CaptureType;
  data: unknown;
  callId: string;
  agentName: string;
  businessName: string;
  createdAt: string;
};

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'appointment', label: 'Appointments' },
  { key: 'reservation', label: 'Reservations' },
  { key: 'lead', label: 'Leads' },
  { key: 'callback-request', label: 'Callbacks' },
] as const;

const TYPE_LABEL: Record<CaptureType, string> = {
  appointment: 'Appointment',
  reservation: 'Reservation',
  lead: 'Lead',
  'callback-request': 'Callback',
};

export function CapturesTable({
  items,
  activeType,
}: {
  items: CaptureListItem[];
  activeType: 'all' | CaptureType;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function onTabChange(next: string) {
    const qs = new URLSearchParams(sp);
    if (next === 'all') qs.delete('type');
    else qs.set('type', next);
    router.push(`/dashboard/captures${qs.toString() ? `?${qs.toString()}` : ''}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={activeType} onValueChange={onTabChange}>
          <TabsList className="flex h-auto flex-wrap gap-1 bg-card/40 p-1">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button
          variant="outline"
          size="sm"
          onClick={() => toast.info('CSV export ships in Phase 14.')}
        >
          <Download className="size-3.5" />
          Export CSV
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/40">
        <Table>
          <TableHeader>
            <TableRow className="bg-card/40 hover:bg-card/40">
              <TableHead className="font-medium">Type</TableHead>
              <TableHead className="font-medium">Agent</TableHead>
              <TableHead className="font-medium">Caller</TableHead>
              <TableHead className="font-medium">Contact</TableHead>
              <TableHead className="font-medium">Captured</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No captures match this filter.
                </TableCell>
              </TableRow>
            ) : (
              items.map((c) => {
                const d = (c.data ?? {}) as Record<string, unknown>;
                const callerName =
                  pickString(d, 'caller_name') ?? pickString(d, 'name') ?? '—';
                const contact =
                  pickString(d, 'email') ?? pickString(d, 'phone') ?? '—';
                return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer transition hover:bg-muted/40"
                    onClick={() => router.push(`/dashboard/calls/${c.callId}`)}
                  >
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {TYPE_LABEL[c.type]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/calls/${c.callId}`}
                        className="font-medium text-foreground hover:text-voice"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.agentName}
                      </Link>
                      {c.businessName ? (
                        <p className="text-xs text-muted-foreground">{c.businessName}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{callerName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{contact}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatRelative(c.createdAt)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
