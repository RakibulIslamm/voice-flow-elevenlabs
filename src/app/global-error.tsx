'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void fetch('/api/internal/log-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        scope: 'global-error',
      }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="font-serif text-4xl">Something went wrong</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            An unexpected error occurred. Try again, or return to the home page. If the problem
            persists, please contact support.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Try again
            </button>
            <a
              href="/"
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
