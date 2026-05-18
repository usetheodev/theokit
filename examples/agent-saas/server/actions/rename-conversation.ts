import { defineAction, requireAuth } from 'theokit/server'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { conversations } from '../../db/schema.js'
import type { RequestContext } from '../context.js'

/**
 * Server action: rename a conversation. Demonstrates `defineAction` +
 * CSRF protection (handled by the framework when the action is called
 * from a form). Zod validates the input; the action runs server-side
 * and returns the updated row.
 */
export default defineAction<
  z.ZodObject<{ id: z.ZodString; title: z.ZodString }>,
  RequestContext
>({
  input: z.object({
    id: z.string().uuid(),
    title: z.string().min(1).max(120),
  }),
  handler: async ({ input, ctx }) => {
    requireAuth(ctx.session)
    const [row] = await ctx.db
      .update(conversations)
      .set({ title: input.title, updatedAt: new Date() })
      .where(
        and(
          eq(conversations.id, input.id),
          eq(conversations.userId, ctx.session.userId),
        ),
      )
      .returning()
    if (!row) {
      throw Object.assign(new Error('Conversation not found'), { status: 404 })
    }
    return { ok: true, conversation: row }
  },
})
