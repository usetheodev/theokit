import {
  extractTraceContext,
  generateNewTraceContext,
} from '../observability/trace-context-propagation.js'

import { type JobBackend, type JobLease, NonRetryableError } from './job-backend.js'
import type { JobContext, JobDefinition } from './job-types.js'

/**
 * Job runner — pulls leases from a backend and invokes the matching
 * handler. Each invocation wires up `JobContext` with:
 *   - `traceId` extracted from the lease's `traceparent` header (W3C
 *     Trace Context per R0.5.9), OR a fresh generated trace_id when
 *     the upstream had no traceparent OR it was malformed.
 *   - `attempt` from the lease.
 *   - `signal` that aborts when the lease times out.
 *
 * `tick()` runs one dequeue+dispatch cycle and returns when all leases
 * have been ack'd or nack'd. Production deploys call `tick()` in a loop
 * with backoff (the loop is outside this module's scope).
 *
 * EC-6 (trace continuity edge): when a lease has no traceparent OR a
 * malformed one, the handler still gets a valid traceId (generated) —
 * never null/undefined. The job MAY itself enqueue child jobs that
 * continue the new trace_id.
 */

export interface JobRunner {
  /** Run one dequeue+dispatch cycle. */
  tick(opts?: { batchSize?: number; lockSeconds?: number }): Promise<number>
}

export function createJobRunner(
  backend: JobBackend,
  definitions: readonly JobDefinition[],
): JobRunner {
  const byName = new Map<string, JobDefinition>()
  for (const def of definitions) {
    byName.set(def.name, def)
  }

  const runOne = async (lease: JobLease): Promise<void> => {
    const def = byName.get(lease.name)
    if (!def) {
      // Job name not registered in this runner's definition set. Nack
      // permanently — the lease can't be processed by this runner.
      await backend.nack(lease.jobId, {
        error: `No job definition for "${lease.name}"`,
        nonRetryable: true,
      })
      return
    }

    // Resolve trace ID from lease's traceparent, or fall back to fresh.
    let traceId: string
    if (lease.traceparent) {
      const headers = new Headers({ traceparent: lease.traceparent })
      const ctx = extractTraceContext(headers)
      traceId = ctx?.trace_id ?? generateNewTraceContext().trace_id
    } else {
      traceId = generateNewTraceContext().trace_id
    }

    // Optional Zod validation on input.
    let parsedInput: unknown = lease.input
    if (def.inputSchema) {
      try {
        parsedInput = def.inputSchema.parse(lease.input)
      } catch (err) {
        await backend.nack(lease.jobId, {
          error: `Input validation failed: ${err instanceof Error ? err.message : String(err)}`,
          nonRetryable: true,
        })
        return
      }
    }

    const abortController = new AbortController()
    // Auto-abort when lease expires
    const lockMs = lease.lockExpiresAt.getTime() - Date.now()
    const lockTimer = setTimeout(
      () => {
        abortController.abort()
      },
      Math.max(0, lockMs),
    )

    const jobCtx: JobContext = {
      traceId,
      input: parsedInput,
      signal: abortController.signal,
      attempt: lease.attempts,
    }

    try {
      await def.handler(jobCtx)
      await backend.ack(lease.jobId)
    } catch (err) {
      const isNonRetryable = err instanceof NonRetryableError
      await backend.nack(lease.jobId, {
        error: err instanceof Error ? err.message : String(err),
        nonRetryable: isNonRetryable,
      })
    } finally {
      clearTimeout(lockTimer)
    }
  }

  return {
    async tick(opts) {
      const leases = await backend.dequeue({
        batchSize: opts?.batchSize ?? 10,
        lockSeconds: opts?.lockSeconds ?? 30,
      })
      // Process leases sequentially — caller controls concurrency via
      // batchSize and tick frequency.
      for (const lease of leases) {
        await runOne(lease)
      }
      return leases.length
    },
  }
}
