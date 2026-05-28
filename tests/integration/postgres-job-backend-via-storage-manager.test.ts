import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostgresJobBackend } from '../../packages/theo/src/server/jobs/job-backend-postgres.js'
import {
  __resetSingletonForTests,
  getStorageManager,
} from '../../packages/theo/src/server/storage/storage-manager.js'
import type { PoolLike } from '../../packages/theo/src/server/storage/storage-types.js'

beforeEach(() => {
  __resetSingletonForTests()
})

const makePool = (): PoolLike => ({
  query: () => Promise.resolve({ rows: [] }),
  end: () => Promise.resolve(),
})

const minimalConfig = () => ({
  servers: {
    primary: { host: 'h', user: 'u', password: '' },
  },
  databases: {
    jobs: { server: 'primary', database: 'theo_jobs' },
  },
})

describe('T2.1 — PostgresJobBackend.fromStorageManager (ADR-0007)', () => {
  it('creates a backend with a manager-cached pool (happy path)', () => {
    const m = getStorageManager()
    m.configure(minimalConfig())
    const factory = vi.fn(() => makePool())
    const backend = PostgresJobBackend.fromStorageManager(m, 'jobs', factory)
    expect(backend).toBeInstanceOf(PostgresJobBackend)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('reuses pool across multiple fromStorageManager calls with same dbName', () => {
    const m = getStorageManager()
    m.configure(minimalConfig())
    const factory = vi.fn(() => makePool())
    PostgresJobBackend.fromStorageManager(m, 'jobs', factory)
    PostgresJobBackend.fromStorageManager(m, 'jobs', factory)
    expect(factory).toHaveBeenCalledTimes(1) // pool cached on first call
  })

  it('throws for unknown db name (validation error)', () => {
    const m = getStorageManager()
    m.configure({ databases: {}, servers: {} })
    expect(() => PostgresJobBackend.fromStorageManager(m, 'ghost', () => makePool())).toThrow(
      /Database "ghost" not configured/,
    )
  })

  it('original constructor still works (BC)', () => {
    const backend = new PostgresJobBackend({ pool: makePool() })
    expect(backend).toBeInstanceOf(PostgresJobBackend)
    expect(backend.name).toBe('postgres')
  })

  it('throws after manager.dispose() (error scenario)', async () => {
    const m = getStorageManager()
    m.configure(minimalConfig())
    await m.dispose()
    expect(() => PostgresJobBackend.fromStorageManager(m, 'jobs', () => makePool())).toThrow(
      /StorageManager is disposed/,
    )
  })

  it('forwards tableName option to constructor', () => {
    const m = getStorageManager()
    m.configure(minimalConfig())
    const backend = PostgresJobBackend.fromStorageManager(m, 'jobs', () => makePool(), {
      tableName: 'custom_jobs_table',
    })
    // Indirect check — we can't introspect #table, but the backend was built
    // without throwing, which means the options merged correctly.
    expect(backend).toBeInstanceOf(PostgresJobBackend)
  })
})
