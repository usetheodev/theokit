'use client'

import { useEffect, useState } from 'react'
import { theoFetch } from 'theokit/client'
import type { GET } from '../server/routes/data.js'

export default function Page() {
  const [data, setData] = useState<{ now: Date; label: string } | null>(null)

  useEffect(() => {
    theoFetch<typeof GET>('/api/data', {}).then((r) => setData(r))
  }, [])

  return (
    <main>
      <h1>Custom transformer demo</h1>
      {data ? (
        <>
          <p>
            <strong>now</strong> (typeof: {typeof data.now} — instanceof Date:{' '}
            {(data.now instanceof Date).toString()})
          </p>
          <p>label: {data.label}</p>
        </>
      ) : (
        <p>Loading…</p>
      )}
    </main>
  )
}
