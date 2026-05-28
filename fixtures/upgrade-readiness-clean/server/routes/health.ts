import { defineRoute } from '@theokit/core'
import { z } from 'zod'

export default defineRoute({
  GET: {
    response: z.object({ ok: z.literal(true) }),
    handler: () => ({ ok: true as const }),
  },
})
