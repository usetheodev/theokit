/**
 * Bootstrap stages extracted from `start.ts` per T4.2 (architecture-cleanup, ADR-0017).
 *
 * The full goal of T4.2 is a ≤30-LOC `startCommand` spine + 6-8 stage files. This
 * file ships the first batch: the configure-from-config bootstrap helpers + the
 * SSR entry resolver. They are stand-alone, side-effect-free at module load, and
 * already individually testable.
 *
 * Remaining stages (request-handler extraction, graceful-shutdown extraction,
 * signal-handlers extraction) are deferred to a follow-up sprint — see plan
 * `docs/plans/architecture-cleanup-plan.md` T4.2 Deferred sub-tasks.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { warnOnce } from '../../server/observability/logger.js'

interface SdkAgentRegistry {
  configure?: (opts: { maxAgents?: number; idleTimeoutMs?: number }) => void
}
interface SdkModule {
  Agent?: { registry?: SdkAgentRegistry }
}

/**
 * Configure SDK's Agent.registry from `theo.config.ts > agents.registry`.
 * Lazy at boot; EC-3 sync flag flip prevents race under concurrent boot.
 * Silent no-op when registry config is absent or SDK is uninstalled.
 */
export async function configureAgentRegistryFromConfig(
  registryConfig: { maxAgents: number; idleTimeoutMs: number } | undefined,
): Promise<void> {
  if (registryConfig === undefined) return
  try {
    const sdk = (await import('@usetheo/sdk').catch(() => null)) as SdkModule | null
    const sdkConfigure = sdk?.Agent?.registry?.configure
    if (sdkConfigure === undefined) return
    const { configureAgentRegistryOnce } =
      await import('../../server/agent/configure-agent-registry.js')
    configureAgentRegistryOnce(
      {
        configure: (opts) => {
          sdkConfigure(opts)
        },
      },
      registryConfig,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    warnOnce('bootstrap.agent_registry_skip', {
      event: 'bootstrap.agent_registry_skip',
      message: msg,
    })
  }
}

/**
 * Configure the StorageManager from `theo.config.ts > storage` (ADR-0007).
 * Manager enforces configure-once internally (D3); this helper bridges the
 * config to the singleton with actionable error handling.
 */
export async function configureStorageManagerFromConfig(storageConfig: unknown): Promise<void> {
  if (storageConfig === undefined || storageConfig === null) return
  try {
    const { getStorageManager } = await import('../../server/storage/storage-manager.js')
    const { storageSchema } = await import('../../config/schema.js')
    // Re-validate at boot so a malformed config from a non-Zod source
    // (test fixtures, dynamic configs) surfaces a clear error early.
    const parsed = storageSchema.parse(storageConfig)
    getStorageManager().configure(parsed)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    warnOnce('bootstrap.storage_skip', {
      event: 'bootstrap.storage_skip',
      message: msg,
    })
  }
}

const SSR_EXTENSIONS = ['.mjs', '.js'] as const

/**
 * Resolve the SSR entry-server module path. tsup may emit `.mjs` or `.js`
 * depending on output format. Try `.mjs` first (modern default) then fall
 * back to `.js`. Returns null when neither exists — SSR stays disabled.
 *
 * Exported so unit tests can pin the resolution order without booting the
 * full CLI.
 */
export function resolveSsrEntry(distDir: string): string | null {
  for (const ext of SSR_EXTENSIONS) {
    const path = resolve(distDir, `server/entry-server${ext}`)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- distDir is from `theokit start`'s own caller-controlled config; the suffix is from a const literal array
    if (existsSync(path)) return path
  }
  return null
}
