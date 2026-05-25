/**
 * Thrown when a plugin or middleware decorates `ctx.<key>` with a value
 * that the framework would also like to inject (e.g., `ctx.queue` from
 * the jobs backend wiring).
 *
 * Per EC-202 of system-100-percent-functional-plan: silent override is a
 * latent bug class. Fail loud so the conflict surfaces immediately.
 */
export class DuplicateContextKeyError extends Error {
  readonly code = 'DUPLICATE_CONTEXT_KEY'
  constructor(
    public readonly key: string,
    opts?: { reason?: string },
  ) {
    super(
      `Duplicate context key "${key}". ${opts?.reason ?? 'The framework cannot inject a value for a key already decorated by middleware or a plugin.'}`,
    )
    this.name = 'DuplicateContextKeyError'
  }
}
