'use client'

import { useEffect, useState } from 'react'
import { theoFetch } from 'theokit/client'
import type { GET, POST, User } from '../server/routes/users.js'

/**
 * Typed-client demo. The `typeof GET` and `typeof POST` imports give
 * `theoFetch` full type inference:
 *
 *   - `query.search` is `string | undefined` (Zod schema)
 *   - response is `User[]` (handler return type)
 *   - body for POST is `{ name: string; email: string }` (Zod schema)
 *   - response for POST is `User`
 *
 * No `as` casts. No manual interfaces duplicated on the client side.
 */
export default function Page() {
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<User[]>([])

  useEffect(() => {
    let cancelled = false
    theoFetch<typeof GET>('/api/users', search ? { query: { search } } : {})
      .then((data) => {
        if (!cancelled) setUsers(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [search])

  async function createUser() {
    const created = await theoFetch<typeof POST>('/api/users', {
      body: { name: 'New User', email: `new-${Date.now()}@example.com` },
    })
    setUsers((prev) => [...prev, created])
  }

  return (
    <main>
      <h1>Typed client demo</h1>
      <input
        placeholder="Search by name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <button type="button" onClick={createUser}>
        Create user
      </button>
      <ul>
        {users.map((u) => (
          <li key={u.id}>
            {u.name} — {u.email}
          </li>
        ))}
      </ul>
    </main>
  )
}
