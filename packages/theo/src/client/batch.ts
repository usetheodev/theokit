/**
 * T5.1 — client-side microtask batching.
 *
 * Collects all `dispatch` calls within the same microtask and sends them as a
 * single HTTP POST to the configured transport. Each caller's promise resolves
 * with its own result; one failed item does not break the others (per-item
 * error isolation).
 *
 * Designed as a transport-agnostic primitive so unit tests do not require
 * network access. The default transport (fetch to `/api/__theo_batch__`)
 * lives alongside this module but is created by the consumer (e.g., theoFetch).
 */

export interface BatchRequest {
  path: string
  method: string
  query?: Record<string, unknown>
  body?: unknown
  headers?: Record<string, string>
}

export type BatchResponse =
  | { index: number; data: unknown }
  | { index: number; error: { message: string; code?: string } }

export type BatchTransport = (requests: BatchRequest[]) => Promise<BatchResponse[]>

export interface BatcherOptions {
  transport: BatchTransport
  /** Maximum batch size before flushing into multiple parallel batches. */
  max?: number
}

export interface Batcher {
  dispatch(req: BatchRequest): Promise<unknown>
}

interface PendingCall {
  req: BatchRequest
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

export function createBatcher(options: BatcherOptions): Batcher {
  const max = options.max ?? 32
  let queue: PendingCall[] = []
  let flushScheduled = false

  function flush(): void {
    flushScheduled = false
    const current = queue
    queue = []
    if (current.length === 0) return

    // Split into chunks respecting max
    const chunks: PendingCall[][] = []
    for (let i = 0; i < current.length; i += max) {
      chunks.push(current.slice(i, i + max))
    }

    for (const chunk of chunks) {
      const payload: BatchRequest[] = chunk.map((p) => p.req)
      options
        .transport(payload)
        .then((results) => {
          for (let i = 0; i < chunk.length; i++) {
            // `results[i]` could be undefined at runtime when the transport
            // returns fewer entries than the chunk; TypeScript's strict
            // typing without `noUncheckedIndexedAccess` does not surface
            // this, so we hand-narrow.
            const result = results.length > i ? results[i] : undefined
            if (result === undefined) {
              chunk[i].reject(new Error(`Batch transport returned no result for index ${i}`))
              continue
            }
            if ('error' in result) {
              const err = new Error(result.error.message)
              ;(err as { code?: string }).code = result.error.code
              chunk[i].reject(err)
            } else {
              chunk[i].resolve(result.data)
            }
          }
        })
        .catch((err: unknown) => {
          for (const item of chunk) item.reject(err)
        })
    }
  }

  return {
    dispatch(req: BatchRequest): Promise<unknown> {
      return new Promise<unknown>((resolve, reject) => {
        queue.push({ req, resolve, reject })
        if (!flushScheduled) {
          flushScheduled = true
          queueMicrotask(flush)
        }
      })
    },
  }
}
