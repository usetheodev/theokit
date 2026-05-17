import { defineRoute } from 'theokit/server'
import { z } from 'zod'
import type { AgentEvent } from 'theokit/server'

/**
 * MOCK AGENT ENDPOINT — REPLACE WITH YOUR REAL LLM PROVIDER.
 *
 * What this is:
 *   A demo that emits 3 hardcoded events so the default scaffold has
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
 *   const stream = await openai.chat.completions.create({ stream: true, ... })
 *   for await (const chunk of stream) {
 *     // yield { type: 'message', content: chunk.choices[0].delta.content }
 *   }
 *
 * The shape on the wire is server-sent events (text/event-stream):
 *   data: {"type":"message","content":"..."}\n\n
 *   data: {"type":"tool_call","name":"...","args":{...}}\n\n
 *   ...
 */
export const POST = defineRoute({
  body: z.object({ message: z.string().min(1) }),
  handler: ({ body }) => {
    const events: AgentEvent[] = [
      { type: 'message', content: `Recebi: "${body.message}"` },
      { type: 'tool_call', name: 'search', args: { q: body.message } },
      { type: 'message', content: 'Pronto. (Este é um mock — conecte seu LLM aqui.)' },
    ]

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        }
        controller.close()
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  },
})
