import { defineRoute } from 'theokit/server'
import { z } from 'zod'

export interface User {
  id: string
  name: string
}

const db: User[] = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
]

export const GET = defineRoute({
  query: z.object({ search: z.string().optional() }),
  handler: ({ query }): User[] => {
    if (!query.search) return db
    return db.filter((u) =>
      u.name.toLowerCase().includes(query.search!.toLowerCase()),
    )
  },
})
