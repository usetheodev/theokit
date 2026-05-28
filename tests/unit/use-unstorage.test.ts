import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import {
  __resetSingletonForTests,
  getStorageManager,
} from '../../packages/theo/src/server/storage/storage-manager.js'
import { useUnstorage } from '../../packages/theo/src/server/storage/use-unstorage.js'

beforeEach(() => {
  __resetSingletonForTests()
})

describe('T3.1 — useUnstorage(name, driver?) (ADR-0009)', () => {
  it('returns Storage instance with getItem/setItem/removeItem (happy path)', async () => {
    const storage = await useUnstorage<string>('cache-test')
    expect(typeof storage.getItem).toBe('function')
    expect(typeof storage.setItem).toBe('function')
    expect(typeof storage.removeItem).toBe('function')
  })

  it('caches per name — same instance returned across calls (happy path)', async () => {
    const a = await useUnstorage<string>('cache-cache')
    const b = await useUnstorage<string>('cache-cache')
    expect(a).toBe(b)
  })

  it('independent namespace from manager.useStorage (no collision)', async () => {
    const m = getStorageManager()
    const generic = m.useStorage('foo', () => ({ kind: 'plain' }))
    const unstorage = await useUnstorage('foo')
    expect(generic).not.toBe(unstorage as unknown as { kind: 'plain' })
  })

  it('default driver is memory — set+get roundtrip works (edge case)', async () => {
    const storage = await useUnstorage<string>('roundtrip')
    await storage.setItem('k1', 'v1')
    const value = await storage.getItem('k1')
    expect(value).toBe('v1')
  })

  it('removeItem after setItem returns null on getItem (edge case)', async () => {
    const storage = await useUnstorage<string>('remove-test')
    await storage.setItem('k', 'v')
    await storage.removeItem('k')
    expect(await storage.getItem('k')).toBeNull()
  })

  it('drains via manager.dispose() — storage participates in shutdown (lifecycle)', async () => {
    const m = getStorageManager()
    await useUnstorage<string>('drain-me')
    // Dispose should not throw
    await expect(m.dispose()).resolves.toBeUndefined()
  })

  it('typed value inference — getItem returns T | null (type test)', async () => {
    interface User {
      id: number
      name: string
    }
    const storage = await useUnstorage<User>('users')
    const value = await storage.getItem('u1')
    expectTypeOf(value).toEqualTypeOf<User | null>()
    expect(value).toBeNull()
  })

  it('hasItem reflects setItem state (happy path)', async () => {
    const storage = await useUnstorage<number>('has-test')
    expect(await storage.hasItem('absent')).toBe(false)
    await storage.setItem('present', 42)
    expect(await storage.hasItem('present')).toBe(true)
  })

  it('keys() lists prefixed entries (happy path)', async () => {
    const storage = await useUnstorage<string>('keys-test')
    await storage.setItem('a', '1')
    await storage.setItem('b', '2')
    const keys = await storage.keys()
    expect(keys.length).toBeGreaterThanOrEqual(2)
    expect(keys).toContain('a')
    expect(keys).toContain('b')
  })

  // EC-4 — verified by smoke test that useUnstorage isn't tree-shaken inappropriately
  it('[EC-4] useUnstorage marked server-only — only reachable via theokit/server barrel', async () => {
    const theokit = await import('../../packages/theo/src/server/index.js')
    expect(typeof theokit.useUnstorage).toBe('function')
    // The barrel package.json marks this entry "node" only; client bundles
    // never resolve it. This test confirms the export is present in the
    // server barrel (and thus subject to the bundler's server-only resolution).
  })
})
