import {
  createConversationHistory,
  defineAgentEndpoint,
  streamAgentRun,
  type AgentEvent,
} from 'theokit/server'
import { InMemoryConversationStorage } from '@usetheo/sdk'

import { tools } from '../tools/index.js'

/**
 * Chat endpoint — exercises every TheoKit-SDK integration primitive from
 * SDK v1.1.0:
 *
 *  • defineAgentEndpoint         → wraps the async generator into SSE wire
 *  • createConversationHistory   → bridges cookie ↔ Agent.getOrCreate(id)
 *  • streamAgentRun              → maps SDKMessage → AgentEvent + structured
 *                                  AgentRunError mapping (code/provider/retriable)
 *  • tools (3×)                  → defineAgentTool wrapped as CustomTool
 *  • InMemoryConversationStorage → ephemeral storage suitable for demo;
 *                                  swap to PostgresConversationStorage in
 *                                  production (see docs/concepts/conversation-history.md)
 *  • ctx.signal                  → propagated to agent.send for abort-on-disconnect
 *                                  (stops token charges when browser closes)
 *
 * Provider: OPENROUTER_API_KEY required. Set MODEL_ID to override the default.
 *
 * Persistence: InMemoryConversationStorage resets per request — fine for
 * demo. For real conversation continuity across requests, use a durable
 * adapter (Postgres/Redis recipes in `docs/concepts/conversation-history.md`).
 */

function readCookie(request: { headers?: unknown }, name: string): string | undefined {
  const headers = request.headers
  let raw: string | undefined
  if (typeof headers === 'object' && headers !== null) {
    const maybeGet = (headers as { get?: unknown }).get
    if (typeof maybeGet === 'function') {
      const result = (maybeGet as (k: string) => string | null).call(headers, 'cookie')
      raw = result ?? undefined
    } else {
      const node = headers as { cookie?: string }
      raw = node.cookie
    }
  }
  if (raw === undefined || raw.length === 0) return undefined
  for (const pair of raw.split(/[;,]/)) {
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    const k = pair.slice(0, eq).trim()
    if (k === name) {
      const v = pair.slice(eq + 1).trim()
      if (/^[a-zA-Z0-9_-]{1,128}$/.test(v)) return v
    }
  }
  return undefined
}

export const POST = defineAgentEndpoint({
  async *handler({ body, request, cookieHeaders, signal }): AsyncGenerator<AgentEvent> {
    const safeBody =
      body !== null && typeof body === 'object' && !Array.isArray(body)
        ? (body as { message?: string })
        : {}
    const { message = '' } = safeBody

    if (message.trim().length === 0) {
      yield { type: 'error', message: 'Empty message — type something to ask the agent.' }
      return
    }

    const apiKey = process.env.OPENROUTER_API_KEY
    if (apiKey === undefined || apiKey.length === 0) {
      yield {
        type: 'error',
        message:
          'OPENROUTER_API_KEY not set. Get a free key at https://openrouter.ai/keys and add to .env.',
      }
      return
    }

    // Default model: openai/gpt-4o-mini — production-grade cheap model with
    // first-class tool calling. Override via MODEL_ID env var.
    const modelId = process.env.MODEL_ID ?? 'openrouter/openai/gpt-4o-mini'

    const probedId = readCookie(request, 'theo_conversation') ?? crypto.randomUUID()

    // Phase 8 — SDK v1.1.0 InMemoryConversationStorage. For real persistence
    // (serverless / multi-host deploys), swap for Postgres/Redis adapter
    // (see docs/concepts/conversation-history.md).
    const conversationStorage = new InMemoryConversationStorage()

    const { agent, conversationId } = await createConversationHistory({
      request,
      response: { headers: cookieHeaders },
      agentId: probedId,
      options: {
        apiKey,
        model: { id: modelId },
        tools,
        conversationStorage,
      },
    })

    // Defense-in-depth: if the SDK ever ignored the agentId override, the
    // cookie would point to one conversation while the runtime serves
    // another → silent persistence drift. Throw loudly instead.
    if (conversationId !== probedId) {
      throw new Error(
        `createConversationHistory ignored agentId override: requested ${probedId}, got ${conversationId}.`,
      )
    }

    // Phase 8 — thread the request close signal so tokens stop being charged
    // when the browser disconnects mid-stream.
    const run = await agent.send(message, { signal })
    yield* streamAgentRun(run)
  },
})
