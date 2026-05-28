/**
 * StorageManager public surface (ADR-0007).
 *
 * Imported into the top-level `theokit/server` barrel (T1.3).
 */

export { StorageManager, getStorageManager, __resetSingletonForTests } from './storage-manager.js'
export { useUnstorage } from './use-unstorage.js'
export type { UnstorageInstance } from './use-unstorage.js'
export { useDatabase } from './use-database.js'
export type { Db0Database } from './use-database.js'
export type { PostgresFactory, RedisFactory } from './storage-manager.js'
export type {
  GenericFactory,
  PoolLike,
  PostgresDatabaseConfig,
  RedisLike,
  RedisServerConfig,
  ServerConfig,
  StorageAdapter,
  StorageConfig,
  TlsConfig,
} from './storage-types.js'
