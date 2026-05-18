import { defineRoute } from 'theokit/server'
import { z } from 'zod'
import type { RequestContext } from '../context.js'

export const POST = defineRoute<
  z.ZodUndefined,
  z.ZodObject<{ email: z.ZodString; password: z.ZodString }>,
  z.ZodUndefined,
  RequestContext
>({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
  handler: async ({ body, ctx }) => {
    // DEMO ONLY — replace with bcrypt/argon2 password comparison against
    // the users table. This stub accepts any password.
    const userId = `u-${body.email}`
    await ctx.sessions.createSession(ctx.res, {
      userId,
      email: body.email,
    })
    return { ok: true, email: body.email }
  },
})
