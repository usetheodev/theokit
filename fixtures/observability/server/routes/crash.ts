import { defineRoute } from 'theokit/server'
export const GET = defineRoute({
  handler: () => {
    throw new Error('Intentional crash for testing')
  },
})
