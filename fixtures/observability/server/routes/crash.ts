import { defineRoute } from 'theo/server'
export const GET = defineRoute({
  handler: () => { throw new Error('Intentional crash for testing') },
})
