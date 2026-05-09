import type { ViteDevServer, Connect } from 'vite'
import { scanServerActions } from '../server/action-scan.js'
import { executeAction } from '../server/action-execute.js'
import { sendError } from '../server/execute.js'

const PREFIX = '/api/__actions/'

export function createActionMiddleware(
  vite: ViteDevServer,
  serverDir: string,
): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith(PREFIX)) {
      return next()
    }

    // Strip prefix and query string
    const pathAfterPrefix = url.slice(PREFIX.length).split('?')[0]
    const segments = pathAfterPrefix.split('/').filter(Boolean)

    // Need at least 2 segments: actionPath + exportName
    if (segments.length < 2) {
      sendError(res, 'BAD_REQUEST', 'Action URL must be /api/__actions/{file}/{exportName}', 400)
      return
    }

    const exportName = segments[segments.length - 1]
    const actionPath = segments.slice(0, -1).join('/')

    // Find matching action file
    const actions = scanServerActions(serverDir)
    const action = actions.find((a) => a.actionPath === actionPath)

    if (!action) {
      sendError(res, 'NOT_FOUND', `Action file "${actionPath}" not found`, 404)
      return
    }

    await executeAction(action.filePath, exportName, req, res, vite)
  }
}
