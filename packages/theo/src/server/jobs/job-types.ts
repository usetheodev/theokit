/**
 * Job primitive types (R0.5.5-9).
 *
 * @see docs/adr/0002-job-backend-interface-neutral-contract.md
 * @see docs/adr/0003-enqueue-returns-void-transactional-outbox.md
 */

/**
 * Type registry for jobs. Users extend via module augmentation:
 *
 * ```ts
 * declare module 'theokit/server' {
 *   interface JobRegistry {
 *     'process-document': { documentId: string }
 *     'send-email': { to: string; subject: string }
 *   }
 * }
 * ```
 *
 * Once augmented, `ctx.queue.enqueue<'process-document'>(...)` gets full
 * type inference on the `input` argument.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface JobRegistry {}

export interface JobContext<TInput = unknown> {
  /** W3C trace_id propagated from the originating request or cron. */
  readonly traceId: string
  /** The job's input, type-narrowed per JobRegistry entry. */
  readonly input: TInput
  /** Abort signal triggered when the worker stops or lease times out. */
  readonly signal: AbortSignal
  /** Attempt number (1-indexed). */
  readonly attempt: number
}

export interface JobOptions<TInput = unknown> {
  /** Optional Zod schema (or any `.parse(value)`-shaped object) for input validation. */
  input?: { parse: (value: unknown) => TInput }
  /** Maximum dispatch attempts (default 1 — no retry surprise per ADR-0003). */
  maxAttempts?: number
  /** Handler. Returns `void` per ADR-0003 — no workflow API. */
  handler: (ctx: JobContext<TInput>) => Promise<void> | void
}

export interface JobDefinition<TInput = unknown> {
  readonly name: string
  readonly maxAttempts: number
  readonly hasInputSchema: boolean
  readonly handler: (ctx: JobContext<TInput>) => Promise<void> | void
  readonly inputSchema?: { parse: (value: unknown) => TInput }
}
