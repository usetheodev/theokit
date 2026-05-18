import { defineRoute, requireAuth } from 'theokit/server'
import { z } from 'zod'
import { and, eq, asc } from 'drizzle-orm'
import { conversations, messages, type Message } from '../../../../db/schema.js'
import type { RequestContext } from '../../../context.js'

/** GET /api/conversations/:id — fetch conversation + its messages */
export const GET = defineRoute<
  z.ZodUndefined,
  z.ZodUndefined,
  z.ZodObject<{ id: z.ZodString }>,
  RequestContext,
  { id: string; title: string; agentKind: string; messages: Message[] }
>({
  params: z.object({ id: z.string().uuid() }),
  handler: async ({ params, ctx }) => {
    requireAuth(ctx.session)
    const [conv] = await ctx.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, params.id),
          eq(conversations.userId, ctx.session.userId),
        ),
      )
      .limit(1)
    if (!conv) {
      throw Object.assign(new Error('Conversation not found'), {
        status: 404,
        code: 'NOT_FOUND',
      })
    }
    const msgs = await ctx.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(asc(messages.createdAt))
    return {
      id: conv.id,
      title: conv.title,
      agentKind: conv.agentKind,
      messages: msgs,
    }
  },
})

/** DELETE /api/conversations/:id */
export const DELETE = defineRoute<
  z.ZodUndefined,
  z.ZodUndefined,
  z.ZodObject<{ id: z.ZodString }>,
  RequestContext,
  { ok: true }
>({
  params: z.object({ id: z.string().uuid() }),
  handler: async ({ params, ctx }) => {
    requireAuth(ctx.session)
    await ctx.db
      .delete(conversations)
      .where(
        and(
          eq(conversations.id, params.id),
          eq(conversations.userId, ctx.session.userId),
        ),
      )
    return { ok: true }
  },
})
