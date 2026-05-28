import { defineRoute } from 'theokit/server'

export const GET = defineRoute({
  handler: () => Response.json({ ok: true }),
})
