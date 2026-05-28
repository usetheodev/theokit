import { defineRoute } from 'theokit/server'
import { z } from 'zod'

export const GET = defineRoute({
  query: z.object({}),
  async handler() {
    return { pong: true }
  },
})
