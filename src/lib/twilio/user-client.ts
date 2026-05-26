import 'server-only';
import twilio, { type Twilio } from 'twilio';
import { Types } from 'mongoose';
import { connectDb } from '@/lib/db/connect';
import { User, type TwilioIntegration } from '@/lib/db/models/user';
import { decrypt } from '@/lib/crypto';
import { ExternalServiceError, IntegrationDisconnectedError } from '@/lib/errors';

/**
 * Plaintext Twilio creds, decrypted from `integrations.twilio.encryptedCreds`.
 * Held only for the duration of a single call — never logged, never returned
 * from a server action that could surface it to the browser.
 */
export type TwilioCreds = { accountSid: string; authToken: string };

/**
 * Returns the user's decrypted Twilio credentials. Use this when you need
 * the raw `authToken` (e.g. signature verification on inbound webhooks)
 * and not just a ready-made SDK client.
 *
 * Throws {@link IntegrationDisconnectedError} if Twilio isn't connected.
 */
export async function getUserTwilioCreds(userId: string): Promise<TwilioCreds> {
  if (!userId || !Types.ObjectId.isValid(userId)) {
    throw new IntegrationDisconnectedError(
      'Twilio',
      'Sign in again — your account ID is missing or malformed.',
    );
  }

  await connectDb();
  const user = await User.findById(userId)
    .select('integrations.twilio')
    .lean<{ integrations: { twilio: TwilioIntegration } } | null>();

  const integration = user?.integrations?.twilio;
  if (!integration?.enabled || !integration.encryptedCreds) {
    throw new IntegrationDisconnectedError('Twilio');
  }

  try {
    const payload = JSON.parse(decrypt(integration.encryptedCreds)) as TwilioCreds;
    if (!payload.accountSid || !payload.authToken) {
      throw new Error('Decrypted creds missing accountSid or authToken.');
    }
    return payload;
  } catch (e) {
    throw new ExternalServiceError(
      'Twilio',
      e instanceof Error
        ? `Could not decrypt Twilio creds: ${e.message}`
        : 'Could not decrypt Twilio creds.',
    );
  }
}

/**
 * Returns a Twilio SDK client wired with the user's BYOK credentials.
 * Use this for any Twilio REST call (number listing, webhook config,
 * account fetch, etc.).
 *
 * Throws if the user isn't connected. The client itself never throws on
 * construction — only on actual API calls — so wrap usage in try/catch
 * and surface {@link ExternalServiceError} when calls fail.
 */
export async function getUserTwilioClient(userId: string): Promise<Twilio> {
  const creds = await getUserTwilioCreds(userId);
  return twilio(creds.accountSid, creds.authToken);
}

export type UserPhoneNumber = {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
    fax: boolean;
  };
  voiceUrl: string | null;
  voiceMethod: string | null;
};

/**
 * Fetches the list of phone numbers in the user's Twilio account.
 * Lists are bounded to 50 — beyond that the UI should add pagination,
 * but for MVP the cap matches Twilio's default page size and matches the
 * spec.
 *
 * Errors thrown by Twilio (network, auth) surface as ExternalServiceError
 * so server actions can translate them via safeAction.
 */
export async function listUserPhoneNumbers(userId: string): Promise<UserPhoneNumber[]> {
  const client = await getUserTwilioClient(userId);
  try {
    const numbers = await client.incomingPhoneNumbers.list({ limit: 50 });
    return numbers.map((n) => ({
      sid: n.sid,
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName ?? n.phoneNumber,
      capabilities: {
        voice: !!n.capabilities?.voice,
        sms: !!n.capabilities?.sms,
        mms: !!n.capabilities?.mms,
        fax: !!n.capabilities?.fax,
      },
      voiceUrl: n.voiceUrl || null,
      voiceMethod: n.voiceMethod || null,
    }));
  } catch (e) {
    throw new ExternalServiceError(
      'Twilio',
      e instanceof Error ? e.message : 'Failed to fetch phone numbers from Twilio.',
    );
  }
}

/**
 * Points a Twilio phone number at our incoming-call webhook. Used by
 * `enablePhoneChannel`. Clearing the webhook (set to empty string) is
 * how we "release" the number on disable — Twilio then plays its default
 * "no application" response.
 *
 * Returns the updated voiceUrl so the caller can sanity-check it before
 * writing the agent doc.
 */
export async function configurePhoneNumberWebhook(
  userId: string,
  phoneNumberSid: string,
  options: {
    voiceUrl: string;
    statusCallback?: string;
    method?: 'GET' | 'POST';
  },
): Promise<{ voiceUrl: string }> {
  const client = await getUserTwilioClient(userId);
  try {
    const updated = await client.incomingPhoneNumbers(phoneNumberSid).update({
      voiceUrl: options.voiceUrl,
      voiceMethod: options.method ?? 'POST',
      statusCallback: options.statusCallback,
      statusCallbackMethod: options.statusCallback ? options.method ?? 'POST' : undefined,
    });
    return { voiceUrl: updated.voiceUrl ?? '' };
  } catch (e) {
    throw new ExternalServiceError(
      'Twilio',
      e instanceof Error ? e.message : 'Failed to update Twilio phone number webhook.',
    );
  }
}

/**
 * Best-effort clear of the Twilio webhook for a phone number. Used on
 * disable + on Twilio disconnect — failures are swallowed because the
 * worst case is an orphan webhook URL that points at our server (which
 * will just return a graceful unavailable TwiML).
 */
export async function clearPhoneNumberWebhook(
  userId: string,
  phoneNumberSid: string,
): Promise<{ ok: boolean }> {
  try {
    const client = await getUserTwilioClient(userId);
    await client.incomingPhoneNumbers(phoneNumberSid).update({
      voiceUrl: '',
      statusCallback: '',
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Lightweight wrapper around `twilio.validateRequest` so route handlers
 * don't have to import the SDK directly. Returns boolean — never throws.
 *
 * IMPORTANT: Twilio computes the signature over the URL **including any
 * query string** (e.g. `?agentId=...`). Pass the full URL exactly as it
 * arrived at our handler.
 */
export function validateTwilioSignature(input: {
  authToken: string;
  signatureHeader: string | null;
  url: string;
  params: Record<string, string>;
}): boolean {
  if (!input.signatureHeader) return false;
  try {
    return twilio.validateRequest(
      input.authToken,
      input.signatureHeader,
      input.url,
      input.params,
    );
  } catch {
    return false;
  }
}
