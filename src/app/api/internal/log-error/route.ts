import { NextResponse } from 'next/server';
import { z } from 'zod';
import { safeRoute } from '@/lib/safe-route';
import { logError } from '@/lib/tracking/log-error';

const schema = z.object({
  message: z.string().min(1),
  stack: z.string().optional(),
  name: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Browser-side telemetry sink. ErrorBoundary, error.tsx, global-error.tsx,
 * and ErrorTelemetry all POST here. The route persists via `logError`, which
 * itself never throws — so a Mongo outage falls back to console.error instead
 * of breaking the page.
 */
export const POST = safeRoute({
  schema,
  handler: async ({ input }) => {
    const error = Object.assign(new Error(input.message), {
      name: input.name ?? 'ClientError',
      stack: input.stack,
    });
    await logError(error, input.context ?? {});
    return NextResponse.json({ ok: true });
  },
});
