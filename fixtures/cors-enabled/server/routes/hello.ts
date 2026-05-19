import { defineRoute } from 'theokit/server'
import { z } from 'zod'

export const GET = defineRoute({
  query: z.object({}),
  async handler() {
    return { ok: true, message: 'hello from cors-enabled fixture' }
  },
})
