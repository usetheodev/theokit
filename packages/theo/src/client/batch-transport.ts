/**
 * T1.5 — Default HTTP transport for the client batcher.
 *
 * Wraps `fetch` to POST `/api/__theo_batch__` with the collected requests
 * and return the array of per-item results.
 */

import {
  createBatcher,
  type BatchTransport,
  type Batcher,
  type BatchRequest,
  type BatchResponse,
} from './batch.js'

const BATCH_ENDPOINT = '/api/__theo_batch__'

export interface CreateBatchTransportOptions {
  /** Override fetch (default: globalThis.fetch). Used by tests. */
  fetchImpl?: typeof fetch
  /** Override endpoint (default '/api/__theo_batch__'). */
  endpoint?: string
}

export function createBatchTransport(options: CreateBatchTransportOptions = {}): BatchTransport {
  const fetchImpl = options.fetchImpl ?? fetch
  const endpoint = options.endpoint ?? BATCH_ENDPOINT
  return async (requests: BatchRequest[]): Promise<BatchResponse[]> => {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    })
    if (!response.ok) {
      throw new Error(`Batch transport returned ${response.status}`)
    }
    const payload = (await response.json()) as { results?: BatchResponse[] }
    if (!Array.isArray(payload.results)) {
      throw new Error('Batch response missing results array')
    }
    // Map results to indexed BatchResponse shape (server already returns the right form)
    return payload.results.map((item, index) => {
      if ('error' in item) {
        return { index, error: (item as { error: { message: string; code?: string } }).error }
      }
      return { index, data: (item as { data: unknown }).data }
    })
  }
}

// --- EC-7: singleton batcher per page, lazy-instantiated ---

let globalBatcher: Batcher | undefined

/** Test-only — reset the module-scope singleton between assertions. */
export function __resetGlobalBatcherForTests(): void {
  globalBatcher = undefined
}

/**
 * Returns the global batcher singleton when `globalThis.__THEO_BATCHING__` is
 * truthy; undefined otherwise. Lazy-instantiated on first call.
 */
export function getGlobalBatcher(): Batcher | undefined {
  const g = globalThis as { __THEO_BATCHING__?: boolean }
  if (!g.__THEO_BATCHING__) return undefined
  globalBatcher ??= createBatcher({ transport: createBatchTransport() })
  return globalBatcher
}
