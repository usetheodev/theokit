import type { IncomingMessage, ServerResponse } from 'node:http'

import type { z } from 'zod'

import { parseRequestBody } from '../body-parser.js'
import type { PluginContext } from '../plugin-types.js'
import type { PluginRunner } from '../plugins/plugin-runner.js'
import type { LoadModule } from '../scan/module-loader.js'
import { dispatchCsrfWarn } from '../security/csrf-warn-dispatch.js'
import { enforceCsrf, type CsrfMode, type DisallowedConfig } from '../security/csrf.js'

import { sendJson, sendError } from './execute.js'
import { handleRequestError } from './handle-request-error.js'
import { runMiddlewareAndContext } from './middleware-runner.js'

// Minimal Zod-shaped contract — we only need `safeParse`, not the whole API.
interface ZodLike {
  safeParse: (value: unknown) => {
    success: boolean
    data?: unknown
    error?: { issues: z.ZodIssue[] }
  }
}

// Shape of a `defineAction` export. Anchored by structural typing — we do
// not import the action factory's return type to avoid module cycles, but
// we do reject inputs that fail the structural test.
interface ActionConfig {
  input: ZodLike
  handler: (params: { input: unknown; ctx: unknown }) => unknown
  csrf?: false
}

function isActionConfig(value: unknown): value is ActionConfig {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  if (typeof candidate.handler !== 'function') return false
  const input = candidate.input as ZodLike | undefined
  return typeof input?.safeParse === 'function'
}

export interface ExecuteActionOptions {
  filePath: string
  exportName: string
  req: IncomingMessage
  res: ServerResponse
  loadModule: LoadModule
  serverDir?: string
  requestId?: string
  pluginRunner?: PluginRunner
  csrfMode?: CsrfMode
  disallowed?: DisallowedConfig
}

// Backwards-compatible positional signature; the options-shape is the new
// preferred entry point and what the framework uses internally.
// eslint-disable-next-line max-params -- public API surface; existing callers pass positional args
export async function executeAction(
  filePath: string,
  exportName: string,
  req: IncomingMessage,
  res: ServerResponse,
  loadModule: LoadModule,
  serverDir?: string,
  requestId?: string,
  pluginRunner?: PluginRunner,
  csrfMode: CsrfMode = 'strict',
  disallowed?: DisallowedConfig,
): Promise<void> {
  return executeActionWithOptions({
    filePath,
    exportName,
    req,
    res,
    loadModule,
    serverDir,
    requestId,
    pluginRunner,
    csrfMode,
    disallowed,
  })
}

async function loadActionConfig(
  loadModule: LoadModule,
  filePath: string,
  exportName: string,
  res: ServerResponse,
  requestId: string | undefined,
): Promise<ActionConfig | null> {
  const mod = await loadModule(filePath)
  const exportedValue = mod[exportName]
  if (!isActionConfig(exportedValue)) {
    sendError(res, 'NOT_FOUND', `Action "${exportName}" not found`, 404, undefined, requestId)
    return null
  }
  return exportedValue
}

interface CsrfActionCtx {
  actionConfig: ActionConfig
  csrfMode: CsrfMode
  disallowed: DisallowedConfig | undefined
  requestId: string | undefined
}

function enforceCsrfForAction(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: CsrfActionCtx,
): boolean {
  if (ctx.actionConfig.csrf === false) return true
  const decision = enforceCsrf(
    req,
    ctx.csrfMode,
    {
      // T3.3 DRY — canonical dispatcher
      warn: dispatchCsrfWarn,
      path: req.url,
    },
    ctx.disallowed,
  )
  if (decision.allow) return true
  sendError(
    res,
    'CSRF_INVALID',
    decision.reason ?? 'CSRF check failed',
    403,
    undefined,
    ctx.requestId,
  )
  return false
}

interface ActionPipeline {
  ctx: Record<string, unknown>
  buildPluginCtx: (ctxObj: Record<string, unknown>) => PluginContext
  pluginRunner: PluginRunner | undefined
  serverDir: string | undefined
  loadModule: LoadModule
  req: IncomingMessage
  res: ServerResponse
}

async function runPreHandlerPipeline(p: ActionPipeline): Promise<boolean> {
  if (p.serverDir) {
    const result = await runMiddlewareAndContext(p.req, p.res, p.loadModule, p.serverDir)
    if (result.aborted) return false
    Object.assign(p.ctx, (result.ctx ?? {}) as Record<string, unknown>)
    p.pluginRunner?.applyDecorations(p.ctx)
  }
  if (p.pluginRunner) {
    const preResult = await p.pluginRunner.runPreHandler(p.buildPluginCtx(p.ctx))
    if (preResult.shortCircuited) return false
  }
  return true
}

async function readActionBody(
  req: IncomingMessage,
  res: ServerResponse,
  requestId: string | undefined,
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    const parsed = await parseRequestBody(req)
    const body = parsed.json !== undefined ? parsed.json : parsed.fields
    return { ok: true, body }
  } catch (err) {
    sendError(res, 'VALIDATION_ERROR', (err as Error).message, 400, undefined, requestId)
    return { ok: false }
  }
}

async function executeActionWithOptions(opts: ExecuteActionOptions): Promise<void> {
  const {
    filePath,
    exportName,
    req,
    res,
    loadModule,
    serverDir,
    requestId,
    pluginRunner,
    csrfMode = 'strict',
    disallowed,
  } = opts

  const buildPluginCtx = (ctxObj: Record<string, unknown>): PluginContext => ({
    request: req,
    response: res,
    ctx: ctxObj,
    requestId: requestId ?? 'no-id',
  })

  let ctx: Record<string, unknown> = {}

  try {
    // 1. Only POST.
    if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
      sendError(res, 'METHOD_NOT_ALLOWED', 'Actions only accept POST', 405, undefined, requestId)
      return
    }

    // 2. Plugin onRequest hook (parity with executeRoute).
    if (pluginRunner) {
      pluginRunner.applyDecorations(ctx)
      const onReqResult = await pluginRunner.runOnRequest(buildPluginCtx(ctx))
      if (onReqResult.shortCircuited) return
    }

    // 3. Load module + locate action export.
    const actionConfig = await loadActionConfig(loadModule, filePath, exportName, res, requestId)
    if (!actionConfig) return

    // 4. CSRF enforcement
    if (!enforceCsrfForAction(req, res, { actionConfig, csrfMode, disallowed, requestId })) {
      return
    }

    // 5+6. Middleware + context pipeline, then plugin preHandler.
    const pipeline: ActionPipeline = {
      ctx,
      buildPluginCtx,
      pluginRunner,
      serverDir,
      loadModule,
      req,
      res,
    }
    if (!(await runPreHandlerPipeline(pipeline))) return
    ctx = pipeline.ctx

    // 7. Parse body (supports JSON and multipart/form-data).
    const bodyOutcome = await readActionBody(req, res, requestId)
    if (!bodyOutcome.ok) return

    // 8. Validate input with Zod.
    const result = actionConfig.input.safeParse(bodyOutcome.body)
    if (!result.success) {
      sendError(
        res,
        'VALIDATION_ERROR',
        'Invalid action input',
        400,
        result.error?.issues,
        requestId,
      )
      return
    }

    await runActionHandler({
      actionConfig,
      input: result.data,
      ctx,
      res,
      pluginRunner,
      buildPluginCtx,
    })
  } catch (err) {
    await handleActionError(err, { req, res, ctx, requestId, pluginRunner, buildPluginCtx })
  }
}

interface HandlerCtx {
  actionConfig: ActionConfig
  input: unknown
  ctx: Record<string, unknown>
  res: ServerResponse
  pluginRunner: PluginRunner | undefined
  buildPluginCtx: (ctxObj: Record<string, unknown>) => PluginContext
}

async function runActionHandler(args: HandlerCtx): Promise<void> {
  const handlerResult = await args.actionConfig.handler({ input: args.input, ctx: args.ctx })
  const status = handlerResult === undefined || handlerResult === null ? 204 : 200
  sendJson(args.res, handlerResult ?? null, status)
  if (args.pluginRunner) {
    await args.pluginRunner.runOnResponse(args.buildPluginCtx(args.ctx))
  }
}

interface ActionErrorCtx {
  req: IncomingMessage
  res: ServerResponse
  ctx: Record<string, unknown>
  requestId: string | undefined
  pluginRunner: PluginRunner | undefined
  buildPluginCtx: (ctxObj: Record<string, unknown>) => PluginContext
}

// T3.4 (PV-9 DRY): delegate to the shared `handleRequestError` helper.
// Adds the duck-type AuthRequiredError fallback (latent bug fix — was
// missing from action-execute, present in execute).
async function handleActionError(err: unknown, c: ActionErrorCtx): Promise<void> {
  return handleRequestError(err, {
    req: c.req,
    res: c.res,
    requestId: c.requestId,
    pluginRunner: c.pluginRunner,
    buildPluginCtx: c.buildPluginCtx,
  })
}
