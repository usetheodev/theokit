import { describe, it, expect, beforeEach, vi } from 'vitest'

import { createCacheEngine } from '../../packages/theo/src/cache/cache-engine.js'
import { InMemoryCacheAdapter } from '../../packages/theo/src/cache/in-memory-adapter.js'

describe('createCacheEngine', () => {
  let storage: InMemoryCacheAdapter
  beforeEach(() => {
    storage = new InMemoryCacheAdapter()
  })

  it('miss then hit: loader called once', async () => {
    const engine = createCacheEngine({ storage })
    let calls = 0
    const fn = async () => {
      calls++
      return { v: 'v1' }
    }
    const r1 = await engine.getOrCompute('k', fn, { maxAge: 60 })
    expect(r1.status).toBe('miss')
    expect(r1.value).toEqual({ v: 'v1' })
    const r2 = await engine.getOrCompute('k', fn, { maxAge: 60 })
    expect(r2.status).toBe('hit')
    expect(r2.value).toEqual({ v: 'v1' })
    expect(calls).toBe(1)
  })

  it('stale returns old value + triggers background revalidate', async () => {
    const engine = createCacheEngine({ storage })
    let calls = 0
    const fn = async () => {
      calls++
      return { v: calls }
    }
    // Seed entry with very short maxAge but large swr
    await engine.getOrCompute('k', fn, { maxAge: 0.01, swr: 60 })
    expect(calls).toBe(1)
    // Wait past maxAge but within swr
    await new Promise((r) => setTimeout(r, 50))
    const r = await engine.getOrCompute('k', fn, { maxAge: 0.01, swr: 60 })
    expect(r.status).toBe('stale')
    expect(r.value).toEqual({ v: 1 }) // returns OLD value immediately
    // Wait for background revalidate
    await new Promise((r) => setTimeout(r, 50))
    expect(calls).toBe(2)
  })

  it('expired (past maxAge + swr) recomputes as miss', async () => {
    const engine = createCacheEngine({ storage })
    let calls = 0
    const fn = async () => ({ v: ++calls })
    await engine.getOrCompute('k', fn, { maxAge: 0.01, swr: 0 })
    await new Promise((r) => setTimeout(r, 50))
    const r = await engine.getOrCompute('k', fn, { maxAge: 0.01, swr: 0 })
    expect(r.status).toBe('miss')
    expect(r.value).toEqual({ v: 2 })
  })

  it('concurrent first-miss dedupes to exactly 1 loader call', async () => {
    const engine = createCacheEngine({ storage })
    let calls = 0
    const fn = async () => {
      calls++
      await new Promise((r) => setTimeout(r, 30))
      return { v: 'shared' }
    }
    const results = await Promise.all(
      Array.from({ length: 10 }).map(() => engine.getOrCompute('same-key', fn, { maxAge: 60 })),
    )
    expect(calls).toBe(1)
    for (const r of results) {
      expect(r.value).toEqual({ v: 'shared' })
    }
  })

  it('invalidate removes entry', async () => {
    const engine = createCacheEngine({ storage })
    let calls = 0
    const fn = async () => ({ v: ++calls })
    await engine.getOrCompute('k', fn, { maxAge: 60 })
    expect(await engine.invalidate('k')).toBe(true)
    const r = await engine.getOrCompute('k', fn, { maxAge: 60 })
    expect(r.status).toBe('miss')
    expect(calls).toBe(2)
  })

  it('invalidate unknown returns false', async () => {
    const engine = createCacheEngine({ storage })
    expect(await engine.invalidate('nope')).toBe(false)
  })

  it('invalidateTag removes all tagged entries', async () => {
    const engine = createCacheEngine({ storage })
    let calls = 0
    const fn = async () => ({ v: ++calls })
    await engine.getOrCompute('k1', fn, { maxAge: 60, tags: ['x'] })
    await engine.getOrCompute('k2', fn, { maxAge: 60, tags: ['x', 'y'] })
    await engine.getOrCompute('k3', fn, { maxAge: 60, tags: ['y'] })
    expect(await engine.invalidateTag('x')).toBe(2)
    const r3 = await engine.getOrCompute('k3', fn, { maxAge: 60, tags: ['y'] })
    expect(r3.status).toBe('hit')
  })

  it('revalidatePath encodes as tag', async () => {
    const engine = createCacheEngine({ storage })
    const fn = async () => 'data'
    await engine.getOrCompute('route:dashboard', fn, {
      maxAge: 60,
      tags: ['_THEO_T_/dashboard/page'],
    })
    expect(await engine.revalidatePath('/dashboard', 'page')).toBe(1)
  })

  it('cacheVersion mismatch bypasses cached entry', async () => {
    const engine = createCacheEngine({ storage })
    let calls = 0
    const fn = async () => ({ v: ++calls })
    await engine.getOrCompute('k', fn, { maxAge: 60, cacheVersion: 'v1' })
    const r = await engine.getOrCompute('k', fn, {
      maxAge: 60,
      cacheVersion: 'v2',
    })
    expect(r.status).toBe('miss')
    expect(calls).toBe(2)
  })

  it('validate=false treats hit as miss', async () => {
    const engine = createCacheEngine({ storage })
    let calls = 0
    const fn = async () => ({ v: ++calls })
    await engine.getOrCompute('k', fn, { maxAge: 60 })
    const r = await engine.getOrCompute('k', fn, {
      maxAge: 60,
      validate: () => false,
    })
    expect(r.status).toBe('miss')
    expect(calls).toBe(2)
  })

  it('transform applied to cached value', async () => {
    const engine = createCacheEngine({ storage })
    const fn = async () => ({ raw: 42 })
    const r1 = await engine.getOrCompute('k', fn, {
      maxAge: 60,
      transform: (x) => ({ ...x, doubled: x.raw * 2 }),
    })
    expect(r1.value).toEqual({ raw: 42, doubled: 84 })
    const r2 = await engine.getOrCompute('k', fn, {
      maxAge: 60,
      transform: (x) => ({ ...x, doubled: x.raw * 2 }),
    })
    expect(r2.status).toBe('hit')
    expect(r2.value).toEqual({ raw: 42, doubled: 84 })
  })

  it('loader throws → rejects + clears inFlight (next call retries)', async () => {
    const engine = createCacheEngine({ storage })
    let calls = 0
    const fn = async () => {
      calls++
      if (calls === 1) throw new Error('oops')
      return { v: 'ok' }
    }
    await expect(engine.getOrCompute('k', fn, { maxAge: 60 })).rejects.toThrow('oops')
    const r2 = await engine.getOrCompute('k', fn, { maxAge: 60 })
    expect(r2.value).toEqual({ v: 'ok' })
  })

  it('EC-8: clock skew (negative age) treated as fresh hit', async () => {
    const engine = createCacheEngine({ storage })
    // Seed cache, then simulate clock skew by manually writing entry with future storedAt
    await engine.set('k', {
      body: JSON.stringify({ v: 'future' }),
      status: 200,
      headers: [],
      storedAt: Date.now() + 60000,
      maxAge: 1,
      swr: 0,
      tags: [],
    })
    let calls = 0
    const fn = async () => {
      calls++
      return { v: 'fresh' }
    }
    const r = await engine.getOrCompute('k', fn, { maxAge: 1 })
    expect(r.status).toBe('hit')
    expect(r.value).toEqual({ v: 'future' })
    expect(calls).toBe(0)
  })

  it('EC-9: validate throws → treated as miss + onError called', async () => {
    const onError = vi.fn()
    const engine = createCacheEngine({ storage, onError })
    let calls = 0
    const fn = async () => ({ v: ++calls })
    await engine.getOrCompute('k', fn, { maxAge: 60 })
    const r = await engine.getOrCompute('k', fn, {
      maxAge: 60,
      validate: () => {
        throw new Error('validate boom')
      },
    })
    expect(r.status).toBe('miss')
    expect(calls).toBe(2)
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ phase: 'get', key: 'k' }),
    )
  })

  it('EC-10: loader returning undefined warns once + does not cache', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const engine = createCacheEngine({ storage })
    const fn = async () => undefined
    const r1 = await engine.getOrCompute('k', fn, { maxAge: 60 })
    const r2 = await engine.getOrCompute('k', fn, { maxAge: 60 })
    expect(r1.value).toBeUndefined()
    expect(r2.value).toBeUndefined()
    expect(await storage.size()).toBe(0)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })

  it('background revalidate failure keeps stale entry + onError called', async () => {
    const onError = vi.fn()
    const engine = createCacheEngine({ storage, onError })
    let calls = 0
    const fn = async () => {
      calls++
      if (calls > 1) throw new Error('upstream down')
      return { v: 'first' }
    }
    await engine.getOrCompute('k', fn, { maxAge: 0.01, swr: 60 })
    await new Promise((r) => setTimeout(r, 50))
    const r = await engine.getOrCompute('k', fn, { maxAge: 0.01, swr: 60 })
    expect(r.status).toBe('stale')
    expect(r.value).toEqual({ v: 'first' })
    await new Promise((r) => setTimeout(r, 50))
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ phase: 'revalidate', key: 'k' }),
    )
  })

  it('maxAge=0 always misses', async () => {
    const engine = createCacheEngine({ storage })
    let calls = 0
    const fn = async () => ({ v: ++calls })
    await engine.getOrCompute('k', fn, { maxAge: 0 })
    await engine.getOrCompute('k', fn, { maxAge: 0 })
    expect(calls).toBe(2)
  })

  it('set direct writes to storage', async () => {
    const engine = createCacheEngine({ storage })
    const entry = {
      body: JSON.stringify({ x: 1 }),
      status: 200,
      headers: [] as Array<[string, string]>,
      storedAt: Date.now(),
      maxAge: 60,
      swr: 0,
      tags: [],
    }
    await engine.set('k', entry)
    expect(await storage.get('k')).toEqual(entry)
  })
})
