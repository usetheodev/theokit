import type { IncomingMessage, ServerResponse } from 'node:http'

import { AuthRequiredError } from '../auth/auth.js'
import { DuplicateContextKeyError } from '../jobs/duplicate-context-key-error.js'
import { createOutbox } from '../jobs/outbox.js'
import { createOutboxDispatcher, createQueueClient } from '../jobs/queue-client.js'
import { warnOnce } from '../observability/logger.js'
import type { PluginContext } from '../plugin-types.js'
import type { PluginRunner } from '../plugins/plugin-runner.js'
import { dispatchCsrfWarn } from '../security/csrf-warn-dispatch.js'
import { enforceCsrf } from '../security/csrf.js'

import type { ExecuteRouteContext } from './execute-context.js'
import { parseQueryAndBody, runZodValidation } from './execute-stages.js'
import { runMiddlewareAndContext } from './middleware-runner.js'
import { sendError, sendJson } from './send-response.js'

// CSRF policy applies to every state-mutating method, including DELETE.
const CSRF_PROTECTED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// T5.1: sendJson + sendError + SendErrorOptions moved to send-response.ts
// to break the execute ↔ execute-stages cycle. Re-exported below for
// backward compat.
export { sendJson, sendError } from './send-response.js'
export type { SendErrorOptions, SendErrorInput } from './send-response.js'
// T3.1 — ExecuteRouteContext (ADR-0016)
export type { ExecuteRouteContext } from './execute-context.js'

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

// sendError moved to send-response.ts (T5.1) — re-exported above.

// CR-007/Knip cleanup: `parseBody` (legacy JSON-only parser) was exported
// but had no remaining consumers — the route pipeline uses
// `parseRequestBody` (multipart + JSON) directly. Removed to shrink the
// public surface and remove the duplicated METHODS_WITH_BODY constant.

// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity, complexity -- `executeRoute` is the framework's central request pipeline; its body length + branch density mirror the actual request lifecycle. T3.1 / ADR-0016 retired `max-params` (context object replaces 12 positional args). Branch complexity remains intentional: the request lifecycle has irreducible state machine arms (CSRF stage → Zod validate → middleware → handler → stream/JSON response). Remaining helpers `runCsrfStage`, `parseQueryAndBody`, `runHandlerStage`, etc. were extracted in earlier waves.
export async function executeRoute(ctx: ExecuteRouteContext): Promise<void> {
  // T3.1 — destructure the context with defaults applied
  const {
    route,
    method,
    params,
    req,
    res,
    loadModule,
    serverDir,
    requestId,
    pluginRunner,
    transformer,
    csrfMode = 'strict',
    disallowed,
    jobBackend,
  } = ctx
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

    // T2.1 — wire ctx.queue + outbox lifecycle when jobBackend is configured.
    // EC-202: throw on collision instead of silent override.
    if (jobBackend) {
      if (ctx.queue !== undefined) {
        throw new DuplicateContextKeyError('queue', {
          reason:
            'A plugin or middleware already decorated ctx.queue; choose a different key OR remove jobs.backend from theo.config.ts.',
        })
      }
      const outbox = createOutbox()
      const queueClient = createQueueClient(jobBackend, outbox)
      ctx.queue = queueClient

      // Discard on abort or 4xx (handler throws cascade to 500 via catch
      // below, where statusCode is already >= 400).
      res.on('close', () => {
        if (!res.writableFinished) outbox.discard()
      })
      // Flush on commit, only when response indicates success.
      res.on('finish', () => {
        if (res.statusCode >= 400) {
          outbox.discard()
          return
        }
        void outbox.flush(createOutboxDispatcher(jobBackend))
      })
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
          // T3.3 DRY — see security/csrf-warn-dispatch.ts
          warn: dispatchCsrfWarn,
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

    // T5.1 — extracted stages (parseQueryAndBody + runZodValidation).
    // Each stage either succeeds (returns parsed data) OR short-circuits
    // (sends the error response inline + returns ok:false).
    const rc = routeConfig as Record<string, unknown>

    const parseResult = await parseQueryAndBody(req, res, requestId)
    if (!parseResult.ok) return
    const { query } = parseResult.data
    let { body } = parseResult.data

    const validationResult = runZodValidation(rc, res, requestId, { query, body, params })
    if (!validationResult.ok) return
    body = validationResult.data.body

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
