import type { ViteDevServer, Connect } from 'vite'
import { randomUUID } from 'node:crypto'
import { scanServerRoutes } from '../server/scan.js'
import { matchRoute } from '../server/match.js'
import { executeRoute, sendError } from '../server/execute.js'
import { createViteLoader } from '../server/module-loader.js'
import { logRequest } from '../server/logger.js'

export function createApiMiddleware(
  vite: ViteDevServer,
  serverDir: string,
): Connect.NextHandleFunction {
  const loadModule = createViteLoader(vite)
  return async (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api/')) {
      return next()
    }

    const requestId = randomUUID()
    const start = Date.now()
    res.setHeader('x-request-id', requestId)

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
  }
}
