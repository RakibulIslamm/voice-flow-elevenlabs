import 'server-only';

/**
 * Resolves an incoming request's host into the value we store and check
 * against `agent.channels.browser.allowedDomains`.
 *
 * Returns `null` if the header is missing/garbled — caller should reject
 * those (a real browser always sends Origin on cross-origin POSTs).
 */
export function originToHostname(origin: string | null | undefined): string | null {
  if (!origin) return null;
  try {
    // URL() throws on garbage like "null" or "*"; that's fine — we want
    // to reject those rather than accept an unparseable origin.
    const url = new URL(origin);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Subdomain-aware hostname match. An allowed entry of `example.com`
 * matches `example.com`, `app.example.com`, `www.example.com`, etc.
 * An entry of `app.example.com` does NOT match `example.com` — entries
 * always grant access to themselves and descendants only.
 *
 * Localhost gets exact match only (no synthetic subdomains).
 */
export function hostnameMatches(host: string, allowed: string): boolean {
  const h = host.toLowerCase();
  const a = allowed.toLowerCase();
  if (h === a) return true;
  if (a === 'localhost') return false; // exact only
  return h.endsWith(`.${a}`);
}

/**
 * Top-level check. Empty allowlist = "any origin", so an agent owner
 * who hasn't bothered locking down embeds doesn't accidentally block
 * their own page. The hosted talk page (NEXT_PUBLIC_APP_URL) is checked
 * by the caller — it's a separate concept from the agent-level allowlist.
 */
export function isOriginAllowed(
  hostname: string,
  allowedDomains: readonly string[],
): boolean {
  if (allowedDomains.length === 0) return true;
  return allowedDomains.some((entry) => hostnameMatches(hostname, entry));
}
