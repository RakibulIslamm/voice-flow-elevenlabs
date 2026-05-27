import { AlertTriangle } from 'lucide-react';

/**
 * Shared shell for legal pages: title, "last updated" line, the
 * template-warning banner (these are starting-point templates, NOT
 * legal advice), and a consistent prose container.
 */
export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 pb-24 pt-16 sm:px-6">
      <header className="space-y-2">
        <h1 className="font-serif text-4xl tracking-tight text-foreground sm:text-5xl">{title}</h1>
        <p className="text-sm text-muted-foreground">Last updated {updated}</p>
      </header>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong>Template — review with legal counsel before production use.</strong> This document
          is a generic starting point and does not constitute legal advice.
        </p>
      </div>

      <div className="mt-10 space-y-8">{children}</div>
    </article>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-xl tracking-tight text-foreground">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}
