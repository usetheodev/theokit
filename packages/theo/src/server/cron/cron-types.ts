/**
 * Cron primitive types (R0.5.4).
 *
 * @see docs/adr/0004-cron-schedule-5-field-utc-strict.md
 */

export type CronConcurrencyPolicy = 'forbid' | 'allow'

export interface CronContext {
  /** W3C trace_id propagated from the scheduler invocation. */
  readonly traceId: string
  /** UTC instant the cron was scheduled to fire. */
  readonly scheduledAt: Date
  /** Abort signal triggered when the scheduler stops or shuts down. */
  readonly signal: AbortSignal
}

export interface CronOptions {
  /** 5-field UTC cron expression (ADR-0004). */
  schedule: string
  /** Handler invoked on each fire. May return Promise. */
  handler: (ctx: CronContext) => unknown
  /**
   * Concurrency policy when previous handler is still running:
   * - 'forbid' (default) — skip the next fire + log a warning
   * - 'allow'            — run concurrently
   */
  concurrency?: CronConcurrencyPolicy
}

export interface CronDefinition {
  readonly name: string
  readonly schedule: string
  readonly handler: (ctx: CronContext) => unknown
  readonly concurrency: CronConcurrencyPolicy
}
