import { z } from 'zod'
import { defineAgentTool } from 'theokit/server'

/**
 * Returns the server's current ISO 8601 timestamp. No arguments.
 *
 * The simplest possible tool — proves the wire (`defineAgentTool` →
 * `CustomTool` → `streamAgentRun` SSE → ToolCallCard) end-to-end.
 */
export const currentTime = defineAgentTool({
  name: 'current_time',
  description: 'Get the current ISO 8601 timestamp on the server.',
  inputSchema: z.object({}),
  handler: () => new Date().toISOString(),
})
