import { defineRoute } from 'theokit/server'
import { z } from 'zod'

export const GET = defineRoute({
  params: z.object({ id: z.string() }),
  handler: ({ params }) => ({ id: params.id }),
})
