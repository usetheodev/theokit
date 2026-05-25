import { z } from 'zod'
import { defineAgentTool } from 'theokit/server'

/**
 * Returns the server's ISO 8601 timestamp. Smallest possible tool — proves
 * the wire (`defineAgentTool` → CustomTool → SSE → ToolCallCard) end-to-end.
 */
export const currentTime = defineAgentTool({
  name: 'current_time',
  description: 'Get the current ISO 8601 timestamp on the server.',
  inputSchema: z.object({}),
  handler: () => new Date().toISOString(),
})
