import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';
import { safeRoute } from '@/lib/safe-route';
import { requireUser } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import { Call, type CallDoc, type TranscriptTurn, type ToolCallRecord } from '@/lib/db/models/call';
import { NotFoundError } from '@/lib/errors';

/**
 * GET /api/calls/[id] — read-only call snapshot for the dashboard's
 * live-transcript polling loop. Returns the same shape the call detail
 * page renders so client code can swap state without translating.
 *
 * The id is pulled from the URL path inside `parse` (App Router doesn't
 * deliver dynamic segments to safeRoute's handler context). `schema`
 * has to be set or safeRoute skips the parse step entirely.
 */
export const GET = safeRoute({
  schema: z.object({ id: z.string() }),
  parse: async (req: NextRequest) => {
    const segments = req.nextUrl.pathname.split('/').filter(Boolean);
    return { id: segments[segments.length - 1] };
  },
  handler: async ({ input }) => {
    const id = input.id;
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundError('Call not found.');
    }

    const session = await requireUser();
    await connectDb();

    const call = await Call.findById(id)
      .select(
        '_id agentId userId channel status startedAt endedAt durationSeconds transcript toolCalls summary outcome costUsd updatedAt',
      )
      .lean<
        Pick<
          CallDoc,
          | '_id'
          | 'agentId'
          | 'userId'
          | 'channel'
          | 'status'
          | 'startedAt'
          | 'endedAt'
          | 'durationSeconds'
          | 'transcript'
          | 'toolCalls'
          | 'summary'
          | 'outcome'
          | 'costUsd'
          | 'updatedAt'
        > | null
      >();

    if (!call || call.userId.toString() !== session.user.id) {
      throw new NotFoundError('Call not found.');
    }

    // Avoid leaking the raw ObjectId types — give the client plain
    // ISO + string forms so it can render without extra adapters.
    return NextResponse.json({
      id: call._id.toString(),
      agentId: call.agentId.toString(),
      channel: call.channel,
      status: call.status,
      startedAt: call.startedAt?.toISOString() ?? null,
      endedAt: call.endedAt?.toISOString() ?? null,
      durationSeconds: call.durationSeconds ?? null,
      summary: call.summary ?? null,
      outcome: call.outcome ?? null,
      costUsd: call.costUsd ?? null,
      transcript: (call.transcript ?? []).map((t: TranscriptTurn) => ({
        role: t.role,
        content: t.content,
        timestamp: t.timestamp?.toISOString?.() ?? new Date().toISOString(),
      })),
      toolCalls: (call.toolCalls ?? []).map((t: ToolCallRecord) => ({
        name: t.name,
        input: t.input,
        output: t.output,
        timestamp: t.timestamp?.toISOString?.() ?? new Date().toISOString(),
      })),
      updatedAt: call.updatedAt?.toISOString() ?? null,
    });
  },
});
