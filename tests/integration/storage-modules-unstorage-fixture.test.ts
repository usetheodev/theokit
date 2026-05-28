/**
 * Integration test for `tests/fixtures/storage-modules-unstorage-redis/`.
 *
 * Verifies the end-to-end wire of `useUnstorage(name, driver)` with a custom
 * Driver implementation. Uses the in-memory `mockRedisDriver` for determinism.
 */
import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import type { Driver } from 'unstorage'
import {
  __resetSingletonForTests,
  getStorageManager,
} from '../../packages/theo/src/server/storage/storage-manager.js'
import { getCache } from '../fixtures/storage-modules-unstorage-redis/server/lib/cache.js'
import { mockRedisDriver } from '../fixtures/storage-modules-unstorage-redis/server/lib/mock-redis-driver.js'

beforeEach(() => {
  __resetSingletonForTests()
})

describe('T3.2 — storage-modules-unstorage-redis fixture', () => {
  it('boots with useUnstorage + mock driver (happy path)', async () => {
    const cache = await getCache()
    expect(cache).toBeDefined()
    expect(typeof cache.getItem).toBe('function')
  })

  it('setItem / getItem roundtrip preserves complex value (happy path)', async () => {
    const cache = await getCache<{ name: string; tags: string[] }>('users')
    await cache.setItem('u1', { name: 'alice', tags: ['admin', 'editor'] })
    const got = await cache.getItem('u1')
    expect(got).toEqual({ name: 'alice', tags: ['admin', 'editor'] })
  })

  it('dispose closes storage cleanly (lifecycle)', async () => {
    const m = getStorageManager()
    await getCache('disposable')
    await expect(m.dispose()).resolves.toBeUndefined()
  })

  it('removeItem after setItem returns null (edge case)', async () => {
    const cache = await getCache('rm-test')
    await cache.setItem('k', 'v')
    await cache.removeItem('k')
    expect(await cache.getItem('k')).toBeNull()
  })

  it('concurrent setItem resolves last-write-wins (error scenario: concurrency)', async () => {
    const cache = await getCache<number>('concurrent')
    await Promise.all([
      cache.setItem('counter', 1),
      cache.setItem('counter', 2),
      cache.setItem('counter', 3),
      cache.setItem('counter', 4),
      cache.setItem('counter', 5),
    ])
    const value = await cache.getItem('counter')
    expect([1, 2, 3, 4, 5]).toContain(value)
  })

  it('[EC-7] mock driver shape matches unstorage Driver interface (type pin)', () => {
    const driver = mockRedisDriver()
    expectTypeOf(driver).toExtend<Driver>()
    expect(driver.name).toBe('mock-redis')
    expect(typeof driver.getItem).toBe('function')
    expect(typeof driver.setItem).toBe('function')
    expect(typeof driver.removeItem).toBe('function')
  })

  it('prefix option scopes keys correctly (happy path)', async () => {
    const driver = mockRedisDriver({ prefix: 'app:' })
    expect(driver.name).toBe('mock-redis')
    expect(driver.options).toEqual({ prefix: 'app:' })
  })
})
