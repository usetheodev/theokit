import { createCacheEngine, defineCachedFunction, InMemoryCacheAdapter } from 'theokit/server'

const engine = createCacheEngine({ storage: new InMemoryCacheAdapter() })

let fetchCount = 0
export const fetchStripeSubscriptions = defineCachedFunction(
  engine,
  async (userId: string) => {
    fetchCount++
    await new Promise((r) => setTimeout(r, 50))
    return { userId, subs: ['monthly'], _debug_call_count: fetchCount }
  },
  {
    name: 'stripe-subs',
    maxAge: 60,
    tags: (userId) => [`stripe:user:${userId}`],
  },
)
