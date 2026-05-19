import { defineRoute } from 'theokit/server'
import { z } from 'zod'

/**
 * POST /api/hello — the demo endpoint exercised by the buttons on the home page.
 *
 * - With X-Theo-Action header → 200 OK, devtools Requests tab shows the row.
 * - Without the header → 403 + csrf.warn fires → devtools Errors tab shows it.
 * - With ?token=... in query string → devtools Requests tab shows token as [REDACTED].
 * - With Authorization header → devtools Requests tab shows Authorization as [REDACTED].
 */
export const POST = defineRoute({
  body: z.object({
    name: z.string().optional(),
    secret: z.string().optional(),
    x: z.number().optional(),
  }).optional(),
  handler: async ({ body }) => {
    return {
      ok: true,
      received: body ?? null,
      hint: 'Open the devtools panel — check Requests tab for this entry.',
    }
  },
})
