import 'server-only';
import { MongoClient } from 'mongodb';
import { env } from '@/lib/env';

/**
 * Native MongoClient promise — required by the Auth.js MongoDB adapter
 * (which uses the native driver, not Mongoose). The Mongoose connection in
 * `./connect.ts` uses the same MONGODB_URI but a separate socket pool, which
 * is fine: Mongoose handles app models, the adapter handles auth collections
 * (`users`, `accounts`, `verification_tokens`).
 *
 * Cached on `globalThis` so warm function invocations reuse the connection
 * instead of opening a new client per request.
 */

declare global {
  // eslint-disable-next-line no-var
  var __authMongoClientPromise: Promise<MongoClient> | undefined;
}

function buildPromise(): Promise<MongoClient> {
  const uri = env.MONGODB_URI;
  if (!uri) {
    // Reject with a useful message instead of throwing at module load —
    // soft env policy means the app must still boot.
    return Promise.reject(new Error('MONGODB_URI is not configured (auth adapter)'));
  }
  return new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  }).connect();
}

export const mongoClientPromise: Promise<MongoClient> =
  globalThis.__authMongoClientPromise ?? buildPromise();

if (!globalThis.__authMongoClientPromise) {
  globalThis.__authMongoClientPromise = mongoClientPromise;
}
