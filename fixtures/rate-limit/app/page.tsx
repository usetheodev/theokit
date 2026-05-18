'use client'

import { useState } from 'react'

export default function Page() {
  const [responses, setResponses] = useState<{ status: number }[]>([])

  async function fireBurst() {
    const results = await Promise.all(
      Array.from({ length: 7 }, () => fetch('/api/api')),
    )
    setResponses(results.map((r) => ({ status: r.status })))
  }

  return (
    <main>
      <h1>Rate limit demo</h1>
      <p>
        Config: 5 requests per 10s window. Click the button to fire 7
        requests; the last 2 should return <code>429</code>.
      </p>
      <button type="button" onClick={fireBurst}>Fire 7 requests</button>
      <ul>
        {responses.map((r, i) => (
          <li key={i}>#{i + 1}: status {r.status}</li>
        ))}
      </ul>
    </main>
  )
}
