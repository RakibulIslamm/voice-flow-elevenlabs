import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import { env } from '@/lib/env';
import type { UserPlan } from '@/lib/db/models/user';

/**
 * Edge-safe Auth.js configuration. NO adapter, NO DB imports — this file
 * gets imported by `src/proxy.ts` which runs on the Edge runtime.
 *
 * Only providers that DO NOT require an adapter belong here (OAuth, OIDC,
 * Credentials). Adapter-dependent providers — Email/Resend, Nodemailer —
 * MUST be declared in `./auth.ts` instead, alongside MongoDBAdapter. If a
 * Resend provider is added here, Auth.js will throw `MissingAdapter` the
 * moment the proxy initialises with this config.
 *
 * Providers are constructed conditionally so the app boots cleanly even
 * when credentials aren't set yet (soft-env policy).
 */
const providers: NextAuthConfig['providers'] = [];

if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      authorization: { params: { scope: 'openid email profile' } },
      // Auto-link a Google sign-in to an existing account that shares the
      // same email (e.g. a user who first signed up via magic link, then
      // returns and clicks "Continue with Google"). Auth.js calls this
      // "dangerous" because for an arbitrary OAuth provider the `email`
      // claim could be unverified or attacker-controlled. Google always
      // returns a verified email it owns end-to-end, so the risk doesn't
      // apply here. Do NOT copy this flag to other providers without
      // confirming they verify email ownership the same way.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

/**
 * Dev-only fallback secret. NEVER used in production — `secret` resolves to
 * `undefined` in prod when AUTH_SECRET isn't set, which makes Auth.js refuse
 * to issue/decode JWTs (the correct behaviour). In development this lets
 * middleware redirects work even before the real secret has been generated,
 * so you can scaffold UI / verify routing without configuring auth first.
 */
const isProduction = process.env.NODE_ENV === 'production';
const devFallbackSecret =
  'voiceflow-DEV-ONLY-fallback-secret-rotate-before-production-use-min-32-chars';
const resolvedSecret = env.AUTH_SECRET || (isProduction ? undefined : devFallbackSecret);

export const authConfig = {
  secret: resolvedSecret,
  // Trust the Host header. Required for Vercel and any deployment behind a
  // proxy/CDN. Auth.js's host check is a defense for raw self-hosted setups
  // where Host could be spoofed; on Vercel the platform sets it correctly.
  trustHost: true,
  pages: { signIn: '/sign-in' },
  session: { strategy: 'jwt' },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      // On initial sign-in `user` is populated; copy its id into the token.
      // DB-backed enrichment (plan, isAdmin) happens in auth.ts's overriding
      // jwt callback which runs on Node and can touch Mongoose.
      if (user) {
        token.id = user.id;
        if (user.plan) token.plan = user.plan;
        if (typeof user.isAdmin === 'boolean') token.isAdmin = user.isAdmin;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? session.user.id;
        session.user.plan = (token.plan as UserPlan) ?? 'free';
        session.user.isAdmin = (token.isAdmin as boolean) ?? false;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
