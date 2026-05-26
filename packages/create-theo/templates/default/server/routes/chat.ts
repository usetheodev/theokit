import { z } from 'zod'
import {
  defineAgentEndpoint,
  defineAgentTool,
  streamAgentRun,
  createConversationHistory,
  type AgentEvent,
} from 'theokit/server'

/**
 * Chat agent endpoint — persistent conversation via createConversationHistory.
 *
 * Each browser tab gets a stable conversation id cookie on first visit;
 * subsequent requests resume the same agent. Conversation turns auto-persist
 * in `<cwd>/.theokit/agents/<conversationId>/messages.jsonl` (SDK owns
 * storage). Tools: current_time example. Memory facts: opt-in via
 * options.memory (off by default).
 *
 * Provider: OPENROUTER_API_KEY (preferred — gateway to many models) OR
 * ANTHROPIC_API_KEY (direct Anthropic).
 */

const currentTime = defineAgentTool({
  name: 'current_time',
  description: 'Get the current ISO timestamp on the server.',
  inputSchema: z.object({}),
  handler: () => new Date().toISOString(),
})

export const POST = defineAgentEndpoint({
  async *handler({ body, request, cookieHeaders, signal }): AsyncGenerator<AgentEvent> {
    const safeBody =
      body !== null && typeof body === 'object' && !Array.isArray(body)
        ? (body as { message?: string })
        : {}
    const { message = '' } = safeBody
    const orKey = process.env.OPENROUTER_API_KEY
    const anKey = process.env.ANTHROPIC_API_KEY
    const apiKey = orKey !== undefined && orKey.length > 0 ? orKey : anKey
    const modelId =
      orKey !== undefined && orKey.length > 0
        ? 'openrouter/anthropic/claude-3.5-sonnet'
        : 'claude-sonnet-4-5-20250929'
    if (apiKey === undefined || apiKey.length === 0) {
      yield {
        type: 'error',
        message: 'Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY in your .env to enable the agent.',
      }
      return
    }
    const { agent } = await createConversationHistory({
      request,
      response: { headers: cookieHeaders },
      options: {
        apiKey,
        model: { id: modelId },
        tools: [currentTime],
      },
    })
    const run = await agent.send(message, { signal })
    yield* streamAgentRun(run)
    // Intentionally NO agent.dispose() — the agent stays registered so the
    // next request from the same conversation resumes it (continuity).
  },
})
