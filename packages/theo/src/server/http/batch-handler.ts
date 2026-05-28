/**
 * T1.4 — Server-side batch handler.
 *
 * Receives `{ requests: [...] }` POSTed to `/api/__theo_batch__` and returns
 * `{ results: [...] }` with per-item error isolation. EC-2: items cannot
 * override auth/forwarded headers (would be a session-bypass vector).
 */

import { z } from 'zod'

export const STRIPPED_HEADERS = [
  'authorization',
  'cookie',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'host',
] as const

export const BATCH_PATH = '/api/__theo_batch__'
const DEFAULT_MAX_BATCH = 32

export class BatchPathConflictError extends Error {
  constructor(path: string) {
    super(
      `Server route conflicts with reserved batch path ${path}. ` +
        `Rename the route or disable batching in theo.config.ts.`,
    )
    this.name = 'BatchPathConflictError'
  }
}

const batchRequestSchema = z.object({
  path: z.string().min(1),
  method: z.string().min(1),
  query: z.record(z.unknown()).optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string()).optional(),
})

const batchPayloadSchema = z.object({
  requests: z.array(batchRequestSchema).min(1),
})

export type BatchRequestItem = z.infer<typeof batchRequestSchema>
export type BatchPayload = z.infer<typeof batchPayloadSchema>

export type BatchExecuteFn = (
  req: BatchRequestItem,
) => Promise<{ data: unknown } | { error: { message: string; code?: string } }>

export interface HandleBatchOptions {
  execute: BatchExecuteFn
  /** Max number of items per batch. Default 32. */
  max?: number
  /** Outer-request headers that override per-item headers in STRIPPED_HEADERS. */
  outerHeaders?: Record<string, string>
}

export type BatchResultItem = { data: unknown } | { error: { message: string; code?: string } }

export interface BatchResponse {
  results: BatchResultItem[]
}

/**
 * Sanitize a per-item header object: keys in STRIPPED_HEADERS are removed,
 * then the outer request's values for those keys are layered on top so that
 * downstream middlewares see the real session/auth headers.
 */
function sanitizeItemHeaders(
  itemHeaders: Record<string, string> | undefined,
  outerHeaders: Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {}
  if (itemHeaders) {
    for (const [k, v] of Object.entries(itemHeaders)) {
      const lower = k.toLowerCase()
      if (!(STRIPPED_HEADERS as readonly string[]).includes(lower)) {
        out[lower] = v
      }
    }
  }
  if (outerHeaders) {
    for (const stripped of STRIPPED_HEADERS) {
      // `Object.hasOwn` defends against missing keys without triggering
      // `no-unnecessary-condition` (TypeScript types `outerHeaders` keys
      // as defined; `hasOwn` keeps the conditional honest at runtime).
      if (Object.hasOwn(outerHeaders, stripped)) {
        out[stripped] = outerHeaders[stripped]
      }
    }
  }
  return out
}

/**
 * Validate + execute a batch request.
 *
 * CR-028 fix: previously the signature was `payload: BatchPayload`,
 * suggesting the caller had already validated. In reality `api-middleware`
 * passes `JSON.parse(rawBody) as BatchPayload` — an unsafe cast over raw
 * HTTP input. We widen the input type to `unknown` so the type system
 * forces validation, then run Zod once at this single trust boundary.
 */
export async function handleBatchRequest(
  payload: unknown,
  options: HandleBatchOptions,
): Promise<BatchResponse> {
  const parsed = batchPayloadSchema.parse(payload)
  const max = options.max ?? DEFAULT_MAX_BATCH
  if (parsed.requests.length > max) {
    throw new Error(`Batch size ${parsed.requests.length} exceeds max ${max}`)
  }

  const results: BatchResultItem[] = []
  for (const item of parsed.requests) {
    const sanitized: BatchRequestItem = {
      ...item,
      headers: sanitizeItemHeaders(item.headers, options.outerHeaders),
    }
    try {
      const r = await options.execute(sanitized)
      results.push(r)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({ error: { message } })
    }
  }
  return { results }
}
