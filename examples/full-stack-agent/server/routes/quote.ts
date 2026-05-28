/**
 * Cache demo: a synthetic "quote" lookup that takes 200ms.
 * - Cached for 5 seconds with 30 seconds of stale-while-revalidate.
 * - Tagged ['quote'] for fan-out invalidation from /api/quote-bust.
 *
 * Hit `/api/quote?symbol=AAPL` repeatedly to see X-Theo-Cache transition:
 *   MISS  → first call, handler ran (slow 200ms)
 *   HIT   → next 5 seconds, served from cache (instant)
 *   STALE → seconds 5–35, served from cache + background refresh kicks off
 *   MISS  → after 35s the entry is fully expired
 */
import { defineCachedRoute } from 'theokit/server'
import { z } from 'zod'
import { cacheEngine } from '../lib/cache.js'

let callCount = 0

export const GET = defineCachedRoute(cacheEngine, {
  query: z.object({ symbol: z.string().min(1).max(10) }),
  cache: {
    maxAge: 5,
    swr: 30,
    tags: ['quote'],
    bypassWhen: (req) => req.headers.get('x-no-cache') === '1',
  },
  async handler({ query }) {
    callCount++
    await new Promise((r) => setTimeout(r, 200)) // simulate upstream latency
    return Response.json({
      symbol: query.symbol.toUpperCase(),
      price: Math.round(100 + Math.random() * 50 * 100) / 100,
      computedAt: new Date().toISOString(),
      _meta: {
        handlerCallCount: callCount,
        cachedFor: '5s + 30s SWR',
      },
    })
  },
})
