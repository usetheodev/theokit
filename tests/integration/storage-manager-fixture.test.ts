/**
 * Integration test for `tests/fixtures/storage-manager-recipe/` — proves the
 * end-to-end wire of `theo.config.ts > storage` → `getStorageManager().configure()`
 * → adapter consumption via `usePostgres` / `useRedis`.
 *
 * Uses in-memory stubs (no real PG / Redis required).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fixtureConfig from '../fixtures/storage-manager-recipe/theo.config.js'
import { initStorage } from '../fixtures/storage-manager-recipe/server/lib/storage-init.js'
import {
  __resetSingletonForTests,
  getStorageManager,
} from '../../packages/theo/src/server/storage/storage-manager.js'
import type { PoolLike, RedisLike } from '../../packages/theo/src/server/storage/storage-types.js'

beforeEach(() => {
  __resetSingletonForTests()
  vi.restoreAllMocks()
})

const makePool = (label: string): PoolLike & { __label: string; ended: boolean } => ({
  __label: label,
  ended: false,
  query: () => Promise.resolve({ rows: [] }),
  end() {
    this.ended = true
    return Promise.resolve()
  },
})

const makeRedis = (): RedisLike => ({
  quit: () => Promise.resolve('OK'),
  disconnect: () => {},
})

describe('T2.2 — storage-manager-recipe fixture', () => {
  it('boots when initStorage(config) is called with the fixture config (happy path)', () => {
    initStorage(fixtureConfig)
    const manager = getStorageManager()
    expect(manager.__isConfiguredForTests()).toBe(true)
  })

  it('initStorage warns and ignores when called twice with config (EC-3 / D3)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    initStorage(fixtureConfig)
    initStorage(fixtureConfig)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('already configured'))
  })

  it('initStorage is a no-op when storage block absent (edge case)', () => {
    initStorage({})
    expect(getStorageManager().__isConfiguredForTests()).toBe(false)
  })

  it('two databases on the same server produce SEPARATE pools (one per dbName)', () => {
    initStorage(fixtureConfig)
    const manager = getStorageManager()
    let count = 0
    const factory = () => makePool(`pool-${++count}`)
    const conv = manager.usePostgres('conversations', factory)
    const jobs = manager.usePostgres('jobs', factory)
    expect(conv).not.toBe(jobs)
    expect(count).toBe(2) // one factory call per dbName
  })

  it('manager.dispose() drains the fixture pools end-to-end (lifecycle scenario)', async () => {
    initStorage(fixtureConfig)
    const manager = getStorageManager()
    const conv = makePool('conv')
    const jobs = makePool('jobs')
    const redis = makeRedis()
    manager.usePostgres('conversations', () => conv)
    manager.usePostgres('jobs', () => jobs)
    manager.useRedis('cache', () => redis)
    await manager.dispose()
    expect(conv.ended).toBe(true)
    expect(jobs.ended).toBe(true)
    expect(manager.__isDisposedForTests()).toBe(true)
  })

  it('fixture exports a defineConfig-derived object with `storage` populated', () => {
    expect(fixtureConfig).toBeDefined()
    expect(fixtureConfig.storage).toBeDefined()
    expect(fixtureConfig.storage?.servers?.primary).toBeDefined()
    expect(Object.keys(fixtureConfig.storage?.databases ?? {})).toEqual(['conversations', 'jobs'])
  })
})
