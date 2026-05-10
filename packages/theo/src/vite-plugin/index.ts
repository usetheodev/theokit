import type { Plugin } from 'vite'
import { resolve, basename, dirname } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { scanRoutes } from '../router/scan.js'
import { generateRouteManifest } from '../router/generate.js'
import { generateEntryClient } from '../router/entry.js'
import { generateEntryServer } from '../router/entry-server.js'
import { isRouteFile } from '../router/types.js'
import { createApiMiddleware } from './api-middleware.js'
import { createActionMiddleware } from './action-middleware.js'
import { scanWebSocketRoutes } from '../server/ws-scan.js'
import type { RateLimitConfig } from '../server/rate-limit.js'

const VIRTUAL_ENTRY_ID = '/@theo/entry-client'
const RESOLVED_ENTRY_ID = '\0@theo/entry-client'
const VIRTUAL_MANIFEST_ID = '/@theo/route-manifest'
const RESOLVED_MANIFEST_ID = '\0@theo/route-manifest'
const VIRTUAL_ENTRY_SERVER_ID = '/@theo/entry-server'
const RESOLVED_ENTRY_SERVER_ID = '\0@theo/entry-server'

export interface TheoPluginOptions {
  root?: string
  rateLimit?: RateLimitConfig
  ssr?: boolean
}

export function theoPlugin(rootOrOptions?: string | TheoPluginOptions): Plugin {
  const options = typeof rootOrOptions === 'string' ? { root: rootOrOptions } : (rootOrOptions ?? {})
  const projectRoot = options.root ?? process.cwd()
  const appDir = resolve(projectRoot, 'app')
  const ssrEnabled = options.ssr ?? false

  // Resolve paths for SSR module loading
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const theoSrcDir = resolve(currentDir, '..')

  return {
    name: 'theo',

    config() {
      // Detect whether we're running from source (.ts) or compiled dist (.js)
      const ext = existsSync(resolve(theoSrcDir, 'index.ts')) ? '.ts' : '.js'
      return {
        envPrefix: 'THEO_PUBLIC_',
        resolve: {
          alias: [
            { find: 'theokit/server', replacement: resolve(theoSrcDir, `server/index${ext}`) },
            { find: 'theokit', replacement: resolve(theoSrcDir, `index${ext}`) },
          ],
        },
      }
    },

    resolveId(id: string) {
      if (id === VIRTUAL_ENTRY_ID) return RESOLVED_ENTRY_ID
      if (id === VIRTUAL_MANIFEST_ID) return RESOLVED_MANIFEST_ID
      if (id === VIRTUAL_ENTRY_SERVER_ID) return RESOLVED_ENTRY_SERVER_ID
    },

    load(id: string) {
      if (id === RESOLVED_ENTRY_ID) {
        return generateEntryClient(ssrEnabled)
      }
      if (id === RESOLVED_MANIFEST_ID) {
        const tree = scanRoutes(appDir)
        return generateRouteManifest(tree)
      }
      if (id === RESOLVED_ENTRY_SERVER_ID) {
        return generateEntryServer()
      }
    },

    configureServer(server) {
      // Server middleware (action before API — more specific prefix first)
      const serverDir = resolve(projectRoot, 'server')
      server.middlewares.use(createActionMiddleware(server, serverDir))
      server.middlewares.use(createApiMiddleware(server, serverDir, options.rateLimit))

      // SSR dev middleware
      if (ssrEnabled) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url ?? '/'
          // Skip API, static, and HMR requests
          if (url.startsWith('/api/') || url.startsWith('/@') || url.startsWith('/node_modules/') || url.includes('.')) {
            return next()
          }

          try {
            const indexPath = resolve(projectRoot, 'index.html')
            let template = readFileSync(indexPath, 'utf-8')
            template = await server.transformIndexHtml(url, template)

            const mod = await server.ssrLoadModule(VIRTUAL_ENTRY_SERVER_ID)
            const result = await mod.render(url)

            if (result && typeof result === 'object' && 'redirect' in result) {
              res.writeHead(302, { Location: (result.redirect as Response).headers.get('location') ?? '/' })
              res.end()
              return
            }

            // render() returns HTML string — inject into template
            const ssrHtml = result as string
            const rootDivMatch = template.match(/<div id=["']root["'][^>]*>/)
            if (!rootDivMatch) {
              res.writeHead(200, { 'Content-Type': 'text/html' })
              res.end(template)
              return
            }

            const splitIdx = template.indexOf(rootDivMatch[0]) + rootDivMatch[0].length
            const html = template.slice(0, splitIdx) + ssrHtml + template.slice(splitIdx)

            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(html)
          } catch (err) {
            server.ssrFixStacktrace(err as Error)
            console.error('[SSR Dev Error]', err)
            // Fallback to CSR
            return next()
          }
        })
      }

      // Frontend HMR watcher
      function handleRouteChange(filePath: string) {
        if (!isRouteFile(basename(filePath))) return
        if (!filePath.startsWith(appDir)) return

        const mod = server.moduleGraph.getModuleById(RESOLVED_MANIFEST_ID)
        if (mod) {
          server.moduleGraph.invalidateModule(mod)
          server.ws.send({ type: 'full-reload' })
        }
      }

      server.watcher.on('add', handleRouteChange)
      server.watcher.on('unlink', handleRouteChange)

      // WebSocket upgrade handler (dev mode)
      const wsRoutes = scanWebSocketRoutes(resolve(projectRoot, 'server'))
      if (wsRoutes.length > 0 && server.httpServer) {
        import('ws').then(({ WebSocketServer }) => {
          const wss = new WebSocketServer({ noServer: true })

          server.httpServer!.on('upgrade', async (request, socket, head) => {
            const url = request.url ?? '/'
            if (!url.startsWith('/ws/')) return // Let Vite handle HMR etc.

            const wsPath = url.split('?')[0]
            const match = wsRoutes.find(r => r.wsPath === wsPath)
            if (!match) { socket.destroy(); return }

            try {
              const mod = await server.ssrLoadModule(match.filePath)
              const handler = mod.default ?? mod

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
        }).catch(() => {
          console.warn('[Theo] WebSocket routes found but "ws" package not installed. Run: npm install ws')
        })
      }
    },
  }
}
