import type { IncomingMessage, ServerResponse } from 'node:http'

import { AuthRequiredError } from './auth.js'
import { parseRequestBody } from './body-parser.js'
import { enforceCsrf, type CsrfMode, type DisallowedConfig } from './csrf.js'
import { warnOnce } from './logger.js'
import type { ServerRouteNode } from './match.js'
import { runMiddlewareAndContext } from './middleware-runner.js'
import type { LoadModule } from './module-loader.js'
import type { PluginRunner } from './plugin-runner.js'
import type { PluginContext } from './plugin-types.js'
import type { TheoTransformer } from './transformer.js'

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

interface StreamPipeCtx {
  buildPluginCtx: (ctxObj: Record<string, unknown>) => PluginContext
  ctx: Record<string, unknown>
  method: string
  pluginRunner: PluginRunner | undefined
  requestId: string | undefined
  routePath: string
}

/**
 * Pipe a Web Standard ReadableStream into a Node ServerResponse. Stream
 * errors after headers are sent cannot change the response status, but
 * MUST be logged + reported (CR-004 fix). Extracted from `executeRoute`
 * to keep that function's nesting under the max-depth ceiling.
 */
async function pipeWebStreamToResponse(
  body: ReadableStream<Uint8Array>,
  res: ServerResponse,
  ctx: StreamPipeCtx,
): Promise<void> {
  const reader = body.getReader()
  try {
    let done = false
    while (!done) {
      const chunk = await reader.read()
      done = chunk.done
      if (!done) res.write(chunk.value)
    }
  } catch (streamErr) {
    warnOnce(`stream-error:${ctx.routePath}:${ctx.method}`, {
      event: 'stream.error',
      requestId: ctx.requestId ?? 'no-id',
      route: ctx.routePath,
      method: ctx.method,
      message: streamErr instanceof Error ? streamErr.message : String(streamErr),
    })
    if (ctx.pluginRunner) {
      try {
        await ctx.pluginRunner.runOnError(ctx.buildPluginCtx(ctx.ctx), streamErr)
      } catch {
        // onError plugins must never destabilize the response close.
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* lock may already be released by abort */
    }
  }
}

// eslint-disable-next-line max-params -- public API surface; existing callers pass positional args
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

// CR-007/Knip cleanup: `parseBody` (legacy JSON-only parser) was exported
// but had no remaining consumers — the route pipeline uses
// `parseRequestBody` (multipart + JSON) directly. Removed to shrink the
// public surface and remove the duplicated METHODS_WITH_BODY constant.

// eslint-disable-next-line max-params, max-lines-per-function, complexity, sonarjs/cognitive-complexity -- public API; `executeRoute` is the framework's central request pipeline and stays in one place by design (its 12 positional args + branch density mirror the actual request lifecycle; refactoring across modules would obscure the flow more than the cyclomatic count alone suggests). Internal helpers `runCsrfStage`, `parseQueryAndBody`, `runHandlerStage`, etc. have been extracted in other waves; what remains here is the orchestration spine.
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
  csrfMode: CsrfMode = 'strict',
  disallowed?: DisallowedConfig,
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
      sendError(
        res,
        'METHOD_NOT_ALLOWED',
        `Method ${method} not allowed`,
        405,
        undefined,
        requestId,
      )
      return
    }

    const handler =
      typeof routeConfig === 'function'
        ? routeConfig
        : (routeConfig as Record<string, unknown>).handler
    if (typeof handler !== 'function') {
      sendError(res, 'INTERNAL_ERROR', 'Route handler is not a function', 500, undefined, requestId)
      return
    }

    // Phase 5 — CSRF enforcement (warn-first default; strict in 0.3.0).
    // Skips: safe methods (GET/HEAD/OPTIONS), per-route opt-out (`csrf: false`),
    // and bare function exports (legacy style — no opt-out hook available).
    const routeOptOut =
      typeof routeConfig === 'object' && (routeConfig as { csrf?: unknown }).csrf === false
    if (CSRF_PROTECTED_METHODS.has(method) && !routeOptOut) {
      const decision = enforceCsrf(
        req,
        csrfMode,
        {
          warn: (payload) => {
            // T2.1 — warnOnce dedupes by event+method+path so a request
            // loop with 1000 POSTs doesn't flood logs with 1000 identical
            // warnings. Apps grep for `event":"csrf.warn"`.
            const key = `${payload.event}:${payload.method}:${payload.path ?? ''}`
            warnOnce(key, payload as unknown as Record<string, unknown>)
          },
          path: req.url,
        },
        disallowed,
      )
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

    // Zod validation. CR-015 fix: replace `{ safeParse: Function }` with
    // a precise structural type so the type system catches misuse and the
    // call site is `as`-cast free.
    interface ZodLike {
      safeParse: (value: unknown) => {
        success: boolean
        data?: unknown
        error?: { issues: unknown[] }
      }
    }
    const isZodLike = (value: unknown): value is ZodLike =>
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { safeParse?: unknown }).safeParse === 'function'

    const rc = routeConfig as Record<string, unknown>
    if (isZodLike(rc.query)) {
      const result = rc.query.safeParse(query)
      if (!result.success) {
        sendError(
          res,
          'VALIDATION_ERROR',
          'Invalid query parameters',
          400,
          result.error?.issues,
          requestId,
        )
        return
      }
      Object.assign(query, result.data)
    }

    if (isZodLike(rc.body)) {
      const result = rc.body.safeParse(body)
      if (!result.success) {
        sendError(
          res,
          'VALIDATION_ERROR',
          'Invalid request body',
          400,
          result.error?.issues,
          requestId,
        )
        return
      }
      body = result.data
    }

    if (isZodLike(rc.params)) {
      const result = rc.params.safeParse(params)
      if (!result.success) {
        sendError(
          res,
          'VALIDATION_ERROR',
          'Invalid route parameters',
          400,
          result.error?.issues,
          requestId,
        )
        return
      }
      Object.assign(params, result.data)
    }

    // T4.3 — preHandler hook (after Zod validation, before handler)
    if (pluginRunner) {
      const preResult = await pluginRunner.runPreHandler(buildPluginCtx(ctx))
      if (preResult.shortCircuited) return
    }

    // Execute handler. `handler` is structurally typed as `unknown` at
    // this point (came out of a duck-typed module). Cast through a narrow
    // type so the call is properly typed.
    type RouteHandlerCallable = (args: {
      query: Record<string, string>
      body: unknown
      params: Record<string, string>
      request: IncomingMessage
      ctx: Record<string, unknown>
    }) => unknown
    const callableHandler = handler as RouteHandlerCallable
    const handlerResult = await callableHandler({ query, body, params, request: req, ctx })

    // Handle result
    if (handlerResult === undefined || handlerResult === null) {
      sendJson(res, null, (rc.status as number | undefined) ?? 204, transformer)
      if (pluginRunner) await pluginRunner.runOnResponse(buildPluginCtx(ctx))
      return
    }

    if (handlerResult instanceof Response) {
      // `Object.fromEntries(Headers)` collapses multi-valued headers like
      // `Set-Cookie` to a single string. Set Set-Cookie via setHeader array
      // overload BEFORE writeHead (writeHead flushes headers; later setHeader
      // is a no-op or throws). Then writeHead with the remaining singletons.
      const headersBag: Record<string, string> = {}
      for (const [k, v] of handlerResult.headers) {
        if (k.toLowerCase() !== 'set-cookie') headersBag[k] = v
      }
      const setCookies = handlerResult.headers.getSetCookie()
      if (setCookies.length > 0) {
        res.setHeader('Set-Cookie', setCookies)
      }
      res.writeHead(handlerResult.status, headersBag)

      if (handlerResult.body) {
        await pipeWebStreamToResponse(handlerResult.body, res, {
          buildPluginCtx,
          ctx,
          method,
          pluginRunner,
          requestId,
          routePath: route.routePath,
        })
      }

      res.end()
      if (pluginRunner) await pluginRunner.runOnResponse(buildPluginCtx(ctx))
      return
    }

    sendJson(res, handlerResult, (rc.status as number | undefined) ?? 200, transformer)
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
    sendError(
      res,
      'INTERNAL_ERROR',
      err instanceof Error && err.message ? err.message : 'Internal server error',
      500,
      undefined,
      requestId,
    )
    if (pluginRunner) {
      const errCtxObj: Record<string, unknown> = {}
      pluginRunner.applyDecorations(errCtxObj)
      await pluginRunner.runOnResponse(buildPluginCtx(errCtxObj), { inErrorPath: true })
    }
  }
}
