/**
 * StorageManager — per-process singleton coordinating pluggable storage
 * adapters (Postgres pools, Redis clients, in-memory adapters).
 *
 * Architectural decisions: see ADR-0007 (docs/adr/0007-storage-manager-singleton.md).
 *
 * Lifecycle:
 *   1. `getStorageManager()` returns the singleton (D1).
 *   2. `configure(storageConfig)` honored once per process (D3). Second call
 *      warns and is ignored.
 *   3. `usePostgres(dbName, factory)` / `useRedis(serverName, factory)`
 *      lazily create + cache (D2). Factory invoked exactly once per name.
 *   4. `register(adapter)` opts the adapter into the SIGTERM drain (D6).
 *   5. `dispose()` drains in parallel — adapters + pools + Redis (D5).
 *      Idempotent. Adapter errors logged + swallowed (do not block shutdown).
 *
 * Test seam: `__resetForTests()` resets state. Test files MUST call it from
 * `beforeEach` to avoid pollution across `it` blocks (EC-3).
 */

import type {
  PoolLike,
  PostgresDatabaseConfig,
  RedisLike,
  RedisServerConfig,
  ServerConfig,
  StorageAdapter,
  StorageConfig,
} from './storage-types.js'

export type PostgresFactory = (server: ServerConfig, db: PostgresDatabaseConfig) => PoolLike
export type RedisFactory = (config: RedisServerConfig) => RedisLike

export class StorageManager {
  #config: StorageConfig | undefined
  readonly #dbPools = new Map<string, PoolLike>()
  readonly #redisClients = new Map<string, RedisLike>()
  readonly #genericClients = new Map<string, unknown>()
  readonly #adapters = new Set<StorageAdapter>()
  #disposed = false

  /**
   * Apply the storage config block from `theo.config.ts`. Second call warns
   * and is ignored (D3). Reset only via `__resetForTests()`.
   */
  configure(config: StorageConfig): void {
    if (this.#config !== undefined) {
      console.warn('[theokit] StorageManager already configured; ignoring second configure() call')
      return
    }
    this.#config = config
  }

  /**
   * Generic cache + factory for ANY client (MySQL, Mongo, Turso, DynamoDB, …).
   * Returns the cached client OR invokes the factory and caches its return.
   *
   * EC-1 FIX: cache-hit check uses `Map.has(name)`, NOT `cached !== undefined`.
   * Factories returning `null` or `undefined` are valid (lazy connect, stubs);
   * the `!== undefined` check would re-invoke the factory infinitely for
   * undefined returns AND silently cache `null` cast as `T`.
   *
   * EC-2 (documented type hole): `useStorage<A>('x', fA)` followed by
   * `useStorage<B>('x', fB)` returns the cached A cast as B. Same trade-off
   * as `Map<string, unknown>` — caller is responsible for using unique names
   * per type.
   *
   * Lifecycle: generic clients are NOT auto-drained by `dispose()`. Call
   * `manager.register({ name, dispose })` separately to participate.
   *
   * Reserved name prefixes (do NOT use): `__pg:`, `__redis:`, `__unstorage:`,
   * `__db0:` — these are used internally by the typed helpers.
   */
  useStorage<T>(name: string, factory: () => T): T {
    if (this.#disposed) throw new Error('StorageManager is disposed')
    if (this.#genericClients.has(name)) return this.#genericClients.get(name) as T
    const client = factory()
    this.#genericClients.set(name, client)
    return client
  }

  /**
   * Return a Postgres pool for the named database. Lazy + cached. Factory
   * invoked exactly once per `dbName` (D2).
   *
   * Throws if:
   *   - manager is disposed
   *   - `dbName` is not in `config.databases`
   *   - the referenced server is not in `config.servers` (EC-2: deferred
   *     cross-field validation surfaces here, not at configure time)
   */
  usePostgres(dbName: string, factory: PostgresFactory): PoolLike {
    if (this.#disposed) throw new Error('StorageManager is disposed')
    const cached = this.#dbPools.get(dbName)
    if (cached !== undefined) return cached
    const dbConfig = this.#config?.databases?.[dbName]
    if (dbConfig === undefined) {
      throw new Error(
        `Database "${dbName}" not configured. Add it to theo.config.ts > storage.databases.`,
      )
    }
    const server = this.#config?.servers?.[dbConfig.server]
    if (server === undefined) {
      throw new Error(
        `Server "${dbConfig.server}" referenced by database "${dbName}" not found in theo.config.ts > storage.servers.`,
      )
    }
    const pool = factory(server, dbConfig)
    this.#dbPools.set(dbName, pool)
    return pool
  }

  /**
   * Return a Redis client for the named server. Lazy + cached. Factory
   * invoked exactly once per `serverName`.
   */
  useRedis(serverName: string, factory: RedisFactory): RedisLike {
    if (this.#disposed) throw new Error('StorageManager is disposed')
    const cached = this.#redisClients.get(serverName)
    if (cached !== undefined) return cached
    const serverConfig = this.#config?.redis?.[serverName]
    if (serverConfig === undefined) {
      throw new Error(
        `Redis server "${serverName}" not configured. Add it to theo.config.ts > storage.redis.`,
      )
    }
    const client = factory(serverConfig)
    this.#redisClients.set(serverName, client)
    return client
  }

  /**
   * Register an adapter for graceful shutdown coordination (D6).
   *
   * EC-4: throws if the manager is already disposed — prevents silent
   * leaks in test seams that reset+reuse the manager.
   */
  register(adapter: StorageAdapter): void {
    if (this.#disposed) {
      throw new Error(
        'StorageManager is disposed; cannot register new adapter. Call __resetForTests() in test setup.',
      )
    }
    this.#adapters.add(adapter)
  }

  /**
   * Drain in parallel — registered adapters, then PG pools, then Redis
   * clients. Idempotent (D5). Errors per resource are logged and swallowed
   * — they do NOT prevent shutdown of the remaining resources.
   *
   * Caller must wrap in a timeout if a bound is needed (EC-7: documented).
   * In production, `start.ts` wraps the whole shutdown sequence in a 25 s
   * force-exit timer.
   */
  async dispose(): Promise<void> {
    if (this.#disposed) return
    this.#disposed = true

    const adapterDrains = Array.from(this.#adapters).map((a) =>
      a.dispose().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[theokit] adapter "${a.name}" dispose failed: ${msg}`)
      }),
    )
    await Promise.all(adapterDrains)

    const poolCloses = Array.from(this.#dbPools.values()).map((pool) => {
      // EC-5: pool without `.end()` is silently skipped (TS already enforces
      // shape at factory signature; this is the graceful runtime fallback if
      // user bypasses via `as` cast).
      if (pool.end === undefined) return Promise.resolve()
      return pool.end().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[theokit] PG pool close failed: ${msg}`)
      })
    })
    await Promise.all(poolCloses)

    const redisCloses = Array.from(this.#redisClients.values()).map((c) =>
      c.quit().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[theokit] Redis quit failed, falling back to disconnect: ${msg}`)
        c.disconnect()
      }),
    )
    await Promise.all(redisCloses)

    this.#dbPools.clear()
    this.#redisClients.clear()
    this.#genericClients.clear()
    this.#adapters.clear()
  }

  /** @internal Testing seam — resets state so a single test file can re-use the singleton across `it` blocks (EC-3). */
  __resetForTests(): void {
    this.#config = undefined
    this.#dbPools.clear()
    this.#redisClients.clear()
    this.#genericClients.clear()
    this.#adapters.clear()
    this.#disposed = false
  }

  /** @internal Introspection helper for tests. */
  __isConfiguredForTests(): boolean {
    return this.#config !== undefined
  }

  /** @internal Introspection helper for tests. */
  __isDisposedForTests(): boolean {
    return this.#disposed
  }
}

// Singleton — one StorageManager per process (D1).
let __singleton: StorageManager | undefined

export function getStorageManager(): StorageManager {
  __singleton ??= new StorageManager()
  return __singleton
}

/** @internal Drops the module-level singleton — used by tests that need a fresh manager. */
export function __resetSingletonForTests(): void {
  __singleton = undefined
}
