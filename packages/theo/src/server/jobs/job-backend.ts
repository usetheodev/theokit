/**
 * Neutral `JobBackend` interface per ADR-0002.
 *
 * Implementations ship in core:
 *   - `InMemoryJobBackend` (T2.2) — dev + tests; no external deps
 *   - `PostgresJobBackend` (T3.1) — production; requires `pg` peer dep
 *
 * Community packages (`@theokit/jobs-redis`, `@theokit/jobs-sqs`, etc.)
 * implement this same interface to plug in alternate substrates without
 * modifying TheoKit core.
 */

export interface JobEnqueueInput {
  /** The job name (matches a `defineJob` declaration). */
  name: string
  /** Validated input (already passed through Zod or equivalent at the queue-client layer). */
  input: unknown
  /** Optional idempotency key for at-most-once dispatch within TTL. */
  idempotencyKey?: string
  /** Optional delay before the job becomes available for dispatch. */
  delaySeconds?: number
  /** W3C Trace Context propagation per ADR/R0.5.9. */
  traceparent?: string
  /** Maximum dispatch attempts (read from JobDefinition by the queue client). */
  maxAttempts?: number
}

export interface JobLease {
  readonly jobId: string
  readonly name: string
  readonly input: unknown
  readonly attempts: number
  readonly maxAttempts: number
  readonly traceparent?: string
  readonly lockExpiresAt: Date
}

export interface JobBackend {
  /** Human-readable name for logging (e.g., "memory", "postgres"). */
  readonly name: string

  /** Persist a job for later dispatch. Returns the generated jobId. */
  enqueue(input: JobEnqueueInput): Promise<{ jobId: string }>

  /** Worker loop polls for the next available leases. */
  dequeue(opts: { batchSize?: number; lockSeconds?: number }): Promise<JobLease[]>

  /** Mark a job complete (success). */
  ack(jobId: string): Promise<void>

  /** Mark a job failed; backend decides retry vs DLQ via attempts. */
  nack(jobId: string, opts: { error: string; nonRetryable?: boolean }): Promise<void>

  /** Optional: return existing jobId if `key` was enqueued within `ttlSeconds`. */
  idempotency?(key: string, ttlSeconds: number): Promise<{ jobId: string } | null>
}

/**
 * Thrown from a job handler to opt out of retry policy. The backend MUST
 * nack with `nonRetryable: true` and permanently remove the job.
 */
export class NonRetryableError extends Error {
  readonly code = 'NON_RETRYABLE'
  constructor(message: string) {
    super(message)
    this.name = 'NonRetryableError'
  }
}
