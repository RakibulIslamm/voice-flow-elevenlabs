import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { safeRoute } from '@/lib/safe-route';
import { connectDb } from '@/lib/db/connect';

/**
 * Liveness + database probe. Returns 200 when MongoDB is reachable, 503 when
 * not. Designed to be polled by uptime checks (Vercel/UptimeRobot/etc.).
 *
 * We resolve DB errors inside the handler instead of letting them bubble up
 * to safeRoute — the caller wants a structured `{ status, db }` body, not a
 * generic 502 EXTERNAL_SERVICE_ERROR.
 */
export const GET = safeRoute({
  handler: async () => {
    const timestamp = new Date().toISOString();

    try {
      await connectDb();
      const adminDb = mongoose.connection.db;
      if (adminDb) {
        await adminDb.admin().ping();
      }
      return NextResponse.json({ status: 'ok', db: 'connected', timestamp });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { status: 'degraded', db: 'disconnected', error: message, timestamp },
        { status: 503 },
      );
    }
  },
});
