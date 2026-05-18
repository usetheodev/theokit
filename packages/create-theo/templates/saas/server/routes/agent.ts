import {
  defineAgentEndpoint,
  requireAuth,
  type AgentEvent,
} from 'theokit/server'
import type { RequestContext } from '../context.js'

/**
 * Protected agent endpoint. `requireAuth` fires BEFORE the stream starts;
 * unauthorized requests get 401 immediately — no SSE bytes leak.
 *
 * Replace the mock generator with your LLM provider call.
 */
export const POST = defineAgentEndpoint<{ message: string }, RequestContext>({
  async *handler({ ctx, request }): AsyncGenerator<AgentEvent> {
    requireAuth(ctx.session)
    const body = (await request.json()) as { message?: string }
    const msg = body.message ?? ''
    yield {
      type: 'message',
      content: `Hello ${ctx.session.email}, you said: "${msg}"`,
    }
    yield { type: 'message', content: '(Replace this mock with your LLM.)' }
  },
})
