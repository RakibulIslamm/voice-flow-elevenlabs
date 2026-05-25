import 'server-only';
import { getElevenLabsClient } from './client';
import { ExternalServiceError } from '@/lib/errors';

export type ElevenLabsAccountInfo = {
  /** Subscription tier — 'free', 'starter', 'creator', 'pro', 'scale', etc. */
  tier: string;
  /** Total characters allowed in the current billing window. */
  characterLimit: number;
  /** Characters consumed so far in the current window. */
  charactersUsed: number;
  /** Whether the account is eligible for instant voice cloning (IVC). */
  canUseInstantVoiceCloning?: boolean;
};

/**
 * Pulls the user's ElevenLabs subscription / quota info. Displayed in the
 * Integrations card so users can see their tier and remaining character
 * budget without leaving VoiceFlow.
 *
 * Calls `user/subscription` directly; the wider `user.get()` payload
 * includes more identity info we don't need.
 */
export async function getAccountInfo(userId: string): Promise<ElevenLabsAccountInfo> {
  const client = await getElevenLabsClient(userId);
  try {
    const sub = await client.user.subscription.get();
    return normalize(sub);
  } catch (e) {
    throw new ExternalServiceError(
      'ElevenLabs',
      `Failed to fetch account info: ${e instanceof Error ? e.message : 'unknown error'}`,
    );
  }
}

function normalize(raw: unknown): ElevenLabsAccountInfo {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const tier = (r.tier as string | undefined) ?? 'free';
  const characterLimit = num(r.character_limit ?? r.characterLimit) ?? 0;
  const charactersUsed = num(r.character_count ?? r.charactersUsed) ?? 0;
  const canUseInstantVoiceCloning =
    (r.can_use_instant_voice_cloning as boolean | undefined) ??
    (r.canUseInstantVoiceCloning as boolean | undefined);
  return { tier, characterLimit, charactersUsed, canUseInstantVoiceCloning };
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
