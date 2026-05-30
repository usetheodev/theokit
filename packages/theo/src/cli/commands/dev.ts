import react from '@vitejs/plugin-react'
import { createServer, type ViteDevServer } from 'vite'

import { loadConfig } from '../../config/load-config.js'
import { loadEnv } from '../../config/load-env.js'
import { validateProjectStructure } from '../../core/validate-structure.js'
import { orchestrateDev } from '../../services/index.js'
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

  // Wave 2 (T1.1) — spawn polyglot services BEFORE Vite. Healthcheck gates
  // readiness. Empty `services: {}` → early return (Wave 1 BC preserved).
  const orchestration = await orchestrateDev({
    cwd,
    services: config.services,
  })
  if (!orchestration.allHealthy) {
    await orchestration.stop()
    throw new Error(
      `[services] services failed healthcheck: ${orchestration.unhealthy.join(', ')}. ` +
        `Check that each declared service binds its port and responds 200 on its ` +
        `healthcheck path within 30s.`,
    )
  }

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
  let server: ViteDevServer
  try {
    const theoPlugins = await theoPluginAsync({
      root: cwd,
      rateLimit: flatRateLimit,
      ssr: config.ssr,
      // Wave 2 (T3.1) — wire typed-client plugin when services declared.
      services: config.services,
      // T4.1 (canvas-ecosystem-refactor / ADR D6) — passthrough peer-deps
      // that plugins import dynamically (e.g., mermaid via plugin-canvas).
      viteOptimizeDeps: config.viteOptimizeDeps,
    })
    server = await createServer({
      root: cwd,
      plugins: [react(), ...theoPlugins],
      server: { port },
      logLevel: options?.port === 0 ? 'silent' : undefined,
    })

    await server.listen()
  } catch (err) {
    // EC-1 / try-finally pattern: if Vite create/listen fails AFTER services
    // started, stop them so we don't leak child processes.
    await orchestration.stop()
    throw err
  }

  // EC-1 fix: attach orchestration.stop() to the underlying HTTP server's
  // close event via Node-native API. We do NOT mutate `server.close`
  // (fragile across Vite upgrades). httpServer is `http.Server | null`.
  server.httpServer?.on('close', () => {
    void orchestration.stop()
  })

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
