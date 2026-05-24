import { NextResponse } from 'next/server';
import { z } from 'zod';
import { safeRoute } from '@/lib/safe-route';

const schema = z.object({
  message: z.string().min(1),
  stack: z.string().optional(),
  componentStack: z.string().optional(),
  digest: z.string().optional(),
  url: z.string().optional(),
  scope: z.string().optional(),
});

export const POST = safeRoute({
  schema,
  handler: async ({ input }) => {
    // TODO(phase-3): persist to ErrorLog model in MongoDB.
    if (process.env.NODE_ENV !== 'production') {
      console.error('[log-error]', {
        scope: input.scope,
        message: input.message,
        url: input.url,
      });
    }
    return NextResponse.json({ ok: true });
  },
});
