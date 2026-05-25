/**
 * Client-side error reporter — POSTs a structured payload to the internal
 * log-error endpoint, which persists it to the ErrorLog collection and (in
 * development) prints to the server console.
 *
 * Use this from any client component that catches an error you want
 * persisted. Never throws. Safe to fire-and-forget with `void`.
 */

type ClientReportPayload = {
  message: string;
  name?: string;
  stack?: string;
  context?: Record<string, unknown>;
};

export async function reportClientError(payload: ClientReportPayload): Promise<void> {
  try {
    await fetch('/api/internal/log-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      // Survive page unload — common when the error happens during navigation.
      keepalive: true,
    });
  } catch {
    // Telemetry must never break the user-facing flow.
  }
}
