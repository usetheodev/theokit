import { defineRoute } from 'theokit/server'
import { z } from 'zod'

export interface User {
  id: string
  name: string
  email: string
}

// In-memory user store (demo only)
const users: User[] = [
  { id: 'u-1', name: 'Alice', email: 'alice@example.com' },
  { id: 'u-2', name: 'Bob', email: 'bob@example.com' },
]

/**
 * GET /api/users?search=...
 *
 * Query schema is Zod-validated; client gets `query.search?: string` typed
 * via `theoFetch<typeof GET>(...)` end-to-end (no manual `as` casts).
 */
export const GET = defineRoute({
  query: z.object({ search: z.string().optional() }),
  handler: ({ query }): User[] => {
    if (!query.search) return users
    return users.filter((u) =>
      u.name.toLowerCase().includes(query.search!.toLowerCase()),
    )
  },
})

/**
 * POST /api/users — create a user. Body schema is Zod-validated; client
 * autocompletes `body.name` + `body.email` and TS rejects extras.
 */
export const POST = defineRoute({
  body: z.object({ name: z.string().min(1), email: z.string().email() }),
  handler: ({ body }): User => {
    const user: User = { id: `u-${users.length + 1}`, ...body }
    users.push(user)
    return user
  },
})
