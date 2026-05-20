/**
 * T7.3 — RFC 7636 PKCE primitive.
 *
 * Reference: https://datatracker.ietf.org/doc/html/rfc7636
 *
 * Pure-function, dependency-free implementation using Web Crypto.
 *
 * Usage in an OAuth authorization-code flow:
 *
 *   const { codeVerifier, codeChallenge, codeChallengeMethod } = await generatePkceChallenge()
 *   // Store codeVerifier in the user's session
 *   // Send codeChallenge + codeChallengeMethod in the /authorize redirect
 *   // ... user authenticates with provider ...
 *   // On /callback, send codeVerifier with the code → token exchange
 */

export interface PkceChallenge {
  codeVerifier: string
  codeChallenge: string
  codeChallengeMethod: 'S256'
}

// CR-020 DRY: single canonical base64url encoder lives in _internal/encoding.
import { base64urlEncode } from './_internal/encoding.js'

/**
 * Compute the code_challenge from a code_verifier per RFC 7636 §4.2.
 * Exported separately to enable RFC 7636 Appendix B vector testing.
 */
export async function pkceChallengeFromVerifier(verifier: string): Promise<string> {
  const bytes = new TextEncoder().encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return base64urlEncode(new Uint8Array(hash))
}

/**
 * Generate a fresh PKCE challenge pair.
 *
 * Verifier: 32 cryptographically random bytes → 43-char base64url string.
 * RFC 7636 §4.1 allows 43–128 chars; we ship the minimum-safe default.
 *
 * Method: 'S256' only — no 'plain' fallback. RFC 7636 §7.2 strongly
 * discourages plain and modern providers reject it.
 */
export async function generatePkceChallenge(): Promise<PkceChallenge> {
  const random = new Uint8Array(32)
  crypto.getRandomValues(random)
  const codeVerifier = base64urlEncode(random)
  const codeChallenge = await pkceChallengeFromVerifier(codeVerifier)
  return { codeVerifier, codeChallenge, codeChallengeMethod: 'S256' }
}
