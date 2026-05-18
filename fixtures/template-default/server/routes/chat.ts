import { defineAgentEndpoint, type AgentEvent } from 'theokit/server'

/**
 * MOCK AGENT ENDPOINT — REPLACE WITH YOUR REAL LLM PROVIDER.
 *
 * What this is:
 *   A demo that yields 3 hardcoded events so the default scaffold has
 *   something to render from the first `theokit dev`.
 *
 * What to do here:
 *   Substitua este mock pelo seu LLM provider (OpenAI/Anthropic/local).
 *   O shape de AgentEvent é o contrato — qualquer provider que produza
 *   events compatíveis (`message`, `tool_call`, `tool_result`, `error`)
 *   funciona. Para token streaming, prefira UM evento `message` com
 *   content acumulado em vez de um evento por token (evita SSE backpressure).
 *
 * Example real handler:
 *   import { OpenAI } from 'openai'
 *   export const POST = defineAgentEndpoint({
 *     async *handler({ body }) {
 *       const { message } = body as { message: string }
 *       const stream = await openai.chat.completions.create({ stream: true, ... })
 *       let acc = ''
 *       for await (const chunk of stream) {
 *         acc += chunk.choices[0].delta.content ?? ''
 *         yield { type: 'message', content: acc }
 *       }
 *     },
 *   })
 *
 * The `body` is already parsed by the framework (JSON / multipart). Use
 * `body` instead of `request.json()` — `request` is the underlying Node
 * `IncomingMessage` and does not expose a Web-Fetch `.json()` method.
 *
 * The wire format is Server-Sent Events (text/event-stream), produced
 * automatically by `defineAgentEndpoint`:
 *   data: {"type":"message","content":"..."}\n\n
 *   data: {"type":"tool_call","name":"...","args":{...}}\n\n
 */
export const POST = defineAgentEndpoint({
  async *handler({ body }): AsyncGenerator<AgentEvent> {
    const { message = '' } = (body ?? {}) as { message?: string }
    yield { type: 'message', content: `Recebi: "${message}"` }
    yield { type: 'tool_call', name: 'search', args: { q: message } }
    yield { type: 'message', content: 'Pronto. (Este é um mock — conecte seu LLM aqui.)' }
  },
})
