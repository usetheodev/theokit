import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, join, extname } from 'node:path'
import { loadConfig } from '../../config/load-config.js'
import { scanServerRoutes } from '../../server/scan.js'
import { scanServerActions } from '../../server/action-scan.js'
import { matchRoute } from '../../server/match.js'
import { executeRoute, sendError } from '../../server/execute.js'
import { executeAction } from '../../server/action-execute.js'
import { createProductionLoader } from '../../server/module-loader.js'
import { serveStaticFile } from '../../server/static.js'
import { logRequest } from '../../server/logger.js'
import { createRateLimiter } from '../../server/rate-limit.js'
import { findSuggestion } from '../../server/suggest.js'
import { scanWebSocketRoutes } from '../../server/ws-scan.js'
import { loadManifest } from '../../server/manifest.js'
import type { ServerRouteNode } from '../../server/match.js'
import type { ActionNode } from '../../server/action-scan.js'
import type { WebSocketRouteNode } from '../../server/ws-scan.js'

interface StartOptions {
  port?: number
}

export async function startCommand(options: StartOptions): Promise<void> {
  const cwd = process.cwd()
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
    console.warn('  ⚠ No manifest found, scanning routes at startup. Run "theo build" to generate manifest.')
    cachedRoutes = scanServerRoutes(serverDir)
    cachedActions = scanServerActions(serverDir)
    cachedWsRoutes = scanWebSocketRoutes(serverDir)
  }

  // Rate limiter (opt-in)
  const rateLimiter = config.rateLimit
    ? createRateLimiter(config.rateLimit)
    : null

  // SSR setup (opt-in)
  const ssrServerPath = resolve(distDir, 'server/entry-server.js')
  const ssrEnabled = config.ssr && existsSync(ssrServerPath)
  let ssrRender: ((url: string) => Promise<string | { redirect: Response }>) | null = null
  let htmlHead = ''
  let htmlTail = ''

  if (ssrEnabled) {
    const mod = await import(ssrServerPath)
    ssrRender = mod.render
    // Split HTML template on root div
    const rootDivMatch = indexHtml.match(/<div id=["']root["'][^>]*>/)
    if (rootDivMatch) {
      const splitIdx = indexHtml.indexOf(rootDivMatch[0]) + rootDivMatch[0].length
      htmlHead = indexHtml.slice(0, splitIdx)
      htmlTail = indexHtml.slice(splitIdx)
    }
  }

  const server = createServer(async (req, res) => {
    const url = req.url ?? '/'
    const requestId = randomUUID()
    const start = Date.now()

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
            logRequest({ method: req.method ?? 'POST', url, status: 429, duration: Date.now() - start, requestId })
            return
          }
        }

        const pathAfterPrefix = url.slice('/api/__actions/'.length).split('?')[0]
        const segments = pathAfterPrefix.split('/').filter(Boolean)
        if (segments.length < 2) {
          sendError(res, 'BAD_REQUEST', 'Action URL must be /api/__actions/{file}/{exportName}', 400, undefined, requestId)
          logRequest({ method: req.method ?? 'POST', url, status: 400, duration: Date.now() - start, requestId })
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
          logRequest({ method: req.method ?? 'POST', url, status: 404, duration: Date.now() - start, requestId })
          return
        }
        await executeAction(action.filePath, exportName, req, res, loadModule, serverDir, requestId)
        logRequest({ method: req.method ?? 'POST', url, status: res.statusCode, duration: Date.now() - start, requestId })
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
            logRequest({ method: req.method ?? 'GET', url, status: 429, duration: Date.now() - start, requestId })
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
          logRequest({ method: req.method ?? 'GET', url, status: 404, duration: Date.now() - start, requestId })
          return
        }
        const method = (req.method ?? 'GET').toUpperCase()
        await executeRoute(match.route, method, match.params, req, res, loadModule, serverDir, requestId)
        logRequest({ method, url, status: res.statusCode, duration: Date.now() - start, requestId })
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
      if (ssrRender) {
        try {
          const result = await ssrRender(url)
          if (result && typeof result === 'object' && 'redirect' in result) {
            res.writeHead(302, { Location: result.redirect.headers.get('location') ?? '/' })
            res.end()
            return
          }
          const ssrHtml = result as string
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
  })

  // WebSocket upgrade handler (opt-in: only if server/ws/ exists)
  if (cachedWsRoutes.length > 0) {
    try {
      const { WebSocketServer } = await import('ws')
      const wss = new WebSocketServer({ noServer: true })

      server.on('upgrade', async (request, socket, head) => {
        const url = request.url ?? '/'
        if (!url.startsWith('/ws/')) {
          socket.destroy()
          return
        }

        const wsPath = url.split('?')[0]
        const match = cachedWsRoutes.find(r => r.wsPath === wsPath)
        if (!match) {
          socket.destroy()
          return
        }

        try {
          const mod = await loadModule(match.filePath)
          const handler = (mod.default ?? mod) as import('../../server/define-websocket.js').WebSocketHandler

          wss.handleUpgrade(request, socket, head, (ws) => {
            handler.onOpen?.(ws, request)
            ws.on('message', (data: Buffer) => handler.onMessage?.(ws, data.toString()))
            ws.on('close', (code: number, reason: Buffer) => handler.onClose?.(ws, code, reason))
            ws.on('error', (err: Error) => handler.onError?.(ws, err))
          })
        } catch {
          socket.destroy()
        }
      })
    } catch {
      throw new Error(
        'WebSocket routes found but "ws" package is not installed. Run: npm install ws',
      )
    }
  }

  server.listen(port, () => {
    console.log(`\n  Theo production server`)
    console.log(`  → http://localhost:${port}\n`)
  })
}
