import { defineAction } from 'theo/server'
import { z } from 'zod'

export const createUser = defineAction({
  input: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  handler: ({ input }) => ({
    id: '1',
    name: input.name,
    email: input.email,
  }),
})
