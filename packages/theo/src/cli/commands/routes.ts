import { resolve, relative } from 'node:path'

import { loadConfig } from '../../config/load-config.js'
import { validateProjectStructure } from '../../core/validate-structure.js'
import { scanServerActions } from '../../server/scan/action-scan.js'
import { scanServerRoutes } from '../../server/scan/scan.js'
import { scanWebSocketRoutes } from '../../server/scan/ws-scan.js'

export async function routesCommand(): Promise<void> {
  const cwd = process.cwd()
  const config = await loadConfig(cwd)
  validateProjectStructure(cwd)

  const serverDir = resolve(cwd, config.serverDir)

  const apiRoutes = scanServerRoutes(serverDir)
  const actions = scanServerActions(serverDir)
  const wsRoutes = scanWebSocketRoutes(serverDir)

  const totalCount = apiRoutes.length + actions.length + wsRoutes.length

  if (totalCount === 0) {
    console.log('\n  No routes found.\n')
    return
  }

  // API Routes
  if (apiRoutes.length > 0) {
    console.log('\n  API Routes')
    console.log('  ' + '─'.repeat(60))
    for (const route of apiRoutes) {
      const rel = relative(cwd, route.filePath)
      console.log(`  GET/POST  ${route.routePath.padEnd(30)} ${rel}`)
    }
  }

  // Actions
  if (actions.length > 0) {
    console.log('\n  Actions')
    console.log('  ' + '─'.repeat(60))
    for (const action of actions) {
      const rel = relative(cwd, action.filePath)
      console.log(`  POST      /api/__actions/${action.actionPath.padEnd(18)} ${rel}`)
    }
  }

  // WebSocket
  if (wsRoutes.length > 0) {
    console.log('\n  WebSocket')
    console.log('  ' + '─'.repeat(60))
    for (const route of wsRoutes) {
      const rel = relative(cwd, route.filePath)
      console.log(`  WS        ${route.wsPath.padEnd(30)} ${rel}`)
    }
  }

  console.log(`\n  Total: ${totalCount} endpoints\n`)
}
