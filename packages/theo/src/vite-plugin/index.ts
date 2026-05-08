import type { Plugin } from 'vite'
import { resolve, basename } from 'node:path'
import { scanRoutes } from '../router/scan.js'
import { generateRouteManifest } from '../router/generate.js'
import { generateEntryClient } from '../router/entry.js'
import { isRouteFile } from '../router/types.js'

const VIRTUAL_ENTRY_ID = '/@theo/entry-client'
const RESOLVED_ENTRY_ID = '\0@theo/entry-client'
const VIRTUAL_MANIFEST_ID = '/@theo/route-manifest'
const RESOLVED_MANIFEST_ID = '\0@theo/route-manifest'

export function theoPlugin(root?: string): Plugin {
  const projectRoot = root ?? process.cwd()
  const appDir = resolve(projectRoot, 'app')

  return {
    name: 'theo',

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
