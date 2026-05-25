'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, CircleDashed, CirclePause, CircleX, Globe2, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { CallChannel, CallStatus } from '@/lib/db/models/call';

export type CallListItem = {
  id: string;
  agentId: string;
  agentName: string;
  businessName: string;
  channel: CallChannel;
  status: CallStatus;
  startedAtIso: string;
  durationSeconds: number | null;
  outcome: string | null;
  callerLabel: string;
};

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'in-progress', label: 'In progress' },
  { key: 'abandoned', label: 'Abandoned' },
  { key: 'failed', label: 'Failed' },
] as const;

export function CallsTable({
  items,
  activeStatus,
}: {
  items: CallListItem[];
  activeStatus: 'all' | CallStatus;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function onTabChange(next: string) {
    const qs = new URLSearchParams(sp);
    if (next === 'all') qs.delete('status');
    else qs.set('status', next);
    router.push(`/dashboard/calls${qs.toString() ? `?${qs.toString()}` : ''}`);
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeStatus} onValueChange={onTabChange}>
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

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/40">
        <Table>
          <TableHeader>
            <TableRow className="bg-card/40 hover:bg-card/40">
              <TableHead className="font-medium">Agent</TableHead>
              <TableHead className="font-medium">Channel</TableHead>
              <TableHead className="font-medium">Caller</TableHead>
              <TableHead className="font-medium">Started</TableHead>
              <TableHead className="font-medium">Duration</TableHead>
              <TableHead className="font-medium">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No calls match this filter.
                </TableCell>
              </TableRow>
            ) : (
              items.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer transition hover:bg-muted/40"
                  onClick={() => router.push(`/dashboard/calls/${c.id}`)}
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <Link
                        href={`/dashboard/calls/${c.id}`}
                        className="font-medium text-foreground hover:text-voice"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.agentName}
                      </Link>
                      {c.businessName ? (
                        <span className="text-xs text-muted-foreground">{c.businessName}</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ChannelBadge channel={c.channel} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.callerLabel}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatRelative(c.startedAtIso)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatDuration(c.durationSeconds)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
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

function ChannelBadge({ channel }: { channel: CallChannel }) {
  if (channel === 'phone') {
    return (
      <Badge variant="outline" className="text-[10px]">
        <Phone className="mr-1 size-2.5" />
        Phone
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px]">
      <Globe2 className="mr-1 size-2.5" />
      Browser
    </Badge>
  );
}

export function StatusBadge({ status }: { status: CallStatus }) {
  const map: Record<
    CallStatus,
    { label: string; className: string; icon: typeof Check }
  > = {
    completed: {
      label: 'Completed',
      className:
        'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300',
      icon: Check,
    },
    'in-progress': {
      label: 'In progress',
      className: 'bg-voice/15 text-voice hover:bg-voice/15',
      icon: CircleDashed,
    },
    abandoned: {
      label: 'Abandoned',
      className: 'bg-muted text-muted-foreground hover:bg-muted',
      icon: CirclePause,
    },
    failed: {
      label: 'Failed',
      className: 'bg-destructive/15 text-destructive hover:bg-destructive/15',
      icon: CircleX,
    },
  };
  const cfg = map[status];
  const Icon = cfg.icon;
  return (
    <Badge className={cn('text-[10px]', cfg.className)}>
      <Icon className="mr-1 size-2.5" />
      {cfg.label}
    </Badge>
  );
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
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
