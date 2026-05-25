import 'server-only';
import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { safeRoute } from '@/lib/safe-route';
import { connectDb } from '@/lib/db/connect';
import { Call } from '@/lib/db/models/call';
import { verifyWidgetToken } from '@/lib/widget/token';
import { NotFoundError, WidgetUnauthorizedError } from '@/lib/errors';

const inputSchema = z.object({
  widgetToken: z.string().min(1),
  callId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid callId.'),
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(8_000),
});

/**
 * Client-side transcript backup. The ElevenLabs post-call webhook
 * (Phase 11) is the source of truth for the final transcript; this
 * endpoint exists so the dashboard can show live progress *during*
 * the call and so we don't lose anything if the webhook ever drops.
 *
 * Auth: HMAC widget token. We check the call belongs to the token's
 * agent so a leaked token for agent A can't pollute agent B's call.
 */
export const POST = safeRoute({
  schema: inputSchema,
  handler: async ({ input }) => {
    const token = verifyWidgetToken(input.widgetToken);
    if (!token) {
      throw new WidgetUnauthorizedError('Widget session expired. Please reload the page.');
    }

    await connectDb();
    const call = await Call.findById(input.callId)
      .select('_id agentId status')
      .lean<{ _id: { toString(): string }; agentId: { toString(): string }; status: string } | null>();
    if (!call) throw new NotFoundError('Call not found.');
    if (call.agentId.toString() !== token.agentId) {
      throw new WidgetUnauthorizedError('Token does not match this call.');
    }

    await Call.updateOne(
      { _id: new Types.ObjectId(input.callId) },
      {
        $push: {
          transcript: {
            role: input.role,
            content: input.content,
            timestamp: new Date(),
          },
        },
      },
    );

    return NextResponse.json({ ok: true });
  },
});
