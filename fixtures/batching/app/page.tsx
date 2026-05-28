'use client'

import { useEffect, useState } from 'react'
import { createBatcher, type BatchTransport } from 'theokit/client'

/**
 * Demonstrates `createBatcher`. Same-microtask dispatches collapse into a
 * single transport call (HTTP POST to /api/__theo_batch__ by convention).
 *
 * The transport here is a no-op test stub — for a real app you'd point it
 * at fetch('/api/__theo_batch__', { method: 'POST', body: ... }).
 */
const httpTransport: BatchTransport = async (requests) => {
  const res = await fetch('/api/__theo_batch__', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  return (await res.json()) as { responses: { result?: unknown; error?: { message: string } }[] }
}

const batcher = createBatcher({ transport: httpTransport, max: 32 })

export default function Page() {
  const [results, setResults] = useState<unknown[]>([])

  useEffect(() => {
    // 3 dispatches in the same microtask → 1 transport call.
    Promise.all([
      batcher.dispatch({ path: '/api/users', query: { id: '1' } }),
      batcher.dispatch({ path: '/api/users', query: { id: '2' } }),
      batcher.dispatch({ path: '/api/users', query: { id: '3' } }),
    ])
      .then(setResults)
      .catch(() => {})
  }, [])

  return (
    <main>
      <h1>Batching demo</h1>
      <p>
        Three same-tick dispatches collapse into a single POST to <code>/api/__theo_batch__</code>.
        Open DevTools → Network and watch.
      </p>
      <pre>{JSON.stringify(results, null, 2)}</pre>
    </main>
  )
}
