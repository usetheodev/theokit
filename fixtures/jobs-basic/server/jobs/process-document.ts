import { z } from 'zod'

import { defineJob } from '../../../../packages/theo/src/server/jobs/define-job.js'

export default defineJob('process-document', {
  input: z.object({ documentId: z.string() }),
  maxAttempts: 3,
  async handler({ input, traceId, attempt }) {
    console.log(
      `[job:process-document] doc=${input.documentId} trace=${traceId} attempt=${attempt}`,
    )
  },
})
