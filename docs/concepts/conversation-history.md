# Conversation history

> **Phase 10** — concept doc for the SDK v1.1.0 `ConversationStorageAdapter`
> integration, the per-deploy-target adapter choice, and migration paths.

## What is conversation history?

Every `Agent.getOrCreate(id)` (or `createConversationHistory`) call resolves
to an `Agent` instance whose message log is **persistent** — turns survive
process restarts, hop between requests, and outlive the HTTP cycle.

The SDK owns the persistence contract via `ConversationStorageAdapter`:

```ts
interface ConversationStorageAdapter {
  getMessages(conversationId: string): Promise<readonly SDKMessage[]>
  appendMessage(conversationId: string, message: SDKMessage): Promise<void>
  deleteConversation(conversationId: string): Promise<void>
  listConversationIds?(opts?: { limit?: number }): Promise<readonly string[] | undefined>
  dispose?(): Promise<void>
}
```

TheoKit mirrors the structural shape as `ConversationStorageLike` and threads
it through `createConversationHistory({ options: { conversationStorage } })`.

## The three adapters that matter

| Adapter | Where it lives | Persistence | Multi-host? | Best for |
|---------|----------------|-------------|:----:|----------|
| `FileSystemConversationStorage` | `@usetheo/sdk` (default) | `.theokit/agents/<id>/messages.jsonl` | ❌ | Single-host Node, indie/MicroSaaS |
| `InMemoryConversationStorage` | `@usetheo/sdk` | RAM only — lost on restart | ❌ | Tests, demos, ephemeral chats |
| `PostgresConversationStorage` | Recipe (this repo: `tests/fixtures/conversation-postgres/`) | Postgres `agent_conversations` table | ✅ | Production multi-host, K8s, TheoCloud |
| `RedisConversationStorage` | Recipe (this repo: `tests/fixtures/conversation-redis/`) | Redis List + 30-day TTL | ✅ | Serverless (CF Workers + Upstash, Lambda + ElastiCache) |

The first two ship in `@usetheo/sdk` itself. The latter two are **recipes** —
ready-to-copy classes that consumers paste into their project. They live in
`tests/fixtures/` as proof-of-contract; not as published packages.

## Deploy-target choice matrix

| Deploy target | Recommended adapter | Why |
|---------------|---------------------|-----|
| Single Node host (VPS, Docker single-container) | `FileSystemConversationStorage` (default) | Zero infra; works out of the box |
| Vercel (serverless functions) | `RedisConversationStorage` (Upstash) | `/tmp` is ephemeral; KV-style Redis is the standard pairing |
| Cloudflare Workers | `RedisConversationStorage` (Upstash) | No filesystem at all on Workers |
| AWS Lambda | `RedisConversationStorage` (ElastiCache or Upstash) | Same as Vercel — ephemeral fs |
| K8s deployment (multi-replica) | `PostgresConversationStorage` | Shared SQL is the simplest cross-replica state store |
| **TheoCloud (principal target)** | `PostgresConversationStorage` (managed) | TheoCloud ships hosted Postgres; adapter is the natural pairing |

## Usage

### Default (no setup)

```ts
import { createConversationHistory } from 'theokit/server'

const { agent } = await createConversationHistory({
  request, response: { headers: cookieHeaders },
  options: { apiKey, model: { id: 'openrouter/openai/gpt-4o-mini' }, tools },
})
// SDK falls back to FileSystemConversationStorage automatically.
```

### Production — Postgres

```ts
import { createConversationHistory } from 'theokit/server'
import { Pool } from 'pg'
import { PostgresConversationStorage } from './lib/conversation-storage.js'
// (copy `tests/fixtures/conversation-postgres/storage.ts` to your project)

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const conversationStorage = new PostgresConversationStorage(pool)
// One-time at boot:
await conversationStorage.migrate()

const { agent } = await createConversationHistory({
  request, response: { headers: cookieHeaders },
  options: {
    apiKey, model: { id: 'openrouter/openai/gpt-4o-mini' }, tools,
    conversationStorage,
  },
})
```

### Serverless — Redis (Upstash example)

```ts
import { createConversationHistory } from 'theokit/server'
import IORedis from 'ioredis'
import { RedisConversationStorage } from './lib/conversation-storage.js'
// (copy `tests/fixtures/conversation-redis/storage.ts` to your project)

const redis = new IORedis(process.env.REDIS_URL!)
const conversationStorage = new RedisConversationStorage(redis)

const { agent } = await createConversationHistory({
  request, response: { headers: cookieHeaders },
  options: {
    apiKey, model: { id: 'openrouter/openai/gpt-4o-mini' }, tools,
    conversationStorage,
  },
})
```

## Migration paths

### From filesystem → Postgres

1. Snapshot `.theokit/agents/*/messages.jsonl` (one file per conversation).
2. For each file: parse, INSERT INTO `agent_conversations` (id, messages, updated_at) VALUES (...).
3. Verify `getMessages(id)` returns the same messages.
4. Update `theo.config.ts` to pass the Postgres adapter.

### From filesystem → Redis

1. For each conversation: RPUSH every message as JSON-stringified entry into `agent:conversation:<id>`.
2. EXPIRE the key with the desired TTL (default 30 days).
3. Update `theo.config.ts` to pass the Redis adapter.

The migration is a one-time script. After deploy, the new adapter takes over.

## Operational limits

| Limit | FileSystem | Postgres | Redis |
|-------|:----------:|:--------:|:-----:|
| Single message size | < ~10 MB (jsonl line) | < 1 GB (JSONB column) | < 512 MB (Redis string) |
| Messages per conversation | unbounded | ~1 GB total | unbounded with TTL |
| Concurrent appends per conversation | unsafe (race) | atomic (single SQL) | atomic (RPUSH) |
| TTL | none (fs) | none (column) | 30 days (configurable) |

## EC reference

This concept doc lands as part of Phase 10 of the
[SDK v1.1.0 consumption plan](../plans/sdk-1-1-0-consumption-plan.md).
Edge cases relevant here:

- **EC-2 (MUST FIX)**: RedisConversationStorage validates `conversationId`
  against `^[a-zA-Z0-9_-]{1,128}$` at every entry point. Rejects `:`, `*`,
  whitespace, empty, > 128 chars.
- **EC-11 (SHOULD TEST)**: pg-mem may not support JSONB `||` with parameter
  binding — the PostgresConversationStorage tests preflight and gate.
- **EC-12 (SHOULD TEST)**: the test Redis mock supports fake-timer-driven
  TTL expiration; real Redis production deploys rely on actual `EXPIRE`.

## Cross-references

- Plan: `docs/plans/sdk-1-1-0-consumption-plan.md`
- Postgres recipe: `tests/fixtures/conversation-postgres/storage.ts`
- Redis recipe: `tests/fixtures/conversation-redis/storage.ts`
- Test (Postgres): `tests/integration/conversation-postgres-fixture.test.ts`
- Test (Redis): `tests/integration/conversation-redis-fixture.test.ts`
- SDK source: `@usetheo/sdk` v1.1.0 — `Agent.getOrCreate` + `ConversationStorageAdapter`
- Agent registry GC: `docs/concepts/agent-registry-lifecycle.md` (sibling concept)
