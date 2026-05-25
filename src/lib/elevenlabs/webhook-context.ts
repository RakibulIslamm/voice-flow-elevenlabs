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

/**
 * Validates an inbound ElevenLabs webhook (post-call or tool) end-to-end:
 *
 *   1. Reads the raw body (required — JSON parsing would re-serialise
 *      and the HMAC wouldn't match)
 *   2. Loosely parses to extract `agent_id` (and `conversation_id` if
 *      present) so we can find the owning user
 *   3. Loads the agent + user from Mongo
 *   4. Decrypts the user's per-agent webhook secret (set when they pasted
 *      it from their ElevenLabs dashboard in Phase 7)
 *   5. Verifies the HMAC signature against the raw body
 *   6. Returns the loaded doc handles for the handler to act on
 *
 * Returns a discriminated result so callers can short-circuit cleanly.
 * Any 401 is logged at debug-level only — webhook signature failures
 * are common during initial setup and we don't want to flood Sentry.
 */
export async function verifyAndLoadContext(req: NextRequest): Promise<VerifyResult> {
  const rawBody = await req.text();
  if (!rawBody) {
    return { ok: false, status: 400, code: 'EMPTY_BODY', message: 'Empty request body.' };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { ok: false, status: 400, code: 'INVALID_JSON', message: 'Body is not valid JSON.' };
  }

  // ElevenLabs's signing header is lowercased on the wire; NextRequest
  // headers.get() is case-insensitive but we keep the canonical form
  // visible in source for grep-ability.
  const signature =
    req.headers.get('elevenlabs-signature') ?? req.headers.get('x-elevenlabs-signature');

  // Extract agent_id from the payload — try common locations. The
  // post-call webhook nests data under `data`; tool webhooks pass tool
  // parameters at the top level but ElevenLabs forwards `agent_id` and
  // `conversation_id` as headers AND sometimes in the body envelope.
  const agentId =
    pickString(payload, 'agent_id') ??
    pickString((payload.data ?? {}) as Record<string, unknown>, 'agent_id') ??
    req.headers.get('elevenlabs-agent-id') ??
    req.headers.get('x-elevenlabs-agent-id');

  const conversationId =
    pickString(payload, 'conversation_id') ??
    pickString((payload.data ?? {}) as Record<string, unknown>, 'conversation_id') ??
    req.headers.get('elevenlabs-conversation-id') ??
    req.headers.get('x-elevenlabs-conversation-id');

  if (!agentId) {
    return {
      ok: false,
      status: 400,
      code: 'MISSING_AGENT_ID',
      message: 'Could not find agent_id in payload or headers.',
    };
  }

  await connectDb();

  const agent = await Agent.findOne({ elevenLabsAgentId: agentId });
  if (!agent) {
    // Could legitimately happen if the agent was deleted in VoiceFlow
    // but the ElevenLabs side wasn't cleaned up. Log low-severity and
    // 404 quietly so ElevenLabs stops retrying.
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
    void logError(e, { scope: 'webhook-context', stage: 'decrypt', userId: user._id.toString() });
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

  return {
    ok: true,
    ctx: {
      rawBody,
      payload,
      conversationId,
      agent,
      user,
    },
  };
}

function pickString(obj: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}
