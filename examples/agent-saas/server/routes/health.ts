import { defineRoute } from 'theokit/server'

export const GET = defineRoute({
  handler: () => ({ status: 'ok', at: new Date().toISOString() }),
})
