'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/states/error-state';
import { reportClientError } from '@/lib/tracking/client-report';

export default function CallDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void reportClientError({
      message: error.message,
      name: error.name,
      stack: error.stack,
      context: {
        scope: 'dashboard-calls-detail',
        digest: error.digest,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      },
    });
  }, [error]);

  return (
    <ErrorState
      title="We couldn't load this call"
      description="Try again in a moment. Old or archived calls may have been purged from cold storage."
      action={
        <Button onClick={reset} variant="outline">
          Try again
        </Button>
      }
    />
  );
}
