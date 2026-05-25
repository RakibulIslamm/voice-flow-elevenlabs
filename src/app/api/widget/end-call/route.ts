import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { safeRoute } from '@/lib/safe-route';
import { connectDb } from '@/lib/db/connect';
import { Call } from '@/lib/db/models/call';
import { verifyWidgetToken } from '@/lib/widget/token';
import { NotFoundError, WidgetUnauthorizedError } from '@/lib/errors';
import { trackEvent } from '@/lib/tracking/event';

const inputSchema = z.object({
  widgetToken: z.string().min(1),
  callId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid callId.'),
});

/**
 * Best-effort call-end marker fired by the browser SDK's disconnect
 * handler. The ElevenLabs webhook (Phase 11) is the real source of
 * truth for completion + duration + outcome; this endpoint just
 * stops the Call from sitting in `in-progress` if the webhook is
 * delayed or never fires (page closed mid-call, network blip, etc.).
 *
 * We never *downgrade* a status that the webhook may have already
 * upgraded — so a Call already `completed` by the webhook stays
 * `completed` even if this endpoint fires late.
 */
export const POST = safeRoute({
  schema: inputSchema,
  handler: async ({ input }) => {
    const token = verifyWidgetToken(input.widgetToken);
    if (!token) {
      throw new WidgetUnauthorizedError('Widget session expired.');
    }

    await connectDb();
    const call = await Call.findById(input.callId);
    if (!call) throw new NotFoundError('Call not found.');
    if (call.agentId.toString() !== token.agentId) {
      throw new WidgetUnauthorizedError('Token does not match this call.');
    }

    if (call.status !== 'in-progress') {
      // Webhook already finalised this call — leave it alone.
      return NextResponse.json({ ok: true, status: call.status });
    }

    const endedAt = new Date();
    const startedAt = call.startedAt ?? call.createdAt;
    const durationSeconds = Math.max(
      0,
      Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
    );

    call.endedAt = endedAt;
    call.durationSeconds = durationSeconds;
    call.status = call.transcript.length > 0 ? 'completed' : 'abandoned';
    await call.save();

    void trackEvent('call.ended', {
      userId: call.userId.toString(),
      agentId: call.agentId.toString(),
      callId: call._id.toString(),
      properties: {
        status: call.status,
        durationSeconds,
        transcriptTurns: call.transcript.length,
        source: 'client',
      },
    });

    return NextResponse.json({
      ok: true,
      status: call.status,
      durationSeconds,
    });
  },
});
