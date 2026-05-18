import { defineRoute } from 'theokit/server'

/**
 * Plain GET route — no per-route rate limit needed. The framework's
 * rate limiter (configured at `theo.config.ts`) is applied uniformly
 * to /api/* routes.
 */
export const GET = defineRoute({
  handler: () => ({ ok: true, at: new Date().toISOString() }),
})
