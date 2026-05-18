import { defineRoute } from 'theokit/server'
import { z } from 'zod'
import type { RequestContext } from '../context.js'

/**
 * Demo login — DO NOT USE IN PRODUCTION.
 *
 * Accepts any non-empty username/password. Replace with a real password
 * hash comparison (e.g., bcrypt) against your user table.
 */
export const POST = defineRoute<
  z.ZodUndefined,
  z.ZodObject<{ username: z.ZodString; password: z.ZodString }>,
  z.ZodUndefined,
  RequestContext
>({
  body: z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  }),
  handler: async ({ body, ctx }) => {
    // demo only — any password works
    await ctx.sessions.createSession(ctx.res, {
      userId: `u-${body.username}`,
      username: body.username,
    })
    return { ok: true, username: body.username }
  },
})
