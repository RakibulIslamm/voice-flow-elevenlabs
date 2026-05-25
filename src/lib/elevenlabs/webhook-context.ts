import 'server-only';
import type { NextRequest } from 'next/server';
import type { HydratedDocument } from 'mongoose';
import { Agent, type AgentDoc } from '@/lib/db/models/agent';
import { User, type UserDoc } from '@/lib/db/models/user';
import { connectDb } from '@/lib/db/connect';
import { decrypt } from '@/lib/crypto';
import { verifyElevenLabsSignature } from './verify-signature';
import { logError } from '@/lib/tracking/log-error';

/**
 * Common shape we hand to webhook + tool handlers after verifying the
 * HMAC signature. `agent` and `user` are HYDRATED Mongoose documents
 * so the handler can `.save()` directly without re-fetching.
 */
export type HydratedAgent = HydratedDocument<AgentDoc>;
export type HydratedUser = HydratedDocument<UserDoc>;

export type WebhookContext = {
  rawBody: string;
  payload: Record<string, unknown>;
  /** The ElevenLabs conversation id (`conversation_id` in the payload), or null if missing. */
  conversationId: string | null;
  agent: HydratedAgent;
  user: HydratedUser;
};

export type VerifyResult =
  | { ok: true; ctx: WebhookContext }
  | { ok: false; status: number; code: string; message: string };

type LoadOptions = {
  /**
   * Whether to enforce HMAC signature verification.
   *   - `true`  — post-call/personalization webhooks (ElevenLabs signs these).
   *   - `false` — tool webhooks (ElevenLabs does NOT sign these; we rely on
   *               the agent_id lookup + unguessable URL for authorisation).
   */
  requireSignature: boolean;
};

/**
 * Shared loader: reads body, extracts `agent_id` + `conversation_id` from
 * (in order) query params → body → nested body.data → headers, then loads
 * the agent + user. Optionally verifies the HMAC signature.
 *
 * Returns a discriminated result so callers can short-circuit cleanly.
 */
async function load(req: NextRequest, options: LoadOptions): Promise<VerifyResult> {
  const rawBody = await req.text();
  // Tool calls may legitimately POST with an empty body if the tool has
  // no required parameters — only treat empty as fatal when we expect a
  // signed envelope (post-call payloads always have content).
  if (!rawBody && options.requireSignature) {
    return { ok: false, status: 400, code: 'EMPTY_BODY', message: 'Empty request body.' };
  }

  let payload: Record<string, unknown> = {};
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { ok: false, status: 400, code: 'INVALID_JSON', message: 'Body is not valid JSON.' };
    }
  }

  const url = req.nextUrl;
  const agentId =
    url.searchParams.get('agent_id') ||
    pickString(payload, 'agent_id') ||
    pickString((payload.data ?? {}) as Record<string, unknown>, 'agent_id') ||
    req.headers.get('elevenlabs-agent-id') ||
    req.headers.get('x-elevenlabs-agent-id');

  const conversationId =
    url.searchParams.get('conversation_id') ||
    pickString(payload, 'conversation_id') ||
    pickString((payload.data ?? {}) as Record<string, unknown>, 'conversation_id') ||
    req.headers.get('elevenlabs-conversation-id') ||
    req.headers.get('x-elevenlabs-conversation-id');

  if (!agentId) {
    return {
      ok: false,
      status: 400,
      code: 'MISSING_AGENT_ID',
      message: 'Could not find agent_id in payload, query params, or headers.',
    };
  }

  await connectDb();

  const agent = await Agent.findOne({ elevenLabsAgentId: agentId });
  if (!agent) {
    void logError(
      new Error('Webhook for unknown agent'),
      { scope: 'webhook-context', agentId },
      { severity: 'low' },
    );
    return { ok: false, status: 404, code: 'AGENT_NOT_FOUND', message: 'Agent not found.' };
  }

  const user = await User.findById(agent.userId);
  if (!user) {
    return { ok: false, status: 404, code: 'OWNER_NOT_FOUND', message: 'Agent owner missing.' };
  }

  if (options.requireSignature) {
    const signature =
      req.headers.get('elevenlabs-signature') ?? req.headers.get('x-elevenlabs-signature');

    const encrypted = user.integrations?.elevenlabs?.encryptedWebhookSecret;
    if (!encrypted) {
      return {
        ok: false,
        status: 412,
        code: 'WEBHOOK_NOT_CONFIGURED',
        message: 'Agent owner has not configured a webhook secret.',
      };
    }

    let secret: string;
    try {
      secret = decrypt(encrypted);
    } catch (e) {
      void logError(e, {
        scope: 'webhook-context',
        stage: 'decrypt',
        userId: user._id.toString(),
      });
      return {
        ok: false,
        status: 500,
        code: 'SECRET_DECRYPT_FAILED',
        message: 'Internal configuration error.',
      };
    }

    if (!verifyElevenLabsSignature(rawBody, signature, secret)) {
      return {
        ok: false,
        status: 401,
        code: 'INVALID_SIGNATURE',
        message: 'Signature verification failed.',
      };
    }
  }

  return {
    ok: true,
    ctx: { rawBody, payload, conversationId, agent, user },
  };
}

/**
 * Validates an inbound ElevenLabs **post-call** webhook end-to-end with
 * HMAC signature verification against the user's per-agent secret.
 */
export async function verifyAndLoadContext(req: NextRequest): Promise<VerifyResult> {
  return load(req, { requireSignature: true });
}

/**
 * Loads context for a **tool** webhook (no HMAC required — ElevenLabs
 * doesn't sign tool calls). Authorisation comes from the `agent_id` we
 * embed in the tool URL via `{{system__agent_id}}`, which ElevenLabs
 * substitutes at runtime. The URL itself is private to the agent owner.
 */
export async function loadToolContext(req: NextRequest): Promise<VerifyResult> {
  return load(req, { requireSignature: false });
}

function pickString(obj: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}
