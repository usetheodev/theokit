import { defineAgentEndpoint, type AgentEvent } from 'theokit/server'

/**
 * Wire-format reference: emits one event of each AgentEvent variant in order.
 *
 * Wire format produced by `defineAgentEndpoint`:
 *
 *   data: {"type":"message","content":"..."}\n\n
 *   data: {"type":"tool_call","name":"...","args":{...}}\n\n
 *   data: {"type":"tool_result","name":"...","data":{...}}\n\n
 *   data: {"type":"error","message":"..."}\n\n
 *
 * Content-Type: text/event-stream
 * Cache-Control: no-cache, no-transform
 * Connection: keep-alive
 */
export const POST = defineAgentEndpoint({
  async *handler(): AsyncGenerator<AgentEvent> {
    yield { type: 'message', content: 'hello from the mock' }
    yield { type: 'tool_call', name: 'search', args: { q: 'theokit' } }
    yield { type: 'tool_result', name: 'search', data: { hits: 0 } }
    yield { type: 'error', message: 'simulated error (still part of the wire-format demo)' }
  },
})
