import { defineRoute } from 'theokit/server'

export const GET = defineRoute({
  handler: ({ ctx }) => {
    const started = (ctx as { startedAt?: number }).startedAt ?? 0
    return { ok: true, decoratedStartedAt: started }
  },
})
