'use server';

import { z } from 'zod';
import { Types } from 'mongoose';
import twilio from 'twilio';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { safeAction } from '@/lib/safe-action';
import { requireUser } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import {
  User,
  type ElevenLabsAccountInfo,
  type UserDoc,
} from '@/lib/db/models/user';
import { Agent } from '@/lib/db/models/agent';
import { encrypt } from '@/lib/crypto';
import { env } from '@/lib/env';
import {
  AppError,
  InvalidCredentialError,
  ExternalServiceError,
  QuotaExceededError,
} from '@/lib/errors';
import { getAccountInfo } from '@/lib/elevenlabs/account';
import { requireElevenLabsConnection } from '@/lib/elevenlabs/require';
import {
  clearPhoneNumberWebhook,
  getUserTwilioClient,
  listUserPhoneNumbers,
  type UserPhoneNumber,
} from '@/lib/twilio/user-client';
import { trackEvent } from '@/lib/tracking/event';

/**
 * BYOK: paste-and-verify flow.
 *
 * We deliberately construct an ad-hoc `ElevenLabsClient` here instead of
 * using `getElevenLabsClient()` — the factory requires an existing
 * connection, but at this point the user hasn't been saved yet. We probe
 * with the proposed key, abort on 401, then encrypt + persist only on a
 * verified success.
 */
const connectSchema = z.object({
  apiKey: z.string().trim().min(20, 'API key looks too short. Double-check and try again.'),
});

export const connectElevenLabs = safeAction(connectSchema, async ({ apiKey }) => {
  const session = await requireUser();
  const userId = session.user.id;

  // 0. Fail fast if the server isn't configured to encrypt secrets. We
  //    check BEFORE calling ElevenLabs so the user doesn't waste a key
  //    verification on a server that can't persist the result.
  ensureEncryptionConfigured();

  // 1. Verify the key by reading the subscription endpoint.
  const account = await verifyAndFetchAccount(apiKey);

  // 2. Encrypt and persist atomically.
  await connectDb();
  const encryptedApiKey = safeEncrypt(apiKey);
  const apiKeyPreview = buildKeyPreview(apiKey);
  const now = new Date();

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        'integrations.elevenlabs.enabled': true,
        'integrations.elevenlabs.encryptedApiKey': encryptedApiKey,
        'integrations.elevenlabs.apiKeyPreview': apiKeyPreview,
        'integrations.elevenlabs.connectedAt': now,
        'integrations.elevenlabs.verifiedAt': now,
        'integrations.elevenlabs.accountInfo': account,
      },
    },
  );

  // 3. Track (never throws).
  void trackEvent('integration.elevenlabs.connected', {
    userId,
    properties: { tier: account.tier },
  });

  return { ok: true as const, accountInfo: account };
});

/**
 * Re-verifies an existing connection and refreshes the cached account
 * info. Powers the "Refresh status" button on the Integrations card.
 */
const noInput = z.object({}).optional();
export const testElevenLabsConnection = safeAction(noInput, async () => {
  const session = await requireUser();
  const userId = session.user.id;

  // Throws IntegrationDisconnectedError if not connected — safeAction
  // translates that into a clean error result.
  await requireElevenLabsConnection(userId);

  let account: ElevenLabsAccountInfo;
  try {
    const info = await getAccountInfo(userId);
    account = {
      tier: info.tier,
      characterLimit: info.characterLimit,
      charactersUsed: info.charactersUsed,
    };
  } catch (e) {
    // ExternalServiceError leaks the SDK message — re-throw with a
    // friendlier, BYOK-specific public message instead.
    if (e instanceof ExternalServiceError) {
      throw new InvalidCredentialError(
        'ElevenLabs',
        'Your ElevenLabs API key seems invalid or expired. Please reconnect.',
      );
    }
    throw e;
  }

  await connectDb();
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        'integrations.elevenlabs.verifiedAt': new Date(),
        'integrations.elevenlabs.accountInfo': account,
      },
    },
  );

  return { ok: true as const, accountInfo: account };
});

/**
 * Saves the ElevenLabs-generated post-call webhook secret to the user's
 * integration. ElevenLabs generates this server-side when the webhook is
 * created in their dashboard — the user copies it from ElevenLabs into
 * VoiceFlow. We encrypt at rest, decrypt only inside the webhook
 * handler when verifying the HMAC signature.
 *
 * We don't have a way to *test* the secret here (you can only verify it
 * against an actual signed payload), so this action is pure save.
 */
const webhookSecretSchema = z.object({
  webhookSecret: z
    .string()
    .trim()
    .min(16, 'Webhook secret looks too short. ElevenLabs secrets are 32+ characters.'),
});

export const setElevenLabsWebhookSecret = safeAction(webhookSecretSchema, async ({ webhookSecret }) => {
  const session = await requireUser();
  const userId = session.user.id;

  ensureEncryptionConfigured();

  // The user must already have an API key on file — webhook secrets only
  // matter once the account is otherwise wired up.
  await requireElevenLabsConnection(userId);

  await connectDb();
  const encryptedWebhookSecret = safeEncrypt(webhookSecret);
  const webhookSecretPreview = `...${webhookSecret.slice(-4)}`;

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        'integrations.elevenlabs.encryptedWebhookSecret': encryptedWebhookSecret,
        'integrations.elevenlabs.webhookSecretPreview': webhookSecretPreview,
        'integrations.elevenlabs.webhookConfiguredAt': new Date(),
      },
    },
  );

  void trackEvent('integration.elevenlabs.webhook-secret-set', { userId });

  return { ok: true as const, webhookSecretPreview };
});

export const removeElevenLabsWebhookSecret = safeAction(noInput, async () => {
  const session = await requireUser();
  const userId = session.user.id;

  await connectDb();
  await User.updateOne(
    { _id: userId },
    {
      $unset: {
        'integrations.elevenlabs.encryptedWebhookSecret': '',
        'integrations.elevenlabs.webhookSecretPreview': '',
        'integrations.elevenlabs.webhookConfiguredAt': '',
      },
    },
  );

  void trackEvent('integration.elevenlabs.webhook-secret-removed', { userId });

  return { ok: true as const };
});

/**
 * Disconnect = clear the API key and pause every agent that depends on
 * it. We deliberately do NOT delete the agents from the user's
 * ElevenLabs account — they may reconnect later and want to reuse them.
 *
 * If Twilio is connected, phone-enabled agents lose their channel too
 * (the bridge needs ElevenLabs), but Twilio itself stays connected.
 */
export const disconnectElevenLabs = safeAction(noInput, async () => {
  const session = await requireUser();
  const userId = session.user.id;

  await connectDb();

  await Agent.updateMany(
    { userId },
    {
      $set: {
        status: 'paused',
        'channels.phone.enabled': false,
      },
    },
  );

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        'integrations.elevenlabs.enabled': false,
      },
      $unset: {
        'integrations.elevenlabs.encryptedApiKey': '',
        'integrations.elevenlabs.apiKeyPreview': '',
        'integrations.elevenlabs.verifiedAt': '',
        'integrations.elevenlabs.accountInfo': '',
        'integrations.elevenlabs.encryptedWebhookSecret': '',
        'integrations.elevenlabs.webhookSecretPreview': '',
        'integrations.elevenlabs.webhookConfiguredAt': '',
      },
    },
  );

  void trackEvent('integration.elevenlabs.disconnected', { userId });

  return { ok: true as const };
});

// ---------------------------------------------------------------------------
// Twilio (Phase 12)
// ---------------------------------------------------------------------------

/**
 * Plans that may connect Twilio. Free + starter are gated behind the
 * paywall — the dialog hides the connect button in those cases too, but
 * we enforce server-side as defence-in-depth.
 */
const PHONE_PLANS = new Set<UserDoc['plan']>(['pro', 'business']);

const twilioConnectSchema = z.object({
  accountSid: z
    .string()
    .trim()
    .regex(/^AC[a-f0-9]{32}$/i, 'Account SID must start with AC followed by 32 hex characters.'),
  authToken: z
    .string()
    .trim()
    .min(20, 'Auth Token looks too short. Copy it from Twilio Console → API keys & tokens.'),
});

export const connectTwilio = safeAction(twilioConnectSchema, async ({ accountSid, authToken }) => {
  const session = await requireUser();
  const userId = session.user.id;

  ensureEncryptionConfigured();

  await connectDb();
  // Plan check — server-side defence in depth. The UI also hides the
  // button for free/starter, but we never trust client-side gating.
  const user = await User.findById(userId).select('plan').lean<Pick<UserDoc, 'plan'> | null>();
  if (!user) {
    throw new InvalidCredentialError('VoiceFlow', 'Account not found.');
  }
  if (!PHONE_PLANS.has(user.plan)) {
    throw new QuotaExceededError(
      'Phone calling requires Pro plan or above. Please upgrade in Billing.',
    );
  }

  // Verify creds by hitting Twilio's Account.fetch endpoint. This is the
  // standard "is this account live and is this token valid?" probe — it
  // returns the account name + status, which we also surface to the user
  // post-connect as confirmation we hit the right account.
  await verifyTwilioCreds(accountSid, authToken);

  const encryptedCreds = safeEncrypt(JSON.stringify({ accountSid, authToken }));
  const accountSidPreview = `...${accountSid.slice(-4)}`;
  const now = new Date();

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        'integrations.twilio.enabled': true,
        'integrations.twilio.encryptedCreds': encryptedCreds,
        'integrations.twilio.accountSidPreview': accountSidPreview,
        'integrations.twilio.connectedAt': now,
        'integrations.twilio.verifiedAt': now,
      },
    },
  );

  void trackEvent('integration.twilio.connected', { userId });

  return { ok: true as const, accountSidPreview };
});

export const testTwilioConnection = safeAction(noInput, async () => {
  const session = await requireUser();
  const userId = session.user.id;

  // Touch the SDK with the stored creds — proves the auth token still
  // works (Twilio can rotate it from their console) and refreshes the
  // verifiedAt timestamp so the UI doesn't show a stale "last verified"
  // forever.
  let client;
  try {
    client = await getUserTwilioClient(userId);
  } catch (e) {
    if (e instanceof Error && e.name === 'IntegrationDisconnectedError') throw e;
    throw e;
  }

  try {
    const account = await client.api.v2010.accounts(client.accountSid).fetch();
    if (account.status !== 'active') {
      throw new InvalidCredentialError(
        'Twilio',
        `Your Twilio account is "${account.status}" — please reactivate it in the Twilio console.`,
      );
    }
  } catch (e) {
    if (isTwilioAuthError(e)) {
      throw new InvalidCredentialError(
        'Twilio',
        'Your Twilio Auth Token seems invalid or rotated. Please reconnect.',
      );
    }
    if (e instanceof InvalidCredentialError) throw e;
    throw new ExternalServiceError(
      'Twilio',
      e instanceof Error ? e.message : undefined,
      'Could not reach Twilio to verify your credentials. Please try again.',
    );
  }

  await connectDb();
  await User.updateOne(
    { _id: userId },
    { $set: { 'integrations.twilio.verifiedAt': new Date() } },
  );

  return { ok: true as const };
});

/**
 * Returns the user's Twilio phone numbers — used by the integration
 * detail page and the per-agent phone picker. We also annotate each
 * number with the agent (if any) currently assigned to it, so the UI
 * can show "assigned to {agent}" inline.
 */
export const listTwilioPhoneNumbers = safeAction(noInput, async () => {
  const session = await requireUser();
  const userId = session.user.id;

  const numbers = await listUserPhoneNumbers(userId);

  await connectDb();
  // Look up which numbers are assigned to this user's agents so we can
  // tag them in the UI. One query for all SIDs.
  const sids = numbers.map((n) => n.sid);
  type AssignedAgent = {
    _id: Types.ObjectId;
    name: string;
    channels?: { phone?: { twilioPhoneNumberSid?: string } };
  };
  const agents: AssignedAgent[] = sids.length
    ? await Agent.find({
        userId,
        'channels.phone.twilioPhoneNumberSid': { $in: sids },
      })
        .select('_id name channels.phone.twilioPhoneNumberSid')
        .lean<AssignedAgent[]>()
    : [];
  const bySid = new Map<string, { agentId: string; agentName: string }>();
  for (const a of agents) {
    const sid = a.channels?.phone?.twilioPhoneNumberSid;
    if (sid) bySid.set(sid, { agentId: a._id.toString(), agentName: a.name });
  }

  const enriched: Array<UserPhoneNumber & { assignedAgent: { id: string; name: string } | null }> =
    numbers.map((n) => ({
      ...n,
      assignedAgent: bySid.get(n.sid) ? { id: bySid.get(n.sid)!.agentId, name: bySid.get(n.sid)!.agentName } : null,
    }));

  return { ok: true as const, numbers: enriched };
});

/**
 * Disconnect Twilio. We deliberately tear down any phone-enabled agents
 * first — the bridge needs Twilio creds, so leaving them "enabled" would
 * silently fail every inbound call until the user notices.
 *
 * Webhook clears are best-effort. If Twilio's API is unreachable the
 * disconnect still succeeds locally; the worst case is an orphan webhook
 * URL that points at our server and gets gracefully rejected by the
 * incoming handler when the agent isn't active.
 */
export const disconnectTwilio = safeAction(noInput, async () => {
  const session = await requireUser();
  const userId = session.user.id;

  await connectDb();

  // Find phone-enabled agents BEFORE we tear down creds — the webhook
  // clear needs the Twilio client and the client needs the creds.
  const phoneAgents = await Agent.find({
    userId,
    'channels.phone.enabled': true,
  })
    .select('_id channels.phone.twilioPhoneNumberSid')
    .lean<Array<{ _id: Types.ObjectId; channels: { phone: { twilioPhoneNumberSid?: string } } }>>();

  // Best-effort webhook clears in parallel.
  await Promise.allSettled(
    phoneAgents.map(async (a) => {
      const sid = a.channels?.phone?.twilioPhoneNumberSid;
      if (sid) await clearPhoneNumberWebhook(userId, sid);
    }),
  );

  // Disable phone channel on every affected agent in one query.
  if (phoneAgents.length > 0) {
    await Agent.updateMany(
      { _id: { $in: phoneAgents.map((a) => a._id) } },
      {
        $set: { 'channels.phone.enabled': false },
        $unset: {
          'channels.phone.twilioPhoneNumberSid': '',
          'channels.phone.twilioPhoneNumber': '',
        },
      },
    );
  }

  // Then clear the user's Twilio integration.
  await User.updateOne(
    { _id: userId },
    {
      $set: { 'integrations.twilio.enabled': false },
      $unset: {
        'integrations.twilio.encryptedCreds': '',
        'integrations.twilio.accountSidPreview': '',
        'integrations.twilio.verifiedAt': '',
      },
    },
  );

  void trackEvent('integration.twilio.disconnected', {
    userId,
    properties: { agentsAffected: phoneAgents.length },
  });

  return { ok: true as const, agentsDisabled: phoneAgents.length };
});

async function verifyTwilioCreds(accountSid: string, authToken: string): Promise<void> {
  let client: ReturnType<typeof twilio>;
  try {
    client = twilio(accountSid, authToken);
  } catch {
    throw new InvalidCredentialError(
      'Twilio',
      'Invalid Twilio Account SID. Please verify and try again.',
    );
  }
  try {
    const account = await client.api.v2010.accounts(accountSid).fetch();
    if (account.status === 'closed' || account.status === 'suspended') {
      throw new InvalidCredentialError(
        'Twilio',
        `Your Twilio account is "${account.status}". Reactivate it in the Twilio console first.`,
      );
    }
  } catch (e) {
    if (e instanceof InvalidCredentialError) throw e;
    if (isTwilioAuthError(e)) {
      throw new InvalidCredentialError(
        'Twilio',
        'Invalid Twilio Auth Token. Please verify and try again.',
      );
    }
    throw new ExternalServiceError(
      'Twilio',
      e instanceof Error ? e.message : undefined,
      'Could not reach Twilio. Please try again.',
    );
  }
}

function isTwilioAuthError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const r = e as Record<string, unknown>;
  if (r.status === 401 || r.status === 403) return true;
  if (typeof r.message === 'string' && /authenticate|invalid.*token|unauthori[sz]ed/i.test(r.message)) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function verifyAndFetchAccount(apiKey: string): Promise<ElevenLabsAccountInfo> {
  let client: ElevenLabsClient;
  try {
    client = new ElevenLabsClient({ apiKey });
  } catch {
    throw new InvalidCredentialError(
      'ElevenLabs',
      'Invalid ElevenLabs API key. Please verify and try again.',
    );
  }

  try {
    const sub = await client.user.subscription.get();
    const tier = (asString(sub, 'tier') ?? 'free') as string;
    const characterLimit = asNumber(sub, 'character_limit') ?? asNumber(sub, 'characterLimit') ?? 0;
    const charactersUsed = asNumber(sub, 'character_count') ?? asNumber(sub, 'charactersUsed') ?? 0;
    return { tier, characterLimit, charactersUsed };
  } catch (e) {
    if (isAuthError(e)) {
      throw new InvalidCredentialError(
        'ElevenLabs',
        'Invalid ElevenLabs API key. Please verify and try again.',
      );
    }
    throw new ExternalServiceError(
      'ElevenLabs',
      e instanceof Error ? e.message : undefined,
      'Could not reach ElevenLabs to verify your account. Please try again.',
    );
  }
}

function buildKeyPreview(apiKey: string): string {
  const tail = apiKey.slice(-4);
  return `...${tail}`;
}

/**
 * Public message users actually see in production. Generic on purpose —
 * server config issues never leak to the UI. The dev-friendly version
 * with the actual env var name lives behind NODE_ENV === 'development'.
 */
const GENERIC_CONFIG_MESSAGE = 'Service is temporarily unavailable. Please try again later.';

function isDev(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Refuse to start the connect/save flow if the server can't encrypt
 * secrets. Without this we'd hit ElevenLabs successfully, then throw a
 * cryptic "Invalid key length" from `crypto.createCipheriv` that
 * `safeAction` surfaces as the unhelpful "Something went wrong" code
 * `INTERNAL_ERROR`. In production this branch never fires because the
 * env validator + deploy checks ensure `ENCRYPTION_KEY` is set — and if
 * it ever does fire, the user sees a generic message while the full
 * technical detail goes to `console.error` + the ErrorLog collection
 * via safeAction.
 */
function ensureEncryptionConfigured(): void {
  const key = env.ENCRYPTION_KEY;
  if (key && /^[0-9a-f]{64}$/i.test(key)) return;

  const techDetail =
    'ENCRYPTION_KEY is missing or not 64 hex characters. ' +
    'Generate one with `openssl rand -hex 32` and set it in .env.local before restarting.';

  // Always log the technical reason — surfaces in the server terminal AND
  // gets persisted to ErrorLog via safeAction's `logError` (statusCode 500).
  console.error('[CONFIGURATION_ERROR]', techDetail);

  throw new AppError({
    code: 'CONFIGURATION_ERROR',
    statusCode: 500,
    publicMessage: isDev() ? techDetail : GENERIC_CONFIG_MESSAGE,
  });
}

/**
 * Wraps `encrypt()` so a malformed key surfaces as a clean AppError
 * instead of a raw Node crypto exception. The pre-check above catches
 * the common case; this catches the rest (e.g. a key that's 64 hex
 * chars but somehow rejected at runtime).
 */
function safeEncrypt(plaintext: string): string {
  try {
    return encrypt(plaintext);
  } catch (e) {
    const techDetail = `encrypt() failed: ${e instanceof Error ? e.message : 'unknown error'}`;
    console.error('[CONFIGURATION_ERROR]', techDetail);
    throw new AppError({
      code: 'CONFIGURATION_ERROR',
      statusCode: 500,
      publicMessage: isDev()
        ? `${techDetail}. Check ENCRYPTION_KEY in .env.local.`
        : GENERIC_CONFIG_MESSAGE,
    });
  }
}

function asString(o: unknown, k: string): string | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const v = (o as Record<string, unknown>)[k];
  return typeof v === 'string' ? v : undefined;
}

function asNumber(o: unknown, k: string): number | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const v = (o as Record<string, unknown>)[k];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function isAuthError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const r = e as Record<string, unknown>;
  if (r.statusCode === 401 || r.status === 401) return true;
  if (typeof r.message === 'string' && /unauthori[sz]ed|invalid.*api.*key|401/i.test(r.message)) {
    return true;
  }
  return false;
}
