import 'server-only';
import { NextResponse } from 'next/server';
import { safeRoute } from '@/lib/safe-route';
import { auth } from '~/auth';
import { UnauthorizedError } from '@/lib/errors';
import { requireElevenLabsConnection } from '@/lib/elevenlabs/require';
import { listVoices } from '@/lib/elevenlabs/voices';
import { getAccountInfo } from '@/lib/elevenlabs/account';

/**
 * BYOK ElevenLabs end-to-end probe. Any signed-in user can call this to
 * verify their OWN connection — there's no admin gate because the
 * endpoint only ever reads `session.user.id`'s integration. No
 * cross-tenant data access is possible.
 *
 * Pre-requisites:
 *   - You're signed in.
 *   - You've connected YOUR ElevenLabs API key via the Integrations page
 *     (Phase 7 ships the UI; for now this returns INTEGRATION_DISCONNECTED).
 *
 * Response on success:
 *   { ok: true, voiceCount, tier, charactersUsed, characterLimit, sampleVoices }
 */
export const GET = safeRoute({
  handler: async () => {
    const session = await auth();
    if (!session?.user?.id) {
      throw new UnauthorizedError('Sign in to use this endpoint.');
    }

    // Throws IntegrationDisconnectedError (400) if the caller hasn't
    // connected ElevenLabs yet — safeRoute will surface this as a clean
    // JSON error.
    await requireElevenLabsConnection(session.user.id);

    const [voices, account] = await Promise.all([
      listVoices(session.user.id),
      getAccountInfo(session.user.id),
    ]);

    return NextResponse.json({
      ok: true,
      voiceCount: voices.length,
      tier: account.tier,
      charactersUsed: account.charactersUsed,
      characterLimit: account.characterLimit,
      sampleVoices: voices.slice(0, 3).map((v) => ({
        voiceId: v.voiceId,
        name: v.name,
        isCustom: v.isCustom,
      })),
    });
  },
});
