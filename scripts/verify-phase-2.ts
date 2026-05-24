/**
 * Phase 2 verification — exercises crypto, HMAC, and widget-token round-trips
 * against the current .env.local. Run with:
 *
 *   pnpm verify:phase-2
 */
import { encrypt, decrypt, encryptJSON, decryptJSON } from '@/lib/crypto';
import { signHmac, verifyHmac } from '@/lib/hmac';
import { signWidgetToken, verifyWidgetToken } from '@/lib/widget/token';

let failures = 0;

function assert(label: string, ok: boolean, detail?: unknown) {
  const mark = ok ? '✓' : '✗';
  if (!ok) failures++;
  console.log(`${mark} ${label}${detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`);
}

// --- AES-256-GCM round trip
{
  const plain = 'hello world — encrypt me 🎙️';
  const enc = encrypt(plain);
  const dec = decrypt(enc);
  assert('encrypt(decrypt(plaintext)) === plaintext', dec === plain);
  assert('ciphertext is iv:authTag:ciphertext format', enc.split(':').length === 3);
  assert('two encryptions of same plaintext produce different ciphertexts', encrypt(plain) !== enc);

  // Tampered ciphertext must fail
  const tampered = enc.replace(/.$/, (c) => (c === '0' ? '1' : '0'));
  let threw = false;
  try {
    decrypt(tampered);
  } catch {
    threw = true;
  }
  assert('decrypt rejects tampered ciphertext', threw);
}

// --- JSON helpers
{
  const original = { agentId: 'a_123', scopes: ['voice', 'sms'], n: 42 };
  const roundTrip = decryptJSON<typeof original>(encryptJSON(original));
  assert(
    'encryptJSON / decryptJSON round trip',
    JSON.stringify(roundTrip) === JSON.stringify(original),
  );
}

// --- HMAC round trip
{
  const secret = 'my-super-secret-for-test';
  const payload = 'payload-to-sign';
  const sig = signHmac(payload, secret);
  assert('verifyHmac accepts valid signature', verifyHmac(payload, sig, secret) === true);
  assert(
    'verifyHmac rejects wrong signature (timing-safe)',
    verifyHmac(payload, sig.replace(/.$/, (c) => (c === '0' ? '1' : '0')), secret) === false,
  );
  assert(
    'verifyHmac rejects wrong secret',
    verifyHmac(payload, sig, 'wrong-secret') === false,
  );
  assert(
    'verifyHmac rejects mangled-length signature without throwing',
    verifyHmac(payload, sig.slice(0, -2), secret) === false,
  );
}

// --- Widget token
{
  const token = signWidgetToken({ agentId: 'agent_demo', origin: 'https://example.com' }, 60);
  const payload = verifyWidgetToken(token);
  assert('verifyWidgetToken returns payload for a fresh token', payload !== null);
  assert(
    'payload.agentId / origin preserved',
    payload?.agentId === 'agent_demo' && payload?.origin === 'https://example.com',
  );
  assert(
    'payload has iat and exp = iat + ttl',
    typeof payload?.iat === 'number' &&
      typeof payload?.exp === 'number' &&
      payload!.exp - payload!.iat === 60,
  );

  // Tampered signature
  const tamperedSig = token.replace(/.$/, (c) => (c === '0' ? '1' : '0'));
  assert(
    'verifyWidgetToken rejects tampered signature',
    verifyWidgetToken(tamperedSig) === null,
  );

  // Tampered body
  const [, sig] = token.split('.');
  assert(
    'verifyWidgetToken rejects tampered body',
    verifyWidgetToken('aGFja2VkLWJvZHk.' + sig) === null,
  );

  // Expired token (ttl = -1 so it expired 1s ago)
  const expired = signWidgetToken({ agentId: 'a', origin: 'https://example.com' }, -1);
  assert('verifyWidgetToken rejects expired token', verifyWidgetToken(expired) === null);

  // Non-string input
  assert('verifyWidgetToken rejects non-string input', verifyWidgetToken(123) === null);
  assert('verifyWidgetToken rejects missing dot', verifyWidgetToken('no-dot-here') === null);
}

if (failures > 0) {
  console.error(`\n❌ ${failures} assertion(s) failed`);
  process.exit(1);
} else {
  console.log('\n✅ All Phase 2 crypto / HMAC / widget-token checks passed');
}
