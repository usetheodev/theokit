import type { JobDefinition, JobOptions } from './job-types.js'

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

function validateName(name: string): void {
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    throw new Error(
      `defineJob: invalid name "${name}". ` +
        'Must be 1-64 chars, lowercase alphanumeric + hyphen, starting with [a-z0-9].',
    )
  }
}

/**
 * Declare a background job. Pure identity helper — no registration side
 * effect; the build-time scanner (T2.3) discovers definitions by walking
 * `server/jobs/` and emits `.theo/jobs.json`.
 *
 * Per ADR-0003, handler returns `void` (or `Promise<void>`); no workflow
 * API. To run another job after this one, call `ctx.queue.enqueue` from
 * the handler.
 *
 * @example
 * ```ts
 * // server/jobs/process-document.ts
 * import { defineJob } from 'theokit/server'
 * import { z } from 'zod'
 *
 * export default defineJob('process-document', {
 *   input: z.object({ documentId: z.string() }),
 *   maxAttempts: 3,
 *   async handler({ input, traceId }) {
 *     // process input.documentId
 *   },
 * })
 * ```
 */
export function defineJob<TInput = unknown>(
  name: string,
  options: JobOptions<TInput>,
): JobDefinition<TInput> {
  validateName(name)
  return {
    name,
    maxAttempts: options.maxAttempts ?? 1,
    hasInputSchema: options.input !== undefined,
    handler: options.handler,
    inputSchema: options.input,
  }
}
