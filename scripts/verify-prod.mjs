#!/usr/bin/env node
/**
 * Smoke test the production build. Builds, starts `next start`, probes the
 * routes that prove our boundaries fire correctly, then kills the server.
 * Run with: `pnpm verify:prod`
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = process.env.VERIFY_PORT ?? '3100';
const BASE = `http://localhost:${PORT}`;

let failures = 0;

function log(ok, label, detail) {
  const mark = ok ? '✓' : '✗';
  if (!ok) failures++;
  console.log(`${mark} ${label}${detail ? `  — ${detail}` : ''}`);
}

async function probe(path, expectedStatus) {
  try {
    const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
    log(res.status === expectedStatus, `GET ${path} → ${expectedStatus}`, `got ${res.status}`);
    return res;
  } catch (e) {
    log(false, `GET ${path} → ${expectedStatus}`, `fetch failed: ${e.message}`);
    return null;
  }
}

async function probeHeaders() {
  try {
    const res = await fetch(BASE);
    const required = [
      ['strict-transport-security', /max-age=/],
      ['x-content-type-options', /nosniff/i],
      ['referrer-policy', /strict-origin-when-cross-origin/i],
      ['x-frame-options', /DENY/i],
      ['permissions-policy', /microphone/i],
    ];
    for (const [name, pattern] of required) {
      const value = res.headers.get(name);
      log(value !== null && pattern.test(value), `header: ${name}`, value ?? 'missing');
    }
  } catch (e) {
    log(false, 'security headers probe', e.message);
  }
}

async function main() {
  console.log('\n→ Building...');
  await run('pnpm', ['build']);

  console.log(`\n→ Starting next start on :${PORT}`);
  const server = spawn('pnpm', ['exec', 'next', 'start', '--port', PORT], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, MallocNanoZone: '' },
  });

  try {
    await waitForReady(server, 30_000);

    console.log('\n→ Probing routes...');
    await probe('/', 200);
    await probe('/asdf', 404);

    console.log('\n→ Probing security headers...');
    await probeHeaders();
  } finally {
    server.kill('SIGTERM');
    await sleep(500);
    if (!server.killed) server.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n❌ ${failures} verification(s) failed`);
    process.exit(1);
  }
  console.log('\n✅ Production build serves cleanly + all security headers present');
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, MallocNanoZone: '' } });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

function waitForReady(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      buffer += text;
      if (/Ready|started server/i.test(buffer)) resolve();
      if (Date.now() > deadline) reject(new Error('timeout waiting for next start'));
    });
    child.on('exit', (code) => reject(new Error(`server exited before ready (code=${code})`)));
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
