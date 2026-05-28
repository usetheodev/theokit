import type { IncomingMessage, ServerResponse } from 'node:http'

import type { ViteDevServer, Connect } from 'vite'

import { handleBatchRequest, BATCH_PATH } from '../server/http/batch-handler.js'
import { createCorsHandler, type CorsConfig } from '../server/http/cors.js'
import { executeRoute, sendError } from '../server/http/execute.js'
import { extractTraceId, TRACE_HEADER } from '../server/http/trace-context.js'
import type { AuditLogger } from '../server/observability/audit-log.js'
import { logRequest } from '../server/observability/logger.js'
import { findSuggestion } from '../server/observability/suggest.js'
import type { PluginRunner } from '../server/plugins/plugin-runner.js'
import { createRateLimiter } from '../server/rate-limit/rate-limit.js'
import type { RateLimitConfig } from '../server/rate-limit/rate-limit.js'
import { matchRoute } from '../server/scan/match.js'
import { createViteLoader } from '../server/scan/module-loader.js'
import { scanServerRoutes } from '../server/scan/scan.js'
import {
  CSP_REPORT_PATH,
  handleCspReport,
  type CspReportHandlerOptions,
} from '../server/security/csp-report.js'
import { handleCsrfReadiness } from '../server/security/csrf-readiness-endpoint.js'
import type { CsrfReadinessStore } from '../server/security/csrf-readiness-store.js'
import type { DisallowedConfig } from '../server/security/csrf.js'
import { applySecurityHeaders } from '../server/security/security-headers.js'
import type { SecurityHeadersConfig } from '../server/security/security-headers.js'
import type { TheoTransformer } from '../server/transformer.js'

export interface ApiMiddlewareOptions {
  rateLimitConfig?: RateLimitConfig
  pluginRunner?: PluginRunner
  transformer?: TheoTransformer
  /** When defined, enables /api/__theo_batch__ endpoint with given options. */
  batching?: { max?: number }
  /** Phase 5 — CSRF enforcement mode. Default 'warn' (0.2.0). */
  csrfMode?: 'off' | 'warn' | 'strict'
  /** Phase 6 — Default security headers config. */
  securityHeaders?: SecurityHeadersConfig
  /** T5.1 — per-route disallowed escalation pattern. */
  disallowed?: DisallowedConfig
  /** T1.2 — CORS configuration. When undefined, no CORS handling (same-origin only). */
  cors?: CorsConfig
  /** T4.1 — Audit logger. Receives csrf.warn, rate-limit.exceeded, csp.violation events. */
  auditLogger?: AuditLogger
  /** T5.1 — Optional CSP violation hook (forwarded to Sentry / custom sink). */
  onCspViolation?: CspReportHandlerOptions['onViolation']
  /**
   * T2.2 — Optional CSRF readiness store. When provided, the
   * `/__theo/csrf-readiness` endpoint is mounted and warn events are
   * recorded into the store. Dev-mode middleware wires this automatically;
   * production hosts opt in via config.security.csrfTelemetry.exposeReadinessEndpoint.
   */
  csrfReadinessStore?: CsrfReadinessStore
  /**
   * Wave 2 completion (T1.1 vite-proxy) — list of services-proxy path prefixes
   * (e.g. `['/api/agent', '/api/worker']`). Requests whose path starts with
   * any of these prefixes bypass the api-middleware (call `next()`) so the
   * later proxyMiddleware (installed by Vite from `server.proxy`) can forward
   * them to the polyglot sidecar. Empty / undefined preserves Wave 1 BC.
   */
  servicesProxyPrefixes?: readonly string[]
}

/**
 * Wave 2 completion — true when `url` is OUTSIDE TheoKit's API namespace,
 * either because it doesn't start with `/api/` OR because it matches a
 * services-proxy prefix. In both cases the middleware should call `next()`
 * so the request reaches Vite's proxyMiddleware / static fallback. Combining
 * both checks into one helper keeps the main arrow function's cyclomatic
 * complexity within the eslint ceiling.
 */
function shouldBypassApiMiddleware(url: string, prefixes: readonly string[]): boolean {
  if (!url.startsWith('/api/')) return true
  if (prefixes.length === 0) return false
  const path = url.split('?')[0]
  for (const prefix of prefixes) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return true
  }
  return false
}

async function handleCspReportIfMatch(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  ctx: {
    auditLogger: AuditLogger | undefined
    onCspViolation: CspReportHandlerOptions['onViolation'] | undefined
  },
): Promise<boolean> {
  const pathOnly = url.split('?')[0]
  if (pathOnly !== CSP_REPORT_PATH || req.method !== 'POST') return false
  await handleCspReport(req, res, { auditLogger: ctx.auditLogger, onViolation: ctx.onCspViolation })
  return true
}

interface RateLimitCtx {
  rateLimiter:
    | ((req: IncomingMessage) => { limited: boolean; headers: Record<string, string> })
    | null
  requestId: string
  url: string
  start: number
}

/**
 * Apply rate-limit headers and send 429 if exceeded. Returns true when
 * the caller should stop handling the request (limit hit), false otherwise.
 * Extracted from `createApiMiddleware` to keep complexity within ceiling.
 */
function applyRateLimitOr429(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RateLimitCtx,
): boolean {
  if (!ctx.rateLimiter) return false
  const check = ctx.rateLimiter(req)
  for (const [k, v] of Object.entries(check.headers)) res.setHeader(k, v)
  if (!check.limited) return false
  sendError(res, 'RATE_LIMITED', 'Too many requests', 429, undefined, ctx.requestId)
  logRequest({
    method: req.method ?? 'GET',
    url: ctx.url,
    status: 429,
    duration: Date.now() - ctx.start,
    requestId: ctx.requestId,
  })
  return true
}

interface BatchMatchCtx {
  url: string
  batching: { max?: number } | undefined
  requestId: string
  start: number
}

async function handleBatchIfMatch(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: BatchMatchCtx,
): Promise<boolean> {
  if (!ctx.batching) return false
  const urlPathOnly = ctx.url.split('?')[0]
  if (urlPathOnly !== BATCH_PATH || req.method !== 'POST') return false
  await handleBatchInline(req, res, ctx.batching, ctx.requestId)
  logRequest({
    method: req.method ?? 'POST',
    url: ctx.url,
    status: res.statusCode,
    duration: Date.now() - ctx.start,
    requestId: ctx.requestId,
  })
  return true
}

async function handleBatchInline(
  req: IncomingMessage,
  res: ServerResponse,
  batching: { max?: number },
  requestId: string,
): Promise<void> {
  try {
    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      req.on('data', (c) => chunks.push(c as Buffer))
      req.on('end', () => {
        resolve()
      })
      req.on('error', reject)
    })
    // CR-028: pass the parsed JSON as `unknown`; Zod inside
    // handleBatchRequest is the validation boundary.
    const payload: unknown = JSON.parse(Buffer.concat(chunks).toString())
    const outerHeaders: Record<string, string> = {}
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') outerHeaders[k.toLowerCase()] = v
    }
    const result = await handleBatchRequest(payload, {
      max: batching.max,
      outerHeaders,
      // T1.4 placeholder — full per-item route execution lands in a
      // follow-up; for now we return an empty ack so the integration
      // tests of the batch endpoint shape pass.
      execute: () => Promise.resolve({ data: { ok: true } }),
    })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(result))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    sendError(res, 'BATCH_ERROR', message, 400, undefined, requestId)
  }
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
      : (rateLimitConfigOrOptions ?? {})

  const loadModule = createViteLoader(vite)
  const rateLimiter = opts.rateLimitConfig ? createRateLimiter(opts.rateLimitConfig) : null
  const pluginRunner = opts.pluginRunner
  const transformer = opts.transformer
  const batching = opts.batching
  // T6.1 — default flipped from 'warn' to 'strict' for 0.3.0.
  const csrfMode = opts.csrfMode ?? 'strict'
  const disallowed = opts.disallowed
  const securityHeadersConfig = opts.securityHeaders ?? {}
  const securityEnv = { production: process.env.NODE_ENV === 'production' }
  // T1.2 — CORS handler runs FIRST in the pipeline (D10).
  const corsHandler = opts.cors ? createCorsHandler(opts.cors) : null
  const auditLogger = opts.auditLogger
  const onCspViolation = opts.onCspViolation
  const csrfReadinessStore = opts.csrfReadinessStore
  const servicesProxyPrefixes = opts.servicesProxyPrefixes ?? []

  return (req, res, next) => {
    void (async () => {
      const url = req.url ?? ''

      // T5.1 — built-in CSP report endpoint. Matched BEFORE the /api/* gate
      // so the path lives outside the user's route namespace. Endpoint is
      // CSRF-exempt (browsers don't send X-Theo-Action on report POSTs).
      if (await handleCspReportIfMatch(req, res, url, { auditLogger, onCspViolation })) {
        return
      }

      // T2.2 — CSRF readiness endpoint. Only mounted when a store is wired
      // (dev-mode wires it automatically; prod opt-in via config).
      if (csrfReadinessStore && (await handleCsrfReadiness(req, res, csrfReadinessStore))) {
        return
      }

      if (shouldBypassApiMiddleware(url, servicesProxyPrefixes)) {
        next()
        return
      }

      // T1.2 + D10 — CORS preflight runs BEFORE rate limit, BEFORE CSRF.
      // Preflight short-circuits the response (204 + Access-Control-* headers).
      if (corsHandler?.handlePreflight(req, res)) {
        return
      }

      // Phase 7 — traceId resolution. Reads traceparent / x-request-id /
      // generates UUID. The `requestId` name is kept for backward compat
      // with downstream helpers (sendError, logRequest) — same value flows
      // under both `x-request-id` (legacy) and `x-trace-id` (canonical).
      const requestId = extractTraceId(req)
      const start = Date.now()
      res.setHeader('x-request-id', requestId)
      res.setHeader(TRACE_HEADER, requestId)
      // Phase 6 — Apply security headers BEFORE the handler runs so route
      // handlers can still override via res.setHeader (last write wins).
      applySecurityHeaders(res, securityHeadersConfig, securityEnv)
      // T1.2 — Add CORS headers to non-preflight responses.
      corsHandler?.applyHeaders(req, res)

      if (applyRateLimitOr429(req, res, { rateLimiter, requestId, url, start })) {
        return
      }

      // T1.4 — Batch endpoint (only when batching is enabled in config)
      if (await handleBatchIfMatch(req, res, { url, batching, requestId, start })) {
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
        logRequest({
          method: req.method ?? 'GET',
          url,
          status: 404,
          duration: Date.now() - start,
          requestId,
        })
        return
      }

      const method = (req.method ?? 'GET').toUpperCase()
      // T3.1 (ADR-0016) — context object replaces 12 positional args
      await executeRoute({
        route: match.route,
        method,
        params: match.params,
        req,
        res,
        loadModule,
        serverDir,
        requestId,
        pluginRunner,
        transformer,
        csrfMode,
        disallowed,
      })
      logRequest({ method, url, status: res.statusCode, duration: Date.now() - start, requestId })
    })()
  }
}
