/**
 * Shared encoding utilities for crypto-adjacent code.
 *
 * CR-020 DRY: `base64urlEncode` was duplicated across `oauth-pkce.ts` and
 * `oauth-state.ts`. Duplication in cryptographic helpers is a bug class —
 * a future RFC-driven tweak (e.g., padding semantics) would diverge across
 * files. Centralizing the single canonical implementation eliminates that
 * vector.
 *
 * Module is intentionally under `_internal/` so it is **not** part of the
 * public API surface. Consumers outside `packages/theo/src/server` must
 * not import from here.
 */

/**
 * RFC 4648 §5 — base64url-encode bytes without padding. Used wherever an
 * RFC requires URL-safe base64 (PKCE per RFC 7636 §4.1, JWT per RFC 7515,
 * etc.). Pure function — does not mutate `bytes`.
 */
export function base64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  // The `=+$` trailing-padding regex is bounded (at most 2 chars for
  // base64). sonarjs flags the `+` quantifier conservatively, but the
  // input is the output of `btoa()` — a string with at most 2 trailing
  // `=` characters by spec.
  // eslint-disable-next-line sonarjs/slow-regex -- bounded trailing-padding pattern (max 2 chars)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Constant-time string equality.
 *
 * CR-012: prior implementations early-exited on length mismatch
 * (`if (a.length !== b.length) return false`). That early exit leaks
 * the comparison-target length via wall-clock timing — observable when
 * the secret length is itself sensitive (length-based bucket assignment,
 * variable-length nonces). This implementation always iterates
 * `max(a.length, b.length)` characters, OR-folding mismatches into a
 * single accumulator that is checked once at the end.
 *
 * Returns `false` for empty inputs as a defensive default — never accept
 * "both empty" as a match.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length === 0 || b.length === 0) return false

  const maxLen = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < maxLen; i++) {
    // charCodeAt returns NaN for out-of-range indices; (NaN ^ x) is x, so we
    // explicitly substitute 0 to keep the OR-fold meaningful.
    const ca = i < a.length ? a.charCodeAt(i) : 0
    const cb = i < b.length ? b.charCodeAt(i) : 0
    diff |= ca ^ cb
  }
  return diff === 0
}
