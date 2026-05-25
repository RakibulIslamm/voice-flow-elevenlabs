import 'server-only';
import { env } from '@/lib/env';

export type EnabledProviders = {
  google: boolean;
  resend: boolean;
  anyEnabled: boolean;
};

/**
 * Mirrors the conditional provider-construction logic in `auth.config.ts`.
 * Used by the sign-in page (server component) to render an appropriate UI
 * instead of silently failing when a provider's env vars aren't set.
 */
export function getEnabledProviders(): EnabledProviders {
  const google = !!(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
  const resend = !!(env.AUTH_RESEND_KEY && env.RESEND_FROM_EMAIL);
  return { google, resend, anyEnabled: google || resend };
}
