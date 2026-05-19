import { defineAction } from 'theokit/server'
import { z } from 'zod'

/**
 * Server action invoked by Auth.js's `signIn` event to mirror the
 * Auth.js-owned user into TheoKit's encrypted session.
 *
 * Wiring (in your Auth.js config):
 *   events: {
 *     async signIn({ user }) {
 *       await fetch('/api/_actions/syncAuthjsUser', {
 *         method: 'POST',
 *         headers: { 'Content-Type': 'application/json', 'X-Theo-Action': '1' },
 *         body: JSON.stringify({ userId: user.id, email: user.email, name: user.name }),
 *       })
 *     }
 *   }
 */
export const syncAuthjsUser = defineAction({
  input: z.object({
    userId: z.string().min(1),
    email: z.string().email(),
    name: z.string().optional(),
  }),
  async handler({ input, ctx }) {
    // Rotate to defeat session-fixation (OWASP A07) BEFORE writing the
    // authenticated session.
    await ctx.sessions.rotateSession(input as never, ctx.res)
    await ctx.sessions.createSession(ctx.res, {
      userId: input.userId,
      email: input.email,
      name: input.name,
    })
    return { ok: true }
  },
})
