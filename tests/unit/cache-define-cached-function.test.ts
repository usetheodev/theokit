import { describe, it, expect, beforeEach, vi } from 'vitest'

import { createCacheEngine } from '../../packages/theo/src/cache/cache-engine.js'
import { defineCachedFunction } from '../../packages/theo/src/cache/define-cached-function.js'
import { InMemoryCacheAdapter } from '../../packages/theo/src/cache/in-memory-adapter.js'
import type { CacheEngine } from '../../packages/theo/src/cache/cache-engine.js'

describe('defineCachedFunction', () => {
  let engine: CacheEngine
  beforeEach(() => {
    engine = createCacheEngine({ storage: new InMemoryCacheAdapter() })
  })

  it('happy path: same args → memoized', async () => {
    let calls = 0
    const fn = async (id: number) => {
      calls++
      return `user-${id}`
    }
    const cached = defineCachedFunction(engine, fn, { name: 'getUser', maxAge: 60 })
    expect(await cached(42)).toBe('user-42')
    expect(await cached(42)).toBe('user-42')
    expect(calls).toBe(1)
  })

  it('invalidate(args) busts the cache', async () => {
    let calls = 0
    const fn = async (id: number) => {
      calls++
      return `user-${id}-call${calls}`
    }
    const cached = defineCachedFunction(engine, fn, { name: 'getUser', maxAge: 60 })
    expect(await cached(42)).toBe('user-42-call1')
    await cached.invalidate(42)
    expect(await cached(42)).toBe('user-42-call2')
  })

  it('static tags propagate to engine entry', async () => {
    const fn = async (id: number) => `v-${id}`
    const cached = defineCachedFunction(engine, fn, {
      name: 'tagged',
      maxAge: 60,
      tags: ['users'],
    })
    await cached(1)
    // Verify by invalidating via tag
    expect(await engine.invalidateTag('users')).toBe(1)
  })

  it('dynamic tags via function', async () => {
    const fn = async (id: number) => `v-${id}`
    const cached = defineCachedFunction(engine, fn, {
      name: 'dyn',
      maxAge: 60,
      tags: (id) => [`user:${id}`],
    })
    await cached(42)
    await cached(99)
    expect(await engine.invalidateTag('user:42')).toBe(1)
    expect(await engine.invalidateTag('user:99')).toBe(1)
  })

  it('throws at construction on missing name', () => {
    const fn = async () => 'x'
    expect(() => defineCachedFunction(engine, fn, {} as unknown as { name: string })).toThrow(
      /name is required/,
    )
  })

  it('throws at construction on invalid maxAge', () => {
    const fn = async () => 'x'
    expect(() => defineCachedFunction(engine, fn, { name: 'x', maxAge: -1 })).toThrow(
      /Invalid maxAge/,
    )
  })

  it('getKey override creates custom keys', async () => {
    let calls = 0
    const fn = async (a: number, b: number) => {
      calls++
      return a + b
    }
    const cached = defineCachedFunction(engine, fn, {
      name: 'add',
      maxAge: 60,
      getKey: (a, b) => `${a}-${b}`,
    })
    await cached(1, 2)
    await cached(1, 2)
    expect(calls).toBe(1)
    // Different args = different key
    await cached(2, 1)
    expect(calls).toBe(2)
  })

  it('propagates loader error + invokes onError', async () => {
    const fn = async () => {
      throw new Error('oops')
    }
    const onError = vi.fn()
    const cached = defineCachedFunction(engine, fn, {
      name: 'fail',
      maxAge: 60,
      onError,
    })
    await expect(cached()).rejects.toThrow('oops')
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ args: [] }))
  })

  it('validate=false treats cached as miss (refetches)', async () => {
    let calls = 0
    const fn = async () => {
      calls++
      return 'x'
    }
    const cached = defineCachedFunction(engine, fn, {
      name: 'val',
      maxAge: 60,
      validate: () => false,
    })
    await cached()
    await cached()
    expect(calls).toBe(2)
  })

  it('invalidate uses same key derivation as call', async () => {
    let calls = 0
    const fn = async (k: string) => {
      calls++
      return `v-${k}-${calls}`
    }
    const cached = defineCachedFunction(engine, fn, {
      name: 'sym',
      maxAge: 60,
      getKey: (k) => `KEY_${k}`,
    })
    await cached('a')
    await cached.invalidate('a')
    const result = await cached('a')
    expect(result).toBe('v-a-2')
  })
})
