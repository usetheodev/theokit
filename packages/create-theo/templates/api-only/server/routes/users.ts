import { defineRoute } from 'theokit/server'
import { z } from 'zod'

const users = [
  { id: '1', name: 'Alice', email: 'alice@example.com' },
  { id: '2', name: 'Bob', email: 'bob@example.com' },
]

export const GET = defineRoute({
  query: z.object({ search: z.string().optional() }),
  handler: ({ query }) => {
    if (query.search) {
      return users.filter((u) => u.name.toLowerCase().includes(query.search!.toLowerCase()))
    }
    return users
  },
})

export const POST = defineRoute({
  body: z.object({ name: z.string().min(1), email: z.string().email() }),
  status: 201,
  handler: ({ body }) => ({
    id: String(users.length + 1),
    name: body.name,
    email: body.email,
  }),
})
