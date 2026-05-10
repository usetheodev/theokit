import type { ViteDevServer, Connect } from 'vite'
import { randomUUID } from 'node:crypto'
import { scanServerRoutes } from '../server/scan.js'
import { matchRoute } from '../server/match.js'
import { executeRoute, sendError } from '../server/execute.js'
import { createViteLoader } from '../server/module-loader.js'
import { logRequest } from '../server/logger.js'
import { createRateLimiter } from '../server/rate-limit.js'
import { findSuggestion } from '../server/suggest.js'
import type { RateLimitConfig } from '../server/rate-limit.js'

export function createApiMiddleware(
  vite: ViteDevServer,
  serverDir: string,
  rateLimitConfig?: RateLimitConfig,
): Connect.NextHandleFunction {
  const loadModule = createViteLoader(vite)
  const rateLimiter = rateLimitConfig ? createRateLimiter(rateLimitConfig) : null

  return async (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api/')) {
      return next()
    }

    const requestId = randomUUID()
    const start = Date.now()
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
      const urlPath = url.split('?')[0]
      const routePaths = routes.map((r) => r.routePath)
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
  }
}
