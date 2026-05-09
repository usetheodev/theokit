import type { ViteDevServer, Connect } from 'vite'
import { scanServerRoutes } from '../server/scan.js'
import { matchRoute } from '../server/match.js'
import { executeRoute, sendError } from '../server/execute.js'

export function createApiMiddleware(
  vite: ViteDevServer,
  serverDir: string,
): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api/')) {
      return next()
    }

    const routes = scanServerRoutes(serverDir)
    const match = matchRoute(url, routes)

    if (!match) {
      sendError(res, 'NOT_FOUND', 'API route not found', 404)
      return
    }

    const method = (req.method ?? 'GET').toUpperCase()
    await executeRoute(match.route, method, match.params, req, res, vite, serverDir)
  }
}
