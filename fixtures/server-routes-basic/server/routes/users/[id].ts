import { defineRoute } from 'theo/server'
import { z } from 'zod'

export const GET = defineRoute({
  params: z.object({ id: z.string() }),
  handler: ({ params }) => ({ id: params.id }),
})
