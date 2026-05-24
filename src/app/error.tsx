'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/states/error-state';
import { Button } from '@/components/ui/button';

export default function RouteError({
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
        scope: 'route-error',
      }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6">
      <ErrorState
        action={
          <div className="flex gap-2">
            <Button onClick={reset}>Try again</Button>
            <Button variant="outline" asChild>
              <a href="/">Go home</a>
            </Button>
          </div>
        }
      />
    </div>
  );
}
