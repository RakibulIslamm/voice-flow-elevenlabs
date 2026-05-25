/**
 * Maps Auth.js v5 client-side error codes (returned by `signIn(..., { redirect: false })`
 * as `result.error`, or appended as `?error=Code` on the sign-in page after a
 * failed redirect-mode flow) to user-friendly messages.
 *
 * The raw code is what should go to logs / monitoring — these strings are
 * what the user sees. Never put the raw code in a toast or page UI.
 *
 * Codes documented at https://errors.authjs.dev/
 */

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  // Backend / config problems — most common when an env var is wrong or a
  // provider is misconfigured. We deliberately don't say "configuration"
  // to end users.
  Configuration: 'Sign-in is temporarily unavailable. Please try again in a few minutes.',

  // OAuth user explicitly denied the consent screen.
  AccessDenied: 'You denied access. Please grant the requested permissions to sign in.',

  // Magic-link token invalid or expired.
  Verification: 'Your sign-in link is invalid or has expired. Request a new one.',

  // OAuth pipeline failures — each maps to "couldn't sign in".
  OAuthSignin: 'Couldn’t start sign-in. Please try again.',
  OAuthCallback: 'Sign-in didn’t complete. Please try again.',
  OAuthCreateAccount: 'We couldn’t create your account. Please try again.',
  EmailCreateAccount: 'We couldn’t create your account. Please try again.',
  Callback: 'Sign-in didn’t complete. Please try again.',
  OAuthAccountNotLinked:
    'This email is already linked to a different sign-in method. Try the original method.',

  // Email (magic link) provider failures — usually transient (Resend rate
  // limit, network blip) or persistent (bad API key, unverified domain).
  EmailSignin: 'We couldn’t send your magic link. Please try again in a few minutes.',

  // Credentials provider — not used by VoiceFlow today but documented anyway.
  CredentialsSignin: 'Those credentials don’t match. Please try again.',

  // Session-protected route hit without a session.
  SessionRequired: 'Please sign in to continue.',
};

const DEFAULT_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Returns a user-facing message for an Auth.js error code. The raw code is
 * never returned — unknown codes fall back to the generic default.
 */
export function getAuthUserMessage(code: string | null | undefined): string {
  if (!code) return DEFAULT_MESSAGE;
  return AUTH_ERROR_MESSAGES[code] ?? DEFAULT_MESSAGE;
}
