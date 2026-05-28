import { defineRoute } from '../../../../packages/theo/src/server/define/define-route.js'
import { z } from 'zod'

export const POST = defineRoute({
  body: z.object({ documentId: z.string() }),
  handler({ body, ctx }) {
    // Cast to access queue; real wiring lands in T6.2 when ctx.queue is
    // injected by the request middleware. For this fixture, the route
    // shape demonstrates the intended usage.
    const queue = (ctx as { queue?: { enqueue: (n: string, i: unknown) => void } }).queue
    queue?.enqueue('process-document', { documentId: body.documentId })
    return { accepted: true }
  },
})
