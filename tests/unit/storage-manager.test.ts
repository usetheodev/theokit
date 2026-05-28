import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  StorageManager,
  __resetSingletonForTests,
  getStorageManager,
} from '../../packages/theo/src/server/storage/storage-manager.js'
import type {
  PoolLike,
  RedisLike,
  StorageAdapter,
  StorageConfig,
} from '../../packages/theo/src/server/storage/storage-types.js'

// EC-3 — reset singleton state between `it` blocks to prevent pollution.
beforeEach(() => {
  __resetSingletonForTests()
  vi.restoreAllMocks()
})

const TEST_PW = 'test-only-stub'
const validConfig = (): StorageConfig => ({
  servers: {
    primary: { host: 'pg.example.com', port: 5432, user: 'theo', password: TEST_PW },
  },
  databases: {
    conv: { server: 'primary', database: 'theo_conv' },
    jobs: { server: 'primary', database: 'theo_jobs' },
  },
  redis: {
    cache: { host: 'redis.example.com', port: 6379, user: 'default', password: '' },
  },
})

const makePool = (label = 'default'): PoolLike & { __label: string; ended: boolean } => {
  const pool = {
    __label: label,
    ended: false,
    query: () => Promise.resolve({ rows: [] }),
    end: () => {
      pool.ended = true
      return Promise.resolve()
    },
  }
  return pool
}

const makeRedis = (
  label = 'default',
): RedisLike & { __label: string; quitCalls: number; disconnectCalls: number } => {
  const r = {
    __label: label,
    quitCalls: 0,
    disconnectCalls: 0,
    quit: () => {
      r.quitCalls++
      return Promise.resolve('OK')
    },
    disconnect: () => {
      r.disconnectCalls++
    },
  }
  return r
}

describe('T1.2 — StorageManager (ADR-0007)', () => {
  describe('singleton (D1)', () => {
    it('getStorageManager() returns the same instance across calls', () => {
      const a = getStorageManager()
      const b = getStorageManager()
      expect(a).toBe(b)
    })
  })

  describe('configure (D3)', () => {
    it('first call is honored', () => {
      const m = getStorageManager()
      m.configure(validConfig())
      expect(m.__isConfiguredForTests()).toBe(true)
    })

    it('second call warns and is ignored', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const m = getStorageManager()
      m.configure(validConfig())
      m.configure({ servers: { other: { host: 'h', user: 'u', password: '' } } })
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('already configured'))
    })
  })

  describe('usePostgres (D2)', () => {
    it('caches the pool on the second call (factory invoked 1×)', () => {
      const m = getStorageManager()
      m.configure(validConfig())
      const factory = vi.fn(() => makePool())
      const p1 = m.usePostgres('conv', factory)
      const p2 = m.usePostgres('conv', factory)
      expect(p1).toBe(p2)
      expect(factory).toHaveBeenCalledTimes(1)
    })

    it('throws for unknown db name (validation error)', () => {
      const m = getStorageManager()
      m.configure(validConfig())
      expect(() => m.usePostgres('ghost', () => makePool())).toThrow(
        /Database "ghost" not configured/,
      )
    })

    it('throws for db whose server is not configured (EC-2: deferred validation surfaces here)', () => {
      const m = getStorageManager()
      m.configure({
        servers: {}, // none
        databases: { conv: { server: 'ghost', database: 'theo' } },
      })
      expect(() => m.usePostgres('conv', () => makePool())).toThrow(/Server "ghost".*not found/)
    })

    it('throws after dispose (edge case)', async () => {
      const m = getStorageManager()
      m.configure(validConfig())
      await m.dispose()
      expect(() => m.usePostgres('conv', () => makePool())).toThrow(/StorageManager is disposed/)
    })

    it('factory throw is not cached — next call retries', () => {
      const m = getStorageManager()
      m.configure(validConfig())
      let attempt = 0
      const factory = () => {
        attempt++
        if (attempt === 1) throw new Error('boom')
        return makePool('retry')
      }
      expect(() => m.usePostgres('conv', factory)).toThrow(/boom/)
      const p = m.usePostgres('conv', factory)
      expect((p as PoolLike & { __label: string }).__label).toBe('retry')
    })
  })

  describe('useRedis', () => {
    it('caches per server name (happy path)', () => {
      const m = getStorageManager()
      m.configure(validConfig())
      const factory = vi.fn(() => makeRedis())
      const r1 = m.useRedis('cache', factory)
      const r2 = m.useRedis('cache', factory)
      expect(r1).toBe(r2)
      expect(factory).toHaveBeenCalledTimes(1)
    })

    it('throws for unknown server name', () => {
      const m = getStorageManager()
      m.configure(validConfig())
      expect(() => m.useRedis('ghost', () => makeRedis())).toThrow(
        /Redis server "ghost" not configured/,
      )
    })
  })

  describe('register + dispose (D5/D6)', () => {
    it('drains adapters + pools + redis (happy path)', async () => {
      const m = getStorageManager()
      m.configure(validConfig())
      const pool = makePool()
      const redis = makeRedis()
      let adapterDisposed = false
      const adapter: StorageAdapter = {
        name: 'test-adapter',
        dispose: () => {
          adapterDisposed = true
          return Promise.resolve()
        },
      }
      m.register(adapter)
      m.usePostgres('conv', () => pool)
      m.useRedis('cache', () => redis)

      await m.dispose()

      expect(adapterDisposed).toBe(true)
      expect(pool.ended).toBe(true)
      expect(redis.quitCalls).toBe(1)
    })

    it('is idempotent — second call no-op', async () => {
      const m = getStorageManager()
      m.configure(validConfig())
      let disposeCalls = 0
      m.register({
        name: 'count',
        dispose: () => {
          disposeCalls++
          return Promise.resolve()
        },
      })
      await m.dispose()
      await m.dispose()
      expect(disposeCalls).toBe(1)
    })

    it('swallows adapter dispose errors (error scenario)', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const m = getStorageManager()
      m.configure(validConfig())
      m.register({
        name: 'throws',
        dispose: () => Promise.reject(new Error('adapter boom')),
      })
      m.register({
        name: 'good',
        dispose: () => Promise.resolve(),
      })
      // Should NOT throw — both adapters processed, error logged
      await expect(m.dispose()).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('adapter "throws" dispose failed'))
    })

    it('falls back to disconnect() when quit() rejects (error scenario)', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const m = getStorageManager()
      m.configure(validConfig())
      const redis = {
        quitCalls: 0,
        disconnectCalls: 0,
        quit: () => {
          redis.quitCalls++
          return Promise.reject(new Error('quit boom'))
        },
        disconnect: () => {
          redis.disconnectCalls++
        },
      }
      m.useRedis('cache', () => redis)
      await m.dispose()
      expect(redis.quitCalls).toBe(1)
      expect(redis.disconnectCalls).toBe(1)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Redis quit failed'))
    })

    it('[EC-4] register() throws after dispose()', async () => {
      const m = getStorageManager()
      m.configure(validConfig())
      await m.dispose()
      expect(() => m.register({ name: 'late', dispose: () => Promise.resolve() })).toThrow(
        /StorageManager is disposed/,
      )
    })

    it('[EC-5] dispose() gracefully skips pools without .end() method', async () => {
      const m = getStorageManager()
      m.configure(validConfig())
      // Bypass type-safety to simulate user passing pool without `end`
      const partialPool: PoolLike = {
        query: () => Promise.resolve({ rows: [] }),
      }
      m.usePostgres('conv', () => partialPool)
      await expect(m.dispose()).resolves.toBeUndefined()
    })
  })

  describe('__resetForTests test seam', () => {
    it('clears state and allows re-configure (EC-3 enabler)', async () => {
      const m = getStorageManager()
      m.configure(validConfig())
      m.usePostgres('conv', () => makePool())
      await m.dispose()
      expect(m.__isDisposedForTests()).toBe(true)

      m.__resetForTests()
      expect(m.__isDisposedForTests()).toBe(false)
      expect(m.__isConfiguredForTests()).toBe(false)
      // Can configure again
      m.configure(validConfig())
      expect(m.__isConfiguredForTests()).toBe(true)
    })
  })

  describe('class identity', () => {
    it('StorageManager is constructable directly (for tests/isolation)', () => {
      const m = new StorageManager()
      expect(m).toBeInstanceOf(StorageManager)
    })
  })
})
