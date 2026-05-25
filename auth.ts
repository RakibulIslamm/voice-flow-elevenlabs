import NextAuth, { type NextAuthConfig } from 'next-auth';
import Resend from 'next-auth/providers/resend';
import { MongoDBAdapter } from '@auth/mongodb-adapter';
import { authConfig } from './auth.config';
import { mongoClientPromise } from '@/lib/db/mongo-client';
import { env } from '@/lib/env';

/**
 * Full Auth.js v5 configuration — extends the Edge-safe `authConfig` with
 * the MongoDB adapter (Node-only), adapter-dependent providers (Resend
 * magic links), and a Node-only `events.createUser` hook that seeds our
 * app-level defaults onto adapter-created user docs.
 *
 * Resend lives here (NOT in `auth.config.ts`) because Auth.js validates
 * that email providers have an adapter at construction time. Declaring it
 * in the Edge-safe config makes the proxy throw `MissingAdapter` on boot.
 *
 * The MongoDB adapter manages the `users`, `accounts`, and
 * `verification_tokens` collections. Our Mongoose `User` model is a typed
 * view over the same `users` collection — it adds `plan`, `isAdmin`,
 * `integrations.twilio`, etc., which the adapter doesn't know about.
 */
const providers: NextAuthConfig['providers'] = [...authConfig.providers];

if (env.AUTH_RESEND_KEY && env.RESEND_FROM_EMAIL) {
  providers.push(
    Resend({
      apiKey: env.AUTH_RESEND_KEY,
      from: env.RESEND_FROM_EMAIL,
    }),
  );
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers,
  adapter: MongoDBAdapter(mongoClientPromise),
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      try {
        const [{ connectDb }, { User }] = await Promise.all([
          import('@/lib/db/connect'),
          import('@/lib/db/models/user'),
        ]);
        await connectDb();
        await User.updateOne(
          { _id: user.id },
          {
            $set: {
              plan: 'free',
              isAdmin: false,
              'usage.minutesUsedThisPeriod': 0,
              'integrations.elevenlabs.enabled': false,
              'integrations.twilio.enabled': false,
            },
          },
        );
      } catch (e) {
        // Non-fatal — the adapter has already created the auth-required
        // fields, the user can still sign in. Defaults will be missing
        // until manually backfilled, but the request shouldn't fail.
        console.error('[auth events.createUser] failed to seed defaults', e);
      }
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      // First apply the Edge-safe callback (copies user.id into the token).
      const baseToken = await authConfig.callbacks!.jwt!({ token, user, trigger });

      // On sign-in OR explicit session update, enrich the token from Mongo
      // so that plan/isAdmin reflect the latest values.
      const shouldRefresh = !!user || trigger === 'update';
      if (shouldRefresh && baseToken.id) {
        try {
          const [{ connectDb }, { User }] = await Promise.all([
            import('@/lib/db/connect'),
            import('@/lib/db/models/user'),
          ]);
          await connectDb();
          const dbUser = await User.findById(baseToken.id).select('plan isAdmin').lean();
          if (dbUser) {
            baseToken.plan = dbUser.plan;
            baseToken.isAdmin = dbUser.isAdmin;
          }
        } catch {
          // DB down — keep existing token values, soft-fail.
        }
      }

      return baseToken;
    },
  },
});
