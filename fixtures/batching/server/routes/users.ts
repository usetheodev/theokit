import { defineRoute } from 'theokit/server'
import { z } from 'zod'

interface User {
  id: string
  name: string
}

const db: User[] = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
  { id: '3', name: 'Carol' },
]

export const GET = defineRoute({
  query: z.object({ id: z.string() }),
  handler: ({ query }) => {
    const user = db.find((u) => u.id === query.id)
    if (!user) throw new Error('not found')
    return user
  },
})
