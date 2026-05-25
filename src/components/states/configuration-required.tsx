import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ConfigRequirementGroup = {
  /** Display name for this requirement group, e.g. "Google OAuth". */
  label: string;
  /** Environment variable names that this group needs. */
  vars: string[];
  /** Optional hint about how to obtain values, e.g. "Get from console.cloud.google.com". */
  hint?: string;
};

/**
 * Shown in place of a feature's UI when the env vars it needs aren't set.
 * Reusable across any page/component that depends on configuration.
 *
 * In **production** (process.env.NODE_ENV === 'production'), only the title
 * and generic description render — internal env var names are hidden so end
 * users never see backend details. In **development**, the full requirement
 * list is shown to help the developer fix the config quickly.
 *
 * Toggle the verbose mode explicitly via the `verbose` prop if you need it.
 */
export function ConfigurationRequired({
  title = 'Service unavailable',
  description = 'This feature is temporarily unavailable. Please try again later or contact support.',
  groups,
  note,
  className,
  verbose,
}: {
  title?: string;
  description?: string;
  groups?: ConfigRequirementGroup[];
  note?: string;
  className?: string;
  /** Defaults to `true` in dev, `false` in prod. */
  verbose?: boolean;
}) {
  const showDetails =
    typeof verbose === 'boolean' ? verbose : process.env.NODE_ENV !== 'production';

  return (
    <div
      role="alert"
      className={cn(
        'rounded-2xl border border-amber-300/70 bg-amber-50/70 p-6 dark:border-amber-500/30 dark:bg-amber-950/30',
        className,
      )}
    >
      <div className="grid size-10 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
        <TriangleAlert className="size-5" />
      </div>
      <h2 className="mt-4 font-serif text-2xl text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>

      {showDetails && groups && groups.length > 0 ? (
        <>
          <p className="mt-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Required configuration
          </p>
          <ul className="mt-2 space-y-3 text-sm">
            {groups.map((g) => (
              <li key={g.label}>
                <p className="font-medium text-foreground">{g.label}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  {g.vars.map((v, i) => (
                    <span key={v} className="inline-flex items-center gap-1">
                      {i > 0 ? <span className="text-muted-foreground/60">+</span> : null}
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                        {v}
                      </code>
                    </span>
                  ))}
                </p>
                {g.hint ? (
                  <p className="mt-1 text-xs text-muted-foreground">{g.hint}</p>
                ) : null}
              </li>
            ))}
          </ul>
          {note ? (
            <p className="mt-5 border-t border-amber-200/60 pt-4 text-xs text-muted-foreground dark:border-amber-500/20">
              {note}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
