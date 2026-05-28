/**
 * Fixture (T2.2) — Postgres + Redis factories for `StorageManager`.
 *
 * Factories are user-owned (D2 in ADR-0007): TheoKit never hard-imports
 * `pg` or `ioredis`. Apps that use these adapters install the driver and
 * provide the factory; apps that don't pay nothing.
 *
 * Note: these factories use `require()` so the drivers are loaded only when
 * the manager actually invokes them (lazy).
 */
import type {
  PoolLike,
  PostgresDatabaseConfig,
  RedisLike,
  RedisServerConfig,
  ServerConfig,
} from '../../../../../packages/theo/src/server/storage/storage-types.js'

export const pgPoolFactory = (_server: ServerConfig, _db: PostgresDatabaseConfig): PoolLike => {
  // In production: `const { Pool } = await import('pg')`.
  // In the fixture test, the test injects a stub factory directly via
  // `manager.usePostgres('conv', stubFactory)` — this file documents the
  // user-facing shape only.
  throw new Error(
    'pgPoolFactory called without driver install. ' +
      'In production: install `pg` and replace this stub with `new (await import("pg")).Pool({...})`.',
  )
}

export const redisFactory = (_config: RedisServerConfig): RedisLike => {
  throw new Error(
    'redisFactory called without driver install. ' +
      'In production: install `ioredis` and return `new (await import("ioredis")).default({...})`.',
  )
}
