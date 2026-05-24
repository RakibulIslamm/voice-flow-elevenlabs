'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '@/components/states/error-state';
import { Button } from '@/components/ui/button';

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void fetch('/api/internal/log-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack ?? undefined,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        scope: 'react-error-boundary',
      }),
      keepalive: true,
    }).catch(() => {
      /* swallow — logging must not throw */
    });
  }

  private reset = () => this.setState({ error: null });

  render(): ReactNode {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="mx-auto max-w-xl px-6 py-16">
            <ErrorState action={<Button onClick={this.reset}>Try again</Button>} />
          </div>
        )
      );
    }
    return this.props.children;
  }
}
