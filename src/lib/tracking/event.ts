import 'server-only';
import type { Types } from 'mongoose';
import { connectDb } from '@/lib/db/connect';
import { EventLog } from '@/lib/db/models/event-log';

type TrackEventData = {
  userId?: Types.ObjectId | string;
  agentId?: Types.ObjectId | string;
  callId?: Types.ObjectId | string;
  properties?: Record<string, unknown>;
};

/**
 * Record a product / analytics event. NEVER throws — analytics must not be
 * able to break the request path. Falls back to console on Mongo failure.
 */
export async function trackEvent(name: string, data: TrackEventData = {}): Promise<void> {
  try {
    await connectDb();
    await EventLog.create({
      name,
      userId: data.userId,
      agentId: data.agentId,
      callId: data.callId,
      properties: data.properties,
      occurredAt: new Date(),
    });
  } catch (writeErr) {
    console.error('[trackEvent] failed to persist', {
      writeErr: writeErr instanceof Error ? writeErr.message : String(writeErr),
      name,
      data,
    });
  }
}
