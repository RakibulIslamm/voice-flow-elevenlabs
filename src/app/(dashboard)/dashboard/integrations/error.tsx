'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/states/error-state';
import { reportClientError } from '@/lib/tracking/client-report';

export default function IntegrationsError({
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
        scope: 'dashboard-integrations',
        digest: error.digest,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      },
    });
  }, [error]);

  return (
    <ErrorState
      title="Integrations are temporarily unavailable"
      description="We couldn't load your connection status. Try again — if the problem persists, contact support."
      action={
        <Button onClick={reset} variant="outline">
          Try again
        </Button>
      }
    />
  );
}
