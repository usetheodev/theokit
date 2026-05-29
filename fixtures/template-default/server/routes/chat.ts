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
    // Provider resolution centralizada (Strategy pattern) — theokit/server resolve
    // apiKey + baseUrl + provider automático via OPENROUTER_API_KEY / OPENAI_API_KEY /
    // ANTHROPIC_API_KEY presente no env. Wire protocol: OpenAI Chat Completions
    // (universal — todos os providers implementam essa API). Consumer NÃO tem
    // conditionals sobre provider — é responsabilidade do framework.
    // Wrap full agent lifecycle in try/catch — provider errors (invalid KEY,
    // 401, rate-limit, model-not-found, 5xx) MUST surface as AgentEvent
    // 'error' so the client renders an actionable message instead of a
    // silent SSE closure. Dogfood chaos Phase 12 validates this contract.
    try {
      const { agent } = await createConversationHistory({
        request,
        response: { headers: cookieHeaders },
        options: {
          // model id literal — provider resolution NÃO depende de prefix inference.
          // Stranger pode trocar livremente sem mexer em routing.
          model: { id: 'gpt-4o-mini' },
          tools: [currentTime],
        },
      })
      const run = await agent.send(message, { signal })
      yield* streamAgentRun(run)
      // Intentionally NO agent.dispose() — the agent stays registered so the
      // next request from the same conversation resumes it (continuity).
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      yield { type: 'error', message: `Agent error: ${msg}` }
    }
  },
})
