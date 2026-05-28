import { describe, expectTypeOf, it } from 'vitest'

import type {
  ConversationHistoryArgs,
  ConversationHistoryResult,
  createConversationHistory,
} from '../../packages/theo/src/server/agent/create-conversation-history.js'

/**
 * T1.1 — createConversationHistory type tests.
 *
 * Pins the public surface: arg shape, return shape, options forwarding.
 */

describe('createConversationHistory (types)', () => {
  it('returns ConversationHistoryResult with agent + conversationId + isNew', () => {
    type Ret = Awaited<ReturnType<typeof createConversationHistory>>
    expectTypeOf<Ret>().toEqualTypeOf<ConversationHistoryResult>()
    expectTypeOf<Ret['conversationId']>().toEqualTypeOf<string>()
    expectTypeOf<Ret['isNew']>().toEqualTypeOf<boolean>()
  })

  it('accepts minimal options with apiKey and model', () => {
    // Type-only assertion — does not execute
    const args: ConversationHistoryArgs = {
      request: new Request('http://localhost'),
      options: { apiKey: 'k', model: { id: 'm' } },
    }
    expectTypeOf(args).toExtend<ConversationHistoryArgs>()
  })

  it('accepts full options including tools and memory passthrough', () => {
    const args: ConversationHistoryArgs = {
      request: new Request('http://localhost'),
      response: { headers: new Headers() },
      agentId: 'optional-explicit-id',
      session: { conversationId: 'session-id' },
      options: {
        apiKey: 'k',
        model: { id: 'm' },
        tools: [
          {
            name: 'noop',
            description: 'd',
            inputSchema: { type: 'object' },
            handler: async () => 'ok',
          },
        ],
        memory: { enabled: true },
      },
      cookieName: 'custom',
      cookieMaxAge: 3600,
    }
    expectTypeOf(args).toExtend<ConversationHistoryArgs>()
  })
})
