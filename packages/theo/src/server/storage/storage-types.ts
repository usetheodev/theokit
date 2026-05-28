/**
 * Canonical structural types for the StorageManager (ADR-0007).
 *
 * `PoolLike` is the minimal pg.Pool subset TheoKit consumes — defined here as
 * single source of truth (D7). Adapters that need a Postgres pool import this
 * type instead of duplicating the shape.
 *
 * `RedisLike` is the minimal ioredis subset the manager calls during dispose.
 *
 * `StorageAdapter` is the lifecycle contract — anything that wants to
 * participate in the StorageManager drain on SIGTERM implements this.
 */

/**
 * Minimal subset of `pg.Pool` we depend on. Accepting this narrower interface
 * lets us:
 *   - test with `pg-mem` (in-memory) without dragging real Postgres into CI
 *   - swap to any wire-compatible client (postgres.js, slonik, etc.)
 *
 * Optional `end()` lets the manager call it during dispose; not required for
 * pools that handle their own lifecycle (e.g., serverless drivers).
 */
export interface PoolLike {
  // The generic R is intentionally used once — callers narrow row shape
  // per-query via `pool.query<MyRowShape>(...)`. Suppressing TS lint;
  // ergonomics > theoretical purity here.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  query<R = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; rowCount?: number | null }>
  /** Optional — manager calls this during dispose(). Pools without end() are silently skipped (EC-5). */
  end?: () => Promise<void>
}

/**
 * Minimal subset of ioredis we depend on during graceful shutdown. The full
 * Redis API is the user's responsibility — manager only needs lifecycle.
 */
export interface RedisLike {
  /** Graceful close — drains pending commands. */
  quit(): Promise<unknown>
  /** Hard close — used as fallback if `quit()` rejects. */
  disconnect(): void
}

/**
 * Lifecycle contract for any adapter that participates in StorageManager
 * graceful shutdown. Call `manager.register(this)` from your adapter's
 * constructor to opt in.
 *
 * Errors thrown from `dispose()` are swallowed by the manager (D5/D6 — log +
 * continue). Do not rely on `dispose()` rejection propagating.
 */
export interface StorageAdapter {
  readonly name: string
  dispose(): Promise<void>
}

/**
 * Generic factory signature for `StorageManager.useStorage<T>(name, factory)`.
 * Useful for typing externally-defined factory functions:
 *
 * ```ts
 * const mongoFactory: GenericFactory<MongoClient> = () => new MongoClient({...})
 * manager.useStorage('mongo', mongoFactory)
 * ```
 */
export type GenericFactory<T> = () => T

/* ─────────────── Config types (mirrors Zod schema in config/schema.ts) ─────────────── */

export interface TlsConfig {
  rejectUnauthorized?: boolean
  caCert?: string
  clientCert?: string
  clientKey?: string
}

export interface ServerConfig {
  host: string
  port?: number
  user: string
  password: string
  tls?: TlsConfig
}

export interface PostgresDatabaseConfig {
  /** References a key in `StorageConfig.servers`. */
  server: string
  database: string
  pool?: {
    min?: number
    max?: number
    connectionTimeoutMillis?: number
    idleTimeoutMillis?: number
  }
}

export interface RedisServerConfig extends ServerConfig {
  db?: number
  maxRetriesPerRequest?: number
}

export interface StorageConfig {
  servers?: Record<string, ServerConfig>
  databases?: Record<string, PostgresDatabaseConfig>
  redis?: Record<string, RedisServerConfig>
}
