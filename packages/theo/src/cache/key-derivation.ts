/**
 * Default tracking/analytics query parameters excluded from cache keys.
 * Mirrors Astro's DEFAULT_EXCLUDED_PARAMS list (memory-provider.ts:117).
 * Set as exact-match (not glob) for KISS + zero-dep.
 */
export const DEFAULT_EXCLUDED_QUERY_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'dclid',
  'msclkid',
  'twclid',
  'li_fat_id',
  'mc_cid',
  'mc_eid',
  '_ga',
  '_gl',
  '_hsenc',
  '_hsmi',
  '_ke',
  'oly_anon_id',
  'oly_enc_id',
  'rb_clickid',
  's_cid',
  'vero_id',
  'wickedid',
  'yclid',
  '__s',
  'ref',
]

export interface KeyDerivationOptions {
  /** Total override — when provided, bypasses all internal logic. */
  getKey?: (req: Request) => string | Promise<string>
  /** Exact-match query param names to drop. Defaults to DEFAULT_EXCLUDED_QUERY_PARAMS. */
  excludeQuery?: string[]
  /** Whether to sort query params alphabetically. Defaults to true. */
  sortQuery?: boolean
  /** Header names whose values are appended as `\0name=value` suffix. */
  varies?: string[]
  /** Namespace prefix (e.g., route name). */
  prefix?: string
}

/**
 * Derive a deterministic cache key from a Request.
 *
 * Default behaviour: `${prefix?}${protocol}//${lower(host)}${path}${?sortedFilteredQuery}` + Vary suffix.
 * `\0` separator chosen because it cannot appear in URLs or HTTP header values.
 *
 * EC-6: malformed URL on getKey path is caller's responsibility.
 * EC-7: enforces getKey returns string.
 */
export async function deriveKey(req: Request, opts: KeyDerivationOptions = {}): Promise<string> {
  if (opts.getKey) {
    const k = await opts.getKey(req)
    if (typeof k !== 'string') {
      throw new Error(`getKey must return a string, got ${typeof k}`)
    }
    return k
  }

  const url = new URL(req.url)
  const queryString = buildQueryString(url, opts)
  const base = `${opts.prefix ? opts.prefix + ':' : ''}${url.protocol}//${url.hostname.toLowerCase()}${url.pathname}${queryString ? '?' + queryString : ''}`

  if (!opts.varies || opts.varies.length === 0) return base
  const parts: string[] = []
  for (const header of opts.varies) {
    parts.push(`${header}=${req.headers.get(header) ?? ''}`)
  }
  return base + '\0' + parts.join('\0')
}

function buildQueryString(url: URL, opts: KeyDerivationOptions): string {
  const params = new URLSearchParams(url.searchParams)
  const exclude = opts.excludeQuery ?? DEFAULT_EXCLUDED_QUERY_PARAMS
  const excludeSet = new Set(exclude)
  for (const key of [...params.keys()]) {
    if (excludeSet.has(key)) params.delete(key)
  }
  if (opts.sortQuery !== false) params.sort()
  return params.toString()
}
