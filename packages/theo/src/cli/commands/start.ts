import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { resolve, join } from 'node:path'

import { loadConfig } from '../../config/load-config.js'
import { loadEnv } from '../../config/load-env.js'
import { generateNonce } from '../../server/auth/nonce.js'
import type { WebSocketHandler } from '../../server/define/define-websocket.js'
import { sendError } from '../../server/http/send-response.js'
import { createPluginRunnerFromConfig } from '../../server/plugins/load-plugins.js'
import { createRateLimiter } from '../../server/rate-limit/rate-limit.js'
import { scanServerActions } from '../../server/scan/action-scan.js'
import type { ActionNode } from '../../server/scan/action-scan.js'
import { loadManifest } from '../../server/scan/manifest.js'
import type { ServerRouteNode } from '../../server/scan/match.js'
import { createProductionLoader } from '../../server/scan/module-loader.js'
import { scanServerRoutes } from '../../server/scan/scan.js'
import { scanWebSocketRoutes } from '../../server/scan/ws-scan.js'
import type { WebSocketRouteNode } from '../../server/scan/ws-scan.js'
import { buildSecurityHeaders } from '../../server/security/security-headers.js'
import { resolveTransformer } from '../../server/transformer.js'

import {
  tryServeAction,
  tryServeApiRoute,
  tryServeCustom404,
  tryServeStatic,
  type RequestHandlerCtx,
} from './start-handlers.js'

/**
 * T0.1 — Resolve the SSR entry-server module path. tsup may emit `.mjs` or
 * `.js` depending on output format. Try `.mjs` first (modern default) then
 * fall back to `.js`. Returns null when neither exists — SSR stays disabled.
 *
 * Exported so unit tests can pin the resolution order without booting the
 * full CLI.
 */
interface SdkAgentRegistry {
  configure?: (opts: { maxAgents?: number; idleTimeoutMs?: number }) => void
}
interface SdkModule {
  Agent?: { registry?: SdkAgentRegistry }
}

async function configureAgentRegistryFromConfig(
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
    console.warn(`[theokit] Agent.registry configuration skipped: ${msg}`)
  }
}

const SSR_EXTENSIONS = ['.mjs', '.js'] as const
export function resolveSsrEntry(distDir: string): string | null {
  for (const ext of SSR_EXTENSIONS) {
    const path = resolve(distDir, `server/entry-server${ext}`)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- distDir is from `theokit start`'s own caller-controlled config; the suffix is from a const literal array
    if (existsSync(path)) return path
  }
  return null
}

interface StartOptions {
  port?: number
}

// eslint-disable-next-line max-lines-per-function, complexity -- top-level CLI bootstrap; setup + request orchestration intentionally co-located so the lifecycle is readable end-to-end
export async function startCommand(options: StartOptions): Promise<void> {
  const cwd = process.cwd()
  // Phase 1 (T1.2) — Load .env BEFORE config load.
  loadEnv({ cwd, mode: 'production' })
  const config = await loadConfig(cwd)

  // Phase 6 — configure SDK's Agent.registry from theo.config.ts
  // (lazy at boot; EC-3 sync flag flip prevents race under concurrent boot).
  await configureAgentRegistryFromConfig(config.agents?.registry)

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

  // Custom error pages (optional)
  const custom404Path = join(clientDir, '404.html')
  const custom500Path = join(clientDir, '500.html')
  const custom404Html = existsSync(custom404Path) ? readFileSync(custom404Path, 'utf-8') : null
  const custom500Html = existsSync(custom500Path) ? readFileSync(custom500Path, 'utf-8') : null

  // Load routes/actions from manifest (built at build time) or fallback to scan
  let cachedRoutes: ServerRouteNode[]
  let cachedActions: ActionNode[]
  let cachedWsRoutes: WebSocketRouteNode[]

  const manifestPath = join(distDir, 'manifest.json')
  if (existsSync(manifestPath)) {
    const manifest = loadManifest(distDir, serverDir)
    cachedRoutes = manifest.routes
    cachedActions = manifest.actions
    cachedWsRoutes = manifest.websockets
  } else {
    console.warn(
      '  ⚠ No manifest found, scanning routes at startup. Run "theo build" to generate manifest.',
    )
    cachedRoutes = scanServerRoutes(serverDir)
    cachedActions = scanServerActions(serverDir)
    cachedWsRoutes = scanWebSocketRoutes(serverDir)
  }

  // Rate limiter (opt-in). Narrow the union shape — the legacy flat
  // (windowMs+max) form maps to createRateLimiter; the per-route variant
  // is consumed via the api-middleware integration path (not this fallback).
  const flatRateLimit =
    config.rateLimit && 'windowMs' in config.rateLimit && 'max' in config.rateLimit
      ? config.rateLimit
      : undefined
  const rateLimiter = flatRateLimit ? createRateLimiter(flatRateLimit) : null

  // SSR setup (opt-in). T0.1: try .mjs first then .js — tsup builds in
  // ESM mode emit .mjs by default; legacy CJS builds emit .js. Without this
  // fallback, modern builds silently fail SSR even when ssr: true is set.
  const ssrServerPath: string | null = config.ssr ? resolveSsrEntry(distDir) : null
  const ssrEnabled = ssrServerPath !== null
  const ssrStreamingEnabled = ssrEnabled && config.ssrStreaming
  // T0.2: ssrRender now accepts `{ nonce }` so per-request nonce threads
  // through to entry-server → StaticRouterProvider + renderToPipeableStream.
  // Return shape: { html, hydrationData } (new) | string (backward-compat
  // for older entry-server bundles) | { redirect } for SSR redirects.
  let ssrRender:
    | ((
        url: string,
        options?: { nonce?: string },
      ) => Promise<SsrRenderResult | { redirect: Response } | string>)
    | null = null
  type RenderStreamingResult = { redirect: Response } | { streaming: true } | undefined
  let ssrRenderStreaming:
    | ((
        url: string,
        response: ServerResponse,
        options?: { signal?: AbortSignal; nonce?: string },
      ) => Promise<RenderStreamingResult>)
    | null = null
  let htmlHead = ''
  let htmlTail = ''

  interface SsrRenderResult {
    html: string
    hydrationData: {
      loaderData?: unknown
      actionData?: unknown
      errors?: unknown
    }
  }
  function isSsrRenderResult(value: unknown): value is SsrRenderResult {
    if (typeof value !== 'object' || value === null) return false
    if (!('html' in value)) return false
    const html = (value as Record<string, unknown>).html
    if (typeof html !== 'string') return false
    return true
  }
  function asSsrRenderResult(value: SsrRenderResult): SsrRenderResult {
    // Type-laundering helper. After `isSsrRenderResult` narrows, the
    // linter still complains about member access on the union type
    // (Awaited<ReturnType<...>> evaluates to a wider type). Routing
    // through this typed identity makes downstream access type-safe.
    return value
  }
  if (ssrEnabled) {
    interface SsrEntryServer {
      render: (
        url: string,
        options?: { nonce?: string },
      ) => Promise<SsrRenderResult | { redirect: Response } | string>
      renderStreaming?: (
        url: string,
        response: ServerResponse,
        options?: { signal?: AbortSignal; nonce?: string },
      ) => Promise<RenderStreamingResult>
    }
    const mod = (await import(ssrServerPath)) as SsrEntryServer
    ssrRender = mod.render
    // T6.1: renderStreaming is only exported when ssrStreaming was enabled
    // at build time. Capture both so we can switch per request without re-importing.
    ssrRenderStreaming = typeof mod.renderStreaming === 'function' ? mod.renderStreaming : null
    // Split HTML template on root div
    const rootDivMatch = /<div id=["']root["'][^>]*>/.exec(indexHtml)
    if (rootDivMatch) {
      const splitIdx = indexHtml.indexOf(rootDivMatch[0]) + rootDivMatch[0].length
      htmlHead = indexHtml.slice(0, splitIdx)
      htmlTail = indexHtml.slice(splitIdx)
    }
  }

  /* eslint-disable complexity, sonarjs/cognitive-complexity --
   * Inline request orchestrator. Mirrors the routing decisions a Vite
   * dev-server middleware does at module top-level; keeping all branches
   * in one place makes the request lifecycle traceable.
   */
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const url = req.url ?? '/'
      const requestId = randomUUID()
      const start = Date.now()

      // T0.2 — Generate a per-request nonce UNCONDITIONALLY (EC-6: avoids
      // dev/prod CSP header divergence; dev's api-middleware nonces every
      // response so prod must match). Apply security headers BEFORE any
      // branch so they persist through writeHead() merges.
      const nonce = generateNonce()
      const securityHeaders = buildSecurityHeaders(
        config.security?.headers ?? {},
        { production: true },
        { nonce },
      )
      for (const [k, v] of Object.entries(securityHeaders)) {
        res.setHeader(k, v)
      }

      // T6.1 — branch handlers extracted to start-handlers.ts
      const handlerCtx: RequestHandlerCtx = {
        req,
        res,
        url,
        requestId,
        startTime: start,
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
      }
      try {
        if (await tryServeAction(handlerCtx)) return
        if (await tryServeApiRoute(handlerCtx)) return
        if (tryServeStatic(handlerCtx)) return
        if (tryServeCustom404(handlerCtx)) return

        // 5. SSR or SPA fallback
        // T6.1: prefer streaming when config.ssrStreaming AND the build emitted renderStreaming.
        if (ssrStreamingEnabled && ssrRenderStreaming) {
          // Wire client-disconnect → AbortController (EC-11)
          const controller = new AbortController()
          const onClose = (): void => {
            controller.abort()
          }
          req.on('close', onClose)
          try {
            const result = await ssrRenderStreaming(url, res, {
              signal: controller.signal,
              nonce,
            })
            if (result && typeof result === 'object' && 'redirect' in result) {
              res.writeHead(302, { Location: result.redirect.headers.get('location') ?? '/' })
              res.end()
              return
            }
            // When renderStreaming succeeds it has already piped + flushed headers.
            // It is responsible for calling res.end() once the stream is drained.
            return
          } catch (streamErr) {
            console.error('[SSR Stream Error]', (streamErr as Error).message)
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'text/html' })
            }
            if (!res.writableEnded) {
              res.end(custom500Html ?? '<h1>500 — Server Error</h1>')
            }
            return
          } finally {
            req.removeListener('close', onClose)
          }
        }
        if (ssrRender) {
          try {
            const result = await ssrRender(url, { nonce })
            if (result && typeof result === 'object' && 'redirect' in result) {
              res.writeHead(302, { Location: result.redirect.headers.get('location') ?? '/' })
              res.end()
              return
            }
            // Backward-compat: old render() returned just a string.
            // New shape: { html, hydrationData } — framework emits
            // hydration data script outside the React root to avoid
            // hydration mismatch with client RouterProvider.
            let ssrHtml = ''
            let hydrationScript = ''
            if (typeof result === 'string') {
              ssrHtml = result
            } else if (isSsrRenderResult(result)) {
              const rendered = asSsrRenderResult(result)
              ssrHtml = rendered.html
              const dataJson = JSON.stringify(rendered.hydrationData).replace(/</g, '\\u003c')
              hydrationScript = `<script${
                nonce ? ` nonce="${nonce}"` : ''
              }>window.__staticRouterHydrationData=${dataJson}</script>`
            }
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(htmlHead + ssrHtml + hydrationScript + htmlTail)
            return
          } catch (ssrErr) {
            console.error('[SSR Error] Falling back to CSR:', (ssrErr as Error).message)
            // Fall through to CSR fallback
          }
        }

        // CSR fallback
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(indexHtml)
      } catch (err) {
        // Custom 500 page for non-API errors
        if (custom500Html && !res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/html' })
          res.end(custom500Html)
        } else if (!res.headersSent) {
          sendError(res, 'INTERNAL_ERROR', (err as Error).message, 500)
        } else {
          res.end()
        }
      }
    })()
    /* eslint-enable complexity, sonarjs/cognitive-complexity */
  })

  // WebSocket upgrade handler (opt-in: only if server/ws/ exists)
  if (cachedWsRoutes.length > 0) {
    try {
      const { WebSocketServer } = await import('ws')
      const wss = new WebSocketServer({ noServer: true })

      server.on('upgrade', (request, socket, head) => {
        void (async () => {
          const url = request.url ?? '/'
          if (!url.startsWith('/ws/')) {
            socket.destroy()
            return
          }

          const wsPath = url.split('?')[0]
          const match = cachedWsRoutes.find((r) => r.wsPath === wsPath)
          if (!match) {
            socket.destroy()
            return
          }

          try {
            const mod = await loadModule(match.filePath)
            const handler = ((mod as { default?: unknown }).default ?? mod) as WebSocketHandler

            wss.handleUpgrade(request, socket, head, (ws) => {
              handler.onOpen?.(ws, request)
              ws.on('message', (data: Buffer) => {
                handler.onMessage?.(ws, data.toString())
              })
              ws.on('close', (code: number, reason: Buffer) => {
                handler.onClose?.(ws, code, reason)
              })
              ws.on('error', (err: Error) => {
                handler.onError?.(ws, err)
              })
            })
          } catch {
            socket.destroy()
          }
        })()
      })
    } catch {
      throw new Error(
        'WebSocket routes found but "ws" package is not installed. Run: npm install ws',
      )
    }
  }

  server.listen(port, () => {
    console.log(`\n  Theo production server`)
    console.log(`  → http://localhost:${String(port)}\n`)
  })

  // Phase 6 — T6.2: graceful shutdown for K8s/PaaS pod termination.
  //
  // EC-13 (DOCUMENT): SIGTERM evicts agents IMMEDIATELY (no per-request drain).
  // In-flight requests get aborted mid-stream — acceptable because the platform's
  // load balancer already removed this pod from rotation BEFORE sending SIGTERM
  // (K8s preStop hook + terminationGracePeriodSeconds; same on Vercel/CF/Render).
  //
  // Re-entry guard: multiple SIGTERMs in quick succession run shutdown ONCE.
  let shuttingDown = false
  const gracefulShutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`\n  [theokit] ${signal} received — evicting agents`)
    // Lazy-import SDK only at shutdown time to avoid forcing the dep on
    // apps that don't use agents at all.
    void (async () => {
      try {
        const sdk = (await import('@usetheo/sdk').catch(() => null)) as {
          Agent?: { registry?: { evictAll?: () => Promise<void> } }
        } | null
        if (sdk?.Agent?.registry?.evictAll !== undefined) {
          await sdk.Agent.registry.evictAll()
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`  [theokit] evictAll error (proceeding to exit): ${msg}`)
      }
      console.log(`  [theokit] shutdown complete`)
      // Close the HTTP server so the event loop drains
      server.close(() => {
        process.exit(0)
      })
      // Force-exit after 25s (under K8s default 30s grace)
      setTimeout(() => {
        console.warn(`  [theokit] forced exit after 25s timeout`)
        process.exit(0)
      }, 25_000).unref()
    })()
  }
  process.on('SIGTERM', () => {
    gracefulShutdown('SIGTERM')
  })
  process.on('SIGINT', () => {
    gracefulShutdown('SIGINT')
  })
}
