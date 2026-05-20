import { defineRoute, requireAuth } from 'theokit/server'
import type { z } from 'zod'
import type { RequestContext } from '../context.js'

export const GET = defineRoute<z.ZodUndefined, z.ZodUndefined, z.ZodUndefined, RequestContext>({
  handler: ({ ctx }) => {
    requireAuth(ctx.session)
    return { userId: ctx.session.userId, email: ctx.session.email }
  },
})
