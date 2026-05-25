import 'server-only';
import { Types } from 'mongoose';
import { connectDb } from '@/lib/db/connect';
import { User, type ElevenLabsIntegration } from '@/lib/db/models/user';
import { IntegrationDisconnectedError } from '@/lib/errors';

/**
 * Lightweight gate for server actions / route handlers that need an
 * ElevenLabs connection but don't (yet) need to call the SDK. Use this
 * over `getElevenLabsClient` when you want to fail fast before doing
 * expensive work (e.g. before launching the agent-wizard route handler).
 *
 * Throws {@link IntegrationDisconnectedError} if not connected.
 * Returns the cached integration subdoc on success so callers can read
 * tier / character usage without a second DB hit.
 */
export async function requireElevenLabsConnection(
  userId: string,
): Promise<ElevenLabsIntegration> {
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

  const integration = user?.integrations?.elevenlabs;
  if (!integration?.enabled || !integration.encryptedApiKey) {
    throw new IntegrationDisconnectedError('ElevenLabs');
  }

  return integration;
}
