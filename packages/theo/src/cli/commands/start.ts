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

  // Rate limiter (opt-in)
  const rateLimiter = config.rateLimit
    ? createRateLimiter(config.rateLimit)
    : null

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
        const actions = scanServerActions(serverDir)
        const action = actions.find((a) => a.actionPath === actionPath)
        if (!action) {
          sendError(res, 'NOT_FOUND', `Action "${actionPath}" not found`, 404, undefined, requestId)
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

        const routes = scanServerRoutes(serverDir)
        const match = matchRoute(url, routes)
        if (!match) {
          sendError(res, 'NOT_FOUND', 'API route not found', 404, undefined, requestId)
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

      // 5. SPA fallback (client-side router decides)
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

  server.listen(port, () => {
    console.log(`\n  Theo production server`)
    console.log(`  → http://localhost:${port}\n`)
  })
}
