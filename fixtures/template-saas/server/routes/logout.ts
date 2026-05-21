import { defineRoute } from 'theokit/server'
import type { z } from 'zod'
import type { RequestContext } from '../context.js'

export const POST = defineRoute<z.ZodUndefined, z.ZodUndefined, z.ZodUndefined, RequestContext>({
  handler: ({ ctx }) => {
    ctx.sessions.destroySession(ctx.res)
    return { ok: true }
  },
})
