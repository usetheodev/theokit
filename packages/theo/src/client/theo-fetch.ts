import superjson from 'superjson'
import type { z } from 'zod'

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
  // `raw` is typed `string`, but stay defensive: callers pass `await response.text()`
  // which can be empty.
  if (raw === '') {
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
  : ExtractQuery<T> extends z.ZodUndefined
    ? undefined
    : z.infer<ExtractQuery<T>>

/** Infer body type from a route's body Zod schema */
export type InferBody<T> = [ExtractBody<T>] extends [never]
  ? undefined
  : ExtractBody<T> extends z.ZodUndefined
    ? undefined
    : z.infer<ExtractBody<T>>

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
    const errorMessage = typeof error?.message === 'string' ? error.message : undefined
    super(errorMessage ?? `HTTP ${String(status)}`)
    this.name = 'TheoFetchError'
    this.status = status
    this.code = typeof error?.code === 'string' ? error.code : undefined
    this.issues = Array.isArray(error?.issues) ? error.issues : undefined
  }
}

/**
 * Serialize a query-param value to a string. Handles primitives, dates,
 * and falls back to JSON for arrays/objects. Avoids the
 * `[object Object]` foot-gun that `no-base-to-string` warns against.
 */
function stringifyQueryValue(value: unknown): string {
  if (value === null) return 'null'
  if (value instanceof Date) return value.toISOString()
  switch (typeof value) {
    case 'string':
      return value
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value)
    default:
      return JSON.stringify(value)
  }
}

// --- Main Function ---

interface TheoFetchInternalOptions {
  method?: string
  query?: Record<string, unknown>
  body?: unknown
  headers?: HeadersInit
  signal?: AbortSignal
}

/**
 * Resolve the request origin per the documented fallback hierarchy. Pure
 * helper extracted to keep `theoFetch` under the complexity ceiling.
 *   1. `globalThis.location.origin` (browser)
 *   2. `globalThis.__THEO_ORIGIN__` (build-time literal)
 *   3. `process.env.THEO_ORIGIN` (escape hatch)
 *   4. `http://localhost` (placeholder for URL parsing — the URL is built
 *      relative so only pathname+search ever flows to the wire)
 */
function resolveRequestOrigin(): string {
  const g = globalThis as { location?: { origin?: string }; __THEO_ORIGIN__?: string }
  const fromEnv = typeof process !== 'undefined' ? process.env.THEO_ORIGIN : undefined
  return g.location?.origin ?? g.__THEO_ORIGIN__ ?? fromEnv ?? 'http://localhost'
}

function buildFetchUrl(path: string, query: Record<string, unknown> | undefined): URL {
  const fetchUrl = new URL(path, resolveRequestOrigin())
  if (!query) return fetchUrl
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) {
      fetchUrl.searchParams.set(k, stringifyQueryValue(v))
    }
  }
  return fetchUrl
}

/**
 * Normalize `HeadersInit` (Headers / `[string, string][]` / Record) into a
 * single plain `Record<string, string>`. Plain-object output is required
 * by callers that introspect headers via index access (test fixtures use
 * `(init.headers as Record<string, string>)['Content-Type']`).
 */
function normalizeHeaders(input: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!input) return out
  if (input instanceof Headers) {
    input.forEach((value, key) => {
      out[key] = value
    })
    return out
  }
  if (Array.isArray(input)) {
    for (const [key, value] of input) out[key] = value
    return out
  }
  for (const [key, value] of Object.entries(input)) {
    out[key] = value
  }
  return out
}

function buildRequestInit(opts: TheoFetchInternalOptions): RequestInit {
  const init: RequestInit = {}
  if (opts.method !== undefined) init.method = opts.method
  if (opts.signal !== undefined) init.signal = opts.signal

  const headers = normalizeHeaders(opts.headers)
  init.headers = headers

  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body)
    headers['Content-Type'] = 'application/json'
  }

  // Phase 5 — Auto-attach `X-Theo-Action: 1` for state-mutating methods so
  // the framework's CSRF check passes when servers run in `strict` mode.
  // Safe methods (GET/HEAD/OPTIONS) skip the header to keep them cacheable.
  const method = (opts.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    headers['X-Theo-Action'] = '1'
  }
  return init
}

async function tryBatcher(
  url: string,
  options: TheoFetchInternalOptions,
): Promise<{ matched: true; result: unknown } | { matched: false }> {
  const batcher = getGlobalBatcher()
  if (!batcher) return { matched: false }
  try {
    const result = await batcher.dispatch({
      path: url,
      method: options.method ?? 'GET',
      query: options.query,
      body: options.body,
    })
    return { matched: true, result }
  } catch {
    // Batcher failure: fall through to direct fetch (graceful degrade).
    return { matched: false }
  }
}

export async function theoFetch<T>(
  url: string,
  options?: TheoFetchOptions<T>,
): Promise<InferResponse<T>> {
  const internal = (options ?? {}) as unknown as TheoFetchInternalOptions

  // T1.5 — Transparent batching when globalThis.__THEO_BATCHING__ is truthy.
  const batchAttempt = await tryBatcher(url, internal)
  if (batchAttempt.matched) {
    return batchAttempt.result as InferResponse<T>
  }

  const fetchUrl = buildFetchUrl(url, internal.query)
  const init = buildRequestInit(internal)
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
  return deserializeFetchResponse(
    text,
    serverTransformerName,
    clientTransformerName,
  ) as InferResponse<T>
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
