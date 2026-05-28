import type { JobEnqueueInput } from './job-backend.js'

/**
 * Transactional outbox buffer for `ctx.queue.enqueue` (T2.5).
 *
 * Lifecycle (wired in `http/execute.ts` by T2.5 integration step):
 *   1. Request handler invoked → create per-request outbox.
 *   2. Handler calls `ctx.queue.enqueue(...)` → outbox.push(entry).
 *   3a. Response committed (`res.on('finish')` + statusCode < 400) →
 *       outbox.flush(backend.enqueue).
 *   3b. Response errors (statusCode >= 400, handler throws, `res.on('close')`
 *       without finish) → outbox.discard().
 *
 * Invariants:
 *   - Outbox NEVER dispatches before commit. Backend.enqueue is NEVER
 *     called on the request hot path.
 *   - Handler throws → ZERO jobs dispatched. KEY guarantee from ADR-0003.
 *
 * EC-107: when `backend.enqueue` throws DURING flush (after response
 * committed), we log + continue. The response is already gone; partial
 * dispatch is better than zero. Each failure goes to `onError` (default:
 * `console.warn`).
 */

export interface OutboxFlushOptions {
  /**
   * Called once per failed entry. Default: `console.warn` with the
   * entry name (NOT input — privacy). Throw nothing back to caller —
   * flush always completes.
   */
  onError?: (entryName: string, errorMessage: string) => void
}

export interface Outbox {
  push(entry: JobEnqueueInput): void
  drain(): JobEnqueueInput[]
  discard(): void
  size(): number
  /**
   * Dispatch all buffered entries via `dispatcher`. Returns after all
   * entries attempted. Per-entry failures invoke `opts.onError` (or
   * default warn) and do NOT abort the loop.
   */
  flush(
    dispatcher: (entry: JobEnqueueInput) => Promise<unknown>,
    opts?: OutboxFlushOptions,
  ): Promise<void>
}

export function createOutbox(): Outbox {
  let buffer: JobEnqueueInput[] = []

  return {
    push(entry) {
      buffer.push(entry)
    },
    drain() {
      const out = buffer
      buffer = []
      return out
    },
    discard() {
      buffer = []
    },
    size() {
      return buffer.length
    },
    async flush(dispatcher, opts) {
      const entries = buffer
      buffer = []
      const onError =
        opts?.onError ??
        ((name, msg) => {
          console.warn(`[theokit:jobs:outbox] flush error for "${name}": ${msg}`)
        })
      for (const e of entries) {
        try {
          await dispatcher(e)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          onError(e.name, message)
        }
      }
    },
  }
}
