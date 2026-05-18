import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { hashPassword, verifyPassword } from '../../examples/agent-saas/server/password.js'

/**
 * Functional tests that exercise REAL code from the agent-saas example
 * (not just grep). These don't need a postgres connection — they cover the
 * code paths that are pure (password helper, agent event generation,
 * channel broadcast bookkeeping).
 */

describe('agent-saas/password (functional — real PBKDF2 round-trip)', () => {
  it('hashed password verifies', async () => {
    const hash = await hashPassword('correct-horse-battery-staple')
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true)
  })

  it('wrong password fails to verify', async () => {
    const hash = await hashPassword('correct-horse-battery-staple')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('two hashes of the same password differ (salted)', async () => {
    const a = await hashPassword('same-password')
    const b = await hashPassword('same-password')
    expect(a).not.toBe(b)
    // But both verify against the original
    expect(await verifyPassword('same-password', a)).toBe(true)
    expect(await verifyPassword('same-password', b)).toBe(true)
  })

  it('malformed stored hash returns false (no throw)', async () => {
    expect(await verifyPassword('whatever', 'not-a-valid-hash')).toBe(false)
    expect(await verifyPassword('whatever', '')).toBe(false)
    expect(await verifyPassword('whatever', 'pbkdf2$0$$')).toBe(false)
  })

  it('hash format is parseable: pbkdf2$iter$salt$key', async () => {
    const hash = await hashPassword('x')
    const parts = hash.split('$')
    expect(parts[0]).toBe('pbkdf2')
    expect(parseInt(parts[1]!, 10)).toBeGreaterThan(0)
    expect(parts[2]).toMatch(/^[0-9a-f]+$/) // salt hex
    expect(parts[3]).toMatch(/^[0-9a-f]+$/) // key hex
  })
})

describe('agent-saas/channels/notifications (functional — broadcast bookkeeping)', () => {
  let mod: typeof import('../../examples/agent-saas/server/channels/notifications.js')
  beforeEach(async () => {
    // Fresh import per test so the in-memory room map starts empty.
    vi.resetModules()
    mod = await import('../../examples/agent-saas/server/channels/notifications.js')
  })
  afterEach(() => {
    vi.resetModules()
  })

  it('broadcast to an empty room is a no-op (no throw)', () => {
    expect(() => mod.broadcast('no-such-room', { kind: 'x', payload: {} })).not.toThrow()
  })

  it('onSubscribe → broadcast hits every connected ws', () => {
    const handler = mod.default
    const received: string[] = []
    const ws = { send: (data: string) => received.push(data) }
    handler.onSubscribe!(ws as never, 'roomA', undefined as never)
    mod.broadcast('roomA', { kind: 'agent.done', payload: { id: '1' } })
    // First message is the subscribed ack, second is the broadcast
    expect(received).toHaveLength(2)
    const broadcast = JSON.parse(received[1]!) as { kind: string }
    expect(broadcast.kind).toBe('agent.done')
  })

  it('onUnsubscribe removes the ws from the room', () => {
    const handler = mod.default
    const sentA: string[] = []
    const sentB: string[] = []
    const a = { send: (d: string) => sentA.push(d) }
    const b = { send: (d: string) => sentB.push(d) }
    handler.onSubscribe!(a as never, 'mix', undefined as never)
    handler.onSubscribe!(b as never, 'mix', undefined as never)
    handler.onUnsubscribe!(a as never, 'mix')
    mod.broadcast('mix', { kind: 'after-unsub', payload: null })
    // a should NOT receive the broadcast; b should
    const aBroadcasts = sentA.filter((m) => m.includes('after-unsub'))
    const bBroadcasts = sentB.filter((m) => m.includes('after-unsub'))
    expect(aBroadcasts).toHaveLength(0)
    expect(bBroadcasts).toHaveLength(1)
  })

  it('onMessage with kind: ping replies with pong', () => {
    const handler = mod.default
    const received: string[] = []
    const ws = { send: (d: string) => received.push(d) }
    handler.onMessage!(ws as never, 'room', { kind: 'ping' })
    const pong = received.find((m) => m.includes('pong'))
    expect(pong).toBeDefined()
  })
})

describe('agent-saas/server/actions/rename-conversation (functional — Zod validation)', () => {
  it('input schema rejects bad uuid', async () => {
    const mod = await import(
      '../../examples/agent-saas/server/actions/rename-conversation.js'
    )
    const action = mod.default
    const parsed = action.input.safeParse({ id: 'not-a-uuid', title: 'X' })
    expect(parsed.success).toBe(false)
  })

  it('input schema accepts valid uuid + non-empty title', async () => {
    const mod = await import(
      '../../examples/agent-saas/server/actions/rename-conversation.js'
    )
    const action = mod.default
    const parsed = action.input.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Renamed',
    })
    expect(parsed.success).toBe(true)
  })

  it('input schema rejects empty title', async () => {
    const mod = await import(
      '../../examples/agent-saas/server/actions/rename-conversation.js'
    )
    const action = mod.default
    const parsed = action.input.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: '',
    })
    expect(parsed.success).toBe(false)
  })
})

describe('agent-saas/routes/signup (functional — Zod body validation)', () => {
  it('rejects invalid email', async () => {
    process.env.SECRET = 'demo-test-32-plus-chars-for-functional-tests-ok'
    const mod = await import('../../examples/agent-saas/server/routes/signup.js')
    const cfg = mod.POST as unknown as { body: { safeParse: (v: unknown) => { success: boolean } } }
    const parsed = cfg.body.safeParse({ email: 'not-email', name: 'X', password: 'longenough123' })
    expect(parsed.success).toBe(false)
  })

  it('rejects short password (< 8 chars)', async () => {
    const mod = await import('../../examples/agent-saas/server/routes/signup.js')
    const cfg = mod.POST as unknown as { body: { safeParse: (v: unknown) => { success: boolean } } }
    const parsed = cfg.body.safeParse({
      email: 'a@b.co',
      name: 'X',
      password: 'short',
    })
    expect(parsed.success).toBe(false)
  })

  it('accepts well-formed input', async () => {
    const mod = await import('../../examples/agent-saas/server/routes/signup.js')
    const cfg = mod.POST as unknown as { body: { safeParse: (v: unknown) => { success: boolean } } }
    const parsed = cfg.body.safeParse({
      email: 'a@b.co',
      name: 'Alice',
      password: 'longenoughpassword',
    })
    expect(parsed.success).toBe(true)
  })
})

describe('agent-saas/routes/conversations (functional — Zod body validation)', () => {
  it('POST body schema enforces agentKind enum', async () => {
    process.env.SECRET = 'demo-test-32-plus-chars-for-functional-tests-ok'
    const mod = await import(
      '../../examples/agent-saas/server/routes/conversations/index.js'
    )
    const cfg = mod.POST as unknown as { body: { safeParse: (v: unknown) => { success: boolean } } }
    const ok = cfg.body.safeParse({ title: 'X', agentKind: 'researcher' })
    expect(ok.success).toBe(true)
    const bad = cfg.body.safeParse({ title: 'X', agentKind: 'wizard' })
    expect(bad.success).toBe(false)
  })

  it('POST body schema rejects empty title', async () => {
    const mod = await import(
      '../../examples/agent-saas/server/routes/conversations/index.js'
    )
    const cfg = mod.POST as unknown as { body: { safeParse: (v: unknown) => { success: boolean } } }
    const parsed = cfg.body.safeParse({ title: '', agentKind: 'coder' })
    expect(parsed.success).toBe(false)
  })

  it('POST body schema rejects title > 120 chars', async () => {
    const mod = await import(
      '../../examples/agent-saas/server/routes/conversations/index.js'
    )
    const cfg = mod.POST as unknown as { body: { safeParse: (v: unknown) => { success: boolean } } }
    const parsed = cfg.body.safeParse({ title: 'x'.repeat(121), agentKind: 'writer' })
    expect(parsed.success).toBe(false)
  })
})
