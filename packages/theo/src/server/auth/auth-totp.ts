/**
 * T6.2 — RFC 6238 TOTP primitive.
 *
 * Reference: https://datatracker.ietf.org/doc/html/rfc6238
 * HMAC-based one-time password (HOTP) base: https://datatracker.ietf.org/doc/html/rfc4226
 *
 * Pure-function, dependency-free implementation via Web Crypto. Secrets
 * may be passed as Uint8Array (preferred) or base32 string.
 *
 * SECURITY NOTES (documented per EC-13):
 *   - TOTP secrets are equivalent to passwords. Encrypt at rest using a
 *     separate KMS key from the session secret. If your DB leaks, ALL
 *     2FA codes are compromised — rotate by forcing all users to re-enroll.
 *   - Use `verifyTotp` constant-time (we use crypto.timingSafeEqual internally).
 */

// CR-012 fix: use the shared constant-time helper that does not early-exit
// on length mismatch (the previous local version did, leaking the digit
// count via timing).
import { constantTimeEquals } from '../_internal/encoding.js'

/** Supported HMAC algorithms per RFC 6238 §1.2. Default SHA-1. */
export type TotpAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512'

export interface TotpOptions {
  /** Shared secret — bytes (preferred) OR base32 string. */
  secret: Uint8Array | string
  /** Time step in seconds. Default 30 (RFC 6238 §5.2 recommended). */
  step?: number
  /** Code length: 6, 7, or 8 digits. Default 6. */
  digits?: 6 | 7 | 8
  /** HMAC algorithm. Default SHA-1 (RFC default). */
  algorithm?: TotpAlgorithm
  /** Time in ms since epoch. Default Date.now(). */
  time?: number
}

export interface VerifyTotpOptions extends TotpOptions {
  /**
   * Drift tolerance in number of steps on each side. Default 1
   * (RFC 6238 §5.2 recommends ±1 step = 90s total window).
   */
  window?: number
}

const DEFAULT_STEP = 30
const DEFAULT_DIGITS = 6
const DEFAULT_ALGORITHM: TotpAlgorithm = 'SHA-1'

/** Decode base32 (RFC 4648, no padding) to bytes. Throws on invalid input. */
function base32Decode(s: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  // Trailing `=` is bounded by spec to 0..6 chars; `\s+` collapses runs
  // of whitespace. Input length is the user's TOTP secret (10..50 chars
  // typical), so super-linear backtracking cannot escalate.
  // eslint-disable-next-line sonarjs/slow-regex -- bounded inputs (TOTP secrets are short)
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '')
  if (!/^[A-Z2-7]+$/.test(clean)) {
    throw new Error('Invalid base32 secret')
  }
  const bits: number[] = []
  for (const c of clean) {
    const idx = alphabet.indexOf(c)
    for (let i = 4; i >= 0; i--) bits.push((idx >> i) & 1)
  }
  // Trim trailing partial byte
  const fullBytes = Math.floor(bits.length / 8)
  const out = new Uint8Array(fullBytes)
  for (let i = 0; i < fullBytes; i++) {
    let v = 0
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i * 8 + j]
    out[i] = v
  }
  return out
}

/** Encode bytes to base32 (RFC 4648, no padding). */
function base32Encode(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let out = ''
  let buffer = 0
  let bits = 0
  for (const b of bytes) {
    buffer = (buffer << 8) | b
    bits += 8
    while (bits >= 5) {
      out += alphabet[(buffer >> (bits - 5)) & 0x1f]
      bits -= 5
    }
  }
  if (bits > 0) out += alphabet[(buffer << (5 - bits)) & 0x1f]
  return out
}

function normalizeSecret(secret: Uint8Array | string): Uint8Array {
  if (typeof secret === 'string') return base32Decode(secret)
  return secret
}

/** Counter (8-byte big-endian) from time in ms / step in seconds. */
function counterBytes(timeMs: number, stepSec: number): Uint8Array {
  const counter = Math.floor(timeMs / 1000 / stepSec)
  const out = new Uint8Array(8)
  // Two 32-bit halves (Number can safely represent up to 2^53; OK until year 285,000+)
  const hi = Math.floor(counter / 0x100000000)
  const lo = counter >>> 0
  out[0] = (hi >>> 24) & 0xff
  out[1] = (hi >>> 16) & 0xff
  out[2] = (hi >>> 8) & 0xff
  out[3] = hi & 0xff
  out[4] = (lo >>> 24) & 0xff
  out[5] = (lo >>> 16) & 0xff
  out[6] = (lo >>> 8) & 0xff
  out[7] = lo & 0xff
  return out
}

async function hmac(
  secret: Uint8Array,
  message: Uint8Array,
  algorithm: TotpAlgorithm,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    secret as BufferSource,
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, message as BufferSource)
  return new Uint8Array(sig)
}

/** RFC 4226 §5.3 dynamic truncation. */
function truncate(mac: Uint8Array, digits: number): string {
  const offset = mac[mac.length - 1] & 0x0f
  const code =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff)
  const mod = 10 ** digits
  return String(code % mod).padStart(digits, '0')
}

/** Generate a TOTP code for a given time. */
export async function generateTotp(opts: TotpOptions): Promise<string> {
  const secret = normalizeSecret(opts.secret)
  const step = opts.step ?? DEFAULT_STEP
  const digits = opts.digits ?? DEFAULT_DIGITS
  const algorithm = opts.algorithm ?? DEFAULT_ALGORITHM
  const time = opts.time ?? Date.now()
  const mac = await hmac(secret, counterBytes(time, step), algorithm)
  return truncate(mac, digits)
}

/**
 * Verify a TOTP code against the current window ± `window` steps.
 *
 * Returns `false` for malformed tokens (non-digit, wrong length) without
 * throwing — defensive against accidental user-input passthrough.
 */
export async function verifyTotp(token: string, opts: VerifyTotpOptions): Promise<boolean> {
  if (typeof token !== 'string') return false
  const digits = opts.digits ?? DEFAULT_DIGITS
  if (!/^\d+$/.test(token) || token.length !== digits) return false

  const step = opts.step ?? DEFAULT_STEP
  const algorithm = opts.algorithm ?? DEFAULT_ALGORITHM
  const time = opts.time ?? Date.now()
  const drift = opts.window ?? 1
  const secret = normalizeSecret(opts.secret)

  // Walk the whole drift range constant-time-ish (no early exit).
  let matched = false
  for (let delta = -drift; delta <= drift; delta++) {
    const t = time + delta * step * 1000
    const code = truncate(await hmac(secret, counterBytes(t, step), algorithm), digits)
    if (constantTimeEquals(code, token)) matched = true
  }
  return matched
}

/** Generate a cryptographically random TOTP secret. Default 20 bytes (RFC minimum). */
export function generateTotpSecret(bytes = 20): Uint8Array {
  if (bytes < 16) {
    throw new Error('TOTP secret must be at least 16 bytes (RFC 6238 §3 minimum)')
  }
  const out = new Uint8Array(bytes)
  crypto.getRandomValues(out)
  return out
}

/**
 * Build an `otpauth://` URI for QR code enrollment. Format follows the
 * de facto Google Authenticator spec adopted by every major TOTP app.
 *   otpauth://totp/<issuer>:<account>?secret=<base32>&issuer=<issuer>&algorithm=<alg>&digits=<n>&period=<sec>
 */
export interface TotpUriOptions {
  secret: Uint8Array
  issuer: string
  account: string
  algorithm?: TotpAlgorithm
  digits?: 6 | 7 | 8
  step?: number
}

export function totpUri(opts: TotpUriOptions): string {
  const label = `${opts.issuer}:${opts.account}`
  const params = new URLSearchParams({
    secret: base32Encode(opts.secret),
    issuer: opts.issuer,
    algorithm: opts.algorithm ?? DEFAULT_ALGORITHM,
    digits: String(opts.digits ?? DEFAULT_DIGITS),
    period: String(opts.step ?? DEFAULT_STEP),
  })
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`
}
