import { Agent } from '@usetheo/sdk'
import { z } from 'zod'
import {
  defineAgentEndpoint,
  defineAgentTool,
  streamAgentRun,
  type AgentEvent,
} from 'theokit/server'

/**
 * Chat agent endpoint — powered by `@usetheo/sdk` with one example tool.
 *
 * defineAgentTool → Zod 3 in, LLM-facing JSON Schema + parsed handler out.
 * yield* streamAgentRun → adapts SDK Run lifecycle to AgentEvent SSE wire.
 * try/catch around dispose → never mask the original SDK error.
 *
 * Provider: prefers OPENROUTER_API_KEY (gateway to many models). Falls back
 * to ANTHROPIC_API_KEY for direct Anthropic. The SDK parses the model id —
 * `openrouter/...` routes via OpenRouter; bare `claude-*` ids route direct.
 */

const currentTime = defineAgentTool({
  name: 'current_time',
  description: 'Get the current ISO timestamp on the server.',
  inputSchema: z.object({}),
  handler: () => new Date().toISOString(),
})

export const POST = defineAgentEndpoint({
  async *handler({ body }): AsyncGenerator<AgentEvent> {
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
    const agent = await Agent.create({
      apiKey,
      model: { id: modelId },
      tools: [currentTime],
    })
    try {
      const run = await agent.send(message)
      yield* streamAgentRun(run)
    } finally {
      try {
        await agent.dispose()
      } catch (e) {
        console.warn('[chat] agent.dispose() failed:', e)
      }
    }
  },
})
