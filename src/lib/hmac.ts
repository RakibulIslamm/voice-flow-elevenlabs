import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

export function signHmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyHmac(payload: string, signature: string, secret: string): boolean {
  const expected = signHmac(payload, secret);
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}
