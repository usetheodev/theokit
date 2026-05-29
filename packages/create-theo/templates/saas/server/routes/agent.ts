import { defineAgentEndpoint, requireAuth, type AgentEvent } from 'theokit/server'
import { trackAgentRun } from 'theokit/server/cost'
import type { RequestContext } from '../context.js'

/**
 * Protected agent endpoint. `requireAuth` fires BEFORE the stream starts;
 * unauthorized requests get 401 immediately — no SSE bytes leak.
 *
 * Observability: wraps the run with `trackAgentRun` to surface per-user
 * cost + token usage to the configured `UsageStorageAdapter` (configure via
 * `theo.config.ts > cost.storage`). Also feeds the devtools `Agents` tab
 * (when running in dev).
 *
 * NOTE: `costUsd: 0` is a v1 stub. Pricing table integration is a
 * `@usetheo/sdk` follow-up (R0.5.11). Devtools tab renders "$0.0000" —
 * indicates "cost tracking not yet calibrated for this model".
 *
 * Replace the mock generator with your LLM provider call.
 */
export const POST = defineAgentEndpoint<{ message: string }, RequestContext>({
  async *handler({ ctx, request }): AsyncGenerator<AgentEvent> {
    requireAuth(ctx.session)
    const body = (await request.json()) as { message?: string }
    const msg = body.message ?? ''
    try {
      yield {
        type: 'message',
        content: `Hello ${ctx.session.email}, you said: "${msg}"`,
      }
      yield { type: 'message', content: '(Replace this mock with your LLM.)' }
    } finally {
      // Always emit observability — even on stream error / abort.
      // `storage` resolved from theo.config.ts > cost.storage (undefined =
      // no-op; configure to enable persistence + devtools tab visibility).
      // To enable persistent cost tracking: wire `cost: { storage }` into
      // `theo.config.ts` and forward via context. Demo passes `undefined`
      // (no-op storage; still fires devtools dispatcher in dev mode).
      await trackAgentRun(
        {
          userId: ctx.session.email,
          model: 'mock/echo',
          tokens: { input: msg.length, output: 0 }, // crude — real impl uses tokenizer
          costUsd: 0, // v1 stub
        },
        { storage: undefined },
      )
    }
  },
})
