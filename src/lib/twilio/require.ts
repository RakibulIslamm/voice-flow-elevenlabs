import 'server-only';
import { Types } from 'mongoose';
import { connectDb } from '@/lib/db/connect';
import { User, type TwilioIntegration } from '@/lib/db/models/user';
import { IntegrationDisconnectedError } from '@/lib/errors';

/**
 * Mirrors `requireElevenLabsConnection`. Lightweight gate for places
 * that need a Twilio connection but don't yet need to call the SDK —
 * e.g. confirming the user can be served a phone-number picker before
 * we spend a Twilio API round-trip.
 *
 * Throws {@link IntegrationDisconnectedError} when there's no creds on
 * file. Returns the cached integration subdoc on success.
 */
export async function requireTwilioConnection(userId: string): Promise<TwilioIntegration> {
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

  return integration;
}
