import { defineRoute } from 'theokit/server'

export const GET = defineRoute({
  handler: ({ ctx }: { ctx: any }) => ({
    hasRequestId: typeof ctx.requestId === 'string',
    middlewareRan: ctx.middlewareRan === true,
    handlerRan: true,
  }),
})
