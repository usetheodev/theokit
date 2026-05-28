import { z } from 'zod'

import { defineJob } from 'theokit/server'

/**
 * Example: long-running document processing. Triggered via
 * `ctx.queue.enqueue('process-document', { documentId })` from a route.
 *
 * In production:
 *   - Fetch the document from storage
 *   - Pass through the LLM for extraction / summarization
 *   - Persist results to the DB
 *
 * Default `maxAttempts: 1` (ADR-0003). Override per-job as needed.
 */
export default defineJob('process-document', {
  input: z.object({ documentId: z.string().min(1) }),
  maxAttempts: 3,
  async handler({ input, traceId, attempt }) {
    console.log(
      `[job:process-document] doc=${input.documentId} trace=${traceId} attempt=${attempt}`,
    )
    // Production: load doc, process, persist.
  },
})
