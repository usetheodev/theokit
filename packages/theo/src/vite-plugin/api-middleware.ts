import type { ViteDevServer, Connect } from 'vite'
import { randomUUID } from 'node:crypto'
import { scanServerRoutes } from '../server/scan.js'
import { matchRoute } from '../server/match.js'
import { executeRoute, sendError } from '../server/execute.js'
import { createViteLoader } from '../server/module-loader.js'
import { logRequest } from '../server/logger.js'
import { createRateLimiter } from '../server/rate-limit.js'
import { findSuggestion } from '../server/suggest.js'
import type { RateLimitConfig } from '../server/rate-limit.js'
import type { PluginRunner } from '../server/plugin-runner.js'
import type { TheoTransformer } from '../server/transformer.js'
import {
  handleBatchRequest,
  BATCH_PATH,
  type BatchPayload,
} from '../server/batch-handler.js'

export interface ApiMiddlewareOptions {
  rateLimitConfig?: RateLimitConfig
  pluginRunner?: PluginRunner
  transformer?: TheoTransformer
  /** When defined, enables /api/__theo_batch__ endpoint with given options. */
  batching?: { max?: number }
}

export function createApiMiddleware(
  vite: ViteDevServer,
  serverDir: string,
  rateLimitConfigOrOptions?: RateLimitConfig | ApiMiddlewareOptions,
): Connect.NextHandleFunction {
  // Backward-compat: accept either RateLimitConfig directly (old signature)
  // or an ApiMiddlewareOptions object (new signature with pluginRunner).
  const opts: ApiMiddlewareOptions =
    rateLimitConfigOrOptions && 'windowMs' in rateLimitConfigOrOptions
      ? { rateLimitConfig: rateLimitConfigOrOptions }
      : (rateLimitConfigOrOptions as ApiMiddlewareOptions | undefined) ?? {}

  const loadModule = createViteLoader(vite)
  const rateLimiter = opts.rateLimitConfig ? createRateLimiter(opts.rateLimitConfig) : null
  const pluginRunner = opts.pluginRunner
  const transformer = opts.transformer
  const batching = opts.batching

  return async (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api/')) {
      return next()
    }

    const requestId = randomUUID()
    const start = Date.now()
    res.setHeader('x-request-id', requestId)

    // Rate limit check
    if (rateLimiter) {
      const check = rateLimiter(req)
      for (const [k, v] of Object.entries(check.headers)) res.setHeader(k, v)
      if (check.limited) {
        sendError(res, 'RATE_LIMITED', 'Too many requests', 429, undefined, requestId)
        logRequest({ method: req.method ?? 'GET', url, status: 429, duration: Date.now() - start, requestId })
        return
      }
    }

    // T1.4 — Batch endpoint (only when batching is enabled in config)
    const urlPathOnly = url.split('?')[0]
    if (batching && urlPathOnly === BATCH_PATH && req.method === 'POST') {
      try {
        const chunks: Buffer[] = []
        await new Promise<void>((resolve, reject) => {
          req.on('data', (c) => chunks.push(c as Buffer))
          req.on('end', () => resolve())
          req.on('error', reject)
        })
        const payload = JSON.parse(Buffer.concat(chunks).toString()) as BatchPayload
        const outerHeaders: Record<string, string> = {}
        for (const [k, v] of Object.entries(req.headers ?? {})) {
          if (typeof v === 'string') outerHeaders[k.toLowerCase()] = v
        }
        const result = await handleBatchRequest(payload, {
          max: batching.max,
          outerHeaders,
          execute: async () => ({ data: { ok: true } }), // TODO: wire to executeRoute per item in a follow-up
        })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        sendError(res, 'BATCH_ERROR', message, 400, undefined, requestId)
      }
      logRequest({ method: req.method ?? 'POST', url, status: res.statusCode, duration: Date.now() - start, requestId })
      return
    }

    const routes = scanServerRoutes(serverDir)
    const match = matchRoute(url, routes)

    if (!match) {
      const urlPath = url.split('?')[0]
      const routePaths = routes.map((r) => r.routePath)
      const suggestion = findSuggestion(urlPath, routePaths)
      const msg = suggestion
        ? `API route not found: ${urlPath}. Did you mean: ${suggestion}?`
        : 'API route not found'
      sendError(res, 'NOT_FOUND', msg, 404, undefined, requestId)
      logRequest({ method: req.method ?? 'GET', url, status: 404, duration: Date.now() - start, requestId })
      return
    }

    const method = (req.method ?? 'GET').toUpperCase()
    await executeRoute(match.route, method, match.params, req, res, loadModule, serverDir, requestId, pluginRunner, transformer)
    logRequest({ method, url, status: res.statusCode, duration: Date.now() - start, requestId })
  }
}
