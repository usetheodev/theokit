'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { buildUseTheoQueryConfig } from 'theokit/react-query'
import { theoFetch } from 'theokit/client'
import type { GET, User } from '../server/routes/users.js'

/**
 * `theokit/react-query` + `@tanstack/react-query` integration.
 *
 * Stable queryKey win (EC-10):
 *   Typing in the search box creates a NEW inline `{ query: { search } }`
 *   object every render. Without stable key derivation, useQuery would treat
 *   it as a different key and trigger an infinite refetch loop.
 *   `buildUseTheoQueryConfig` produces a key derived from the LOGICAL
 *   content — order-independent and identity-independent.
 */
export default function Page() {
  const [search, setSearch] = useState('')

  const config = buildUseTheoQueryConfig<User[]>(
    '/api/users',
    { query: { search } },
    (path, opts) => theoFetch<typeof GET>(path, opts as never),
  )

  const { data, isLoading, isError } = useQuery(config)

  return (
    <main>
      <h1>React Query + theokit/react-query</h1>
      <input
        placeholder="Search…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {isLoading && <p>Loading…</p>}
      {isError && <p>Error</p>}
      <ul>
        {(data ?? []).map((u) => (
          <li key={u.id}>{u.name}</li>
        ))}
      </ul>
    </main>
  )
}
