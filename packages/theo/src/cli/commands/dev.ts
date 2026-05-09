import { createServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { loadConfig } from '../../config/load-config.js'
import { validateProjectStructure } from '../../core/validate-structure.js'
import { theoPlugin } from '../../vite-plugin/index.js'

interface DevOptions {
  port?: number
}

export async function startDevServer(
  cwd: string,
  options?: DevOptions,
): Promise<ViteDevServer> {
  const config = await loadConfig(cwd)
  validateProjectStructure(cwd)

  const port = options?.port ?? config.port
  const server = await createServer({
    root: cwd,
    plugins: [react(), theoPlugin({ root: cwd, rateLimit: config.rateLimit, ssr: config.ssr })],
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
