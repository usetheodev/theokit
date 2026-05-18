# batching

Demonstrates `createBatcher` from `theokit/client`.

## Contract

**Same-microtask dispatches collapse into ONE transport call.** This is the whole point of the primitive.

```ts
import { createBatcher } from 'theokit/client'

const batcher = createBatcher({
  transport: async (requests) => {
    const res = await fetch('/api/__theo_batch__', { method: 'POST', body: JSON.stringify({ requests }) })
    return res.json()
  },
  max: 32, // Optional. If more than 32 dispatches happen in the same tick,
           // the batcher splits into multiple parallel transport calls.
})

// All three resolve from a SINGLE network call:
const [a, b, c] = await Promise.all([
  batcher.dispatch({ path: '/api/users', query: { id: '1' } }),
  batcher.dispatch({ path: '/api/users', query: { id: '2' } }),
  batcher.dispatch({ path: '/api/users', query: { id: '3' } }),
])
```

## Per-item error isolation (EC-10)

If the batch response includes `{ error }` for one item, only that caller's promise rejects. The other items resolve normally. A transport failure (network down) rejects ALL pending dispatches in that batch.

## Server-side batch endpoint

The convention is `POST /api/__theo_batch__`. The endpoint is provided by the framework when `batching: true` is set in `theo.config.ts` — see this fixture's config.

## Run

```bash
npx vitest run tests/unit/fixture-batching.test.ts
```
