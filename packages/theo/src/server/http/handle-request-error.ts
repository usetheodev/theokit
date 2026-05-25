import type { IncomingMessage, ServerResponse } from 'node:http'

import { AuthRequiredError } from '../auth/auth.js'
import type { PluginContext } from '../plugin-types.js'
import type { PluginRunner } from '../plugins/plugin-runner.js'

import { sendError } from './send-response.js'

/**
 * Canonical error handler for HTTP request pipelines (T3.4 of
 * architecture-review-remediation-plan, PV-9 DRY).
 *
 * Replaces the duplicated catch-block logic in `executeRoute` (1 site) and
 * `executeAction` (1 site, via `handleActionError`). Both code paths now
 * share this implementation.
 *
 * Behavior contract (preserved from previous inline catches):
 * - Plugin `onError` fires first (swallowed if it throws — never amplify failure).
 * - `AuthRequiredError` is detected via `instanceof` AND a duck-type shape
 *   check (`code === 'AUTH_REQUIRED' && status === 401`) — required because
 *   under Vite dev / vitest the module-loader can produce a duplicate
 *   AuthRequiredError class identity, breaking `instanceof`.
 * - `onResponse({ inErrorPath: true })` always fires at the end (swallowed
 *   if it throws — EC-9).
 */
export interface HandleRequestErrorCtx {
  req: IncomingMessage
  res: ServerResponse
  requestId: string | undefined
  pluginRunner: PluginRunner | undefined
  buildPluginCtx: (ctxObj: Record<string, unknown>) => PluginContext
}

export async function handleRequestError(err: unknown, c: HandleRequestErrorCtx): Promise<void> {
  // 1. onError hook — swallowed on failure (EC-9 — never amplify)
  if (c.pluginRunner) {
    const errCtxObj: Record<string, unknown> = {}
    c.pluginRunner.applyDecorations(errCtxObj)
    try {
      await c.pluginRunner.runOnError(c.buildPluginCtx(errCtxObj), err)
    } catch {
      // onError handlers must never destabilize the response.
    }
    // EC-9: response may already have been ended by an onError hook
    if (c.res.writableEnded) {
      try {
        await c.pluginRunner.runOnResponse(c.buildPluginCtx(errCtxObj), {
          inErrorPath: true,
        })
      } catch {
        // Containment (same as above).
      }
      return
    }
  }

  // 2. Auth error detection (instanceof + duck-type fallback)
  const isAuthError =
    err instanceof AuthRequiredError ||
    (err !== null &&
      typeof err === 'object' &&
      (err as { code?: unknown }).code === 'AUTH_REQUIRED' &&
      (err as { status?: unknown }).status === 401)

  if (isAuthError) {
    const authErr = err as { code: string; message: string; status: number }
    sendError(c.res, authErr.code, authErr.message, authErr.status, undefined, c.requestId)
  } else {
    sendError(
      c.res,
      'INTERNAL_ERROR',
      err instanceof Error ? err.message : 'Internal server error',
      500,
      undefined,
      c.requestId,
    )
  }

  // 3. onResponse(inErrorPath) — swallowed on failure (EC-9)
  if (c.pluginRunner) {
    const errCtxObj: Record<string, unknown> = {}
    c.pluginRunner.applyDecorations(errCtxObj)
    try {
      await c.pluginRunner.runOnResponse(c.buildPluginCtx(errCtxObj), {
        inErrorPath: true,
      })
    } catch {
      // Containment.
    }
  }
}
