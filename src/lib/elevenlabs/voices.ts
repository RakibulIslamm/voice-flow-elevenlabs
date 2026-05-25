import 'server-only';
import { getElevenLabsClient } from './client';
import { ExternalServiceError } from '@/lib/errors';

/**
 * Canonical Voice shape. Every field is optional except `voiceId` and
 * `name` because ElevenLabs does not always populate gender/accent/preview
 * for older voices.
 */
export type Voice = {
  voiceId: string;
  name: string;
  /** ElevenLabs voice categories include 'premade', 'cloned', 'generated', 'professional'. */
  category?: string;
  accent?: string;
  gender?: string;
  description?: string;
  previewUrl?: string;
  /** True for voices the user has cloned or fine-tuned in their account. */
  isCustom: boolean;
};

/**
 * Lists voices available in the USER's ElevenLabs account: premades + any
 * voices they've cloned. Not cached — each user has their own catalog and
 * cloning a new voice should appear on the next refresh.
 */
export async function listVoices(userId: string): Promise<Voice[]> {
  const client = await getElevenLabsClient(userId);
  try {
    const res = await client.voices.getAll();
    const list = pickVoiceArray(res);
    return list.map(normalize).filter((v): v is Voice => v !== null);
  } catch (e) {
    throw new ExternalServiceError(
      'ElevenLabs',
      `Failed to list voices: ${e instanceof Error ? e.message : 'unknown error'}`,
    );
  }
}

/**
 * Fetches one voice by id. Useful on the agent detail page where we want
 * to render the voice's name/preview without re-listing the whole catalog.
 */
export async function getVoiceById(userId: string, voiceId: string): Promise<Voice | null> {
  const client = await getElevenLabsClient(userId);
  try {
    const raw = await client.voices.get(voiceId);
    return normalize(raw);
  } catch (e) {
    // Treat 404 as null (deleted/unavailable voice) without surfacing as
    // an external-service error — that lets the UI show a "Voice no
    // longer available" hint instead of an alarming red banner.
    if (isNotFound(e)) return null;
    throw new ExternalServiceError(
      'ElevenLabs',
      `Failed to fetch voice: ${e instanceof Error ? e.message : 'unknown error'}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function pickVoiceArray(res: unknown): unknown[] {
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object') {
    const r = res as Record<string, unknown>;
    if (Array.isArray(r.voices)) return r.voices;
  }
  return [];
}

function normalize(raw: unknown): Voice | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const voiceId = (r.voice_id ?? r.voiceId) as string | undefined;
  const name = r.name as string | undefined;
  if (!voiceId || !name) return null;

  const labels = (r.labels ?? {}) as Record<string, string | undefined>;
  const category = (r.category as string | undefined) ?? undefined;

  return {
    voiceId,
    name,
    category,
    accent: labels.accent,
    gender: labels.gender,
    description: (r.description as string | undefined) ?? undefined,
    previewUrl: (r.preview_url ?? r.previewUrl) as string | undefined,
    isCustom: category === 'cloned' || category === 'professional' || category === 'generated',
  };
}

function isNotFound(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const r = e as Record<string, unknown>;
  if (r.statusCode === 404 || r.status === 404) return true;
  if (typeof r.message === 'string' && /not found/i.test(r.message)) return true;
  return false;
}
