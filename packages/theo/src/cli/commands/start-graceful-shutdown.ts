/**
 * Graceful shutdown stage for `theokit start` (T4.2 architecture-cleanup,
 * ADR-0007 D6 — SIGTERM evicts agents + drains StorageManager).
 *
 * EC-13: SIGTERM evicts agents IMMEDIATELY (no per-request drain). In-flight
 * requests get aborted mid-stream — acceptable because the platform LB
 * removed this pod from rotation BEFORE sending SIGTERM (K8s preStop hook +
 * terminationGracePeriodSeconds; same on Vercel/CF/Render).
 *
 * Re-entry guard: multiple SIGTERMs in quick succession run shutdown ONCE.
 */

import type { Server as HttpServer } from 'node:http'

import { warnOnce } from '../../server/observability/logger.js'

export function installGracefulShutdown(server: HttpServer): void {
  let shuttingDown = false
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`\n  [theokit] ${signal} received — evicting agents`)
    void (async () => {
      // Lazy-import SDK only at shutdown time to avoid forcing the dep on
      // apps that don't use agents at all.
      try {
        const sdk = (await import('@usetheo/sdk').catch(() => null)) as {
          Agent?: { registry?: { evictAll?: () => Promise<void> } }
        } | null
        if (sdk?.Agent?.registry?.evictAll !== undefined) {
          await sdk.Agent.registry.evictAll()
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        warnOnce('shutdown.evict_error', {
          event: 'shutdown.evict_error',
          message: msg,
        })
      }
      // T3.1 — drain the StorageManager AFTER agent eviction. Order matters:
      // agents may still hold open pool refs while evicting; closing pools
      // first would break in-flight queries.
      try {
        const { getStorageManager } = await import('../../server/storage/storage-manager.js')
        const manager = getStorageManager()
        await manager.dispose()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        warnOnce('shutdown.dispose_error', {
          event: 'shutdown.dispose_error',
          message: msg,
        })
      }
      console.log(`  [theokit] shutdown complete`)
      server.close(() => {
        process.exit(0)
      })
      setTimeout(() => {
        warnOnce('shutdown.forced_exit', {
          event: 'shutdown.forced_exit',
          message: 'forced exit after 25s timeout',
        })
        process.exit(0)
      }, 25_000).unref()
    })()
  }
  process.on('SIGTERM', () => {
    shutdown('SIGTERM')
  })
  process.on('SIGINT', () => {
    shutdown('SIGINT')
  })
}
