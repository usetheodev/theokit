import { defineRoute } from 'theokit/server'

export const GET = defineRoute({
  handler: () => ({
    ok: true,
    service: 'theokit-openrouter-demo',
    timestamp: new Date().toISOString(),
  }),
})
