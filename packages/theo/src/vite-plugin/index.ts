import type { Plugin } from 'vite'
import { resolve, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanRoutes } from '../router/scan.js'
import { generateRouteManifest } from '../router/generate.js'
import { generateEntryClient } from '../router/entry.js'
import { isRouteFile } from '../router/types.js'
import { createApiMiddleware } from './api-middleware.js'
import { createActionMiddleware } from './action-middleware.js'

const VIRTUAL_ENTRY_ID = '/@theo/entry-client'
const RESOLVED_ENTRY_ID = '\0@theo/entry-client'
const VIRTUAL_MANIFEST_ID = '/@theo/route-manifest'
const RESOLVED_MANIFEST_ID = '\0@theo/route-manifest'

export function theoPlugin(root?: string): Plugin {
  const projectRoot = root ?? process.cwd()
  const appDir = resolve(projectRoot, 'app')

  // Resolve paths for SSR module loading
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const theoSrcDir = resolve(currentDir, '..')

  return {
    name: 'theo',

    config() {
      return {
        resolve: {
          alias: [
            { find: 'theo/server', replacement: resolve(theoSrcDir, 'server/index.ts') },
            { find: 'theo', replacement: resolve(theoSrcDir, 'index.ts') },
          ],
        },
      }
    },

    resolveId(id: string) {
      if (id === VIRTUAL_ENTRY_ID) return RESOLVED_ENTRY_ID
      if (id === VIRTUAL_MANIFEST_ID) return RESOLVED_MANIFEST_ID
    },

    load(id: string) {
      if (id === RESOLVED_ENTRY_ID) {
        return generateEntryClient()
      }
      if (id === RESOLVED_MANIFEST_ID) {
        const tree = scanRoutes(appDir)
        return generateRouteManifest(tree)
      }
    },

    configureServer(server) {
      // Server middleware (action before API — more specific prefix first)
      const serverDir = resolve(projectRoot, 'server')
      server.middlewares.use(createActionMiddleware(server, serverDir))
      server.middlewares.use(createApiMiddleware(server, serverDir))

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
    },
  }
}
