import type { Metadata } from 'next';
import Script from 'next/script';
import { notFound } from 'next/navigation';
import { connectDb } from '@/lib/db/connect';
import { Agent } from '@/lib/db/models/agent';
import { env } from '@/lib/env';

type Params = Promise<{ slug: string }>;

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Embed test · ${slug} · VoiceFlow`,
    robots: { index: false, follow: false },
  };
}

/**
 * Internal QA page for verifying the embed widget works against the
 * built `public/widget.js`. Loaded over our own domain so the agent's
 * allowlist check passes (NEXT_PUBLIC_APP_URL is always allowed).
 *
 * Customers don't see this. Linked from the Embed tab as "Test in new tab".
 */
export default async function EmbedTestPage({ params }: { params: Params }) {
  const { slug } = await params;
  await connectDb();
  const agent = await Agent.findOne({ 'channels.browser.publicSlug': slug })
    .select('name businessName channels.browser.enabled status')
    .lean<{
      name: string;
      businessName?: string;
      channels?: { browser?: { enabled?: boolean } };
      status?: string;
    } | null>();
  if (!agent) notFound();

  const appUrl = (env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const widgetSrc = `${appUrl}/widget.js`;

  return (
    <div className="relative min-h-svh bg-surface text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            'radial-gradient(50% 40% at 50% 0%, color-mix(in oklch, var(--voice) 12%, transparent), transparent 60%)',
        }}
      />

      <main className="mx-auto max-w-2xl px-6 py-20">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-voice">QA · internal</p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight sm:text-4xl">Widget embed test</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          This page loads <code className="font-mono text-xs">/widget.js</code> the same way a
          customer site would and points it at <span className="font-medium">{agent.name}</span>
          {agent.businessName ? ` (${agent.businessName})` : ''}. Look for the floating Talk
          button in the bottom-right corner.
        </p>

        <ul className="mt-8 space-y-3 rounded-2xl border border-border/70 bg-card/50 p-5 text-sm">
          <li className="flex items-baseline gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Slug
            </span>
            <code className="font-mono text-xs">{slug}</code>
          </li>
          <li className="flex items-baseline gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Script
            </span>
            <code className="font-mono text-xs">{widgetSrc}</code>
          </li>
          <li className="flex items-baseline gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Browser
            </span>
            <span>{agent.channels?.browser?.enabled ? 'Enabled' : 'Disabled'}</span>
          </li>
          <li className="flex items-baseline gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Status
            </span>
            <span>{agent.status}</span>
          </li>
        </ul>

        <p className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
          Not for production use. This page exists only for verifying the embed flow end-to-end
          before pasting the snippet onto a customer site.
        </p>

        <details className="mt-6 rounded-xl border border-border/60 bg-card/40 p-4 text-xs">
          <summary className="cursor-pointer text-muted-foreground">Show embed snippet</summary>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-muted/40 p-3 font-mono leading-relaxed">{`<script src="${widgetSrc}" data-agent-slug="${slug}" async></script>`}</pre>
        </details>
      </main>

      {/* Drop the widget the same way a customer would. Strategy=afterInteractive
          mirrors a typical <script async> attachment on a marketing site. */}
      <Script
        src={widgetSrc}
        strategy="afterInteractive"
        data-agent-slug={slug}
      />
    </div>
  );
}
