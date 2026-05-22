// T1.4 — framework auto-loads .env into process.env. No shim needed.
import {
  createConversationHistory,
  defineAgentEndpoint,
  streamAgentRun,
  type AgentEvent,
} from 'theokit/server'

import { buildTools } from '../tools/index.js'

/**
 * Chat endpoint — exercises every Phase B primitive of TheoKit:
 *
 *   • defineAgentEndpoint    — wraps the async generator into SSE.
 *   • createConversationHistory — agentId resolution + cookie bridge
 *                                 + Agent.getOrCreate from @usetheo/sdk.
 *   • streamAgentRun          — SDK Run.stream → AgentEvent SSE.
 *   • defineAgentTool × 8     — via buildTools(conversationId).
 *
 * Provider: OPENROUTER_API_KEY (preferred) OR ANTHROPIC_API_KEY (fallback).
 * Model: configurable via MODEL_ID env var.
 *
 * The route does NOT call agent.dispose() — continuity is the point. The
 * SDK auto-persists conversation turns in
 * `.theokit/agents/<conversationId>/messages.jsonl`.
 */

/**
 * Read a cookie value from either a Web `Request` (`headers.get('cookie')`)
 * or a Node `IncomingMessage` (`headers.cookie` as a plain string). The
 * `defineAgentEndpoint` handler receives whichever shape the underlying
 * adapter passes in — dev uses Node IncomingMessage, prod adapters may
 * pass Web Request.
 */
function readConversationCookie(
  request: { headers?: unknown },
  name: string,
): string | undefined {
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

function resolveProvider(): { apiKey: string; modelId: string } | null {
  const orKey = process.env.OPENROUTER_API_KEY
  const anKey = process.env.ANTHROPIC_API_KEY
  const userModel = process.env.MODEL_ID
  if (orKey !== undefined && orKey.length > 0) {
    return {
      apiKey: orKey,
      // Default: openai/gpt-4o-mini — production-grade cheap model with first-class
      // tool calling. ~$0.15/$0.60 per MTok (input/output). Reference standard for
      // tool-calling demos. Override via MODEL_ID env var — e.g.
      //   MODEL_ID=openrouter/anthropic/claude-haiku-4.5  (Anthropic family, ~5x cost)
      //   MODEL_ID=openrouter/google/gemini-2.0-flash-001 (Google, cheapest tier)
      //   MODEL_ID=openrouter/anthropic/claude-sonnet-4.5 (premium quality)
      modelId: userModel ?? 'openrouter/openai/gpt-4o-mini',
    }
  }
  if (anKey !== undefined && anKey.length > 0) {
    return {
      apiKey: anKey,
      modelId: userModel ?? 'claude-sonnet-4-5-20250929',
    }
  }
  return null
}

export const POST = defineAgentEndpoint({
  async *handler({ body, request, cookieHeaders }): AsyncGenerator<AgentEvent> {
    const safeBody =
      body !== null && typeof body === 'object' && !Array.isArray(body)
        ? (body as { message?: string })
        : {}
    const { message = '' } = safeBody

    const provider = resolveProvider()
    if (provider === null) {
      yield {
        type: 'error',
        message: 'Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY in your .env to enable the agent.',
      }
      return
    }

    // Probe the conversationId from the cookie OR generate one. We need the id
    // BEFORE building tools because workspace_{read,write} sandbox to it.
    const probedId = readConversationCookie(request, 'theo_conversation') ?? crypto.randomUUID()
    const tools = buildTools(probedId)

    const { agent, conversationId } = await createConversationHistory({
      request,
      response: { headers: cookieHeaders },
      agentId: probedId,
      options: {
        apiKey: provider.apiKey,
        model: { id: provider.modelId },
        tools,
      },
    })

    // EC-5 (edge case review — MUST FIX): defense-in-depth — if
    // createConversationHistory ever ignores the agentId override (precedence
    // change, bug, etc.), workspace tools would sandbox to one id while the
    // agent runs under another → silent persistence breakage. Throw loudly.
    if (conversationId !== probedId) {
      throw new Error(
        `createConversationHistory ignored the agentId override: ` +
          `requested ${probedId}, got ${conversationId}. ` +
          `Workspace tools would sandbox to the wrong directory.`,
      )
    }

    const run = await agent.send(message)
    yield* streamAgentRun(run)
    // Intentionally no agent.dispose() — continuity by design.
  },
})
