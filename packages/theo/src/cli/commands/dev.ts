import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { createServer, type ViteDevServer } from 'vite'

import { loadConfig } from '../../config/load-config.js'
import { loadEnv } from '../../config/load-env.js'
import { validateProjectStructure } from '../../core/validate-structure.js'
import { theoPluginAsync } from '../../vite-plugin/index.js'
import { gcAgentRegistry } from '../lib/cleanup.js'

interface DevOptions {
  port?: number
}

export async function startDevServer(cwd: string, options?: DevOptions): Promise<ViteDevServer> {
  // Phase 1 (T1.2) — Load .env files into process.env BEFORE any module
  // reads them. Must run before loadConfig() so theo.config.ts functions
  // referencing process.env.* resolve correctly.
  loadEnv({ cwd, mode: 'development' })

  const config = await loadConfig(cwd)
  validateProjectStructure(cwd)

  // T2.3 — LRU cleanup of `.theokit/agents/<id>/` at startup. Long-lived
  // dev sessions accumulate orphan agent registries (52+ in item #6 dogfood).
  // Default cap 100, configurable via config.agents.maxRegistries.
  const agentsDir = resolve(cwd, '.theokit/agents')
  const gcResult = await gcAgentRegistry({
    dir: agentsDir,
    maxAgents: config.agents?.maxRegistries ?? 100,
  })
  if (gcResult.deleted > 0) {
    console.log(
      `[theokit] Cleaned ${String(gcResult.deleted)} stale agent registries (kept ${String(gcResult.kept)})`,
    )
  }

  const port = options?.port ?? config.port
  // Narrow the rateLimit union: only the legacy flat shape (windowMs+max)
  // flows into the theoPlugin's RateLimitConfig parameter. The per-route
  // variant is consumed inside the api-middleware via the loaded user
  // config separately.
  const flatRateLimit =
    config.rateLimit && 'windowMs' in config.rateLimit && 'max' in config.rateLimit
      ? config.rateLimit
      : undefined
  // theoPluginAsync auto-chains @usetheo/ui + @tailwindcss/vite via
  // top-level Plugin[] return (sync `theoPlugin()` factory's config()
  // hook returning {plugins:[...]} is silently dropped by Vite — see
  // commit history). Spread the result so Vite flattens them.
  const theoPlugins = await theoPluginAsync({
    root: cwd,
    rateLimit: flatRateLimit,
    ssr: config.ssr,
  })
  const server = await createServer({
    root: cwd,
    plugins: [react(), ...theoPlugins],
    server: { port },
    logLevel: options?.port === 0 ? 'silent' : undefined,
  })

  await server.listen()
  return server
}

export async function devCommand(options: DevOptions): Promise<void> {
  try {
    const cwd = process.cwd()
    const server = await startDevServer(cwd, options)
    server.printUrls()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`\n  ✗ ${msg}\n`)
    process.exit(1)
  }
}
