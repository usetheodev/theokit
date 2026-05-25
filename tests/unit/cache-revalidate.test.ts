import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

import { defineCachedFunction } from '../../packages/theo/src/cache/define-cached-function.js'
import {
  _resetCacheEngine,
  getCacheEngine,
  initCacheEngine,
} from '../../packages/theo/src/cache/engine-singleton.js'
import { InMemoryCacheAdapter } from '../../packages/theo/src/cache/in-memory-adapter.js'
import {
  revalidatePath,
  revalidateTag,
  updateTag,
} from '../../packages/theo/src/cache/revalidate.js'

describe('engine singleton + revalidate API', () => {
  beforeEach(() => {
    _resetCacheEngine()
    initCacheEngine({
      enabled: true,
      storage: 'memory',
      maxEntries: 100,
      defaults: { maxAge: 60, cacheErrors: false },
    })
  })
  afterEach(() => {
    _resetCacheEngine()
  })

  describe('singleton', () => {
    it('initCacheEngine + getCacheEngine returns same instance', () => {
      const e1 = getCacheEngine()
      const e2 = getCacheEngine()
      expect(e1).toBe(e2)
    })

    it('initCacheEngine twice throws', () => {
      expect(() =>
        initCacheEngine({
          enabled: true,
          storage: 'memory',
          maxEntries: 100,
          defaults: { maxAge: 60, cacheErrors: false },
        }),
      ).toThrow(/already initialized/)
    })

    it('getCacheEngine before init throws', () => {
      _resetCacheEngine()
      expect(() => getCacheEngine()).toThrow(/not initialized/)
    })

    it('initCacheEngine with enabled=false throws actionable error', () => {
      _resetCacheEngine()
      expect(() =>
        initCacheEngine({
          enabled: false,
          storage: 'memory',
          maxEntries: 100,
          defaults: { maxAge: 60, cacheErrors: false },
        }),
      ).toThrow(/enabled is false/)
    })

    it('uses custom adapter when storage is not "memory"', () => {
      _resetCacheEngine()
      const custom = new InMemoryCacheAdapter({ maxEntries: 5 })
      const engine = initCacheEngine({
        enabled: true,
        storage: custom,
        maxEntries: 999,
        defaults: { maxAge: 60, cacheErrors: false },
      })
      expect(engine.storage).toBe(custom)
    })
  })

  describe('revalidateTag', () => {
    it('happy path: removes all tagged entries', async () => {
      const engine = getCacheEngine()
      const fn = defineCachedFunction(engine, async (n: number) => `v-${n}`, {
        name: 'tagged',
        maxAge: 60,
        tags: ['users'],
      })
      await fn(1)
      await fn(2)
      const r = await revalidateTag('users')
      expect(r.deleted).toBe(2)
    })

    it('unknown tag returns zero', async () => {
      const r = await revalidateTag('nope')
      expect(r.deleted).toBe(0)
    })

    it('empty string warns + returns zero', async () => {
      const r = await revalidateTag('')
      expect(r.deleted).toBe(0)
    })

    it('reserved prefix dropped by validateTags', async () => {
      const r = await revalidateTag('_THEO_T_foo')
      expect(r.deleted).toBe(0)
    })

    it('opts.expire > 0 emits warn-once', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      await revalidateTag('something', { expire: 60 })
      await revalidateTag('other', { expire: 30 })
      // warn-once → only 1 call for the expire warning
      const expireWarnCalls = warnSpy.mock.calls.filter((c) =>
        String(c[0] ?? '').includes('expire is accepted but not honored'),
      )
      expect(expireWarnCalls.length).toBe(1)
      warnSpy.mockRestore()
    })
  })

  describe('updateTag', () => {
    it('behaves like revalidateTag', async () => {
      const engine = getCacheEngine()
      const fn = defineCachedFunction(engine, async (n: number) => `v-${n}`, {
        name: 'updated',
        maxAge: 60,
        tags: ['x'],
      })
      await fn(1)
      const r = await updateTag('x')
      expect(r.deleted).toBe(1)
    })
  })

  describe('revalidatePath', () => {
    it('encodes as _THEO_T_ tag', async () => {
      const engine = getCacheEngine()
      // Seed an entry with the path-derived tag (mimics what middleware does)
      await engine.set('route:dash', {
        body: '"data"',
        status: 200,
        headers: [],
        storedAt: Date.now(),
        maxAge: 60,
        swr: 0,
        tags: ['_THEO_T_/dashboard'],
      })
      const r = await revalidatePath('/dashboard')
      expect(r.deleted).toBe(1)
    })

    it('with type param', async () => {
      const engine = getCacheEngine()
      await engine.set('route:dash-page', {
        body: '"data"',
        status: 200,
        headers: [],
        storedAt: Date.now(),
        maxAge: 60,
        swr: 0,
        tags: ['_THEO_T_/dashboard/page'],
      })
      const r = await revalidatePath('/dashboard', { type: 'page' })
      expect(r.deleted).toBe(1)
    })

    it('root path', async () => {
      const engine = getCacheEngine()
      await engine.set('route:root', {
        body: '"data"',
        status: 200,
        headers: [],
        storedAt: Date.now(),
        maxAge: 60,
        swr: 0,
        tags: ['_THEO_T_/'],
      })
      const r = await revalidatePath('/')
      expect(r.deleted).toBe(1)
    })
  })
})
