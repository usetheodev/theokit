/**
 * Phase 9 (T9.1) — `PostgresConversationStorage` recipe.
 *
 * Implements the SDK's `ConversationStorageAdapter` contract against a
 * PostgreSQL database. Suitable for serverless / multi-host deploys where
 * the filesystem-based default doesn't work.
 *
 * Schema:
 *   CREATE TABLE agent_conversations (
 *     id TEXT PRIMARY KEY,
 *     messages JSONB NOT NULL DEFAULT '[]',
 *     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 *   )
 *
 * Atomicity: every operation is a single SQL statement — no read-modify-
 * write race. `appendMessage` uses INSERT ON CONFLICT + JSONB concat.
 *
 * EC-11 (SHOULD TEST): pg-mem may not support `messages || $msg` JSONB
 * concat. Production Postgres always does. Tests run a preflight check.
 */

interface QueryResultLike {
  rows: unknown[]
}

interface PoolLike {
  query(sql: string, params?: readonly unknown[]): Promise<QueryResultLike>
}

export class PostgresConversationStorage {
  constructor(private readonly pool: PoolLike) {}

  async migrate(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS agent_conversations (
        id TEXT PRIMARY KEY,
        messages JSONB NOT NULL DEFAULT '[]',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
  }

  async getMessages(conversationId: string): Promise<readonly unknown[]> {
    const result = await this.pool.query('SELECT messages FROM agent_conversations WHERE id = $1', [
      conversationId,
    ])
    if (result.rows.length === 0) return []
    const row = result.rows[0] as { messages: unknown }
    const raw = row.messages
    // pg returns JSONB as parsed object; pg-mem may return string. Normalize.
    if (typeof raw === 'string') {
      try {
        const parsed: unknown = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }
    return Array.isArray(raw) ? raw : []
  }

  async appendMessage(conversationId: string, message: unknown): Promise<void> {
    // Atomic upsert + JSONB concat.
    // EC-11: if pg-mem rejects the `||` operator, fall back path is provided
    // by `appendMessageRMW` below (test exercise only).
    await this.pool.query(
      `
      INSERT INTO agent_conversations (id, messages, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE
        SET messages = agent_conversations.messages || $2::jsonb,
            updated_at = NOW()
      `,
      [conversationId, JSON.stringify([message])],
    )
  }

  /**
   * @internal — RMW fallback path when JSONB `||` is not supported.
   * Real Postgres should never use this — it lacks atomicity. Exposed for
   * tests against limited mocks.
   */
  async appendMessageRMW(conversationId: string, message: unknown): Promise<void> {
    const existing = await this.getMessages(conversationId)
    const next = [...existing, message]
    const json = JSON.stringify(next)
    // Use UPDATE-then-INSERT-if-not-exists since pg-mem's ON CONFLICT may
    // misbehave when re-binding the JSONB parameter.
    const update = await this.pool.query(
      'UPDATE agent_conversations SET messages = $2::jsonb, updated_at = NOW() WHERE id = $1 RETURNING id',
      [conversationId, json],
    )
    if (update.rows.length === 0) {
      await this.pool.query(
        'INSERT INTO agent_conversations (id, messages) VALUES ($1, $2::jsonb)',
        [conversationId, json],
      )
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.pool.query('DELETE FROM agent_conversations WHERE id = $1', [conversationId])
  }

  async listConversationIds(opts?: { limit?: number }): Promise<readonly string[]> {
    const limit = opts?.limit ?? 1000
    const result = await this.pool.query(
      'SELECT id FROM agent_conversations ORDER BY updated_at DESC LIMIT $1',
      [limit],
    )
    return (result.rows as { id: string }[]).map((r) => r.id)
  }
}
