/**
 * Fixture (T2.2) — initStorage(config).
 *
 * In a real app this is called once at boot (from `start.ts`, see T3.1).
 * For tests we call it directly and assert manager state.
 */
import { getStorageManager } from '../../../../../packages/theo/src/server/storage/storage-manager.js'
import type { StorageConfig } from '../../../../../packages/theo/src/server/storage/storage-types.js'

export interface AppConfig {
  storage?: StorageConfig
}

export function initStorage(config: AppConfig): void {
  if (config.storage === undefined) return
  const manager = getStorageManager()
  manager.configure(config.storage)
}
