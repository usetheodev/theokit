import { defineRoute } from 'theokit/server'

/**
 * T4.1 — `/api/health` smoke endpoint. The deploy-smoke script asserts:
 *   1. Status 200
 *   2. JSON body { ok: true, adapter: 'vercel' }
 */
export const GET = defineRoute({
  handler: () => {
    return { ok: true, adapter: 'vercel' }
  },
})
