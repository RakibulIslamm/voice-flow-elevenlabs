import 'server-only';
import { NextResponse } from 'next/server';
import { safeRoute } from '@/lib/safe-route';
import { requireUser } from '@/lib/auth/guards';
import { requireElevenLabsConnection } from '@/lib/elevenlabs/require';
import { listVoices } from '@/lib/elevenlabs/voices';

/**
 * Returns the voices available in the CALLER'S ElevenLabs account.
 * Used by the agent wizard's voice picker. Authenticated, BYOK-gated —
 * a disconnected user gets a 400 `INTEGRATION_DISCONNECTED` they can
 * recover from by visiting /dashboard/integrations.
 */
export const GET = safeRoute({
  handler: async () => {
    const session = await requireUser();
    await requireElevenLabsConnection(session.user.id);
    const voices = await listVoices(session.user.id);
    return NextResponse.json({ voices });
  },
});
