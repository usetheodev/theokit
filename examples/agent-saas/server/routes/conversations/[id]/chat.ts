import {
  defineAgentEndpoint,
  requireAuth,
  type AgentEvent,
} from 'theokit/server'
import { and, eq } from 'drizzle-orm'
import { conversations, messages } from '../../../../db/schema.js'
import type { RequestContext } from '../../../context.js'

/**
 * POST /api/conversations/:id/chat
 *
 * Real agent flow:
 *  1. Auth gate fires BEFORE the stream starts (401 if no session).
 *  2. Validate the conversation belongs to the user.
 *  3. Persist the user's message.
 *  4. Stream assistant tokens (mock: word-by-word reply).
 *  5. Persist the assistant's final reply.
 *
 * Replace the `mockReply` generator with an OpenAI/Anthropic streaming call;
 * the rest of the flow (auth, persistence, SSE) stays the same.
 */

const AGENT_PERSONAS: Record<string, string> = {
  researcher:
    'I am a researcher agent. I would survey the literature, cite sources, and answer:',
  writer:
    'I am a writing assistant. I would draft prose and edit for clarity. Reply:',
  coder:
    'I am a coding assistant. I would suggest implementation patterns. Reply:',
}

async function* mockReply(persona: string, message: string): AsyncGenerator<string> {
  const reply = `${persona} "${message}". This is a streamed mock reply — replace this generator with a real LLM call.`
  let acc = ''
  for (const word of reply.split(' ')) {
    acc += (acc ? ' ' : '') + word
    yield acc
    await new Promise((r) => setTimeout(r, 30))
  }
}

export const POST = defineAgentEndpoint<{ message: string }, RequestContext>({
  async *handler({ ctx, request, body }): AsyncGenerator<AgentEvent> {
    requireAuth(ctx.session)

    // Conversation id from the URL path. `defineAgentEndpoint` does not
    // expose params today; we read from `request.url` directly.
    const url = new URL(request.url ?? '/', 'http://internal')
    const segments = url.pathname.split('/').filter(Boolean)
    // /api/conversations/<id>/chat → id at index 2
    const conversationId = segments[2]
    if (!conversationId) {
      yield { type: 'error', message: 'Missing conversation id' }
      return
    }

    const [conv] = await ctx.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, ctx.session.userId),
        ),
      )
      .limit(1)
    if (!conv) {
      yield { type: 'error', message: 'Conversation not found' }
      return
    }

    // Body is parsed by the framework BEFORE the handler runs (executeRoute
    // calls parseRequestBody). Reading `request.body` here would already
    // be empty — use the typed `body` arg instead.
    const payload = (body ?? {}) as { message?: string }
    const userText = (payload.message ?? '').trim()
    if (!userText) {
      yield { type: 'error', message: 'Empty message' }
      return
    }

    // 1. persist user message
    await ctx.db.insert(messages).values({
      conversationId: conv.id,
      role: 'user',
      content: userText,
    })

    yield { type: 'tool_call', name: 'persist_user_message', args: { conversationId: conv.id } }

    // 2. stream assistant reply
    const persona = AGENT_PERSONAS[conv.agentKind] ?? 'I am an agent. Reply:'
    let finalReply = ''
    for await (const partial of mockReply(persona, userText)) {
      finalReply = partial
      yield { type: 'message', content: partial }
    }

    // 3. persist assistant final reply
    await ctx.db.insert(messages).values({
      conversationId: conv.id,
      role: 'assistant',
      content: finalReply,
    })
    yield { type: 'tool_result', name: 'persist_assistant_message', data: { conversationId: conv.id } }
  },
})
