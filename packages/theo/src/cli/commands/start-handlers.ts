import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname } from 'node:path'

import { executeAction } from '../../server/http/action-execute.js'
import { executeRoute } from '../../server/http/execute.js'
import { sendError } from '../../server/http/send-response.js'
import { serveStaticFile } from '../../server/http/static.js'
import { logRequest } from '../../server/observability/logger.js'
import { findSuggestion } from '../../server/observability/suggest.js'
import type { PluginRunner } from '../../server/plugins/plugin-runner.js'
import type { ActionNode } from '../../server/scan/action-scan.js'
import { matchRoute } from '../../server/scan/match.js'
import type { ServerRouteNode } from '../../server/scan/match.js'
import type { LoadModule } from '../../server/scan/module-loader.js'
import type { CsrfMode, DisallowedConfig } from '../../server/security/csrf.js'
import type { TheoTransformer } from '../../server/transformer.js'

/**
 * T6.1 (PV-7 SRP): start.ts request orchestrator decomposed into 5 focused
 * per-branch handlers. Each handler returns `true` if it handled the
 * request (response sent) so the orchestrator can stop iterating.
 *
 * The original 455-LOC monolith closed over 14+ locals; the shared shape
 * `RequestHandlerCtx` makes the dependencies explicit + reviewable.
 */
export interface RequestHandlerCtx {
  req: IncomingMessage
  res: ServerResponse
  url: string
  requestId: string
  startTime: number
  // Pre-loaded build artifacts
  clientDir: string
  custom404Html: string | null
  // Manifest-resolved tables
  cachedRoutes: ServerRouteNode[]
  cachedActions: ActionNode[]
  // Runtime infra
  loadModule: LoadModule
  serverDir: string
  pluginRunner: PluginRunner | undefined
  transformer: TheoTransformer | undefined
  csrfMode: CsrfMode
  disallowed: DisallowedConfig | undefined
  rateLimiter:
    | ((req: IncomingMessage) => { limited: boolean; headers: Record<string, string> })
    | null
}

/** Apply rate limit; return true if request was limited (response sent). */
function applyRateLimit(c: RequestHandlerCtx, method: string): boolean {
  if (!c.rateLimiter) return false
  const check = c.rateLimiter(c.req)
  for (const [k, v] of Object.entries(check.headers)) c.res.setHeader(k, v)
  if (check.limited) {
    sendError(c.res, 'RATE_LIMITED', 'Too many requests', 429, undefined, c.requestId)
    logRequest({
      method,
      url: c.url,
      status: 429,
      duration: Date.now() - c.startTime,
      requestId: c.requestId,
    })
    return true
  }
  return false
}

/** Branch 1: action routes (`/api/__actions/{file}/{exportName}`). */
export async function tryServeAction(c: RequestHandlerCtx): Promise<boolean> {
  if (!c.url.startsWith('/api/__actions/')) return false
  c.res.setHeader('x-request-id', c.requestId)

  if (applyRateLimit(c, c.req.method ?? 'POST')) return true

  const pathAfterPrefix = c.url.slice('/api/__actions/'.length).split('?')[0]
  const segments = pathAfterPrefix.split('/').filter(Boolean)
  if (segments.length < 2) {
    sendError(
      c.res,
      'BAD_REQUEST',
      'Action URL must be /api/__actions/{file}/{exportName}',
      400,
      undefined,
      c.requestId,
    )
    logRequest({
      method: c.req.method ?? 'POST',
      url: c.url,
      status: 400,
      duration: Date.now() - c.startTime,
      requestId: c.requestId,
    })
    return true
  }
  const exportName = segments[segments.length - 1]
  const actionPath = segments.slice(0, -1).join('/')
  const action = c.cachedActions.find((a) => a.actionPath === actionPath)
  if (!action) {
    const actionPaths = c.cachedActions.map((a) => a.actionPath)
    const suggestion = findSuggestion(actionPath, actionPaths)
    const msg = suggestion
      ? `Action "${actionPath}" not found. Did you mean: ${suggestion}?`
      : `Action "${actionPath}" not found`
    sendError(c.res, 'NOT_FOUND', msg, 404, undefined, c.requestId)
    logRequest({
      method: c.req.method ?? 'POST',
      url: c.url,
      status: 404,
      duration: Date.now() - c.startTime,
      requestId: c.requestId,
    })
    return true
  }
  await executeAction(
    action.filePath,
    exportName,
    c.req,
    c.res,
    c.loadModule,
    c.serverDir,
    c.requestId,
    c.pluginRunner,
    c.csrfMode,
    c.disallowed,
  )
  logRequest({
    method: c.req.method ?? 'POST',
    url: c.url,
    status: c.res.statusCode,
    duration: Date.now() - c.startTime,
    requestId: c.requestId,
  })
  return true
}

/** Branch 2: API routes (`/api/*` excluding actions). */
export async function tryServeApiRoute(c: RequestHandlerCtx): Promise<boolean> {
  if (!c.url.startsWith('/api/')) return false
  c.res.setHeader('x-request-id', c.requestId)

  if (applyRateLimit(c, c.req.method ?? 'GET')) return true

  const match = matchRoute(c.url, c.cachedRoutes)
  if (!match) {
    const urlPath = c.url.split('?')[0]
    const routePaths = c.cachedRoutes.map((r) => r.routePath)
    const suggestion = findSuggestion(urlPath, routePaths)
    const msg = suggestion
      ? `API route not found: ${urlPath}. Did you mean: ${suggestion}?`
      : 'API route not found'
    sendError(c.res, 'NOT_FOUND', msg, 404, undefined, c.requestId)
    logRequest({
      method: c.req.method ?? 'GET',
      url: c.url,
      status: 404,
      duration: Date.now() - c.startTime,
      requestId: c.requestId,
    })
    return true
  }
  const method = (c.req.method ?? 'GET').toUpperCase()
  // T3.1 (ADR-0016) — context object replaces 12 positional args
  await executeRoute({
    route: match.route,
    method,
    params: match.params,
    req: c.req,
    res: c.res,
    loadModule: c.loadModule,
    serverDir: c.serverDir,
    requestId: c.requestId,
    pluginRunner: c.pluginRunner,
    transformer: c.transformer,
    csrfMode: c.csrfMode,
    disallowed: c.disallowed,
  })
  logRequest({
    method,
    url: c.url,
    status: c.res.statusCode,
    duration: Date.now() - c.startTime,
    requestId: c.requestId,
  })
  return true
}

/** Branch 3: static files (returns true if a static asset was served). */
export function tryServeStatic(c: RequestHandlerCtx): boolean {
  return serveStaticFile(c.req, c.res, c.clientDir)
}

/** Branch 4: custom 404 for URLs that look like missing assets. */
export function tryServeCustom404(c: RequestHandlerCtx): boolean {
  const urlPath = c.url.split('?')[0]
  if (c.custom404Html && extname(urlPath)) {
    c.res.writeHead(404, { 'Content-Type': 'text/html' })
    c.res.end(c.custom404Html)
    return true
  }
  return false
}
