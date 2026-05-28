import { describe, it, expectTypeOf } from 'vitest'

import type { InMemoryCacheAdapter } from '../../packages/theo/src/cache/in-memory-adapter.js'
import type {
  CacheEntry,
  CacheStorageAdapter,
  CacheStore,
  CacheStoreAdmin,
} from '../../packages/theo/src/cache/storage-adapter.js'

/**
 * T4.4 — CacheStorageAdapter ISP split.
 * Covers PV-8 + EC-14 (InMemoryCacheAdapter satisfies full union).
 */
describe('CacheStorageAdapter ISP split (T4.4)', () => {
  it('CacheStore has 5 members (4 hot methods + name)', () => {
    expectTypeOf<keyof CacheStore>().toEqualTypeOf<
      'name' | 'get' | 'set' | 'delete' | 'deleteByTag'
    >()
  })

  it('CacheStoreAdmin has 3 admin methods', () => {
    expectTypeOf<keyof CacheStoreAdmin>().toEqualTypeOf<'size' | 'clear' | 'keys'>()
  })

  it('EC-14 — InMemoryCacheAdapter satisfies CacheStore & CacheStoreAdmin', () => {
    expectTypeOf<InMemoryCacheAdapter>().toExtend<CacheStore>()
    expectTypeOf<InMemoryCacheAdapter>().toExtend<CacheStoreAdmin>()
  })

  it('CacheStorageAdapter type alias = CacheStore & Partial<CacheStoreAdmin>', () => {
    // A minimal class implementing ONLY CacheStore (no admin) must still
    // satisfy CacheStorageAdapter (backward compat).
    class MinimalAdapter implements CacheStore {
      readonly name = 'minimal'
      async get(_k: string): Promise<CacheEntry | undefined> {
        return undefined
      }
      async set(_k: string, _e: CacheEntry): Promise<void> {}
      async delete(_k: string): Promise<boolean> {
        return false
      }
      async deleteByTag(_t: string): Promise<number> {
        return 0
      }
    }
    expectTypeOf<MinimalAdapter>().toExtend<CacheStorageAdapter>()
  })
})
