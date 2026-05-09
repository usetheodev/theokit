import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { loadConfig } from '../../config/load-config.js'
import { scanServerRoutes } from '../../server/scan.js'
import { scanServerActions } from '../../server/action-scan.js'
import { matchRoute } from '../../server/match.js'
import { executeRoute, sendError } from '../../server/execute.js'
import { executeAction } from '../../server/action-execute.js'
import { createProductionLoader } from '../../server/module-loader.js'
import { serveStaticFile } from '../../server/static.js'

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

  const server = createServer(async (req, res) => {
    const url = req.url ?? '/'

    try {
      // 1. Action routes
      if (url.startsWith('/api/__actions/')) {
        const pathAfterPrefix = url.slice('/api/__actions/'.length).split('?')[0]
        const segments = pathAfterPrefix.split('/').filter(Boolean)
        if (segments.length < 2) {
          sendError(res, 'BAD_REQUEST', 'Action URL must be /api/__actions/{file}/{exportName}', 400)
          return
        }
        const exportName = segments[segments.length - 1]
        const actionPath = segments.slice(0, -1).join('/')
        const actions = scanServerActions(serverDir)
        const action = actions.find((a) => a.actionPath === actionPath)
        if (!action) {
          sendError(res, 'NOT_FOUND', `Action "${actionPath}" not found`, 404)
          return
        }
        await executeAction(action.filePath, exportName, req, res, loadModule, serverDir)
        return
      }

      // 2. API routes
      if (url.startsWith('/api/')) {
        const routes = scanServerRoutes(serverDir)
        const match = matchRoute(url, routes)
        if (!match) {
          sendError(res, 'NOT_FOUND', 'API route not found', 404)
          return
        }
        const method = (req.method ?? 'GET').toUpperCase()
        await executeRoute(match.route, method, match.params, req, res, loadModule, serverDir)
        return
      }

      // 3. Static files
      if (serveStaticFile(req, res, clientDir)) return

      // 4. SPA fallback
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(indexHtml)
    } catch (err) {
      sendError(res, 'INTERNAL_ERROR', (err as Error).message, 500)
    }
  })

  server.listen(port, () => {
    console.log(`\n  Theo production server`)
    console.log(`  → http://localhost:${port}\n`)
  })
}
