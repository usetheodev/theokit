/**
 * T9.2 — RedisConversationStorage recipe + contract tests.
 *
 * Uses a hand-rolled in-memory Redis mock (tests/fixtures/conversation-redis/
 * in-memory-redis.ts) rather than `ioredis-mock` for two reasons:
 *   (a) zero new dependencies
 *   (b) deterministic TTL via setTime/advanceTime (EC-12)
 *
 * Production code targets real Redis via `ioredis` — the contract validated
 * here is what the production storage MUST satisfy. The mock implements
 * only RPUSH/LRANGE/DEL/EXPIRE/KEYS.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { RedisConversationStorage } from '../fixtures/conversation-redis/storage.js'
import { InMemoryRedis } from '../fixtures/conversation-redis/in-memory-redis.js'

describe('RedisConversationStorage (T9.2)', () => {
  let redis: InMemoryRedis
  let storage: RedisConversationStorage

  beforeEach(() => {
    redis = new InMemoryRedis()
    redis.setTime(Date.UTC(2026, 0, 1))
    storage = new RedisConversationStorage(redis)
  })

  it('test_redis_empty_returns_empty', async () => {
    const msgs = await storage.getMessages('unknown')
    expect(msgs).toEqual([])
  })

  it('test_redis_append_then_get', async () => {
    await storage.appendMessage('c1', { role: 'user', content: 'hi' })
    const msgs = await storage.getMessages('c1')
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toEqual({ role: 'user', content: 'hi' })
  })

  it('test_redis_append_preserves_order', async () => {
    await storage.appendMessage('c2', { content: 'a' })
    await storage.appendMessage('c2', { content: 'b' })
    await storage.appendMessage('c2', { content: 'c' })
    const msgs = (await storage.getMessages('c2')) as { content: string }[]
    expect(msgs.map((m) => m.content)).toEqual(['a', 'b', 'c'])
  })

  it('test_redis_concurrent_appends', async () => {
    await Promise.all(Array.from({ length: 20 }, (_, i) => storage.appendMessage('race', { i })))
    const msgs = await storage.getMessages('race')
    expect(msgs).toHaveLength(20)
  })

  it('test_redis_delete_clears', async () => {
    await storage.appendMessage('c3', { content: 'x' })
    await storage.deleteConversation('c3')
    expect(await storage.getMessages('c3')).toEqual([])
  })

  it('test_redis_delete_missing_idempotent', async () => {
    await expect(storage.deleteConversation('never-existed')).resolves.toBeUndefined()
    await expect(storage.deleteConversation('never-existed')).resolves.toBeUndefined()
  })

  // EC-2 (MUST FIX) — conversationId validation
  it('test_redis_storage_rejects_id_with_colon (EC-2)', async () => {
    await expect(storage.appendMessage('a:b', { content: 'x' })).rejects.toMatchObject({
      message: expect.stringContaining('invalid conversationId'),
    })
  })

  it('test_redis_storage_rejects_id_with_wildcard (EC-2)', async () => {
    await expect(storage.appendMessage('a*', { content: 'x' })).rejects.toMatchObject({
      message: expect.stringContaining('invalid conversationId'),
    })
  })

  it('test_redis_storage_rejects_id_with_whitespace (EC-2)', async () => {
    await expect(storage.appendMessage('a b', { content: 'x' })).rejects.toMatchObject({
      message: expect.stringContaining('invalid conversationId'),
    })
  })

  it('test_redis_storage_rejects_empty_id (EC-2)', async () => {
    await expect(storage.appendMessage('', { content: 'x' })).rejects.toMatchObject({
      message: expect.stringContaining('invalid conversationId'),
    })
  })

  it('test_redis_storage_rejects_overlong_id (EC-2 — > 128 chars)', async () => {
    const id = 'a'.repeat(129)
    await expect(storage.appendMessage(id, { content: 'x' })).rejects.toMatchObject({
      message: expect.stringContaining('invalid conversationId'),
    })
  })

  // EC-12 — TTL semantics via deterministic clock
  it('test_redis_ttl_expires (EC-12) — key disappears after 30 days', async () => {
    await storage.appendMessage('c4', { content: 'temp' })
    expect(await storage.getMessages('c4')).toHaveLength(1)
    // Advance past TTL (30 days + 1ms)
    redis.advanceTime(30 * 24 * 60 * 60 * 1000 + 1)
    expect(await storage.getMessages('c4')).toEqual([])
  })

  it('test_redis_list_conversation_ids', async () => {
    await storage.appendMessage('alpha', { content: 'a' })
    await storage.appendMessage('beta', { content: 'b' })
    const ids = await storage.listConversationIds()
    expect(new Set(ids)).toEqual(new Set(['alpha', 'beta']))
  })

  it('test_redis_mock_supports_fake_timer_ttl (EC-12 preflight)', async () => {
    await redis.rpush('preflight', 'v1')
    await redis.expire('preflight', 1) // 1s TTL
    redis.advanceTime(2000)
    const result = await redis.lrange('preflight', 0, -1)
    expect(result).toEqual([])
  })
})
