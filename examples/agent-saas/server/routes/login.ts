import { defineRoute } from 'theokit/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { users } from '../../db/schema.js'
import { verifyPassword } from '../password.js'
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
    const [user] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.email, body.email.toLowerCase()))
      .limit(1)
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'invalid_credentials' }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      )
    }
    const result = await verifyPassword(body.password, user.passwordHash)
    if (!result.ok) {
      return new Response(
        JSON.stringify({ error: 'invalid_credentials' }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      )
    }
    // Phase 8 — transparent migration: if the stored hash was the legacy
    // pbkdf2 format, verifyPassword returns a fresh argon2id rehash. Persist
    // it so subsequent logins use the upgraded scheme.
    if (result.rehashAs) {
      await ctx.db
        .update(users)
        .set({ passwordHash: result.rehashAs })
        .where(eq(users.id, user.id))
    }
    await ctx.sessions.createSession(ctx.res, {
      userId: user.id,
      email: user.email,
      name: user.name,
    })
    return { ok: true, user: { id: user.id, email: user.email, name: user.name } }
  },
})
