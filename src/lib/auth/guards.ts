import 'server-only';
import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import { getSession } from '@/lib/auth/session';
import { ForbiddenError, UnauthorizedError } from '@/lib/errors';

/**
 * Throw `UnauthorizedError` if no signed-in user. Use in Server Actions and
 * Route Handlers — `safeAction` / `safeRoute` translate the throw into a
 * proper 401 response without leaking stack traces.
 */
export async function requireUser(): Promise<Session> {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }
  return session;
}

/**
 * Throw `ForbiddenError` if the user isn't an admin (returns 403).
 * Stronger than middleware — middleware redirects, this hard-blocks
 * server actions / API routes invoked directly.
 */
export async function requireAdmin(): Promise<Session> {
  const session = await requireUser();
  if (!session.user.isAdmin) {
    throw new ForbiddenError('Admin access required.');
  }
  return session;
}

/**
 * Redirect to /sign-in if no signed-in user. Use in Server Components where
 * you want the browser to redirect rather than throw a 401 JSON response.
 * Preserves the current path as `callbackUrl` so the user lands back here
 * after sign-in.
 */
export async function requireUserOrRedirect(currentPath?: string): Promise<Session> {
  const session = await getSession();
  if (!session?.user?.id) {
    const params = new URLSearchParams();
    if (currentPath) params.set('callbackUrl', currentPath);
    const qs = params.toString();
    redirect(`/sign-in${qs ? `?${qs}` : ''}`);
  }
  return session;
}
