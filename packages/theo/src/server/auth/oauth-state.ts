/**
 * T7.4 — OAuth `state` parameter helpers (RFC 6749 §10.12).
 *
 * `state` is a cryptographically random anti-CSRF token. The client
 * stores it (in session/cookie/db) before redirecting to the
 * authorization endpoint and verifies it on the callback. Without it,
 * an attacker can authorize on the user's account using a captured code.
 */

// CR-020 DRY + CR-012 constant-time: shared helpers in _internal/encoding.
import { base64urlEncode, constantTimeEquals } from '../_internal/encoding.js'

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
 *
 * CR-012 fix: `constantTimeEquals` does not early-exit on length mismatch,
 * so the comparison time is independent of how the input was forged.
 */
export function verifyOAuthState(provided: string, stored: string): boolean {
  return constantTimeEquals(provided, stored)
}
