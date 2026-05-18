import { defineRoute } from 'theokit/server'

export const GET = defineRoute({
  handler: () => ({ status: 'ok', target: process.env.THEO_TARGET ?? 'unknown' }),
})
