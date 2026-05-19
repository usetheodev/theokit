/**
 * T7.4 — OAuth `state` parameter helpers (RFC 6749 §10.12).
 *
 * `state` is a cryptographically random anti-CSRF token. The client
 * stores it (in session/cookie/db) before redirecting to the
 * authorization endpoint and verifies it on the callback. Without it,
 * an attacker can authorize on the user's account using a captured code.
 */

function base64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Generate a cryptographically random state token. Default 32 bytes
 * (~43 base64url chars). Increase for higher entropy if your provider
 * supports it.
 */
export function generateOAuthState(opts: { bytes?: number } = {}): string {
  const len = opts.bytes ?? 32
  const buf = new Uint8Array(len)
  crypto.getRandomValues(buf)
  return base64urlEncode(buf)
}

/**
 * Verify a state token. Constant-time compare. Empty inputs always fail
 * (defensive — never accept empty as "they match").
 */
export function verifyOAuthState(provided: string, stored: string): boolean {
  if (typeof provided !== 'string' || typeof stored !== 'string') return false
  if (provided.length === 0 || stored.length === 0) return false
  if (provided.length !== stored.length) return false
  let diff = 0
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ stored.charCodeAt(i)
  }
  return diff === 0
}
