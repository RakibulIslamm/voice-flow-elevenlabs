import { z } from 'zod';

/**
 * Env validation is intentionally SOFT: missing/invalid vars are logged once,
 * but the app continues to boot. Code that actually uses a missing var will
 * fail at the call-site (eg. Mongo connect throws, Stripe SDK throws). This
 * lets you work on UI/scaffolding before every integration is configured.
 *
 * Types stay strict for ergonomics — at runtime, any field whose schema failed
 * will be `undefined`. Treat the typed contract as "must be set before that
 * feature is used", not "guaranteed present at module load".
 */

const serverSchema = z.object({
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  AUTH_GOOGLE_ID: z.string().min(1, 'AUTH_GOOGLE_ID is required'),
  AUTH_GOOGLE_SECRET: z.string().min(1, 'AUTH_GOOGLE_SECRET is required'),
  AUTH_RESEND_KEY: z.string().min(1, 'AUTH_RESEND_KEY is required'),
  RESEND_FROM_EMAIL: z.email('RESEND_FROM_EMAIL must be a valid email'),
  ELEVENLABS_API_KEY: z.string().min(1, 'ELEVENLABS_API_KEY is required'),
  ELEVENLABS_WEBHOOK_SECRET: z
    .string()
    .min(16, 'ELEVENLABS_WEBHOOK_SECRET must be at least 16 characters'),
  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required'),
  OPENROUTER_BASE_URL: z.url('OPENROUTER_BASE_URL must be a valid URL'),
  STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
  STRIPE_WEBHOOK_SECRET: z.string().min(1, 'STRIPE_WEBHOOK_SECRET is required'),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),
  WIDGET_SIGNING_SECRET: z
    .string()
    .min(32, 'WIDGET_SIGNING_SECRET must be at least 32 characters'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url('NEXT_PUBLIC_APP_URL must be a valid URL'),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z
    .string()
    .min(1, 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required'),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

const isServer = typeof window === 'undefined';

const clientRaw = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
};

const clientParsed = clientSchema.safeParse(clientRaw);
const serverParsed = isServer ? serverSchema.safeParse(process.env) : null;

// Collect any validation issues and log them ONCE per process (don't crash).
const issues: string[] = [];
if (serverParsed && !serverParsed.success) {
  for (const i of serverParsed.error.issues) {
    issues.push(`  • ${i.path.join('.') || '(root)'}: ${i.message}`);
  }
}
if (!clientParsed.success) {
  for (const i of clientParsed.error.issues) {
    issues.push(`  • ${i.path.join('.') || '(root)'}: ${i.message}`);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __voiceflowEnvWarned: boolean | undefined;
}

if (issues.length > 0 && !globalThis.__voiceflowEnvWarned) {
  globalThis.__voiceflowEnvWarned = true;
  const scope = isServer ? 'server' : 'client';
  console.warn(
    `\n⚠️  VoiceFlow env (${scope}) — missing or invalid values (app will boot, but features using these will fail at use-site):\n` +
      issues.join('\n') +
      `\n   Fix in .env.local (see .env.example).\n`,
  );
}

/**
 * Typed env object. Fields are typed as required for ergonomics, but at
 * runtime any field whose validation failed is `undefined`. Touch a missing
 * field only inside the feature that needs it — that feature will throw with
 * a useful error from the underlying SDK.
 */
export const env: ServerEnv & ClientEnv = {
  ...(process.env as unknown as ServerEnv),
  ...(serverParsed?.success ? serverParsed.data : ({} as ServerEnv)),
  ...(clientParsed.success ? clientParsed.data : (clientRaw as unknown as ClientEnv)),
};
