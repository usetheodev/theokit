import type { z } from 'zod'

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

  return response.json() as Promise<InferResponse<T>>
}
