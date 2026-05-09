import { defineRoute } from 'theo/server'

export const GET = defineRoute({
  handler: ({ ctx }: { ctx: any }) => ({
    requestId: ctx.requestId,
    middlewareRan: ctx.middlewareRan,
  }),
})
