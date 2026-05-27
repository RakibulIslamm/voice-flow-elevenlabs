import type { Metadata } from 'next';
import { env } from '@/lib/env';

/**
 * Canonical site name + default copy. Centralised so titles/descriptions
 * stay consistent across every public page and the OG image.
 */
export const SITE_NAME = 'VoiceFlow';
export const SITE_TAGLINE = 'AI receptionists that sound human.';
export const SITE_DESCRIPTION =
  'Bring your ElevenLabs account, paste an API key, and launch an AI voice receptionist for your website and phone in 60 seconds. We orchestrate — you own the voice. No voice or telecom markup.';

/** Absolute site origin, trailing slash stripped. */
export function siteUrl(): string {
  return (env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/**
 * Builds a Next.js `Metadata` object with sensible VoiceFlow defaults:
 * templated title, Open Graph + Twitter cards, canonical URL. Pass a
 * `path` (e.g. `/pricing`) to set the canonical + OG url for that page.
 *
 * The OG image is intentionally left to Next's file-based convention
 * (`opengraph-image.tsx`) so every route inherits the dynamic card
 * unless it ships its own — we don't hardcode an image URL here.
 */
export function buildMetadata(opts?: {
  title?: string;
  description?: string;
  path?: string;
  /** Set true on pages that must stay out of search (e.g. embeds). */
  noindex?: boolean;
}): Metadata {
  const base = siteUrl();
  const path = opts?.path ?? '/';
  const url = path === '/' ? base : `${base}${path}`;
  const title = opts?.title ?? `${SITE_NAME} — ${SITE_TAGLINE}`;
  const description = opts?.description ?? SITE_DESCRIPTION;

  return {
    metadataBase: new URL(base),
    title,
    description,
    alternates: { canonical: url },
    robots: opts?.noindex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title,
      description,
      url,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}
