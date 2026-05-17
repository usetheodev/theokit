import type { z } from 'zod'
import superjson from 'superjson'
import { getGlobalBatcher } from './batch-transport.js'

// --- Transformer (T1.3) ---

/**
 * Module-scoped flag preventing the transformer-mismatch warning from
 * firing more than once per session (EC-6).
 */
let mismatchWarned = false

/** Test-only helper to reset the warned flag between assertions. */
export function __resetMismatchWarningForTests(): void {
  mismatchWarned = false
}

/**
 * Deserialize a fetch response body according to the negotiated transformer.
 *
 * `serverTransformerName` comes from the `x-theo-transformer` response header
 * (null when absent — server is using the default JSON path).
 * `clientTransformerName` is the transformer the client was built with
 * (typically injected via a Vite virtual module; falls back to `'json'`).
 *
 * Mismatch fires a single console.warn and falls back to JSON.parse (EC-5/EC-6).
 */
export function deserializeFetchResponse(
  raw: string,
  serverTransformerName: string | null,
  clientTransformerName: string,
): unknown {
  if (raw === '' || raw === null || raw === undefined) {
    return null
  }

  const serverEffective = serverTransformerName ?? 'json'
  if (serverEffective !== clientTransformerName && !mismatchWarned) {
    mismatchWarned = true
    console.warn(
      `[theokit] transformer mismatch: server=${serverEffective}, client=${clientTransformerName}. Falling back to JSON.parse.`,
    )
  }

  if (serverEffective === 'superjson' && clientTransformerName === 'superjson') {
    const wrapped = JSON.parse(raw) as Parameters<typeof superjson.deserialize>[0]
    return superjson.deserialize(wrapped)
  }

  // Default path (json) or mismatch fallback
  return JSON.parse(raw)
}

// --- Utility Types ---

/** Infer the response type from a route's handler return */
export type InferResponse<T> = T extends { handler: (...args: never[]) => infer R }
  ? Awaited<R>
  : unknown

/** Extract the query Zod schema type, handling optional properties */
type ExtractQuery<T> = T extends { query?: infer Q } ? (Q extends z.ZodType ? Q : never) : never

/** Extract the body Zod schema type, handling optional properties */
type ExtractBody<T> = T extends { body?: infer B } ? (B extends z.ZodType ? B : never) : never

/** Infer query type from a route's query Zod schema */
export type InferQuery<T> = [ExtractQuery<T>] extends [never]
  ? undefined
  : ExtractQuery<T> extends z.ZodUndefined ? undefined : z.infer<ExtractQuery<T>>

/** Infer body type from a route's body Zod schema */
export type InferBody<T> = [ExtractBody<T>] extends [never]
  ? undefined
  : ExtractBody<T> extends z.ZodUndefined ? undefined : z.infer<ExtractBody<T>>

/** Build the options type based on what schemas the route has */
export type TheoFetchOptions<T> = Omit<RequestInit, 'body' | 'method'> &
  (InferQuery<T> extends undefined ? { query?: never } : { query: InferQuery<T> }) &
  (InferBody<T> extends undefined ? { body?: never } : { body: InferBody<T> })

// --- Error Class ---

export class TheoFetchError extends Error {
  status: number
  code?: string
  issues?: unknown[]

  constructor(status: number, body?: unknown) {
    const parsed = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
    const error = parsed?.error as Record<string, unknown> | undefined
    const message = (error?.message as string) ?? `HTTP ${status}`
    super(message)
    this.name = 'TheoFetchError'
    this.status = status
    this.code = error?.code as string | undefined
    this.issues = error?.issues as unknown[] | undefined
  }
}

// --- Main Function ---

export async function theoFetch<T>(
  url: string,
  options?: TheoFetchOptions<T>,
): Promise<InferResponse<T>> {
  // T1.5 — Transparent batching: when globalThis.__THEO_BATCHING__ is truthy
  // (set via Vite virtual module when config.batching=true), route this call
  // through the global batcher. Falls back to direct fetch on batcher failure
  // (degrade gracefully).
  const batcher = getGlobalBatcher()
  if (batcher) {
    try {
      const method = (options as { method?: string } | undefined)?.method ?? 'GET'
      const result = await batcher.dispatch({
        path: url,
        method,
        query: (options as { query?: Record<string, unknown> } | undefined)?.query,
        body: (options as { body?: unknown } | undefined)?.body,
      })
      return result as InferResponse<T>
    } catch (err) {
      // Fall through to direct fetch path below
      void err
    }
  }

  const fetchUrl = new URL(url, globalThis.location?.origin ?? 'http://localhost:3000')

  // Append query params (skip undefined values)
  if (options && 'query' in options && options.query) {
    for (const [k, v] of Object.entries(options.query as Record<string, unknown>)) {
      if (v !== undefined) {
        fetchUrl.searchParams.set(k, String(v))
      }
    }
  }

  // Build fetch init
  const { query: _q, body: _b, ...restOptions } = (options ?? {}) as Record<string, unknown>
  const init: RequestInit = { ...(restOptions as RequestInit) }

  if (options && 'body' in options && options.body !== undefined) {
    init.body = JSON.stringify(options.body)
    init.headers = {
      ...(init.headers as Record<string, string> ?? {}),
      'Content-Type': 'application/json',
    }
  }

  const response = await fetch(fetchUrl.toString(), init)

  if (!response.ok) {
    let errorBody: unknown
    try {
      errorBody = await response.json()
    } catch {
      // Non-JSON error response
    }
    throw new TheoFetchError(response.status, errorBody)
  }

  // Handle 204 No Content (EC-1)
  if (response.status === 204) {
    return null as InferResponse<T>
  }

  // Check for empty body
  const contentLength = response.headers.get('content-length')
  if (contentLength === '0') {
    return null as InferResponse<T>
  }

  // T1.3 — transformer-aware deserialization
  const serverTransformerName = response.headers.get('x-theo-transformer')
  const clientTransformerName = resolveClientTransformerName()
  const text = await response.text()
  return deserializeFetchResponse(text, serverTransformerName, clientTransformerName) as InferResponse<T>
}

/**
 * Read the client-configured transformer name. Default `'json'`.
 *
 * In a Vite build, this is overridden by virtual module
 * `/@theo/runtime-config` which sets `globalThis.__THEO_TRANSFORMER__`.
 * Outside Vite (Node SSR, tests) the default applies.
 */
function resolveClientTransformerName(): string {
  const g = globalThis as { __THEO_TRANSFORMER__?: string }
  return g.__THEO_TRANSFORMER__ ?? 'json'
}
