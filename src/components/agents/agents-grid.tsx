'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  Bot,
  Check,
  CircleDot,
  ExternalLink,
  Eye,
  Globe2,
  Phone,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CopyButton } from '@/components/integrations/copy-button';
import { cn } from '@/lib/utils';
import type {
  AgentStatus,
  AgentTemplate,
} from '@/lib/db/models/agent';

export type AgentListItem = {
  id: string;
  name: string;
  businessName: string;
  template: AgentTemplate;
  status: AgentStatus;
  publicSlug: string;
  browserEnabled: boolean;
  phoneEnabled: boolean;
  updatedAt: string;
};

const TEMPLATE_LABELS: Record<AgentTemplate, string> = {
  dental: 'Dental',
  restaurant: 'Restaurant',
  'lead-qualifier': 'Lead qualifier',
  custom: 'Custom',
};

export function AgentsGrid({
  agents,
  elConnected,
  appUrl,
}: {
  agents: AgentListItem[];
  elConnected: boolean;
  appUrl: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          elConnected={elConnected}
          appUrl={appUrl}
        />
      ))}
    </div>
  );
}

function AgentCard({
  agent,
  elConnected,
  appUrl,
}: {
  agent: AgentListItem;
  elConnected: boolean;
  appUrl: string;
}) {
  const publicUrl = `${appUrl}/talk/${agent.publicSlug}`;
  const needsAttention =
    agent.status === 'error' || (agent.status === 'paused' && !elConnected);

  return (
    <Card className="group flex flex-col overflow-hidden border-border/70 bg-card/60 transition hover:border-voice/40">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <Link
            href={`/dashboard/agents/${agent.id}`}
            className="group/title min-w-0 flex-1 outline-none"
          >
            <div className="flex items-center gap-2">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-voice/10 text-voice ring-1 ring-voice/20">
                <Bot className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-serif text-lg leading-tight tracking-tight group-hover/title:text-voice">
                  {agent.name}
                </p>
                {agent.businessName ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {agent.businessName}
                  </p>
                ) : null}
              </div>
            </div>
          </Link>
          {needsAttention ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="grid size-7 place-items-center rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="size-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {agent.status === 'error'
                  ? 'This agent no longer exists in your ElevenLabs account.'
                  : 'Paused — reconnect ElevenLabs to re-activate.'}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {TEMPLATE_LABELS[agent.template] ?? agent.template}
          </Badge>
          <StatusBadge status={agent.status} elConnected={elConnected} />
          {agent.browserEnabled ? (
            <Badge variant="outline" className="text-[10px]">
              <Globe2 className="mr-1 size-2.5" />
              Browser
            </Badge>
          ) : null}
          {agent.phoneEnabled ? (
            <Badge variant="outline" className="text-[10px]">
              <Phone className="mr-1 size-2.5" />
              Phone
            </Badge>
          ) : null}
        </div>

        {/* Stats */}
        <div className="rounded-xl border border-border/60 bg-card/40 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Conversations this month
          </p>
          <p className="mt-1 font-serif text-2xl tracking-tight">0</p>
          <p className="text-[10px] text-muted-foreground">Real data lands Phase 11.</p>
        </div>

        {/* Public URL */}
        <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1.5">
          <code className="min-w-0 flex-1 truncate font-mono text-[11px]">{publicUrl}</code>
          <CopyButton value={publicUrl} className="shrink-0" />
        </div>

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link href={`/dashboard/agents/${agent.id}`}>
              <Eye className="size-3.5" />
              View
            </Link>
          </Button>
          <Button asChild size="sm" className="flex-1">
            <Link href={publicUrl} target="_blank" rel="noopener noreferrer">
              <Sparkles className="size-3.5" />
              Test
              <ExternalLink className="size-3" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  status,
  elConnected,
}: {
  status: AgentStatus;
  elConnected: boolean;
}) {
  if (status === 'error') {
    return (
      <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15 text-[10px]">
        <AlertTriangle className="mr-1 size-2.5" />
        Error
      </Badge>
    );
  }
  if (status === 'paused' && !elConnected) {
    return (
      <Badge
        className={cn(
          'bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 text-[10px] dark:text-amber-300',
        )}
      >
        <AlertTriangle className="mr-1 size-2.5" />
        Needs attention
      </Badge>
    );
  }
  if (status === 'paused') {
    return (
      <Badge className="bg-muted text-muted-foreground hover:bg-muted text-[10px]">
        <CircleDot className="mr-1 size-2.5" />
        Paused
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 text-[10px] dark:text-emerald-300">
      <Check className="mr-1 size-2.5" />
      Active
    </Badge>
  );
}
