import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { resolve, join, extname } from 'node:path'

import { loadConfig } from '../../config/load-config.js'
import { loadEnv } from '../../config/load-env.js'
import { executeAction } from '../../server/action-execute.js'
import { scanServerActions } from '../../server/action-scan.js'
import type { ActionNode } from '../../server/action-scan.js'
import type { WebSocketHandler } from '../../server/define-websocket.js'
import { executeRoute, sendError } from '../../server/execute.js'
import { createPluginRunnerFromConfig } from '../../server/load-plugins.js'
import { logRequest } from '../../server/logger.js'
import { loadManifest } from '../../server/manifest.js'
import { matchRoute } from '../../server/match.js'
import type { ServerRouteNode } from '../../server/match.js'
import { createProductionLoader } from '../../server/module-loader.js'
import { generateNonce } from '../../server/nonce.js'
import { createRateLimiter } from '../../server/rate-limit.js'
import { scanServerRoutes } from '../../server/scan.js'
import { buildSecurityHeaders } from '../../server/security-headers.js'
import { serveStaticFile } from '../../server/static.js'
import { findSuggestion } from '../../server/suggest.js'
import { resolveTransformer } from '../../server/transformer.js'
import { scanWebSocketRoutes } from '../../server/ws-scan.js'
import type { WebSocketRouteNode } from '../../server/ws-scan.js'

/**
 * T0.1 — Resolve the SSR entry-server module path. tsup may emit `.mjs` or
 * `.js` depending on output format. Try `.mjs` first (modern default) then
 * fall back to `.js`. Returns null when neither exists — SSR stays disabled.
 *
 * Exported so unit tests can pin the resolution order without booting the
 * full CLI.
 */
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
  let ssrRender:
    | ((url: string, options?: { nonce?: string }) => Promise<string | { redirect: Response }>)
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

  if (ssrEnabled) {
    interface SsrEntryServer {
      render: (
        url: string,
        options?: { nonce?: string },
      ) => Promise<string | { redirect: Response }>
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

  /* eslint-disable max-lines-per-function, complexity, sonarjs/cognitive-complexity --
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

      try {
        // 1. Action routes
        if (url.startsWith('/api/__actions/')) {
          res.setHeader('x-request-id', requestId)

          // Rate limit check
          if (rateLimiter) {
            const check = rateLimiter(req)
            for (const [k, v] of Object.entries(check.headers)) res.setHeader(k, v)
            if (check.limited) {
              sendError(res, 'RATE_LIMITED', 'Too many requests', 429, undefined, requestId)
              logRequest({
                method: req.method ?? 'POST',
                url,
                status: 429,
                duration: Date.now() - start,
                requestId,
              })
              return
            }
          }

          const pathAfterPrefix = url.slice('/api/__actions/'.length).split('?')[0]
          const segments = pathAfterPrefix.split('/').filter(Boolean)
          if (segments.length < 2) {
            sendError(
              res,
              'BAD_REQUEST',
              'Action URL must be /api/__actions/{file}/{exportName}',
              400,
              undefined,
              requestId,
            )
            logRequest({
              method: req.method ?? 'POST',
              url,
              status: 400,
              duration: Date.now() - start,
              requestId,
            })
            return
          }
          const exportName = segments[segments.length - 1]
          const actionPath = segments.slice(0, -1).join('/')
          const action = cachedActions.find((a) => a.actionPath === actionPath)
          if (!action) {
            const actionPaths = cachedActions.map((a) => a.actionPath)
            const suggestion = findSuggestion(actionPath, actionPaths)
            const msg = suggestion
              ? `Action "${actionPath}" not found. Did you mean: ${suggestion}?`
              : `Action "${actionPath}" not found`
            sendError(res, 'NOT_FOUND', msg, 404, undefined, requestId)
            logRequest({
              method: req.method ?? 'POST',
              url,
              status: 404,
              duration: Date.now() - start,
              requestId,
            })
            return
          }
          await executeAction(
            action.filePath,
            exportName,
            req,
            res,
            loadModule,
            serverDir,
            requestId,
            pluginRunner,
            config.security?.csrf ?? 'strict',
            config.security?.disallowed,
          )
          logRequest({
            method: req.method ?? 'POST',
            url,
            status: res.statusCode,
            duration: Date.now() - start,
            requestId,
          })
          return
        }

        // 2. API routes
        if (url.startsWith('/api/')) {
          res.setHeader('x-request-id', requestId)

          // Rate limit check
          if (rateLimiter) {
            const check = rateLimiter(req)
            for (const [k, v] of Object.entries(check.headers)) res.setHeader(k, v)
            if (check.limited) {
              sendError(res, 'RATE_LIMITED', 'Too many requests', 429, undefined, requestId)
              logRequest({
                method: req.method ?? 'GET',
                url,
                status: 429,
                duration: Date.now() - start,
                requestId,
              })
              return
            }
          }

          const match = matchRoute(url, cachedRoutes)
          if (!match) {
            const urlPath = url.split('?')[0]
            const routePaths = cachedRoutes.map((r) => r.routePath)
            const suggestion = findSuggestion(urlPath, routePaths)
            const msg = suggestion
              ? `API route not found: ${urlPath}. Did you mean: ${suggestion}?`
              : 'API route not found'
            sendError(res, 'NOT_FOUND', msg, 404, undefined, requestId)
            logRequest({
              method: req.method ?? 'GET',
              url,
              status: 404,
              duration: Date.now() - start,
              requestId,
            })
            return
          }
          const method = (req.method ?? 'GET').toUpperCase()
          await executeRoute(
            match.route,
            method,
            match.params,
            req,
            res,
            loadModule,
            serverDir,
            requestId,
            pluginRunner,
            transformer,
            config.security?.csrf ?? 'strict',
            config.security?.disallowed,
          )
          logRequest({
            method,
            url,
            status: res.statusCode,
            duration: Date.now() - start,
            requestId,
          })
          return
        }

        // 3. Static files
        if (serveStaticFile(req, res, clientDir)) return

        // 4. Custom 404 for URLs with file extensions (missing static files)
        const urlPath = url.split('?')[0]
        if (custom404Html && extname(urlPath)) {
          res.writeHead(404, { 'Content-Type': 'text/html' })
          res.end(custom404Html)
          return
        }

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
            const ssrHtml = result
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(htmlHead + ssrHtml + htmlTail)
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
    /* eslint-enable max-lines-per-function, complexity, sonarjs/cognitive-complexity */
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
}
