import { defineRoute } from 'theokit/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { users } from '../../db/schema.js'
import { hashPassword } from '../password.js'
import type { RequestContext } from '../context.js'

export const POST = defineRoute<
  z.ZodUndefined,
  z.ZodObject<{
    email: z.ZodString
    name: z.ZodString
    password: z.ZodString
  }>,
  z.ZodUndefined,
  RequestContext
>({
  body: z.object({
    email: z.string().email(),
    name: z.string().min(1).max(80),
    password: z.string().min(8).max(128),
  }),
  handler: async ({ body, ctx }) => {
    const existing = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email.toLowerCase()))
      .limit(1)
    if (existing.length > 0) {
      return new Response(
        JSON.stringify({ error: 'email_in_use' }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      )
    }

    const passwordHash = await hashPassword(body.password)
    const [user] = await ctx.db
      .insert(users)
      .values({
        email: body.email.toLowerCase(),
        name: body.name,
        passwordHash,
      })
      .returning()

    await ctx.sessions.createSession(ctx.res, {
      userId: user!.id,
      email: user!.email,
      name: user!.name,
    })
    return { ok: true, user: { id: user!.id, email: user!.email, name: user!.name } }
  },
})
