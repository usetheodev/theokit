import type { IncomingMessage, ServerResponse } from 'node:http'
import type { LoadModule } from './module-loader.js'
import { validateCsrf } from './csrf.js'
import { parseBody, sendJson, sendError } from './execute.js'
import { runMiddlewareAndContext } from './middleware-runner.js'
import { AuthRequiredError } from './auth.js'

export async function executeAction(
  filePath: string,
  exportName: string,
  req: IncomingMessage,
  res: ServerResponse,
  loadModule: LoadModule,
  serverDir?: string,
  requestId?: string,
): Promise<void> {
  try {
    // 1. Only POST
    const method = (req.method ?? 'GET').toUpperCase()
    if (method !== 'POST') {
      sendError(res, 'METHOD_NOT_ALLOWED', 'Actions only accept POST', 405, undefined, requestId)
      return
    }

    // 2. CSRF validation
    const csrf = validateCsrf(req)
    if (!csrf.valid) {
      sendError(res, 'FORBIDDEN', csrf.reason, 403, undefined, requestId)
      return
    }

    // 3. Run middleware + context pipeline
    let ctx: unknown = {}
    if (serverDir) {
      const result = await runMiddlewareAndContext(req, res, loadModule, serverDir)
      if (result.aborted) return
      ctx = result.ctx
    }

    // 4. Load module
    const mod = await loadModule(filePath)

    // 5. Find export
    const actionConfig = mod[exportName] as Record<string, unknown> | undefined
    if (!actionConfig || typeof actionConfig.handler !== 'function' || !actionConfig.input) {
      sendError(res, 'NOT_FOUND', `Action "${exportName}" not found`, 404, undefined, requestId)
      return
    }

    // 6. Parse body
    let body: unknown
    try {
      body = await parseBody(req)
    } catch (err) {
      sendError(res, 'VALIDATION_ERROR', (err as Error).message, 400, undefined, requestId)
      return
    }

    // 7. Validate input with Zod
    const input = actionConfig.input as { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { issues: unknown[] } } }
    const result = input.safeParse(body)
    if (!result.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid action input', 400, result.error?.issues, requestId)
      return
    }

    // 8. Execute handler
    const handlerResult = await (actionConfig.handler as Function)({ input: result.data, ctx })

    // 9. Send response
    if (handlerResult === undefined || handlerResult === null) {
      sendJson(res, null, 204)
      return
    }

    sendJson(res, handlerResult, 200)
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      sendError(res, err.code, err.message, err.status, undefined, requestId)
      return
    }
    sendError(res, 'INTERNAL_ERROR', (err as Error).message ?? 'Internal server error', 500, undefined, requestId)
  }
}
