'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/states/error-state';
import { reportClientError } from '@/lib/tracking/client-report';

export default function AgentDetailError({
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
        scope: 'dashboard-agents-detail',
        digest: error.digest,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      },
    });
  }, [error]);

  return (
    <ErrorState
      title="We couldn't load this agent"
      description="Try again in a moment. If this keeps happening, your agent config or ElevenLabs connection may need attention from Integrations."
      action={
        <Button onClick={reset} variant="outline">
          Try again
        </Button>
      }
    />
  );
}
