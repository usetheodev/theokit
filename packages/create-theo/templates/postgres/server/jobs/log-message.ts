import { defineJob } from 'theokit/server/jobs'
import { z } from 'zod'
import { appendFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'

/**
 * Background job demonstrating `defineJob` + `ctx.queue.enqueue` pattern.
 *
 * Triggered from `server/routes/users.ts` POST handler via:
 *   await ctx.queue.enqueue('log-message', { userId, message })
 *
 * Per ADR-0003 (transactional outbox), enqueue is deferred until the
 * route handler commits successfully — handler throws → 0 jobs dispatched.
 */
export default defineJob('log-message', {
  input: z.object({ userId: z.string(), message: z.string() }),
  handler: async ({ input, log }) => {
    // v1.1 EC-9: anchor path to process.cwd() — handler CWD may differ from
    // project root when running via external job runner.
    const auditPath = resolve(process.cwd(), '.theo/audit.log')
    await mkdir(dirname(auditPath), { recursive: true })
    const line = `${new Date().toISOString()} user=${input.userId} msg=${input.message}\n`
    await appendFile(auditPath, line)
    log.info({ msg: 'audit logged', userId: input.userId, path: auditPath })
  },
})
