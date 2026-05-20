/**
 * T2.3 — Privacy redaction for devtools broadcasts.
 *
 * Pure helpers. NO side effects.
 *
 * - EC-18: redactQueryString — `?token=`, `?api_key=`, etc → '[REDACTED]'
 * - EC-19: truncateBody — accepts unknown; binary → '[binary body]'
 * - EC-26: serializeSafely — BigInt walker (recursive)
 * - redactHeaders — Authorization, Cookie, Set-Cookie, etc → '[REDACTED]'
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */

const REDACTED_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'proxy-authorization',
])

const REDACTED_QUERY_KEYS = new Set([
  'token',
  'api_key',
  'password',
  'secret',
  'auth',
  'access_token',
])

const REDACTED_VALUE = '[REDACTED]'
const REDACTED_QUERY_VALUE = '%5BREDACTED%5D' // URL-encoded form

export function redactHeaders(
  h: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined) continue
    if (REDACTED_HEADERS.has(k.toLowerCase())) {
      out[k] = REDACTED_VALUE
    } else {
      out[k] = Array.isArray(v) ? v.join(', ') : v
    }
  }
  return out
}

/**
 * EC-19: type-safe across string / Buffer / FormData / Blob / undefined.
 * Non-string bodies surface as a placeholder; never crash on .slice().
 */
export function truncateBody(
  body: unknown,
  max = 4096,
): { preview: string; length: number; truncated: boolean } {
  if (body === null || body === undefined) {
    return { preview: '', length: 0, truncated: false }
  }
  if (typeof body !== 'string') {
    return { preview: '[binary body]', length: 0, truncated: true }
  }
  const length = body.length
  if (length <= max) return { preview: body, length, truncated: false }
  return { preview: body.slice(0, max), length, truncated: true }
}

/**
 * EC-18: scrub sensitive keys from the URL's query string.
 * Case-insensitive match on key names (after URL-decode).
 */
export function redactQueryString(path: string): string {
  const qIndex = path.indexOf('?')
  if (qIndex === -1) return path
  const base = path.slice(0, qIndex)
  const query = path.slice(qIndex + 1)
  if (query.length === 0) return path
  const parts = query.split('&').map((pair) => {
    const eqIndex = pair.indexOf('=')
    if (eqIndex === -1) return pair
    const key = pair.slice(0, eqIndex)
    let decodedKey = key
    try {
      decodedKey = decodeURIComponent(key)
    } catch {
      // Malformed encoding — fall back to raw key
    }
    if (REDACTED_QUERY_KEYS.has(decodedKey.toLowerCase())) {
      return `${key}=${REDACTED_QUERY_VALUE}`
    }
    return pair
  })
  return `${base}?${parts.join('&')}`
}

/**
 * EC-26: BigInt → '<n>n' string. Recursive walk for arrays and plain objects.
 * Returns a NEW value (does not mutate the input).
 *
 * Limitations:
 *  - Functions, Symbols, Promises, class instances → returned as-is (broadcaster
 *    will likely silently drop them via JSON.stringify default behavior).
 *  - Cycles → would loop forever; defensive seen-set caps recursion.
 */
export function serializeSafely(value: unknown, seen = new WeakSet()): unknown {
  if (typeof value === 'bigint') return `${value.toString()}n`
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  if (Array.isArray(value)) {
    return value.map((v) => serializeSafely(v, seen))
  }
  // Treat plain objects only — class instances pass through unchanged.
  // `getPrototypeOf` returns `unknown` under strict typing; we only need
  // the identity check against `Object.prototype`.
  const proto: unknown = Object.getPrototypeOf(value)
  if (proto !== null && proto !== Object.prototype) return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = serializeSafely(v, seen)
  }
  return out
}
