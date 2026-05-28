/**
 * Mock Redis-style Driver for `unstorage` — used by T3.2 fixture for
 * deterministic CI runs without a real Redis instance.
 *
 * The shape MUST match `unstorage`'s `Driver` interface. EC-7 type test pins
 * to this guarantee.
 */
import type { Driver } from 'unstorage'

export interface MockRedisOptions {
  /** Optional namespace prefix prepended to every key. */
  prefix?: string
}

export function mockRedisDriver(options: MockRedisOptions = {}): Driver {
  const store = new Map<string, string>()
  const key = (k: string): string => `${options.prefix ?? ''}${k}`

  return {
    name: 'mock-redis',
    options,
    hasItem(k) {
      return Promise.resolve(store.has(key(k)))
    },
    getItem(k) {
      return Promise.resolve(store.get(key(k)) ?? null)
    },
    setItem(k, value) {
      store.set(key(k), value)
      return Promise.resolve()
    },
    removeItem(k) {
      store.delete(key(k))
      return Promise.resolve()
    },
    getKeys(base) {
      const prefix = options.prefix ?? ''
      const want = base ?? ''
      const out: string[] = []
      for (const k of store.keys()) {
        if (k.startsWith(`${prefix}${want}`)) out.push(k.slice(prefix.length))
      }
      return Promise.resolve(out)
    },
    clear(base) {
      const prefix = options.prefix ?? ''
      const want = base ?? ''
      for (const k of Array.from(store.keys())) {
        if (k.startsWith(`${prefix}${want}`)) store.delete(k)
      }
      return Promise.resolve()
    },
    dispose() {
      store.clear()
      return Promise.resolve()
    },
  }
}
