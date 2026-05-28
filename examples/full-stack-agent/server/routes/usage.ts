import { defineRoute } from 'theokit/server'
import { z } from 'zod'

import { usageStorage } from '../lib/usage-tracking.js'

/**
 * Example: surface per-user agent usage for tier enforcement.
 * GET /api/usage?userId=<id>&days=<N> → totals for the last N days.
 */
export const GET = defineRoute({
  query: z.object({
    userId: z.string().min(1),
    days: z.coerce.number().int().min(1).max(365).default(30),
  }),
  async handler({ query }) {
    const to = new Date()
    const from = new Date(to.getTime() - query.days * 86_400_000)
    const usage = await usageStorage.getUsage({
      userId: query.userId,
      period: { from, to },
    })
    return { ...usage, periodDays: query.days }
  },
})
