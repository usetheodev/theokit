import type { ViteDevServer, Connect } from 'vite'
import { scanServerActions } from '../server/action-scan.js'
import { executeAction } from '../server/action-execute.js'
import { sendError } from '../server/execute.js'
import { createViteLoader } from '../server/module-loader.js'

const PREFIX = '/api/__actions/'

export function createActionMiddleware(
  vite: ViteDevServer,
  serverDir: string,
): Connect.NextHandleFunction {
  const loadModule = createViteLoader(vite)
  return async (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith(PREFIX)) {
      return next()
    }

    const pathAfterPrefix = url.slice(PREFIX.length).split('?')[0]
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
      sendError(res, 'NOT_FOUND', `Action file "${actionPath}" not found`, 404)
      return
    }

    await executeAction(action.filePath, exportName, req, res, loadModule, serverDir)
  }
}
