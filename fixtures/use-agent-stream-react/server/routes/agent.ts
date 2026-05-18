import { defineAgentEndpoint, type AgentEvent } from 'theokit/server'

export const POST = defineAgentEndpoint({
  async *handler({ request }): AsyncGenerator<AgentEvent> {
    const body = (await request.json()) as { message?: string }
    yield { type: 'message', content: `Echo: ${body.message ?? ''}` }
    yield { type: 'message', content: 'Done.' }
  },
})
