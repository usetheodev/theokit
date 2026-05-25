# cache-basic fixture

Demonstrates all 5 cache primitives from `theokit/server`.

## Files

```
fixtures/cache-basic/
├── theo.config.ts                 # cache: { enabled, storage, routeRules }
├── app/page.tsx                   # minimal page
├── server/routes/users.ts         # defineCachedRoute({ cache: { maxAge: 5, tags: ['users'] }})
├── server/routes/admin-revalidate.ts  # revalidateTag + revalidatePath webhook
└── server/lib/stripe.ts           # defineCachedFunction({ name: 'stripe-subs', tags: dynamic })
```

## Scenarios (verifiable via integration test or manual curl)

1. **defineCachedRoute MISS → HIT (5s window)**
   ```bash
   curl -s -D - http://localhost:3000/api/users?id=42 -o /dev/null | grep -i x-theo-cache
   # → X-Theo-Cache: MISS
   curl -s -D - http://localhost:3000/api/users?id=42 -o /dev/null | grep -i x-theo-cache
   # → X-Theo-Cache: HIT
   ```

2. **Route rule applies (`/api/static/**` → maxAge=300, swr=600)**
   ```bash
   curl -s -D - http://localhost:3000/api/static/foo -o /dev/null | grep -i cache-control
   # → Cache-Control: s-maxage=300, stale-while-revalidate=600
   ```
   (Route rule auto-applied without per-route wrapper)

3. **revalidateTag busts cached entries**
   ```bash
   curl -X POST http://localhost:3000/api/admin-revalidate \
     -H "Content-Type: application/json" \
     -d '{"tag":"users"}'
   # → { ok: true, deleted: 1, kind: 'tag' }
   curl http://localhost:3000/api/users?id=42
   # → X-Theo-Cache: MISS  (fresh call_count incremented)
   ```

4. **defineCachedFunction memoizes per-arg**
   ```ts
   import { fetchStripeSubscriptions } from 'theokit/example-cache-basic/lib/stripe'
   await fetchStripeSubscriptions('alice') // call 1
   await fetchStripeSubscriptions('alice') // call 1 (cached)
   await fetchStripeSubscriptions('bob')   // call 2 (different arg)
   ```

5. **bypassWhen via header**
   ```bash
   curl -H "X-No-Cache: 1" http://localhost:3000/api/users?id=42
   # → handler always called fresh (X-Theo-Cache absent)
   ```

## What this fixture proves

- All 5 cache primitives importable from `theokit/server`
- Route rule glob matching wired
- Tag fan-out invalidation reaches the right entries
- Tracking-param exclusion (utm_*, fbclid) → `?utm_source=email` shares cache with bare `/api/users?id=42`
- Set-Cookie auto-bypass (would emit warn if any route returned cookies)
