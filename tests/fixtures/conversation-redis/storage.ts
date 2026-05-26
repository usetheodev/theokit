/**
 * Phase 9 (T9.2) — `RedisConversationStorage` recipe.
 *
 * Implements the SDK's `ConversationStorageAdapter` contract against Redis.
 * Suitable for serverless deploys with low-latency requirements (CF Workers
 * + Upstash Redis, AWS Lambda + ElastiCache).
 *
 * Storage scheme:
 *   Key:   `agent:conversation:<id>` (Redis List type)
 *   append = RPUSH + EXPIRE 30 days
 *   read   = LRANGE 0 -1 + JSON.parse each entry
 *   delete = DEL
 *
 * EC-2 (MUST FIX): conversationId is validated against the same regex the
 * framework uses for cookies (`^[a-zA-Z0-9_-]{1,128}$`). Rejects `:` (key
 * namespace separator), `*` (Redis glob), whitespace.
 *
 * EC-12 (SHOULD TEST): ioredis-mock TTL semantics may differ from real
 * Redis (fake timer interaction). Production code uses real EXPIRE.
 */

const VALID_ID = /^[a-zA-Z0-9_-]{1,128}$/

interface RedisLike {
  rpush(key: string, ...values: string[]): Promise<number>
  lrange(key: string, start: number, stop: number): Promise<string[]>
  del(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<number>
  keys?(pattern: string): Promise<string[]>
}

export class RedisConversationStorage {
  static readonly TTL_SECONDS = 30 * 24 * 60 * 60 // 30 days
  static readonly KEY_PREFIX = 'agent:conversation:'

  constructor(private readonly redis: RedisLike) {}

  private assertValidId(id: string): void {
    if (!VALID_ID.test(id)) {
      throw new Error(`invalid conversationId: ${JSON.stringify(id)}`)
    }
  }

  private key(id: string): string {
    return `${RedisConversationStorage.KEY_PREFIX}${id}`
  }

  async getMessages(conversationId: string): Promise<readonly unknown[]> {
    this.assertValidId(conversationId)
    const raws = await this.redis.lrange(this.key(conversationId), 0, -1)
    return raws.map((s) => {
      try {
        return JSON.parse(s) as unknown
      } catch {
        return null
      }
    })
  }

  async appendMessage(conversationId: string, message: unknown): Promise<void> {
    this.assertValidId(conversationId)
    const k = this.key(conversationId)
    await this.redis.rpush(k, JSON.stringify(message))
    await this.redis.expire(k, RedisConversationStorage.TTL_SECONDS)
  }

  async deleteConversation(conversationId: string): Promise<void> {
    this.assertValidId(conversationId)
    await this.redis.del(this.key(conversationId))
  }

  async listConversationIds(opts?: { limit?: number }): Promise<readonly string[]> {
    if (this.redis.keys === undefined) return []
    const pattern = `${RedisConversationStorage.KEY_PREFIX}*`
    const keys = await this.redis.keys(pattern)
    const limit = opts?.limit ?? 1000
    return keys.slice(0, limit).map((k) => k.slice(RedisConversationStorage.KEY_PREFIX.length))
  }
}
