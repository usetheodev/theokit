import type { TheoTransformer } from 'theokit/server'

/**
 * Custom transformer — preserves Date objects across the wire via an
 * ISO date marker `__DATE__<iso>`. Minimal alternative to superjson when
 * you only need Date support and want to keep the payload tiny.
 *
 * NOTE: this is for demonstration. The default `superjson` transformer
 * handles Date/Map/Set/BigInt/RegExp out of the box.
 */

const DATE_PREFIX = '__DATE__'

// Pre-walk: JSON.stringify's replacer receives values AFTER toJSON() runs,
// so by the time we'd see a Date it's already a plain ISO string. Walk
// the structure ourselves and substitute Date instances with our marker.
function encodeDates(value: unknown): unknown {
  if (value instanceof Date) return `${DATE_PREFIX}${value.toISOString()}`
  if (Array.isArray(value)) return value.map(encodeDates)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = encodeDates(v)
    }
    return out
  }
  return value
}

export const isoDateTransformer: TheoTransformer = {
  name: 'iso-date',
  serialize: (value: unknown): string => JSON.stringify(encodeDates(value)),
  deserialize: (raw: string): unknown =>
    JSON.parse(raw, (_key, v) =>
      typeof v === 'string' && v.startsWith(DATE_PREFIX)
        ? new Date(v.slice(DATE_PREFIX.length))
        : v,
    ),
}
