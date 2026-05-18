import { defineRoute } from 'theokit/server'

export const GET = defineRoute({
  handler: () => ({
    now: new Date(),
    label: 'with superjson, Date round-trips natively',
  }),
})
