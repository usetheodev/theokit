/**
 * theokit start — production server orchestration spine.
 *
 * T4.2 (architecture-cleanup, ADR-0017): stages extracted to sibling modules.
 *   - start-bootstrap-stages.ts   — config/registry/storage bootstrap + resolveSsrEntry
 *   - start-manifest-loader.ts    — manifest.json or scan fallback
 *   - start-ssr-setup.ts          — SSR entry-server + HTML template split
 *   - start-handlers.ts           — branch handlers (action/route/static/404)
 *   - start-request-handler.ts    — request lifecycle wiring
 *   - start-websocket-handler.ts  — WS upgrade (opt-in)
 *   - start-graceful-shutdown.ts  — SIGTERM/SIGINT drain
 */

import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'

import { loadConfig } from '../../config/load-config.js'
import { loadEnv } from '../../config/load-env.js'
import { createPluginRunnerFromConfig } from '../../server/plugins/load-plugins.js'
import { createRateLimiter } from '../../server/rate-limit/rate-limit.js'
import { createProductionLoader } from '../../server/scan/module-loader.js'
import { resolveTransformer } from '../../server/transformer.js'

import {
  configureAgentRegistryFromConfig,
  configureStorageManagerFromConfig,
} from './start-bootstrap-stages.js'
import { installGracefulShutdown } from './start-graceful-shutdown.js'
import type { RequestHandlerCtx } from './start-handlers.js'
import { loadRoutesAndActions } from './start-manifest-loader.js'
import { createRequestHandler } from './start-request-handler.js'
import { setupSsr } from './start-ssr-setup.js'
import { attachWebSocketHandler } from './start-websocket-handler.js'

// Backwards-compat: external test fixtures may import resolveSsrEntry from here.
export { resolveSsrEntry } from './start-bootstrap-stages.js'

interface StartOptions {
  port?: number
}

export async function startCommand(options: StartOptions): Promise<void> {
  const cwd = process.cwd()
  loadEnv({ cwd, mode: 'production' })
  const config = await loadConfig(cwd)

  await configureAgentRegistryFromConfig(config.agents?.registry)
  await configureStorageManagerFromConfig(config.storage)

  const distDir = resolve(cwd, '.theo')
  const clientDir = resolve(distDir, 'client')
  const serverDir = resolve(cwd, 'server')

  if (!existsSync(clientDir)) {
    throw new Error('No build found. Run `theo build` first.')
  }

  const indexHtml = readFileSync(join(clientDir, 'index.html'), 'utf-8')
  const loadModule = createProductionLoader()
  const port = options.port ?? config.port
  const pluginRunner = await createPluginRunnerFromConfig(config.plugins)
  const transformer = resolveTransformer(config.serialization)

  const custom404Path = join(clientDir, '404.html')
  const custom500Path = join(clientDir, '500.html')
  const custom404Html = existsSync(custom404Path) ? readFileSync(custom404Path, 'utf-8') : null
  const custom500Html = existsSync(custom500Path) ? readFileSync(custom500Path, 'utf-8') : null

  const {
    routes: cachedRoutes,
    actions: cachedActions,
    wsRoutes: cachedWsRoutes,
  } = loadRoutesAndActions(distDir, serverDir)

  // Rate limiter (legacy flat form only — per-route variant is handled in
  // api-middleware integration path, not this fallback).
  const flatRateLimit =
    config.rateLimit && 'windowMs' in config.rateLimit && 'max' in config.rateLimit
      ? config.rateLimit
      : undefined
  const rateLimiter = flatRateLimit ? createRateLimiter(flatRateLimit) : null

  const ssr = await setupSsr({
    distDir,
    indexHtml,
    ssrConfigEnabled: config.ssr,
    ssrStreamingConfig: config.ssrStreaming,
  })

  const server = createServer(
    createRequestHandler({
      buildCtx: (req, res, requestId, startTime): RequestHandlerCtx => ({
        req,
        res,
        url: req.url ?? '/',
        requestId,
        startTime,
        clientDir,
        custom404Html,
        cachedRoutes,
        cachedActions,
        loadModule,
        serverDir,
        pluginRunner,
        transformer,
        csrfMode: config.security?.csrf ?? 'strict',
        disallowed: config.security?.disallowed,
        rateLimiter,
      }),
      securityHeadersConfig: config.security?.headers ?? {},
      ssrRender: ssr.render,
      ssrRenderStreaming: ssr.renderStreaming,
      ssrStreamingEnabled: ssr.streamingEnabled,
      htmlHead: ssr.htmlHead,
      htmlTail: ssr.htmlTail,
      indexHtml,
      custom500Html,
    }),
  )

  await attachWebSocketHandler(server, cachedWsRoutes, loadModule)

  server.listen(port, () => {
    console.log(`\n  Theo production server`)
    console.log(`  → http://localhost:${String(port)}\n`)
  })

  installGracefulShutdown(server)
}
