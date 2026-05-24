import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '@/lib/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, 'hex');
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decrypt(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload: expected iv:authTag:ciphertext');
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  if (iv.length !== IV_LENGTH) throw new Error('Invalid IV length');
  if (authTag.length !== AUTH_TAG_LENGTH) throw new Error('Invalid auth tag length');
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function encryptJSON<T>(value: T): string {
  return encrypt(JSON.stringify(value));
}

export function decryptJSON<T>(encrypted: string): T {
  return JSON.parse(decrypt(encrypted)) as T;
}
