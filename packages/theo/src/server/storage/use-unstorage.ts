/**
 * `useUnstorage(name, driver?)` — wraps `unstorage.createStorage({ driver })`
 * via `StorageManager.useStorage<T>` for caching + lifecycle coordination.
 *
 * Architectural decision: see ADR-0009 (`unstorage` adoption for KV drivers).
 *
 * `unstorage` is an OPTIONAL peer dependency. Apps that don't use KV pay zero
 * bundle cost; calling `useUnstorage` without `unstorage` installed throws an
 * actionable error.
 *
 * The returned `Storage<T>` is auto-registered with `manager.dispose()` so
 * SIGTERM drains it. Repeated calls with the same `name` return the cached
 * instance (factory invoked once).
 *
 * @example Memory driver (dev / tests)
 *   const cache = await useUnstorage<string>('cache')
 *   await cache.setItem('k', 'v')
 *
 * @example Redis driver (prod)
 *   import redisDriver from 'unstorage/drivers/redis'
 *   const cache = await useUnstorage<string>('cache', redisDriver({ url: process.env.REDIS_URL }))
 *
 * Reserved cache key prefix: `__unstorage:` — do NOT use this prefix in
 * `manager.useStorage<T>(name)` to avoid collision (EC-8 documented).
 */
import { getStorageManager } from './storage-manager.js'

interface UnstorageModule {
  createStorage: <T>(options?: { driver?: unknown }) => UnstorageInstance<T>
}

export interface UnstorageInstance<T> {
  getItem(key: string): Promise<T | null>
  setItem(key: string, value: T): Promise<void>
  removeItem(key: string): Promise<void>
  keys(prefix?: string): Promise<string[]>
  hasItem(key: string): Promise<boolean>
  clear(prefix?: string): Promise<void>
  dispose?(): Promise<void>
}

export async function useUnstorage<T = unknown>(
  name: string,
  driver?: unknown,
): Promise<UnstorageInstance<T>> {
  const mod = (await import('unstorage').catch(() => null)) as UnstorageModule | null
  if (mod === null) {
    throw new Error(
      "useUnstorage requires the 'unstorage' package. Install via: pnpm add unstorage",
    )
  }
  const manager = getStorageManager()
  return manager.useStorage<UnstorageInstance<T>>(`__unstorage:${name}`, () => {
    const storage = mod.createStorage<T>({ driver })
    manager.register({
      name: `unstorage:${name}`,
      dispose: () => storage.dispose?.() ?? Promise.resolve(),
    })
    return storage
  })
}
