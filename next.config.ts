import type { NextConfig } from 'next';

// Permissions-Policy: VoiceFlow needs mic and camera (visitors talk to agents).
// Everything else is denied. `interest-cohort=()` opts out of FLoC.
const PERMISSIONS_POLICY = [
  'camera=(self)',
  'microphone=(self)',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'magnetometer=()',
  'gyroscope=()',
  'accelerometer=()',
  'interest-cohort=()',
].join(', ');

const securityHeaders = [
  // Force HTTPS in browsers for 2 years (only effective on real HTTPS hosts).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Block MIME-type sniffing.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Send origin only on cross-origin requests.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disallow being framed by other origins (clickjacking guard).
  // NOTE: when the embeddable widget ships, /api/widget/* responses will need
  // their own CSP frame-ancestors / X-Frame-Options override.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
];

const nextConfig: NextConfig = {
  // Never ship client-side source maps with the production bundle — they
  // would let anyone read the original source. Server source maps stay on
  // for useful stack traces in logs.
  productionBrowserSourceMaps: false,

  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
