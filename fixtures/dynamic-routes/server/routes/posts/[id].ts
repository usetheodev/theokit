import { defineRoute } from 'theokit/server'
import { z } from 'zod'

export const GET = defineRoute({
  params: z.object({ id: z.string().min(1) }),
  handler: ({ params }) => {
    return { id: params.id, title: `Post titled ${params.id}` }
  },
})
