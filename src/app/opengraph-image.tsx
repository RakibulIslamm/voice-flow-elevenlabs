import { ImageResponse } from 'next/og';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/seo/metadata';

// Route segment config — these are read by Next to wire up the OG route.
// No `runtime = 'edge'`: next/og runs on the default runtime in Next 16,
// which lets the card prerender as a static asset at build time.
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Brand colors mirrored from globals.css (--voice amber on a warm dark
// floor). Hardcoded here because Satori can't read CSS custom properties.
const VOICE = '#e8943f';
const BG = '#16120e';
const FG = '#f6f1ea';
const MUTED = '#b9ada0';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: `radial-gradient(60% 70% at 50% 0%, rgba(232,148,63,0.16), transparent 60%), ${BG}`,
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: VOICE,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: BG,
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            V
          </div>
          <span style={{ color: FG, fontSize: 30, fontWeight: 600, letterSpacing: -0.5 }}>
            {SITE_NAME}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <span
            style={{
              color: FG,
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 920,
            }}
          >
            {SITE_TAGLINE}
          </span>
          <span style={{ color: MUTED, fontSize: 30, lineHeight: 1.35, maxWidth: 880 }}>
            Bring your ElevenLabs key. We orchestrate. You own the voice — no markup.
          </span>
        </div>

        <div style={{ display: 'flex', gap: 14 }}>
          {['BYOK ElevenLabs', 'Web + Phone', '85% cheaper at scale'].map((chip) => (
            <span
              key={chip}
              style={{
                color: VOICE,
                fontSize: 22,
                fontWeight: 500,
                padding: '10px 20px',
                borderRadius: 999,
                border: '1px solid rgba(232,148,63,0.35)',
                background: 'rgba(232,148,63,0.08)',
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
