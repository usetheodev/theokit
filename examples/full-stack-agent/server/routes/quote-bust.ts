/**
 * Cache invalidation endpoint.
 * Busts every cache entry tagged 'quote' (regardless of which symbol).
 * After hitting this, the next /api/quote?symbol=X is a MISS again.
 */
import { defineRoute, revalidateTag } from 'theokit/server'
// Side-effect import: ensures the cache singleton is initialized before
// revalidateTag is called.
import '../lib/cache.js'

export const POST = defineRoute({
  async handler() {
    const { deleted } = await revalidateTag('quote')
    return Response.json({
      ok: true,
      deleted,
      message: `Invalidated ${deleted} cached quote entr${deleted === 1 ? 'y' : 'ies'}.`,
    })
  },
})
