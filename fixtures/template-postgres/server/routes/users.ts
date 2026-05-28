import { defineRoute } from 'theokit/server'
import { z } from 'zod'
import { users } from '../../db/schema.js'

export const GET = defineRoute({
  handler: async ({ ctx }) => {
    // Align with api-only template — return array directly so consumers can
    // map without an extra unwrap. Playwright spec asserts Array.isArray.
    const allUsers = await (ctx as any).db.select().from(users)
    return allUsers
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
