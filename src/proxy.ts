import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '../auth.config';

/**
 * Next.js 16 Proxy (renamed from middleware). Must live at the same level
 * as `src/app/`, i.e. `src/proxy.ts` — Next.js will silently ignore it if
 * placed at the project root when an `src/` directory exists.
 *
 * Runs before every matched request to protect /dashboard/* and /admin/*.
 * JWT decoding happens in-process via the Auth.js v5 wrapper — `plan` and
 * `isAdmin` are baked into the token at sign-in so this layer never needs
 * a database round-trip.
 *
 * If `AUTH_SECRET` is unset in production, the Auth.js wrapper refuses to
 * decode (correct behaviour) and `req.auth` is null — protected routes
 * still redirect to /sign-in like any logged-out user. In development,
 * `auth.config.ts` injects a clearly-labelled fallback so verification
 * works without configuration.
 */
const { auth } = NextAuth(authConfig);

const PUBLIC_EXACT = new Set<string>([
  '/',
  '/sign-in',
  '/sign-up',
  '/pricing',
  '/api/internal/health',
  '/api/stripe/webhook',
]);

const PUBLIC_PREFIX = [
  '/legal/',
  '/talk/',
  '/api/auth/',
  '/api/widget/',
  '/api/elevenlabs/',
  '/api/twilio/',
  '/api/internal/log-error', // browser telemetry sink — must work without auth
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIX.some((prefix) => pathname.startsWith(prefix));
}

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const pathname = nextUrl.pathname;

  if (isPublic(pathname)) return NextResponse.next();

  const needsDashboard = pathname.startsWith('/dashboard');
  const needsAdmin = pathname.startsWith('/admin');

  if (!needsDashboard && !needsAdmin) return NextResponse.next();

  if (!session) {
    const signInUrl = new URL('/sign-in', nextUrl.origin);
    signInUrl.searchParams.set('callbackUrl', pathname + nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }

  if (needsAdmin && !session.user?.isAdmin) {
    return NextResponse.redirect(new URL('/dashboard', nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  // Match every path except static assets and Next.js internals. The /api
  // public-prefix list above further filters which API routes bypass auth.
  matcher: [
    '/((?!_next/static|_next/image|_next/data|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
