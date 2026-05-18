import { defineRoute, requireAuth } from 'theokit/server'
import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { conversations, type Conversation } from '../../../db/schema.js'
import type { RequestContext } from '../../context.js'

const AgentKind = z.enum(['researcher', 'writer', 'coder'])

/** GET /api/conversations — list current user's conversations */
export const GET = defineRoute<
  z.ZodObject<{ kind: z.ZodOptional<typeof AgentKind> }>,
  z.ZodUndefined,
  z.ZodUndefined,
  RequestContext,
  Conversation[]
>({
  query: z.object({ kind: AgentKind.optional() }),
  handler: async ({ query, ctx }) => {
    requireAuth(ctx.session)
    const rows = await ctx.db
      .select()
      .from(conversations)
      .where(
        query.kind
          ? eq(conversations.userId, ctx.session.userId)
          : eq(conversations.userId, ctx.session.userId),
      )
      .orderBy(desc(conversations.updatedAt))
    return query.kind ? rows.filter((r) => r.agentKind === query.kind) : rows
  },
})

/** POST /api/conversations — create a new conversation */
export const POST = defineRoute<
  z.ZodUndefined,
  z.ZodObject<{ title: z.ZodString; agentKind: typeof AgentKind }>,
  z.ZodUndefined,
  RequestContext,
  Conversation
>({
  body: z.object({
    title: z.string().min(1).max(120),
    agentKind: AgentKind,
  }),
  handler: async ({ body, ctx }) => {
    requireAuth(ctx.session)
    const [row] = await ctx.db
      .insert(conversations)
      .values({
        userId: ctx.session.userId,
        title: body.title,
        agentKind: body.agentKind,
      })
      .returning()
    return row!
  },
})
