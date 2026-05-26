import { randomBytes } from 'node:crypto';
import { Capture } from '@/lib/db/models/capture';
import type { Types } from 'mongoose';

/**
 * Unambiguous alphabet — no `0/O`, `1/I/L`, `B/8`, etc. Easier for callers
 * to read back over a phone line.
 */
const ALPHABET = '23456789ACDEFGHJKMNPQRTUVWXYZ';

/** Returns one random 6-char code formatted `ABCD-EF`. */
export function generateShortCode(): string {
  const bytes = randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/**
 * Generates a per-user unique short code by retrying on collision. The
 * Capture model has a unique compound index on `(userId, code)` so a
 * collision surfaces as a `MongoServerError` E11000 which we catch.
 */
export async function generateUniqueCaptureCode(userId: Types.ObjectId | string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateShortCode();
    const existing = await Capture.exists({ userId, code: candidate });
    if (!existing) return candidate;
  }
  // Vanishingly unlikely given ALPHABET.length^6 ≈ 5.9e8 keyspace per user;
  // surface as an error rather than loop forever.
  throw new Error('Could not generate a unique capture code after 5 attempts.');
}
