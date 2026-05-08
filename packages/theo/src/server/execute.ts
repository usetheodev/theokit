import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
import type { ServerRouteNode } from './match.js'

const METHODS_WITH_BODY = ['POST', 'PUT', 'PATCH']

export function sendJson(
  res: ServerResponse,
  data: unknown,
  status = 200,
): void {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

export function sendError(
  res: ServerResponse,
  code: string,
  message: string,
  status: number,
  issues?: unknown[],
): void {
  sendJson(res, { error: { code, message, ...(issues ? { issues } : {}) } }, status)
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
  vite: ViteDevServer,
): Promise<void> {
  try {
    const mod = await vite.ssrLoadModule(route.filePath)
    const routeConfig = mod[method]

    if (!routeConfig) {
      sendError(res, 'METHOD_NOT_ALLOWED', `Method ${method} not allowed`, 405)
      return
    }

    const handler = typeof routeConfig === 'function' ? routeConfig : routeConfig.handler
    if (typeof handler !== 'function') {
      sendError(res, 'INTERNAL_ERROR', 'Route handler is not a function', 500)
      return
    }

    // Parse query
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const query: Record<string, string> = Object.fromEntries(url.searchParams)

    // Parse body
    let body: unknown
    try {
      body = await parseBody(req)
    } catch (err) {
      sendError(res, 'VALIDATION_ERROR', (err as Error).message, 400)
      return
    }

    // Zod validation
    if (routeConfig.query) {
      const result = routeConfig.query.safeParse(query)
      if (!result.success) {
        sendError(res, 'VALIDATION_ERROR', 'Invalid query parameters', 400, result.error.issues)
        return
      }
      Object.assign(query, result.data)
    }

    if (routeConfig.body) {
      const result = routeConfig.body.safeParse(body)
      if (!result.success) {
        sendError(res, 'VALIDATION_ERROR', 'Invalid request body', 400, result.error.issues)
        return
      }
      body = result.data
    }

    if (routeConfig.params) {
      const result = routeConfig.params.safeParse(params)
      if (!result.success) {
        sendError(res, 'VALIDATION_ERROR', 'Invalid route parameters', 400, result.error.issues)
        return
      }
      Object.assign(params, result.data)
    }

    // Execute handler
    const handlerResult = await handler({ query, body, params, request: req })

    // Handle result
    if (handlerResult === undefined || handlerResult === null) {
      sendJson(res, null, routeConfig.status ?? 204)
      return
    }

    if (handlerResult instanceof Response) {
      res.writeHead(handlerResult.status, Object.fromEntries(handlerResult.headers))
      const responseBody = await handlerResult.text()
      res.end(responseBody)
      return
    }

    sendJson(res, handlerResult, routeConfig.status ?? 200)
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', (err as Error).message ?? 'Internal server error', 500)
  }
}
