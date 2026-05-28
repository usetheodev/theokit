import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  __resetSingletonForTests,
  getStorageManager,
} from '../../packages/theo/src/server/storage/storage-manager.js'

beforeEach(() => {
  __resetSingletonForTests()
  vi.restoreAllMocks()
})

describe('T1.1 — useStorage<T> generic (ADR-0007 D4)', () => {
  describe('basic caching (happy path)', () => {
    it('caches per name — factory invoked exactly once', () => {
      const m = getStorageManager()
      const factory = vi.fn(() => ({ kind: 'mongo', id: 1 }))
      const a = m.useStorage('mongo', factory)
      const b = m.useStorage('mongo', factory)
      expect(a).toBe(b)
      expect(factory).toHaveBeenCalledTimes(1)
    })

    it('throws after dispose (validation error)', async () => {
      const m = getStorageManager()
      m.configure({})
      await m.dispose()
      expect(() => m.useStorage('x', () => 42)).toThrow(/StorageManager is disposed/)
    })

    it('independent namespace from usePostgres (no collision)', () => {
      const m = getStorageManager()
      m.configure({
        servers: { primary: { host: 'h', user: 'u', password: '' } },
        databases: { conv: { server: 'primary', database: 'theo' } },
      })
      const generic = m.useStorage('conv', () => ({ kind: 'generic' }))
      const pg = m.usePostgres('conv', () => ({
        query: () => Promise.resolve({ rows: [] }),
        end: () => Promise.resolve(),
      }))
      expect(generic).not.toBe(pg as unknown as { kind: 'generic' })
    })

    it('factory return type inferred at call-site (type test)', () => {
      const m = getStorageManager()
      interface MongoClient {
        kind: 'mongo'
        id: number
      }
      const result = m.useStorage<MongoClient>('mongo', () => ({ kind: 'mongo', id: 1 }))
      expectTypeOf(result).toEqualTypeOf<MongoClient>()
      expect(result.kind).toBe('mongo')
    })

    it('factory throw is NOT cached — next call retries', () => {
      const m = getStorageManager()
      let attempt = 0
      const factory = () => {
        attempt++
        if (attempt === 1) throw new Error('boom')
        return { ok: true }
      }
      expect(() => m.useStorage('x', factory)).toThrow(/boom/)
      const ok = m.useStorage('x', factory)
      expect(ok.ok).toBe(true)
    })

    it('user must register adapter for drain (error scenario, documented)', async () => {
      const m = getStorageManager()
      m.configure({})
      let mongoClosed = false
      m.useStorage('mongo', () => ({
        close: () => {
          mongoClosed = true
        },
      }))
      // Without manager.register({...}), dispose() runs but mongo NOT closed by manager
      await m.dispose()
      expect(mongoClosed).toBe(false)
    })
  })

  describe('EC-1 — Map.has() cache-hit check (MUST FIX)', () => {
    it('caches undefined return from factory — factory invoked exactly once', () => {
      const m = getStorageManager()
      const factory = vi.fn(() => undefined as unknown as { x: number })
      const a = m.useStorage<{ x: number } | undefined>('undef', factory)
      const b = m.useStorage<{ x: number } | undefined>('undef', factory)
      expect(a).toBeUndefined()
      expect(b).toBeUndefined()
      expect(factory).toHaveBeenCalledTimes(1)
    })

    it('caches null return from factory — factory invoked exactly once', () => {
      const m = getStorageManager()
      const factory = vi.fn(() => null)
      const a = m.useStorage<unknown>('nullval', factory)
      const b = m.useStorage<unknown>('nullval', factory)
      expect(a).toBeNull()
      expect(b).toBeNull()
      expect(factory).toHaveBeenCalledTimes(1)
    })
  })

  describe('EC-2 — type hole when re-typed name (documented)', () => {
    it('second call with different T returns cached first-type value', () => {
      const m = getStorageManager()
      const first = m.useStorage<{ a: number }>('x', () => ({ a: 1 }))
      const factorySecond = vi.fn(() => ({ b: 'fail' }))
      const second = m.useStorage<{ b: string }>('x', factorySecond)
      expect(factorySecond).not.toHaveBeenCalled()
      // Runtime: second has shape of first (TS hole documented)
      expect((second as unknown as { a: number }).a).toBe(1)
      expect(first).toBe(second as unknown as typeof first)
    })
  })

  describe('EC-3 — usePostgres / useRedis error messages verbatim (BC)', () => {
    it('usePostgres throws EXACT message when database not configured', () => {
      const m = getStorageManager()
      m.configure({ databases: {}, servers: {} })
      expect(() =>
        m.usePostgres('foo', () => ({ query: () => Promise.resolve({ rows: [] }) })),
      ).toThrow('Database "foo" not configured. Add it to theo.config.ts > storage.databases.')
    })

    it('usePostgres throws EXACT message when server not configured', () => {
      const m = getStorageManager()
      m.configure({
        servers: {},
        databases: { conv: { server: 'ghost', database: 'theo' } },
      })
      expect(() =>
        m.usePostgres('conv', () => ({ query: () => Promise.resolve({ rows: [] }) })),
      ).toThrow(
        'Server "ghost" referenced by database "conv" not found in theo.config.ts > storage.servers.',
      )
    })

    it('useRedis throws EXACT message when server not configured', () => {
      const m = getStorageManager()
      m.configure({ redis: {} })
      expect(() =>
        m.useRedis('cache', () => ({ quit: () => Promise.resolve(), disconnect: () => {} })),
      ).toThrow('Redis server "cache" not configured. Add it to theo.config.ts > storage.redis.')
    })
  })

  describe('BC — existing usePostgres / useRedis behavior unchanged', () => {
    it('usePostgres still caches', () => {
      const m = getStorageManager()
      m.configure({
        servers: { primary: { host: 'h', user: 'u', password: '' } },
        databases: { conv: { server: 'primary', database: 'theo' } },
      })
      const factory = vi.fn(() => ({
        query: () => Promise.resolve({ rows: [] }),
        end: () => Promise.resolve(),
      }))
      m.usePostgres('conv', factory)
      m.usePostgres('conv', factory)
      expect(factory).toHaveBeenCalledTimes(1)
    })

    it('useRedis still caches', () => {
      const m = getStorageManager()
      m.configure({
        redis: { cache: { host: 'h', user: 'u', password: '' } },
      })
      const factory = vi.fn(() => ({ quit: () => Promise.resolve(), disconnect: () => {} }))
      m.useRedis('cache', factory)
      m.useRedis('cache', factory)
      expect(factory).toHaveBeenCalledTimes(1)
    })
  })
})
