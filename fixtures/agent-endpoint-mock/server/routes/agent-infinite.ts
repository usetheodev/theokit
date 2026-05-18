import { defineAgentEndpoint, type AgentEvent } from 'theokit/server'

/**
 * Infinite generator — used by the abort test in fixture-agent-endpoint.test.ts
 * to verify that `defineAgentEndpoint` honors `request.signal` (EC-7).
 *
 * Yields a tick every 10ms forever. When the request signal aborts, the
 * underlying generator's `.return()` is called by the wrapper and the
 * stream closes promptly.
 */
export const POST = defineAgentEndpoint({
  async *handler(): AsyncGenerator<AgentEvent> {
    let i = 0
    while (true) {
      yield { type: 'message', content: `tick-${++i}` }
      await new Promise((r) => setTimeout(r, 10))
    }
  },
})
