import type { JobBackend, JobEnqueueInput } from './job-backend.js'
import type { JobRegistry } from './job-types.js'
import type { Outbox } from './outbox.js'

/**
 * Options forwarded to `backend.enqueue` at outbox flush time.
 */
export interface EnqueueOptions {
  /** Optional idempotency key for at-most-once dispatch within TTL. */
  idempotencyKey?: string
  /** Optional delay before the job becomes available. */
  delaySeconds?: number
}

/**
 * Typed queue client. Per ADR-0003, `enqueue` returns `void` and buffers
 * to the per-request outbox. `enqueueWithId` is the log-correlation
 * variant that resolves to `{ jobId }` AFTER the outbox flushes.
 *
 * Type inference: `JobName extends keyof JobRegistry`. Users extend the
 * `JobRegistry` interface via module augmentation (see `job-types.ts`).
 * Without augmentation, all enqueue calls compile-error with "Type X is
 * not assignable to type never" — documented in EC-110 as a known onboarding
 * friction.
 */
export interface QueueClient {
  /** Buffer a job to the outbox. Returns void (fire-and-forget). */
  enqueue<JobName extends keyof JobRegistry>(
    name: JobName,
    input: JobRegistry[JobName],
    opts?: EnqueueOptions,
  ): void
  /**
   * Buffer a job AND return a Promise that resolves with the jobId
   * AFTER the outbox flushes (i.e., after the response commits). NOT a
   * handle to await the job result — there is no result API.
   */
  enqueueWithId<JobName extends keyof JobRegistry>(
    name: JobName,
    input: JobRegistry[JobName],
    opts?: EnqueueOptions,
  ): Promise<{ jobId: string }>
}

export interface CreateQueueClientOptions {
  /** W3C traceparent to propagate to enqueued jobs. */
  traceparent?: string
}

/**
 * Create a per-request queue client wired to a backend + outbox.
 *
 * The backend is referenced only to resolve `enqueueWithId` jobIds at
 * flush time — `enqueue` itself does NOT call backend on the hot path
 * (transactional outbox guarantee per ADR-0003).
 */
export function createQueueClient(
  backend: JobBackend,
  outbox: Outbox,
  opts: CreateQueueClientOptions = {},
): QueueClient {
  const traceparent = opts.traceparent

  return {
    enqueue(name, input, enqueueOpts) {
      const entry: JobEnqueueInput = {
        name: name,
        input,
        idempotencyKey: enqueueOpts?.idempotencyKey,
        delaySeconds: enqueueOpts?.delaySeconds,
        traceparent,
      }
      outbox.push(entry)
    },

    enqueueWithId(name, input, enqueueOpts) {
      let resolveJobId!: (v: { jobId: string }) => void
      let rejectJobId!: (e: unknown) => void
      const promise = new Promise<{ jobId: string }>((resolve, reject) => {
        resolveJobId = resolve
        rejectJobId = reject
      })
      // Prevent unhandled rejection if the response is discarded
      void promise.catch(() => {
        /* swallow — jobId promise is best-effort log correlation */
      })

      // Wrap the entry so the outbox flush resolves the promise.
      const entry: JobEnqueueInput & {
        readonly __resolveJobId?: (v: { jobId: string }) => void
        readonly __rejectJobId?: (e: unknown) => void
      } = {
        name: name,
        input,
        idempotencyKey: enqueueOpts?.idempotencyKey,
        delaySeconds: enqueueOpts?.delaySeconds,
        traceparent,
        __resolveJobId: resolveJobId,
        __rejectJobId: rejectJobId,
      }
      outbox.push(entry)
      return promise
    },
  }
}

/**
 * Outbox dispatcher that bridges enqueueWithId's hidden promise channel
 * (`__resolveJobId` / `__rejectJobId`) to the backend.enqueue result.
 *
 * Use this when the request lifecycle hooks call `outbox.flush(...)`.
 */
export function createOutboxDispatcher(
  backend: JobBackend,
): (entry: JobEnqueueInput) => Promise<unknown> {
  return async (entry) => {
    const augmented = entry as JobEnqueueInput & {
      __resolveJobId?: (v: { jobId: string }) => void
      __rejectJobId?: (e: unknown) => void
    }
    try {
      const result = await backend.enqueue(entry)
      augmented.__resolveJobId?.(result)
      return result
    } catch (err) {
      augmented.__rejectJobId?.(err)
      throw err
    }
  }
}
