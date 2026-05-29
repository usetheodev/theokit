import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createConversationHistory,
  __resetSdkForTests,
  __setSdkForTests,
  type ConversationHistoryArgs,
  type SdkAgent,
  type SdkAgentOptions,
} from '../../packages/theo/src/server/agent/create-conversation-history.js'

/**
 * T1.1 — createConversationHistory unit tests.
 *
 * Strict RED-first. Mocks the SDK's Agent.getOrCreate via the
 * __setSdkForTests/__resetSdkForTests test seam (intentional internal
 * export prefixed with `__` per the SDK-loading pattern used elsewhere in
 * TheoKit's server primitives).
 *
 * Coverage:
 *   - 4-step resolution chain (explicit → session → cookie → uuid).
 *   - EC-1: agentId validation rejects path-traversal / CRLF / over-length values.
 *   - EC-2: actionable error when SDK unavailable.
 *   - EC-3: concurrent first-request race yields independent UUIDs.
 *   - EC-4: cookieMaxAge: 0 coerced to default 30d.
 *   - EC-5: duplicate cookie name returns first match.
 */

function mockSdkAgent(id = 'agent-1') {
  return { id, send: vi.fn(), dispose: vi.fn() }
}

type GetOrCreateFn = (
  agentId: string,
  options: unknown,
) => Promise<{
  id?: string
  send?: unknown
  dispose?: unknown
}>

type SdkGetOrCreate = (agentId: string, options: SdkAgentOptions) => Promise<SdkAgent>

function withMockGetOrCreate(impl: GetOrCreateFn) {
  // Cast through unknown — vitest's `vi.fn` produces a wider type than the
  // SDK signature, but the mock is structurally compatible at runtime.
  __setSdkForTests({
    Agent: {
      getOrCreate: vi.fn(impl) as unknown as SdkGetOrCreate,
    },
  })
}

function makeRequest(cookieHeader?: string): Request {
  const headers = new Headers()
  if (cookieHeader !== undefined) headers.set('cookie', cookieHeader)
  return new Request('http://localhost/api/chat', { method: 'POST', headers })
}

function makeArgs(overrides: Partial<ConversationHistoryArgs> = {}): ConversationHistoryArgs {
  return {
    request: makeRequest(),
    response: { headers: new Headers() },
    options: { apiKey: 'fake', model: { id: 'mock' } },
    ...overrides,
  }
}

describe('createConversationHistory', () => {
  afterEach(() => {
    __resetSdkForTests()
    vi.restoreAllMocks()
  })

  // Happy path
  it('returns existing agent when cookie is present and valid', async () => {
    const captured = { id: '' }
    withMockGetOrCreate(async (id) => {
      captured.id = id
      return mockSdkAgent(id)
    })
    const args = makeArgs({ request: makeRequest('theo_conversation=existing-uuid-123') })
    const result = await createConversationHistory(args)
    expect(result.conversationId).toBe('existing-uuid-123')
    expect(result.isNew).toBe(false)
    expect(captured.id).toBe('existing-uuid-123')
  })

  it('generates new UUID + issues Set-Cookie when no cookie / session / explicit id', async () => {
    withMockGetOrCreate(async (id) => mockSdkAgent(id))
    const args = makeArgs()
    const result = await createConversationHistory(args)
    expect(result.conversationId).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.isNew).toBe(true)
    const setCookie = args.response!.headers.get('set-cookie')!
    expect(setCookie).toMatch(/^theo_conversation=[0-9a-f-]{36}/)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
    expect(setCookie).toMatch(/Max-Age=2592000/)
    expect(setCookie).toMatch(/Path=\//)
  })

  // Resolution priority
  it('explicit agentId wins over session and cookie', async () => {
    withMockGetOrCreate(async (id) => mockSdkAgent(id))
    const result = await createConversationHistory(
      makeArgs({
        agentId: 'explicit-id',
        session: { conversationId: 'session-id' },
        request: makeRequest('theo_conversation=cookie-id'),
      }),
    )
    expect(result.conversationId).toBe('explicit-id')
    expect(result.isNew).toBe(false)
  })

  it('session conversationId wins over cookie when no explicit id', async () => {
    withMockGetOrCreate(async (id) => mockSdkAgent(id))
    const result = await createConversationHistory(
      makeArgs({
        session: { conversationId: 'session-id' },
        request: makeRequest('theo_conversation=cookie-id'),
      }),
    )
    expect(result.conversationId).toBe('session-id')
  })

  // Edge cases
  it('no response means no cookie issued but id is still generated', async () => {
    withMockGetOrCreate(async (id) => mockSdkAgent(id))
    const args: ConversationHistoryArgs = {
      request: makeRequest(),
      options: { apiKey: 'fake', model: { id: 'mock' } },
    }
    const result = await createConversationHistory(args)
    expect(result.conversationId).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.isNew).toBe(true)
  })

  it('empty-string agentId falls through to session', async () => {
    withMockGetOrCreate(async (id) => mockSdkAgent(id))
    const result = await createConversationHistory(
      makeArgs({
        agentId: '',
        session: { conversationId: 'session-id' },
      }),
    )
    expect(result.conversationId).toBe('session-id')
  })

  it('null session falls through to cookie', async () => {
    withMockGetOrCreate(async (id) => mockSdkAgent(id))
    const result = await createConversationHistory(
      makeArgs({
        session: null,
        request: makeRequest('theo_conversation=cookie-id'),
      }),
    )
    expect(result.conversationId).toBe('cookie-id')
  })

  // Error scenario — Agent.getOrCreate fails
  it('propagates Agent.getOrCreate errors', async () => {
    withMockGetOrCreate(async () => {
      throw new Error('registry corrupted')
    })
    await expect(createConversationHistory(makeArgs())).rejects.toThrow('registry corrupted')
  })

  // Finding A regression gate (sdk-residual-behavior-2026-05-28) —
  // when no apiKey passed AND no provider env var, throw actionable error
  // BEFORE Agent.getOrCreate. Prevents SDK silent-fallback (canned content).
  it('Finding A: throws actionable error when no apiKey + no provider env', async () => {
    const origKeys: Record<string, string | undefined> = {
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    }
    try {
      delete process.env.OPENROUTER_API_KEY
      delete process.env.OPENAI_API_KEY
      delete process.env.ANTHROPIC_API_KEY
      withMockGetOrCreate(async (id) => mockSdkAgent(id))
      // Args WITHOUT apiKey
      const argsNoKey = makeArgs({
        options: { model: { id: 'mock' } }, // explicit absence of apiKey
      })
      await expect(createConversationHistory(argsNoKey)).rejects.toThrow(
        /No LLM provider API key|OPENROUTER_API_KEY/,
      )
    } finally {
      for (const [k, v] of Object.entries(origKeys)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  })

  // Escape hatch — explicit apiKey bypasses resolver throw
  it('Finding A: explicit apiKey bypasses auto-resolution + throw', async () => {
    const orig = process.env.OPENROUTER_API_KEY
    try {
      delete process.env.OPENROUTER_API_KEY
      delete process.env.OPENAI_API_KEY
      delete process.env.ANTHROPIC_API_KEY
      withMockGetOrCreate(async (id) => mockSdkAgent(id))
      // Args WITH explicit apiKey — should NOT throw despite no env
      const argsWithKey = makeArgs({
        options: { apiKey: 'sk-explicit-test', model: { id: 'mock' } },
      })
      const result = await createConversationHistory(argsWithKey)
      expect(result.agent).toBeDefined()
    } finally {
      if (orig !== undefined) process.env.OPENROUTER_API_KEY = orig
    }
  })

  // EC-1 — path traversal / CRLF / over-length
  it('EC-1 — rejects path-traversal explicit agentId, generates fresh UUID', async () => {
    withMockGetOrCreate(async (id) => mockSdkAgent(id))
    const result = await createConversationHistory(makeArgs({ agentId: '../../../etc/passwd' }))
    expect(result.conversationId).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.isNew).toBe(true)
  })

  it('EC-1 — rejects CRLF-injection explicit agentId, generates fresh UUID', async () => {
    withMockGetOrCreate(async (id) => mockSdkAgent(id))
    const result = await createConversationHistory(
      makeArgs({ agentId: 'abc\r\nSet-Cookie: evil=1' }),
    )
    expect(result.conversationId).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.isNew).toBe(true)
  })

  it('EC-1 — rejects cookie value longer than 128 chars, generates fresh UUID', async () => {
    withMockGetOrCreate(async (id) => mockSdkAgent(id))
    const longValue = 'a'.repeat(200)
    const result = await createConversationHistory(
      makeArgs({ request: makeRequest(`theo_conversation=${longValue}`) }),
    )
    expect(result.conversationId).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.isNew).toBe(true)
  })

  it('EC-1 — accepts session conversationId with valid chars', async () => {
    withMockGetOrCreate(async (id) => mockSdkAgent(id))
    const result = await createConversationHistory(
      makeArgs({ session: { conversationId: 'user_42-prod' } }),
    )
    expect(result.conversationId).toBe('user_42-prod')
  })

  // EC-2 — SDK not installed
  it('EC-2 — actionable error when @usetheo/sdk import fails', async () => {
    // Force the loader to simulate a missing SDK by setting null + clearing cache
    __setSdkForTests(null)
    await expect(createConversationHistory(makeArgs())).rejects.toThrow(
      /requires @usetheo\/sdk.*pnpm add @usetheo\/sdk/,
    )
  })

  // EC-3 — concurrent first requests
  it('EC-3 — concurrent first requests each get their own UUID + independent Set-Cookie', async () => {
    withMockGetOrCreate(async (id) => mockSdkAgent(id))
    const args1 = makeArgs()
    const args2 = makeArgs()
    const [r1, r2] = await Promise.all([
      createConversationHistory(args1),
      createConversationHistory(args2),
    ])
    expect(r1.isNew).toBe(true)
    expect(r2.isNew).toBe(true)
    expect(r1.conversationId).not.toBe(r2.conversationId)
    expect(args1.response!.headers.get('set-cookie')).toMatch(/^theo_conversation=/)
    expect(args2.response!.headers.get('set-cookie')).toMatch(/^theo_conversation=/)
  })

  // EC-4 — cookieMaxAge boundary
  it('EC-4 — cookieMaxAge: 0 is coerced to default 30d', async () => {
    withMockGetOrCreate(async (id) => mockSdkAgent(id))
    const args = makeArgs({ cookieMaxAge: 0 })
    await createConversationHistory(args)
    const setCookie = args.response!.headers.get('set-cookie')!
    expect(setCookie).toMatch(/Max-Age=2592000/)
    expect(setCookie).not.toMatch(/Max-Age=0/)
  })

  it('EC-4 — cookieMaxAge: -1 coerced to default', async () => {
    withMockGetOrCreate(async (id) => mockSdkAgent(id))
    const args = makeArgs({ cookieMaxAge: -1 })
    await createConversationHistory(args)
    const setCookie = args.response!.headers.get('set-cookie')!
    expect(setCookie).toMatch(/Max-Age=2592000/)
  })

  it('EC-4 — cookieMaxAge: positive integer respected', async () => {
    withMockGetOrCreate(async (id) => mockSdkAgent(id))
    const args = makeArgs({ cookieMaxAge: 60 })
    await createConversationHistory(args)
    const setCookie = args.response!.headers.get('set-cookie')!
    expect(setCookie).toMatch(/Max-Age=60(?!\d)/)
  })

  // EC-5 — duplicate cookie name
  it('EC-5 — duplicate cookie name returns first match', async () => {
    withMockGetOrCreate(async (id) => mockSdkAgent(id))
    const result = await createConversationHistory(
      makeArgs({ request: makeRequest('theo_conversation=abc; theo_conversation=def') }),
    )
    expect(result.conversationId).toBe('abc')
  })

  // Custom cookie name override
  it('respects custom cookieName override', async () => {
    withMockGetOrCreate(async (id) => mockSdkAgent(id))
    const args = makeArgs({ cookieName: 'my_conv' })
    await createConversationHistory(args)
    const setCookie = args.response!.headers.get('set-cookie')!
    expect(setCookie).toMatch(/^my_conv=/)
  })
})
