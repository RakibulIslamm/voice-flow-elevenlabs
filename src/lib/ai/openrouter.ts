import 'server-only';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { env } from '@/lib/env';

/**
 * Platform-side OpenRouter client. Used for Claude summarisation +
 * any other server-only Claude call we run on VoiceFlow's dime.
 * Customer ElevenLabs usage is BYOK — this is NOT.
 *
 * Lazy singleton: env.OPENROUTER_API_KEY can be missing in dev (env
 * validation is soft), so we only construct the client at first use
 * and surface a clear error if the key isn't configured.
 */
let _client: ReturnType<typeof createOpenRouter> | null = null;

export function getOpenRouter() {
  if (_client) return _client;
  if (!env.OPENROUTER_API_KEY) {
    throw new Error(
      'OPENROUTER_API_KEY is not configured. Set it in your environment to enable post-call summaries.',
    );
  }
  _client = createOpenRouter({
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: env.OPENROUTER_BASE_URL || undefined,
  });
  return _client;
}

/**
 * Default summary model. Sonnet 4.6 is the sweet spot for quality and
 * latency on short transcript summaries. Bump to Opus only if customers
 * complain about quality on very long calls.
 */
export const SUMMARY_MODEL_ID = 'anthropic/claude-sonnet-4.6';

/**
 * USD per million tokens for SUMMARY_MODEL_ID. Used to estimate per-call
 * platform cost for analytics. Numbers below match Anthropic's published
 * Sonnet pricing as of writing — bump if the SDK ever reports a different
 * model in the response metadata.
 */
export const PRICE_PER_MILLION = {
  input: 3.0,
  output: 15.0,
} as const;
