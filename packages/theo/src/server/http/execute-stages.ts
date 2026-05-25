import type { IncomingMessage, ServerResponse } from 'node:http'

import { parseRequestBody } from '../body-parser.js'

import { sendError } from './send-response.js'

/**
 * T5.1 (partial Pipeline extraction) — request-parsing + Zod-validation
 * stages extracted from the executeRoute monolith.
 *
 * Each stage returns `{ ok: true, ...data }` on success OR `{ ok: false }`
 * on short-circuit (in which case the stage already sent an error response).
 *
 * Per EC-5 (plugin hook ordering) and EC-15 (AsyncLocalStorage), these
 * stages do NOT invoke plugin hooks — the orchestrator (`executeRoute`)
 * keeps that responsibility in one place.
 */

export type StageResult<T> = { ok: true; data: T } | { ok: false }

/**
 * Parse URL query + request body (multipart/form-data or JSON).
 * On parse failure, sends 400 or 415 (Unsupported Content-Type) + returns
 * `{ ok: false }`. Otherwise returns `{ query, body }`.
 */
export async function parseQueryAndBody(
  req: IncomingMessage,
  res: ServerResponse,
  requestId: string | undefined,
): Promise<StageResult<{ query: Record<string, string>; body: unknown }>> {
  // Query
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const query: Record<string, string> = Object.fromEntries(url.searchParams)

  // Body (JSON + multipart/form-data)
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
    return { ok: false }
  }

  return { ok: true, data: { query, body } }
}

/**
 * Validate query, body, params against the route's Zod schemas (when present).
 * On validation failure, sends 400 with Zod issues + returns `{ ok: false }`.
 * On success, returns the (possibly-transformed) values from `schema.safeParse(...).data`.
 */
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

export function runZodValidation(
  routeConfig: Record<string, unknown>,
  res: ServerResponse,
  requestId: string | undefined,
  input: {
    query: Record<string, string>
    body: unknown
    params: Record<string, string>
  },
): StageResult<{ query: Record<string, string>; body: unknown; params: Record<string, string> }> {
  const { query, params } = input
  let { body } = input

  if (isZodLike(routeConfig.query)) {
    const result = routeConfig.query.safeParse(query)
    if (!result.success) {
      sendError(
        res,
        'VALIDATION_ERROR',
        'Invalid query parameters',
        400,
        result.error?.issues,
        requestId,
      )
      return { ok: false }
    }
    Object.assign(query, result.data)
  }

  if (isZodLike(routeConfig.body)) {
    const result = routeConfig.body.safeParse(body)
    if (!result.success) {
      sendError(
        res,
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        result.error?.issues,
        requestId,
      )
      return { ok: false }
    }
    body = result.data
  }

  if (isZodLike(routeConfig.params)) {
    const result = routeConfig.params.safeParse(params)
    if (!result.success) {
      sendError(
        res,
        'VALIDATION_ERROR',
        'Invalid route parameters',
        400,
        result.error?.issues,
        requestId,
      )
      return { ok: false }
    }
    Object.assign(params, result.data)
  }

  return { ok: true, data: { query, body, params } }
}
