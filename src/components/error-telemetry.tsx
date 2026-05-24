'use client';

import { useEffect } from 'react';

/**
 * Mounted once in the root layout. Captures browser crashes that React error
 * boundaries cannot see: errors thrown in event handlers, microtask rejections,
 * third-party script failures, and any error fired on window outside the React
 * tree. Posts to /api/internal/log-error using fetch + keepalive so the request
 * survives page unload.
 */
export function ErrorTelemetry() {
  useEffect(() => {
    const post = (body: Record<string, unknown>) => {
      try {
        void fetch('/api/internal/log-error', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          keepalive: true,
        }).catch(() => {
          /* swallow — telemetry must never throw */
        });
      } catch {
        /* swallow */
      }
    };

    const onError = (event: ErrorEvent) => {
      post({
        message: event.message || 'window.onerror',
        stack: event.error instanceof Error ? event.error.stack : undefined,
        url: `${window.location.href} @ ${event.filename}:${event.lineno}:${event.colno}`,
        scope: 'window-error',
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      post({
        message: reason instanceof Error ? reason.message : String(reason ?? 'unhandledrejection'),
        stack: reason instanceof Error ? reason.stack : undefined,
        url: window.location.href,
        scope: 'unhandled-rejection',
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
