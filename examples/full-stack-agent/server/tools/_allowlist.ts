/**
 * Hostname allowlist for `web_fetch`.
 *
 * EC-3 (edge case review — MUST FIX): subdomain match MUST use a leading-dot
 * boundary, not naive `endsWith`. `endsWith('wikipedia.org')` matches
 * `evilwikipedia.org` and `nicewikipedia.org.attacker.com` — classic
 * cookie-suffix bug, restores SSRF. Use `host === entry || host.endsWith('.' + entry)`
 * to guarantee the match falls on a subdomain boundary.
 */

const DEFAULT_HOSTS: ReadonlyArray<string> = [
  'wikipedia.org',
  'github.com',
  'raw.githubusercontent.com',
  'api.github.com',
  'news.ycombinator.com',
  'html.duckduckgo.com',
  'duckduckgo.com',
] as const

let cachedAllowlist: string[] | null = null

function loadAllowlist(): string[] {
  if (cachedAllowlist !== null) return cachedAllowlist
  const raw = process.env.WEB_FETCH_ALLOWLIST
  if (raw === undefined || raw.trim().length === 0) {
    cachedAllowlist = [...DEFAULT_HOSTS]
    return cachedAllowlist
  }
  cachedAllowlist = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0)
  return cachedAllowlist
}

/**
 * Match a hostname against the allowlist.
 *
 * Returns `true` when the hostname matches an entry exactly OR is a subdomain
 * of an entry (dot-boundary suffix match). Returns `false` for IPv4/IPv6
 * literals (they will never satisfy the dot-boundary check against a host
 * allowlist).
 */
export function isHostAllowed(hostname: string): boolean {
  const h = hostname.toLowerCase()
  // IPv4/IPv6 literals are never allowed — defense against SSRF to
  // AWS metadata service (169.254.169.254) etc.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false
  if (h.startsWith('[') && h.endsWith(']')) return false
  for (const entry of loadAllowlist()) {
    if (h === entry) return true
    if (h.endsWith('.' + entry)) return true
  }
  return false
}

/** Test-only: reset the cached allowlist. */
export function __resetAllowlistCache(): void {
  cachedAllowlist = null
}
