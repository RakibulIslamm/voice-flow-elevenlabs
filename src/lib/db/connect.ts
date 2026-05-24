import 'server-only';
import mongoose, { type Mongoose } from 'mongoose';
import { env } from '@/lib/env';
import { ExternalServiceError } from '@/lib/errors';

/**
 * Serverless-safe MongoDB connection. The Mongoose connection is cached on
 * `globalThis` so warm function invocations reuse it instead of opening a
 * new socket per request (which would exhaust the Atlas connection pool).
 *
 * Call `connectDb()` at the top of every server action / route handler that
 * touches Mongo. Repeated calls are no-ops after the first success.
 */

type Cache = {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __mongooseCache: Cache | undefined;
}

const cache: Cache = globalThis.__mongooseCache ?? { conn: null, promise: null };
if (!globalThis.__mongooseCache) globalThis.__mongooseCache = cache;

export async function connectDb(): Promise<Mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    const uri = env.MONGODB_URI;
    if (!uri) {
      throw new ExternalServiceError('MongoDB', 'MONGODB_URI is not configured');
    }

    cache.promise = mongoose
      .connect(uri, {
        // Disable command buffering so failures surface immediately instead
        // of queueing for 10s waiting for a connection.
        bufferCommands: false,
        // Serverless: keep the pool small so we don't exhaust Atlas connections
        // across many concurrent warm functions.
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
      })
      .catch((err) => {
        cache.promise = null;
        const reason = err instanceof Error ? err.message : String(err);
        throw new ExternalServiceError('MongoDB', `connect failed: ${reason}`);
      });
  }

  try {
    cache.conn = await cache.promise;
    return cache.conn;
  } catch (err) {
    cache.promise = null;
    cache.conn = null;
    throw err;
  }
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
