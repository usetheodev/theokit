/**
 * T7.4 — OpenID Connect Discovery 1.0 metadata fetcher.
 *
 * Reference: https://openid.net/specs/openid-connect-discovery-1_0.html
 *
 * Caches metadata in module scope. Cache key is the exact issuer string
 * (trailing-slash sensitive per RFC 8414 §3). Failures are NOT cached —
 * subsequent calls retry the fetch.
 *
 * EC-7 — HTTPS enforced. RFC 8414 §3 requires HTTPS for OIDC issuers.
 * Localhost (loopback) is allowed for development.
 */

export interface OidcMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri?: string
  userinfo_endpoint?: string
  end_session_endpoint?: string
  scopes_supported?: string[]
  response_types_supported?: string[]
  grant_types_supported?: string[]
  id_token_signing_alg_values_supported?: string[]
  [key: string]: unknown // OIDC providers ship many optional fields
}

const cache = new Map<string, Promise<OidcMetadata>>()

/** Clear the discovery cache. Used by tests. */
export function clearOidcCache(): void {
  cache.clear()
}

function isLoopback(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1'
}

/**
 * Fetch (or return cached) OIDC provider metadata.
 *
 * Throws when:
 *   - Issuer URL is malformed
 *   - Issuer is HTTP and not a loopback host (EC-7)
 *   - HTTP response is non-OK
 *   - Metadata lacks `authorization_endpoint` (sanity check)
 */
export async function discoverOidcProvider(issuer: string | URL): Promise<OidcMetadata> {
  const issuerStr = typeof issuer === 'string' ? issuer : issuer.toString()
  // Validate protocol BEFORE checking cache — invalid issuers should never poison.
  const url = new URL(issuerStr)
  if (url.protocol !== 'https:' && !isLoopback(url.hostname)) {
    throw new Error(
      `OIDC issuer must use HTTPS (received "${url.protocol}//${url.hostname}…"). ` +
        `RFC 8414 §3 forbids plain HTTP except for loopback hosts.`,
    )
  }

  const cached = cache.get(issuerStr)
  if (cached) return cached

  const promise = (async () => {
    const wellKnown = new URL(
      '.well-known/openid-configuration',
      issuerStr.endsWith('/') ? issuerStr : issuerStr + '/',
    )
    const res = await fetch(wellKnown)
    if (!res.ok) {
      throw new Error(`OIDC discovery failed: ${res.status} ${res.statusText} at ${wellKnown}`)
    }
    const metadata = (await res.json()) as OidcMetadata
    if (!metadata.authorization_endpoint) {
      throw new Error('OIDC metadata missing authorization_endpoint — provider response is invalid')
    }
    return metadata
  })()
  // Cache the promise; on rejection, remove so the next call retries.
  cache.set(issuerStr, promise)
  promise.catch(() => {
    if (cache.get(issuerStr) === promise) cache.delete(issuerStr)
  })
  return promise
}
