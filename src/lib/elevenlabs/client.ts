import 'server-only';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { Types } from 'mongoose';
import { connectDb } from '@/lib/db/connect';
import { User, type ElevenLabsIntegration } from '@/lib/db/models/user';
import { decrypt } from '@/lib/crypto';
import { IntegrationDisconnectedError, ExternalServiceError } from '@/lib/errors';

/**
 * Factory (NOT singleton) that returns a fresh ElevenLabs SDK client
 * authenticated with the *given user's* API key.
 *
 * VoiceFlow is BYOK: every API call to ElevenLabs uses the user's own key
 * (AES-256-GCM-encrypted at rest in `user.integrations.elevenlabs.encryptedApiKey`).
 * The platform itself holds no master key.
 *
 * Why not a singleton: every call must use the right user's key. Caching
 * one instance per call avoids cross-tenant key leakage and survives token
 * rotation without restart.
 *
 * @throws {IntegrationDisconnectedError} when the user has not connected
 *   ElevenLabs, or when their stored payload is invalid.
 */
export async function getElevenLabsClient(userId: string): Promise<ElevenLabsClient> {
  if (!userId || !Types.ObjectId.isValid(userId)) {
    throw new IntegrationDisconnectedError(
      'ElevenLabs',
      'Sign in again — your account ID is missing or malformed.',
    );
  }

  await connectDb();

  const user = await User.findById(userId)
    .select('integrations.elevenlabs')
    .lean<{ integrations: { elevenlabs: ElevenLabsIntegration } } | null>();

  if (!user) {
    throw new IntegrationDisconnectedError('ElevenLabs', 'Account not found.');
  }

  const integration = user.integrations?.elevenlabs;
  if (!integration?.enabled || !integration.encryptedApiKey) {
    throw new IntegrationDisconnectedError('ElevenLabs');
  }

  let apiKey: string;
  try {
    apiKey = decrypt(integration.encryptedApiKey);
  } catch {
    // The stored payload is malformed — most likely because ENCRYPTION_KEY
    // was rotated without re-encrypting. Surface as disconnected rather
    // than a server error: the user can reconnect from the UI.
    throw new IntegrationDisconnectedError(
      'ElevenLabs',
      'Your saved key could not be read. Please reconnect ElevenLabs.',
    );
  }

  try {
    return new ElevenLabsClient({ apiKey });
  } catch (e) {
    // SDK constructor itself failing (malformed key, missing required
    // peer dep, etc.) is an external-service problem — translate so the
    // caller's safeRoute/safeAction wrapper logs and returns 502.
    throw new ExternalServiceError(
      'ElevenLabs',
      e instanceof Error ? e.message : 'Failed to initialise client.',
    );
  }
}
