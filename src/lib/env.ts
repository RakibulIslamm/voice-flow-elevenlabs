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
  // VoiceFlow is BYOK ElevenLabs end-to-end. The platform holds NO master
  // ElevenLabs values:
  //   • API key — user supplies via the Integrations page (encrypted).
  //   • Webhook secret — ElevenLabs generates one per user when they create
  //     the post-call webhook in their dashboard. User copies it into
  //     VoiceFlow's Integrations page (encrypted). Verified per-user inside
  //     the webhook handler via `verifyElevenLabsSignature(body, sig, secret)`.
  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required'),
  OPENROUTER_BASE_URL: z.url('OPENROUTER_BASE_URL must be a valid URL'),
  // Billing provider switch — when `true`, the unified billing routes
  // hit Polar; otherwise Stripe. Stripe stays the default so existing
  // installs keep working without changes.
  POLAR_SDK: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
  // Polar (per-tier product IDs map to a single Polar Product each — Polar
  // bundles recurring + metered pricing under one product).
  POLAR_ACCESS_TOKEN: z.string().optional(),
  POLAR_WEBHOOK_SECRET: z.string().optional(),
  POLAR_SERVER: z.enum(['sandbox', 'production']).optional().default('sandbox'),
  POLAR_STARTER_PRODUCT_ID: z.string().optional(),
  POLAR_PRO_PRODUCT_ID: z.string().optional(),
  POLAR_BUSINESS_PRODUCT_ID: z.string().optional(),
  // Stripe is one of two billing providers; both sets are optional so
  // an install that only wires the active provider (`POLAR_SDK` switch)
  // doesn't get drowned in warnings about the inactive side.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // Per-plan recurring + metered overage price IDs. Stripe charges $0.005
  // per call on the metered side across all paid tiers — value-add of
  // higher tiers is included quota + features, not cheaper overage.
  STRIPE_STARTER_PRICE_ID: z.string().optional(),
  STRIPE_STARTER_OVERAGE_PRICE_ID: z.string().optional(),
  STRIPE_PRO_PRICE_ID: z.string().optional(),
  STRIPE_PRO_OVERAGE_PRICE_ID: z.string().optional(),
  STRIPE_BUSINESS_PRICE_ID: z.string().optional(),
  STRIPE_BUSINESS_OVERAGE_PRICE_ID: z.string().optional(),
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
  // Only required if you embed Stripe.js client-side. We currently
  // redirect server-side to the Checkout URL, so it's optional.
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
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

// POLAR_SDK MUST be a real boolean. When `serverParsed` falls back (any
// other required var failed validation), the spread above leaves it as
// the raw process.env string — and the string 'false' is truthy in JS,
// which would silently flip the whole app to Polar. Coerce explicitly:
// only the literal 'true' enables Polar. This runs regardless of
// validation success, so the provider switch is never a footgun.
(env as { POLAR_SDK: boolean }).POLAR_SDK = process.env.POLAR_SDK === 'true';
