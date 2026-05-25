import { createCacheEngine, defineCachedRoute, InMemoryCacheAdapter } from 'theokit/server'
import { z } from 'zod'

// In a real app, the engine comes from initCacheEngine(config.cache) at framework bootstrap.
// This fixture exposes a local engine so the test harness can introspect it.
const engine = createCacheEngine({ storage: new InMemoryCacheAdapter() })

let calls = 0
export const GET = defineCachedRoute(engine, {
  query: z.object({ id: z.string() }),
  cache: {
    maxAge: 5,
    swr: 30,
    tags: ['users'],
    bypassWhen: (req) => req.headers.get('x-no-cache') === '1',
  },
  handler({ query }) {
    calls++
    return Response.json({ id: query.id, name: 'User ' + query.id, calls })
  },
})

export { engine as __testEngine }
