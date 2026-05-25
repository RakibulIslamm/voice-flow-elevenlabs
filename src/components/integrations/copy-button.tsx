'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Tiny clipboard-copy button with brief "✓ copied" feedback. Used in
 * the ElevenLabs setup steps so users can paste the webhook URL and
 * secret without typo risk.
 */
export function CopyButton({
  value,
  className,
  label = 'Copy',
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          // Clipboard API blocked (e.g. http context) — silently no-op.
        }
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground',
        className,
      )}
      aria-label={copied ? 'Copied' : label}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? 'Copied' : label}
    </button>
  );
}
