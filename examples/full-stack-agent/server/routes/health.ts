import { z } from 'zod'
import { defineRoute } from 'theokit/server'

export const GET = defineRoute({
  responses: {
    200: z.object({
      ok: z.boolean(),
      example: z.string(),
    }),
  },
  handler: () => ({
    status: 200 as const,
    data: { ok: true, example: 'full-stack-agent' },
  }),
})
