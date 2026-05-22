import { z } from 'zod'
import { defineAgentTool } from 'theokit/server'

/**
 * Returns an integer uniformly distributed in [min, max] inclusive.
 *
 * Uses `Math.random()` — NOT cryptographically secure. Fine for the demo
 * (dice rolls, "pick a card", etc.); never use for secrets / nonces.
 */
export const randomNumber = defineAgentTool({
  name: 'random_number',
  description: 'Return a random integer in [min, max] inclusive.',
  inputSchema: z
    .object({
      min: z.number().int(),
      max: z.number().int(),
    })
    .refine((d) => d.max > d.min, { message: 'max must be greater than min' }),
  handler: ({ min, max }) => String(Math.floor(Math.random() * (max - min + 1)) + min),
})
