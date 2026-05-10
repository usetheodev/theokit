import { defineRoute } from 'theokit/server'
import { z } from 'zod'
import { users } from '../../db/schema.js'

export const GET = defineRoute({
  handler: async ({ ctx }) => {
    const allUsers = await (ctx as any).db.select().from(users)
    return { users: allUsers }
  },
})

export const POST = defineRoute({
  body: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  status: 201,
  handler: async ({ body, ctx }) => {
    const [user] = await (ctx as any).db.insert(users).values(body).returning()
    return user
  },
})
