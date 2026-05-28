export interface CacheControlInput {
  /** seconds; 0 forces no-cache */
  maxAge: number
  /** stale-while-revalidate window in seconds; 0 or undefined omits directive */
  swr?: number
  /** emit `private,` prefix (skips shared CDN caching) */
  isPrivate?: boolean
}

const NO_CACHE_HEADER = 'private, no-cache, no-store, max-age=0, must-revalidate'

/**
 * Build a canonical Cache-Control header value.
 *
 * `maxAge === 0` always yields the strict no-cache directive regardless
 * of `swr` or `isPrivate` — defensive default.
 *
 * EC-13: pure function intentional — caller is responsible for input
 * validation (see validateMaxAge / validateExpire in validation.ts).
 */
export function getCacheControlHeader(input: CacheControlInput): string {
  if (input.maxAge === 0) return NO_CACHE_HEADER
  const parts: string[] = []
  if (input.isPrivate) parts.push('private')
  parts.push(`s-maxage=${input.maxAge}`)
  if (input.swr !== undefined && input.swr > 0) {
    parts.push(`stale-while-revalidate=${input.swr}`)
  }
  return parts.join(', ')
}
