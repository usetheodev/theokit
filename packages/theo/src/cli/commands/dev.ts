import react from '@vitejs/plugin-react'
import { createServer, type ViteDevServer } from 'vite'

import { loadConfig } from '../../config/load-config.js'
import { loadEnv } from '../../config/load-env.js'
import { validateProjectStructure } from '../../core/validate-structure.js'
import { theoPluginAsync } from '../../vite-plugin/index.js'

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

  // Phase 7 — legacy fs-mtime sweep removed: SDK's Agent.registry handles
  // LRU + idle eviction natively (configurable via theo.config.ts >
  // agents.registry; lazy-configured on first request).

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
