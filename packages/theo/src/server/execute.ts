import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ServerRouteNode } from './match.js'
import type { LoadModule } from './module-loader.js'
import { runMiddlewareAndContext } from './middleware-runner.js'
import { AuthRequiredError } from './auth.js'
import { parseRequestBody, type BodyParserOptions } from './body-parser.js'
import type { PluginRunner } from './plugin-runner.js'
import type { PluginContext } from './plugin-types.js'
import type { TheoTransformer } from './transformer.js'
import { enforceCsrf, type CsrfMode } from './csrf.js'
import { warnOnce } from './logger.js'

const METHODS_WITH_BODY = ['POST', 'PUT', 'PATCH']
// CSRF policy applies to every state-mutating method, including DELETE.
const CSRF_PROTECTED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function sendJson(
  res: ServerResponse,
  data: unknown,
  status = 200,
  transformer?: TheoTransformer,
): void {
  // T1.2 — transformer-aware serialization. Default (no transformer) uses
  // JSON.stringify direct for backward compat.
  const body = transformer ? transformer.serialize(data) : JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

export interface SendErrorOptions {
  custom404Html?: string
  custom500Html?: string
}

export function sendError(
  res: ServerResponse,
  code: string,
  message: string,
  status: number,
  issues?: unknown[],
  requestId?: string,
  options?: SendErrorOptions,
): void {
  const errorMessage =
    code === 'INTERNAL_ERROR' && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : message

  if (code === 'INTERNAL_ERROR') {
    console.error(`[${requestId ?? 'no-id'}] ${message}`)
  }

  // T2.4 — custom HTML for 404/500 when provided by adapter
  if (status === 404 && options?.custom404Html) {
    const body = options.custom404Html
    res.writeHead(404, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    })
    res.end(body)
    return
  }
  if (status === 500 && options?.custom500Html) {
    const body = options.custom500Html
    res.writeHead(500, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    })
    res.end(body)
    return
  }

  sendJson(
    res,
    {
      error: {
        code,
        message: errorMessage,
        ...(requestId ? { requestId } : {}),
        ...(issues ? { issues } : {}),
      },
    },
    status,
  )
}

export function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const method = req.method?.toUpperCase() ?? 'GET'
    if (!METHODS_WITH_BODY.includes(method)) {
      return resolve(undefined)
    }

    const contentType = req.headers['content-type'] ?? ''
    const chunks: Buffer[] = []

    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString()
      if (!raw) return resolve(undefined)

      if (!contentType.includes('application/json')) {
        return reject(new Error('Expected Content-Type: application/json'))
      }

      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

export async function executeRoute(
  route: ServerRouteNode,
  method: string,
  params: Record<string, string>,
  req: IncomingMessage,
  res: ServerResponse,
  loadModule: LoadModule,
  serverDir?: string,
  requestId?: string,
  pluginRunner?: PluginRunner,
  transformer?: TheoTransformer,
  csrfMode: CsrfMode = 'warn',
): Promise<void> {
  const buildPluginCtx = (ctxObj: Record<string, unknown>): PluginContext => ({
    request: req,
    response: res,
    ctx: ctxObj,
    requestId: requestId ?? 'no-id',
  })

  // T1.2 — emit x-theo-transformer header when a non-default transformer is in use.
  // 'json' is treated as default (no header); any named transformer emits.
  if (transformer && transformer.name !== 'json') {
    res.setHeader('x-theo-transformer', transformer.name)
  }

  try {
    // T4.2 — onRequest hook (runs before middleware)
    let ctx: Record<string, unknown> = {}
    if (pluginRunner) {
      pluginRunner.applyDecorations(ctx)
      const onReqResult = await pluginRunner.runOnRequest(buildPluginCtx(ctx))
      if (onReqResult.shortCircuited) return
    }

    // Run middleware + context pipeline
    if (serverDir) {
      const result = await runMiddlewareAndContext(req, res, loadModule, serverDir)
      if (result.aborted) return
      ctx = (result.ctx ?? {}) as Record<string, unknown>
      // Re-apply decorations on top of middleware-produced ctx so plugin
      // decorations win when middleware did not set the same key.
      if (pluginRunner) pluginRunner.applyDecorations(ctx)
    }

    const mod = await loadModule(route.filePath)
    const routeConfig = mod[method]

    if (!routeConfig) {
      sendError(res, 'METHOD_NOT_ALLOWED', `Method ${method} not allowed`, 405, undefined, requestId)
      return
    }

    const handler = typeof routeConfig === 'function' ? routeConfig : (routeConfig as Record<string, unknown>).handler
    if (typeof handler !== 'function') {
      sendError(res, 'INTERNAL_ERROR', 'Route handler is not a function', 500, undefined, requestId)
      return
    }

    // Phase 5 — CSRF enforcement (warn-first default; strict in 0.3.0).
    // Skips: safe methods (GET/HEAD/OPTIONS), per-route opt-out (`csrf: false`),
    // and bare function exports (legacy style — no opt-out hook available).
    const routeOptOut =
      typeof routeConfig === 'object' &&
      routeConfig !== null &&
      (routeConfig as { csrf?: unknown }).csrf === false
    if (CSRF_PROTECTED_METHODS.has(method) && !routeOptOut) {
      const decision = enforceCsrf(req, csrfMode, {
        warn: (payload) => {
          // T2.1 — warnOnce dedupes by event+method+path so a request
          // loop with 1000 POSTs doesn't flood logs with 1000 identical
          // warnings. Apps grep for `event":"csrf.warn"`.
          const key = `${payload.event}:${payload.method}:${payload.path ?? ''}`
          warnOnce(key, payload as unknown as Record<string, unknown>)
        },
        path: req.url,
      })
      if (!decision.allow) {
        sendError(
          res,
          'CSRF_INVALID',
          decision.reason ?? 'CSRF check failed',
          403,
          undefined,
          requestId,
        )
        return
      }
    }

    // Parse query
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const query: Record<string, string> = Object.fromEntries(url.searchParams)

    // Parse body (supports JSON and multipart/form-data)
    let body: unknown
    try {
      const parsed = await parseRequestBody(req)
      if (parsed.json !== undefined) {
        body = parsed.json
      } else if (parsed.files.length > 0 || Object.keys(parsed.fields).length > 0) {
        body = { ...parsed.fields, _files: parsed.files }
      } else {
        body = undefined
      }
    } catch (err) {
      const message = (err as Error).message
      const status = message.includes('Unsupported Content-Type') ? 415 : 400
      sendError(res, 'VALIDATION_ERROR', message, status, undefined, requestId)
      return
    }

    // Zod validation
    const rc = routeConfig as Record<string, unknown>
    if (rc.query && typeof (rc.query as { safeParse: Function }).safeParse === 'function') {
      const result = (rc.query as { safeParse: Function }).safeParse(query)
      if (!result.success) {
        sendError(res, 'VALIDATION_ERROR', 'Invalid query parameters', 400, result.error.issues, requestId)
        return
      }
      Object.assign(query, result.data)
    }

    if (rc.body && typeof (rc.body as { safeParse: Function }).safeParse === 'function') {
      const result = (rc.body as { safeParse: Function }).safeParse(body)
      if (!result.success) {
        sendError(res, 'VALIDATION_ERROR', 'Invalid request body', 400, result.error.issues, requestId)
        return
      }
      body = result.data
    }

    if (rc.params && typeof (rc.params as { safeParse: Function }).safeParse === 'function') {
      const result = (rc.params as { safeParse: Function }).safeParse(params)
      if (!result.success) {
        sendError(res, 'VALIDATION_ERROR', 'Invalid route parameters', 400, result.error.issues, requestId)
        return
      }
      Object.assign(params, result.data)
    }

    // T4.3 — preHandler hook (after Zod validation, before handler)
    if (pluginRunner) {
      const preResult = await pluginRunner.runPreHandler(buildPluginCtx(ctx))
      if (preResult.shortCircuited) return
    }

    // Execute handler
    const handlerResult = await handler({ query, body, params, request: req, ctx })

    // Handle result
    if (handlerResult === undefined || handlerResult === null) {
      sendJson(res, null, (rc.status as number) ?? 204, transformer)
      if (pluginRunner) await pluginRunner.runOnResponse(buildPluginCtx(ctx))
      return
    }

    if (handlerResult instanceof Response) {
      res.writeHead(handlerResult.status, Object.fromEntries(handlerResult.headers))

      if (handlerResult.body) {
        const reader = handlerResult.body.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(value)
          }
        } catch {
          // Stream error after headers sent — just close the response
        }
      }

      res.end()
      if (pluginRunner) await pluginRunner.runOnResponse(buildPluginCtx(ctx))
      return
    }

    sendJson(res, handlerResult, (rc.status as number) ?? 200, transformer)
    if (pluginRunner) await pluginRunner.runOnResponse(buildPluginCtx(ctx))
  } catch (err) {
    // T4.4 — onError hook (runs before default error response)
    if (pluginRunner) {
      // Best-effort: capture a ctx snapshot for plugins. Decorations were
      // applied to local `ctx` above, but if the error came before that, we
      // pass an empty ctx — the request/response are what matters here.
      const errCtxObj: Record<string, unknown> = {}
      pluginRunner.applyDecorations(errCtxObj)
      await pluginRunner.runOnError(buildPluginCtx(errCtxObj), err)
      // EC-9: response may already have been ended by an onError hook
      if (res.writableEnded) {
        // Still run onResponse but mark inErrorPath to prevent recursion
        await pluginRunner.runOnResponse(buildPluginCtx(errCtxObj), { inErrorPath: true })
        return
      }
    }
    // Duck-type the auth error: under Vite dev / vitest the module-loader
    // can produce a duplicate `AuthRequiredError` class identity, so
    // `instanceof` returns false even though the thrown value carries the
    // expected `code` + `status` fields. We fall back to a shape check.
    const isAuthError =
      err instanceof AuthRequiredError ||
      (err !== null &&
        typeof err === 'object' &&
        (err as { code?: unknown }).code === 'AUTH_REQUIRED' &&
        (err as { status?: unknown }).status === 401)

    if (isAuthError) {
      const authErr = err as { code: string; message: string; status: number }
      sendError(res, authErr.code, authErr.message, authErr.status, undefined, requestId)
      if (pluginRunner) {
        const errCtxObj: Record<string, unknown> = {}
        pluginRunner.applyDecorations(errCtxObj)
        await pluginRunner.runOnResponse(buildPluginCtx(errCtxObj), { inErrorPath: true })
      }
      return
    }
    sendError(res, 'INTERNAL_ERROR', (err as Error).message ?? 'Internal server error', 500, undefined, requestId)
    if (pluginRunner) {
      const errCtxObj: Record<string, unknown> = {}
      pluginRunner.applyDecorations(errCtxObj)
      await pluginRunner.runOnResponse(buildPluginCtx(errCtxObj), { inErrorPath: true })
    }
  }
}
