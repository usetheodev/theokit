import { defineRoute, requireAuth } from 'theokit/server'
import { z } from 'zod'

/**
 * GET /api/me — protected route. requireAuth narrows the session type so
 * `userId`/`login` are guaranteed non-undefined inside the handler.
 */
export const GET = defineRoute({
  query: z.object({}),
  async handler({ ctx }) {
    const session = requireAuth(ctx.session)
    return { userId: session.userId, login: session.login }
  },
})
