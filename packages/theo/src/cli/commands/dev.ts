import react from '@vitejs/plugin-react'
import { createServer, type ViteDevServer } from 'vite'

import { loadConfig } from '../../config/load-config.js'
import { validateProjectStructure } from '../../core/validate-structure.js'
import { theoPlugin } from '../../vite-plugin/index.js'

interface DevOptions {
  port?: number
}

export async function startDevServer(cwd: string, options?: DevOptions): Promise<ViteDevServer> {
  const config = await loadConfig(cwd)
  validateProjectStructure(cwd)

  const port = options?.port ?? config.port
  // Narrow the rateLimit union: only the legacy flat shape (windowMs+max)
  // flows into the theoPlugin's RateLimitConfig parameter. The per-route
  // variant is consumed inside the api-middleware via the loaded user
  // config separately.
  const flatRateLimit =
    config.rateLimit && 'windowMs' in config.rateLimit && 'max' in config.rateLimit
      ? config.rateLimit
      : undefined
  const server = await createServer({
    root: cwd,
    plugins: [react(), theoPlugin({ root: cwd, rateLimit: flatRateLimit, ssr: config.ssr })],
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
