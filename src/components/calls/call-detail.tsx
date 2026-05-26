'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Globe2,
  Loader2,
  Phone,
  PhoneCall,
  RefreshCcw,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/states/empty-state';
import { StatusBadge } from './calls-table';
import { resummarizeCall } from '@/server/actions/calls';
import type { CallChannel, CallStatus } from '@/lib/db/models/call';
import type { CaptureStatus, CaptureType } from '@/lib/db/models/capture';
import { CaptureStatusBadge } from '@/components/captures/captures-table';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TranscriptEntry = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

export type ToolCallEntry = {
  name: string;
  input: unknown;
  output: unknown;
  timestamp: string;
};

export type CallDetailData = {
  id: string;
  agentId: string;
  agentName: string;
  businessName: string;
  channel: CallChannel;
  status: CallStatus;
  externalCallId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  summary: string | null;
  outcome: string | null;
  costUsd: number | null;
  callerLabel: string;
  transcript: TranscriptEntry[];
  toolCalls: ToolCallEntry[];
};

export type CallCaptureItem = {
  id: string;
  type: CaptureType;
  status: CaptureStatus;
  code: string | null;
  data: unknown;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CallDetail({
  call: initial,
  captures,
}: {
  call: CallDetailData;
  captures: CallCaptureItem[];
}) {
  const [call, setCall] = useState(initial);

  // Re-hydrate on the SSR/server initial pass.
  useEffect(() => setCall(initial), [initial]);

  // Live polling while the call is in-progress. We stop as soon as the
  // status flips so we don't ping the server forever.
  useEffect(() => {
    if (call.status !== 'in-progress') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/calls/${call.id}`, { cache: 'no-store' });
        if (res.ok) {
          const body = (await res.json()) as Partial<CallDetailData>;
          if (!cancelled && body && typeof body === 'object') {
            setCall((prev) => ({
              ...prev,
              status: (body.status as CallStatus) ?? prev.status,
              durationSeconds: body.durationSeconds ?? prev.durationSeconds,
              endedAt: body.endedAt ?? prev.endedAt,
              summary: body.summary ?? prev.summary,
              outcome: body.outcome ?? prev.outcome,
              costUsd: body.costUsd ?? prev.costUsd,
              transcript: (body.transcript as TranscriptEntry[]) ?? prev.transcript,
              toolCalls: (body.toolCalls as ToolCallEntry[]) ?? prev.toolCalls,
            }));
          }
        }
      } catch {
        // Transient — let the next tick try again.
      }
      timer = setTimeout(tick, 2_000);
    };
    timer = setTimeout(tick, 2_000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [call.id, call.status]);

  return (
    <div className="space-y-6">
      <Header call={call} />

      <SummaryCard call={call} />

      <TranscriptCard transcript={call.transcript} status={call.status} />

      {call.toolCalls.length > 0 ? <ToolCallsCard tools={call.toolCalls} /> : null}

      {captures.length > 0 ? <CapturesCard captures={captures} /> : null}

      <FooterMeta call={call} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({ call }: { call: CallDetailData }) {
  return (
    <div className="space-y-3">
      <Link
        href="/dashboard/calls"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to calls
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-voice">Call</p>
          <Link
            href={`/dashboard/agents/${call.agentId}`}
            className="font-serif text-3xl tracking-tight hover:text-voice"
          >
            {call.agentName}
          </Link>
          {call.businessName ? (
            <p className="text-sm text-muted-foreground">{call.businessName}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={call.status} />
          {call.channel === 'phone' ? (
            <Badge variant="outline" className="text-[10px]">
              <Phone className="mr-1 size-2.5" />
              Phone
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              <Globe2 className="mr-1 size-2.5" />
              Browser
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px]">
            {call.callerLabel}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {formatDuration(call.durationSeconds)}
          </Badge>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------

function SummaryCard({ call }: { call: CallDetailData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const isInProgress = call.status === 'in-progress';
  const hasSummary = !!call.summary && !!call.outcome;
  const summaryPending = !isInProgress && !hasSummary;

  function onRefetch() {
    startTransition(async () => {
      const result = await resummarizeCall({ callId: call.id, sendEmail: false });
      if (result.ok) {
        toast.success('Summary regenerated.');
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">Summary</CardTitle>
        {hasSummary || summaryPending ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefetch}
            disabled={pending}
            className="h-7 text-xs"
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="size-3.5" />
            )}
            Re-fetch
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {isInProgress ? (
          <p className="text-sm text-muted-foreground">
            <Loader2 className="mr-1.5 inline size-3.5 animate-spin" />
            Call is still in progress. Summary will appear shortly after it ends.
          </p>
        ) : summaryPending ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm leading-relaxed text-amber-700 dark:text-amber-300">
            <p className="font-medium">Generating summary…</p>
            <p className="mt-1 text-xs">
              This usually takes a few seconds. If it doesn&apos;t appear, tap{' '}
              <span className="font-medium">Re-fetch</span> above.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">{call.outcome}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{call.summary}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

function TranscriptCard({
  transcript,
  status,
}: {
  transcript: TranscriptEntry[];
  status: CallStatus;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [transcript.length]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">Transcript</CardTitle>
        <span className="text-xs text-muted-foreground">
          {transcript.length} message{transcript.length === 1 ? '' : 's'}
        </span>
      </CardHeader>
      <CardContent>
        {transcript.length === 0 ? (
          <EmptyState
            icon={PhoneCall}
            title={status === 'in-progress' ? 'Waiting for the call to start…' : 'No transcript'}
            description={
              status === 'in-progress'
                ? 'Once the caller speaks, lines will stream in here.'
                : 'The caller hung up before exchanging any messages.'
            }
          />
        ) : (
          <div
            ref={scrollRef}
            className="max-h-[440px] space-y-3 overflow-y-auto rounded-xl border border-border/60 bg-card/40 p-4"
          >
            {transcript.map((t, i) => (
              <TranscriptBubble key={i} entry={t} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TranscriptBubble({ entry }: { entry: TranscriptEntry }) {
  const time = useMemo(() => {
    try {
      return new Date(entry.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '';
    }
  }, [entry.timestamp]);

  if (entry.role === 'user') {
    return (
      <div className="flex justify-end" title={time}>
        <p className="max-w-[80%] rounded-2xl rounded-tr-md bg-voice/15 px-3 py-2 text-sm leading-relaxed text-foreground">
          {entry.content}
        </p>
      </div>
    );
  }
  return (
    <div className="flex justify-start" title={time}>
      <p className="max-w-[90%] text-sm leading-relaxed text-foreground">{entry.content}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool calls
// ---------------------------------------------------------------------------

function ToolCallsCard({ tools }: { tools: ToolCallEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Tool calls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {tools.map((t, i) => (
          <ToolCallRow key={i} entry={t} />
        ))}
      </CardContent>
    </Card>
  );
}

function ToolCallRow({ entry }: { entry: ToolCallEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-muted/40"
      >
        <span className="flex items-center gap-2">
          <Wrench className="size-3.5 text-voice" />
          <span className="font-mono text-xs">{entry.name}</span>
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {formatTimeShort(entry.timestamp)}
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </span>
      </button>
      {open ? (
        <div className="grid grid-cols-1 gap-2 border-t border-border/60 px-3 py-2 text-xs sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Input
            </p>
            <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
              {safeJson(entry.input)}
            </pre>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Output
            </p>
            <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
              {safeJson(entry.output)}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Captures
// ---------------------------------------------------------------------------

const TYPE_LABEL: Record<CaptureType, string> = {
  appointment: 'Appointment',
  reservation: 'Reservation',
  lead: 'Lead',
  'callback-request': 'Callback request',
};

function CapturesCard({ captures }: { captures: CallCaptureItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Captured</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {captures.map((c) => {
          const fields = c.data && typeof c.data === 'object'
            ? Object.entries(c.data as Record<string, unknown>)
            : [];
          return (
            <div
              key={c.id}
              className="rounded-xl border border-border/60 bg-card/40 p-3"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {TYPE_LABEL[c.type]}
                  </Badge>
                  <CaptureStatusBadge status={c.status} />
                  {c.code ? (
                    <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px]">
                      {c.code}
                    </code>
                  ) : null}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {formatTimeShort(c.createdAt)}
                </span>
              </div>
              <dl className="grid grid-cols-1 gap-x-3 gap-y-1 text-xs sm:grid-cols-[120px_1fr]">
                {fields.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="break-words text-foreground">{renderValue(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Footer meta (cost + ids)
// ---------------------------------------------------------------------------

function FooterMeta({ call }: { call: CallDetailData }) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/60 bg-card/40 p-4 text-xs sm:grid-cols-4">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Started
        </p>
        <p className="mt-1 font-mono text-[11px]">{formatDateTime(call.startedAt)}</p>
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Ended
        </p>
        <p className="mt-1 font-mono text-[11px]">
          {call.endedAt ? formatDateTime(call.endedAt) : '—'}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Summary cost (platform)
        </p>
        <p className="mt-1 font-mono text-[11px]">{formatUsd(call.costUsd)}</p>
      </div>
      <div className="break-all">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          ElevenLabs conversation
        </p>
        <p className="mt-1 font-mono text-[10px]">{call.externalCallId}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number | null): string {
  if (!seconds) return '< 1s';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function formatUsd(value: number | null): string {
  if (value == null) return '—';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(4)}`;
}

function formatTimeShort(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return iso;
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function renderValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return safeJson(v);
}

// Hide unused import warning — Wrench is referenced above but bundlers
// sometimes mark the named-import unused when split across compilation
// boundaries during the first build.
void cn;
