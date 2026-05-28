import { z } from 'zod'
import { defineAgentTool } from 'theokit/server'

/**
 * Returns its input verbatim. Useful as a baseline check in the EmptyState
 * quick actions ("does the agent actually call tools?").
 */
export const echo = defineAgentTool({
  name: 'echo',
  description: 'Return the input text verbatim.',
  inputSchema: z.object({ text: z.string().max(1000) }),
  handler: ({ text }) => text,
})
