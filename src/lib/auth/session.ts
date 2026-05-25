import 'server-only';
import type { Session } from 'next-auth';
import { auth } from '~/auth';
import { connectDb } from '@/lib/db/connect';
import { User, type UserDoc } from '@/lib/db/models/user';

/**
 * Read the current Auth.js session. Returns null when there's no signed-in
 * user. Safe to call in Server Components, Route Handlers, and Server Actions.
 */
export async function getSession(): Promise<Session | null> {
  return auth();
}

/**
 * Load the full Mongoose User doc for the current session. Returns null when
 * unauthenticated or when the user has been deleted out from under their
 * session. Hits Mongo every call — use sparingly, prefer `getSession()` if
 * you only need the JWT-cached fields (id, email, plan, isAdmin).
 */
export async function getCurrentUser(): Promise<UserDoc | null> {
  const session = await getSession();
  if (!session?.user?.id) return null;

  try {
    await connectDb();
    const user = await User.findById(session.user.id).lean<UserDoc>();
    return user ?? null;
  } catch {
    return null;
  }
}
