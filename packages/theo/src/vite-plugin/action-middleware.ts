import { randomUUID } from 'node:crypto'

import type { ViteDevServer, Connect } from 'vite'

import { executeAction } from '../server/action-execute.js'
import { scanServerActions } from '../server/action-scan.js'
import type { CsrfMode, DisallowedConfig } from '../server/csrf.js'
import { sendError } from '../server/execute.js'
import { logRequest } from '../server/logger.js'
import { createViteLoader } from '../server/module-loader.js'
import type { PluginRunner } from '../server/plugin-runner.js'
import { findSuggestion } from '../server/suggest.js'

const PREFIX = '/api/__actions/'

export interface ActionMiddlewareOptions {
  pluginRunner?: PluginRunner
  /**
   * CSRF mode passed through to `executeAction`. Parity with the route
   * middleware — actions inherit the same warn/strict policy as routes.
   * Defaults to 'strict' (the 0.3.0 default).
   */
  csrfMode?: CsrfMode
  /**
   * T5.1 — Rails-inspired per-route escalation. Forwarded to `executeAction`.
   */
  disallowed?: DisallowedConfig
}

export function createActionMiddleware(
  vite: ViteDevServer,
  serverDir: string,
  options?: ActionMiddlewareOptions,
): Connect.NextHandleFunction {
  const loadModule = createViteLoader(vite)
  const pluginRunner = options?.pluginRunner
  const csrfMode: CsrfMode = options?.csrfMode ?? 'strict'
  const disallowed = options?.disallowed
  return (req, res, next) => {
    void (async () => {
      const url = req.url ?? ''
      if (!url.startsWith(PREFIX)) {
        next()
        return
      }

      const requestId = randomUUID()
      const start = Date.now()
      res.setHeader('x-request-id', requestId)

      const pathAfterPrefix = url.slice(PREFIX.length).split('?')[0]
      const segments = pathAfterPrefix.split('/').filter(Boolean)

      if (segments.length < 2) {
        sendError(
          res,
          'BAD_REQUEST',
          'Action URL must be /api/__actions/{file}/{exportName}',
          400,
          undefined,
          requestId,
        )
        logRequest({
          method: req.method ?? 'POST',
          url,
          status: 400,
          duration: Date.now() - start,
          requestId,
        })
        return
      }

      const exportName = segments[segments.length - 1]
      const actionPath = segments.slice(0, -1).join('/')

      const actions = scanServerActions(serverDir)
      const action = actions.find((a) => a.actionPath === actionPath)

      if (!action) {
        const actionPaths = actions.map((a) => a.actionPath)
        const suggestion = findSuggestion(actionPath, actionPaths)
        const msg = suggestion
          ? `Action file "${actionPath}" not found. Did you mean: ${suggestion}?`
          : `Action file "${actionPath}" not found`
        sendError(res, 'NOT_FOUND', msg, 404, undefined, requestId)
        logRequest({
          method: req.method ?? 'POST',
          url,
          status: 404,
          duration: Date.now() - start,
          requestId,
        })
        return
      }

      await executeAction(
        action.filePath,
        exportName,
        req,
        res,
        loadModule,
        serverDir,
        requestId,
        pluginRunner,
        csrfMode,
        disallowed,
      )
      logRequest({
        method: req.method ?? 'POST',
        url,
        status: res.statusCode,
        duration: Date.now() - start,
        requestId,
      })
    })()
  }
}
