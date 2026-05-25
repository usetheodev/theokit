# Cross-Repo Handoff — `theokit-sdk` Production-Readiness Gaps

**From:** TheoKit core (`/home/paulo/Projetos/usetheo/theokit/`)
**To:** TheoKit-SDK team (`/home/paulo/Projetos/usetheo/theokit-sdk/`)
**Date:** 2026-05-25
**Status:** Action required — these unblock TheoKit's path to production-grade deploys (TheoCloud, Vercel, Cloudflare Workers, multi-host Node)
**Reading time:** ~15 min

---

## Context — why this prompt exists

TheoKit just shipped `system-100-percent-functional` (v0.2.0 candidate). The web-framework side is in good shape: 2608 tests, 0 typecheck errors, 0 lint warnings, 0 architecture violations, 8 deploy adapters compile, 5 templates work, OpenRouter demo lands. Phase 7 dogfood report scored 92/100.

**But the framework is NOT yet production-grade for the principal target (TheoCloud) or for any serverless/multi-host deploy.** A technical-gap audit (see `docs/audit/dogfood-2026-05-25-phase-7-consolidated.md` and the conversation history in `/.claude/projects/-home-paulo-Projetos-usetheo-theokit/`) identified **3 CRITICAL gaps**. **Two of them are SDK-side.** This prompt is the SDK-side ask.

Per `CLAUDE.md` memory `feedback-sdk-is-evolvable`: when TheoKit work needs an SDK change, write the SDK task in the SDK repo — don't workaround in TheoKit. This document is that task, structured.

Per `CLAUDE.md` memory `project-stack-deps`: TheoKit's stack assumption is **always** `@usetheo/sdk` + `@usetheo/ui`. The SDK is not "evaluated against alternatives" — it IS the runtime. Therefore the SDK is the only place these gaps can be fixed without violating the locked premise.

The cross-repo workflow (per `CLAUDE.md` "Macro Roadmap" section, "SDK plan (cross-repo)" table):

```
1. SDK team implements + tests + docs.md + CHANGELOG in theokit-sdk/
2. SDK publishes @usetheo/sdk@^X.Y.Z-next.N
3. TheoKit consumes via bump + writes the wrapper that uses the new API
4. TheoKit ships fixture proof in tests/fixtures/
```

---

## Scope of this handoff

**This document is the ENTIRE prompt — self-contained.** No need to read prior plans, audits, or roadmaps. If you (the SDK team / agent) want extra context, paths are linked, but the prompt stands alone.

**What is NOT scope:**
- TheoKit-side fixes (CSP nonce auto-threading, Redis rate-limit adapter, durable Postgres outbox, theo-cloud deploy adapter) — those are tracked in `theokit/docs/plans/`
- Provider-specific bugs (OpenAI quirks, Anthropic streaming edge cases) — separate work
- UI-side issues — separate repo

---

## The six gaps, in order of impact

| # | Gap | Severity | Blocks |
|---|-----|:--------:|--------|
| 1 | `ConversationStorageAdapter` interface | **CRITICAL** | Any serverless deploy (Vercel/CF/Lambda); any multi-host deploy |
| 2 | `Agent.registry` GC / eviction in production | **CRITICAL** | Any long-running Node deploy (eventual OOM) |
| 3 | `AgentRunError` discriminated union with `code` | **HIGH** | Quality client-side error UX; cost tracking; observability |
| 4 | Tool lifecycle hooks (`onToolStart`/`onToolEnd`/`onToolError`) | **MEDIUM-HIGH** | Cost tracking accuracy; audit log; per-tool retry/alerting |
| 5 | Streaming abort propagation via `AbortSignal` | **MEDIUM** | Token cost when SSE client disconnects mid-stream |
| 6 | Conversation quota / abuse hooks | **MEDIUM** | Multi-tenant SaaS deploys |

Recommended ship order: **1 → 2 → 3 → 5 → 4 → 6**. Reason: 1+2 are infrastructure that everything else depends on; 3 is observability that unblocks debugging the rest; 5 is operational (saves money during dev/test); 4+6 are quality-of-life.

---

## Gap 1 — `ConversationStorageAdapter` interface (CRITICAL)

### Evidence

`@usetheo/sdk`'s `Agent.getOrCreate(id)` persists conversation turns to:

```
.theokit/agents/<conversationId>/messages.jsonl
```

This is local filesystem, single-process. Search proof in TheoKit:
- `examples/full-stack-agent/server/routes/chat.ts:23` comment: "SDK auto-persists conversation turns in `.theokit/agents/<conversationId>/messages.jsonl`"
- `examples/openrouter-demo/server/routes/chat.ts:23` same comment
- TheoKit's `server/agent/create-conversation-history.ts` builds on top of `Agent.getOrCreate`

### Impact

**Hard breakage** in three deploy patterns we promise (and need TheoCloud to fully deliver):

1. **Vercel serverless functions** — `/tmp` is the only writable fs and is ephemeral. Conversation disappears between requests (each request = potentially new instance).
2. **Cloudflare Workers** — no filesystem at all. SDK initialization would crash.
3. **Multi-host Node deploys** (K8s replicas, TheoCloud canary) — fs not shared. Same user lands on different replicas across requests → sees different histories.
4. **Container restarts** (Docker, K8s rolling update, scale-to-zero) — `.theokit/` not in a persistent volume → conversation lost.

This is **the #1 blocker** for any production deploy beyond a single self-hosted Node VPS.

### Proposed contract

Add a new interface in `theokit-sdk/packages/sdk/src/conversation/storage-adapter.ts`:

```ts
/**
 * Pluggable persistence for Agent conversation history.
 *
 * `Agent.getOrCreate(id)` reads + appends through this interface instead
 * of writing to the local filesystem directly. Default ships as
 * `FileSystemConversationStorage` (current behaviour) for backward compat.
 *
 * Implementations are sync at the interface level when the underlying
 * store is sync (in-memory, sqlite), async otherwise (Postgres, Redis).
 * The interface is `Promise<>`-returning to keep both flavors uniform.
 */
export interface ConversationStorageAdapter {
  /**
   * Return the full message history for a conversation, in insertion order.
   * MUST return `[]` (not throw) when the conversation does not exist.
   */
  getMessages(conversationId: string): Promise<readonly SDKMessage[]>

  /**
   * Append a single message to the conversation.
   * MUST be atomic — concurrent appends MUST NOT corrupt the log.
   * MUST create the conversation lazily if it does not exist.
   */
  appendMessage(conversationId: string, message: SDKMessage): Promise<void>

  /**
   * Delete the entire conversation. MUST be idempotent (delete-of-missing = ok).
   */
  deleteConversation(conversationId: string): Promise<void>

  /**
   * Optional: list conversation ids. Used by Agent.registry for housekeeping.
   * Implementations that cannot enumerate (e.g., wildcards too expensive
   * on production Redis) MAY return `undefined` to signal "not supported".
   */
  listConversationIds?(opts?: { limit?: number }): Promise<readonly string[] | undefined>

  /**
   * Optional: dispose underlying handles (close DB pool, etc.).
   * MUST be safe to call multiple times.
   */
  dispose?(): Promise<void>
}
```

### Reference implementations in core (`theokit-sdk/packages/sdk/`)

1. **`FileSystemConversationStorage`** — current behaviour. Default when no adapter is configured. Writes to `<cwd>/.theokit/agents/<id>/messages.jsonl`.
2. **`InMemoryConversationStorage`** — `Map<string, SDKMessage[]>`. For tests + ephemeral dev.

### Recipes in `theokit-sdk/docs/recipes/`

(Not in core — to keep `@usetheo/sdk` dep-light; document the pattern, ship as user code.)

3. **`PostgresConversationStorage`** — uses `pg` + a table `agent_conversations(id text, messages jsonb, updated_at timestamptz)`.
4. **`RedisConversationStorage`** — uses `ioredis`; key = `agent:conversation:<id>`; messages stored as a Redis list (`RPUSH`/`LRANGE`).

### Wiring in `Agent`

```ts
// theokit-sdk/packages/sdk/src/agent.ts
interface AgentOptions {
  // ...existing fields...

  /**
   * Conversation persistence. Defaults to `FileSystemConversationStorage`
   * for backward compat. Pass `InMemoryConversationStorage` in tests or
   * a custom adapter (Postgres, Redis) in serverless/multi-host deploys.
   */
  conversationStorage?: ConversationStorageAdapter
}

export class Agent {
  static getOrCreate(id: string, opts?: AgentOptions): Promise<Agent> {
    const storage = opts?.conversationStorage ?? new FileSystemConversationStorage()
    // ... read history via storage, build agent, write back via storage on send
  }
}
```

### Tests (TDD obrigatório per CLAUDE.md `/.claude/rules/testing.md`)

`theokit-sdk/packages/sdk/tests/conversation-storage.test.ts`:

```ts
describe('ConversationStorageAdapter contract', () => {
  // Run the same test suite against every adapter — interface conformance
  describe.each([
    ['InMemory', () => new InMemoryConversationStorage()],
    ['FileSystem', () => new FileSystemConversationStorage({ root: tmpDir() })],
  ])('%s', (_, factory) => {
    it('returns [] for unknown conversation (not throw)', async () => {
      const s = factory()
      expect(await s.getMessages('does-not-exist')).toEqual([])
    })

    it('appendMessage creates the conversation lazily', async () => {
      const s = factory()
      await s.appendMessage('new-id', { role: 'user', content: 'hi' })
      expect(await s.getMessages('new-id')).toHaveLength(1)
    })

    it('preserves insertion order across appends', async () => {
      const s = factory()
      await s.appendMessage('c', { role: 'user', content: 'a' })
      await s.appendMessage('c', { role: 'assistant', content: 'b' })
      await s.appendMessage('c', { role: 'user', content: 'c' })
      const msgs = await s.getMessages('c')
      expect(msgs.map((m) => m.content)).toEqual(['a', 'b', 'c'])
    })

    it('concurrent appends do not corrupt the log', async () => {
      const s = factory()
      await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          s.appendMessage('race', { role: 'user', content: `m${i}` }),
        ),
      )
      const msgs = await s.getMessages('race')
      expect(msgs).toHaveLength(50)
    })

    it('deleteConversation is idempotent', async () => {
      const s = factory()
      await s.deleteConversation('never-existed') // should not throw
      await s.appendMessage('to-delete', { role: 'user', content: 'x' })
      await s.deleteConversation('to-delete')
      await s.deleteConversation('to-delete') // second call also ok
      expect(await s.getMessages('to-delete')).toEqual([])
    })
  })
})
```

### Acceptance criteria

- [ ] `ConversationStorageAdapter` interface exported from `@usetheo/sdk`
- [ ] `FileSystemConversationStorage` is the default (no breaking change to existing apps)
- [ ] `InMemoryConversationStorage` exported
- [ ] Postgres + Redis recipes in `docs/recipes/`
- [ ] All four contract tests pass for both in-core adapters
- [ ] `Agent.getOrCreate` and `Agent.create` accept `conversationStorage` option
- [ ] CHANGELOG entry under `[Unreleased]` → `Added`
- [ ] `docs.md` section "Conversation Storage" with code examples for each adapter
- [ ] Backward compat: existing apps without `conversationStorage` config keep working unchanged

### TheoKit-side follow-up (post-SDK publish)

TheoKit will:
1. Bump `@usetheo/sdk` to the version that ships this
2. Update `createConversationHistory` in `packages/theo/src/server/agent/create-conversation-history.ts` to accept and pass through `conversationStorage`
3. Add a fixture project `tests/fixtures/conversation-redis/` proving the Redis recipe works end-to-end
4. Document in `docs/concepts/conversation-history.md` the per-deploy-target choice (FileSystem for self-hosted Node, Postgres/Redis for serverless + multi-host)

---

## Gap 2 — `Agent.registry` GC / eviction in production (CRITICAL)

### Evidence

TheoKit currently has a dev-mode-only GC at `packages/theo/src/cli/cleanup/cleanup.ts` (`gcAgentRegistry`). It only runs during `theokit dev`. In production (`theokit start`), nothing evicts agents from memory.

Each `Agent.getOrCreate(conversationId)` adds an entry to an internal registry (current implementation in `@usetheo/sdk`). Reasonable assumption based on the API shape: there's a `Map<id, Agent>` or equivalent.

### Impact

A production Node server accepting ~10 new conversation ids/minute over 24 hours holds ~14,400 Agent instances in memory. Each instance carries:
- Provider connection state
- Tool registry
- Conversation history cache (if not lazy-loaded)
- Open file handles (for the filesystem persistence — see Gap 1)

**Guaranteed OOM at some point.** Server uptime is finite without manual restarts. Not acceptable for any 24/7 deploy.

### Proposed contract

Add `Agent.registry` lifecycle config + auto-eviction:

```ts
// theokit-sdk/packages/sdk/src/registry/agent-registry.ts

export interface AgentRegistryOptions {
  /**
   * Maximum number of agents kept alive simultaneously. LRU eviction
   * when exceeded. Default: 100 (suitable for indie/small-team Node deploys).
   * Set higher for high-traffic servers; set lower for memory-constrained envs.
   */
  maxAgents?: number

  /**
   * Idle timeout in milliseconds. Agents not used for this duration are
   * evicted. Default: 30 minutes (1_800_000). Set 0 to disable idle eviction.
   */
  idleTimeoutMs?: number

  /**
   * Called whenever an agent is evicted. Use for logging / observability.
   * Errors thrown by the listener are swallowed (do not crash the eviction).
   */
  onEvict?: (id: string, reason: 'lru' | 'idle' | 'explicit') => void
}

export class AgentRegistry {
  configure(opts: AgentRegistryOptions): void
  evict(id: string): Promise<boolean>  // returns true if was present
  evictAll(): Promise<void>
  size(): number  // current count
  ids(): readonly string[]  // current ids (newest first)
}

// Exported via Agent namespace:
Agent.registry: AgentRegistry
```

### Eviction policy

- **LRU** when `size > maxAgents`. Evict the least-recently-used (last `getOrCreate` or `send` defines "use").
- **Idle timeout** runs as a periodic sweep (every ~60s) — evict any agent whose `lastUsedAt < now - idleTimeoutMs`.
- **Explicit** `Agent.registry.evict(id)` — user-controlled eviction.
- On eviction: call `agent.dispose()` (close fs handles, abort in-flight streams, release provider connections).

### Tests

```ts
describe('Agent.registry LRU eviction', () => {
  it('evicts least-recently-used when maxAgents exceeded', async () => {
    Agent.registry.configure({ maxAgents: 3 })
    const a = await Agent.getOrCreate('a', baseOpts)
    const b = await Agent.getOrCreate('b', baseOpts)
    const c = await Agent.getOrCreate('c', baseOpts)
    await Agent.getOrCreate('d', baseOpts)  // exceeds limit
    expect(Agent.registry.ids()).toEqual(['d', 'c', 'b'])  // a evicted
  })

  it('refreshing usage saves an agent from LRU eviction', async () => {
    Agent.registry.configure({ maxAgents: 3 })
    await Agent.getOrCreate('a', baseOpts)
    await Agent.getOrCreate('b', baseOpts)
    await Agent.getOrCreate('c', baseOpts)
    await Agent.getOrCreate('a', baseOpts)  // refresh a's recency
    await Agent.getOrCreate('d', baseOpts)
    expect(Agent.registry.ids()).toContain('a')
    expect(Agent.registry.ids()).not.toContain('b')  // b was oldest
  })

  it('idle timeout evicts agents not used recently', async () => {
    vi.useFakeTimers()
    Agent.registry.configure({ idleTimeoutMs: 1000 })
    await Agent.getOrCreate('idle', baseOpts)
    vi.advanceTimersByTime(2000)
    // wait for sweep tick
    await vi.runAllTimersAsync()
    expect(Agent.registry.ids()).not.toContain('idle')
  })

  it('onEvict listener fires on every eviction', async () => {
    const calls: Array<[string, string]> = []
    Agent.registry.configure({ maxAgents: 1, onEvict: (id, reason) => calls.push([id, reason]) })
    await Agent.getOrCreate('a', baseOpts)
    await Agent.getOrCreate('b', baseOpts)
    expect(calls).toEqual([['a', 'lru']])
  })

  it('agent.dispose called on eviction', async () => {
    const a = await Agent.getOrCreate('e', baseOpts)
    const spy = vi.spyOn(a, 'dispose')
    await Agent.registry.evict('e')
    expect(spy).toHaveBeenCalled()
  })
})
```

### Acceptance criteria

- [ ] `Agent.registry` exposed with `configure`/`evict`/`evictAll`/`size`/`ids`
- [ ] LRU eviction works at `maxAgents` boundary
- [ ] Idle timeout sweep runs at configurable interval (default 60s)
- [ ] `onEvict` listener invoked with correct reason
- [ ] `agent.dispose()` called on eviction, errors swallowed
- [ ] Default `maxAgents: 100`, `idleTimeoutMs: 1_800_000` (30 min) — safe for indie deploys
- [ ] CHANGELOG entry
- [ ] `docs.md` section "Agent Registry Lifecycle"
- [ ] Backward compat: code that never touches `Agent.registry.configure()` still works (defaults take over)

### TheoKit-side follow-up

1. Remove `dev-agent-gc.ts` (now redundant; SDK handles it natively)
2. Surface registry config in `theo.config.ts` schema: `agents: { registry: AgentRegistryOptions }`
3. Wire `process.on('SIGTERM')` in `theokit start` to call `Agent.registry.evictAll()` for graceful shutdown

---

## Gap 3 — `AgentRunError` discriminated union with `code` (HIGH)

### Evidence

Today's SDK throws `AgentRunError(message: string)` (per the cross-repo change tracked in `CLAUDE.md` macro roadmap, item #3). TheoKit's `streamAgentRun` maps the error to:

```ts
yield { type: 'error', message: error.message }
```

The wire is a stringified blob. The browser-side `useAgentStream` receives:

```ts
events.push({ type: 'error', message: 'Rate limit exceeded for openai/gpt-4o-mini' })
```

There's no way for the UI to:
- Show a "Sign in again" CTA on `auth` errors
- Show a "Wait N seconds" countdown on `rate_limit`
- Show a "Pick a different model" hint on `invalid_model`
- Log structured error metrics for observability

### Impact

- UX falls back to generic "Stream interrupted. Retry?" for every error class
- Cost tracking can't distinguish "user fault" (invalid input) from "provider fault" (5xx) for billing reconciliation
- Logs/metrics dashboards can't aggregate by error class
- Retry policies are pessimistic (we don't know if it's safe to retry)

### Proposed contract

```ts
// theokit-sdk/packages/sdk/src/errors/agent-run-error.ts

export type AgentRunErrorCode =
  | 'auth'                 // 401/403 from provider — bad API key, expired token
  | 'rate_limit'           // 429 — back off, retry after `retryAfterMs`
  | 'quota_exceeded'       // 402 — billing limit hit, no retry
  | 'invalid_model'        // 400 — model id wrong or unavailable
  | 'invalid_input'        // 400 — message format / context shape
  | 'context_too_large'    // request exceeds model's context window
  | 'safety_blocked'       // provider's safety filter blocked the request/response
  | 'provider_unreachable' // 5xx, timeout, DNS failure
  | 'tool_runtime_error'   // a defineAgentTool handler threw
  | 'aborted'              // AbortSignal triggered (see Gap 5)
  | 'unknown'              // unmapped; provider returned something we don't recognize

export class AgentRunError extends Error {
  readonly name: 'AgentRunError'
  readonly code: AgentRunErrorCode
  readonly provider: string  // 'openai' | 'anthropic' | 'openrouter' | ... (provider id from Agent config)
  readonly retriable: boolean  // safe to retry the EXACT same request?
  readonly retryAfterMs?: number  // hint from provider (Retry-After header for rate_limit)
  readonly providerError?: unknown  // raw provider response for debugging (NEVER stringified in `.message`)
  readonly requestId?: string  // provider's request id for support tickets / log correlation
  readonly conversationId?: string  // SDK's agentId, for log correlation

  constructor(opts: {
    message: string
    code: AgentRunErrorCode
    provider: string
    retriable: boolean
    retryAfterMs?: number
    providerError?: unknown
    requestId?: string
    conversationId?: string
    cause?: Error
  })
}
```

### Mapping table (provider responses → AgentRunError.code)

The SDK MUST maintain a mapping per provider. Document at `docs/error-codes.md`:

| Provider | Response | → code | retriable |
|----------|----------|--------|:--------:|
| OpenAI | 401 | `auth` | false |
| OpenAI | 429 | `rate_limit` | true |
| OpenAI | 402 / billing | `quota_exceeded` | false |
| OpenAI | 400 + "model not found" | `invalid_model` | false |
| OpenAI | 400 + "context length" | `context_too_large` | false |
| OpenAI | 400 (other) | `invalid_input` | false |
| OpenAI | 5xx | `provider_unreachable` | true |
| OpenAI | safety filter | `safety_blocked` | false |
| Anthropic | 401 | `auth` | false |
| Anthropic | 429 | `rate_limit` | true |
| ... | ... | ... | ... |
| AbortSignal fired | n/a | `aborted` | false |
| Tool handler threw | n/a | `tool_runtime_error` | false |
| Unmapped | n/a | `unknown` | false |

### TheoKit-side wire mapping (post-SDK publish)

TheoKit's `streamAgentRun` will be updated to:

```ts
yield {
  type: 'error',
  message: error.message,
  code: error.code,           // ← new
  provider: error.provider,   // ← new
  retriable: error.retriable, // ← new
  retryAfterMs: error.retryAfterMs, // ← new (optional)
}
```

The `AgentEvent` Zod schema in `@usetheo/ui` will need a corresponding bump (cross-repo dance with the UI team — out of scope here, but coordinate timing).

### Tests

```ts
describe('AgentRunError discrimination', () => {
  it('maps OpenAI 401 to code=auth, retriable=false', async () => {
    const agent = await mockAgent({ provider: 'openai', mockResponse: { status: 401 } })
    await expect(agent.send('hi')).rejects.toMatchObject({
      name: 'AgentRunError',
      code: 'auth',
      provider: 'openai',
      retriable: false,
    })
  })

  it('maps OpenAI 429 to code=rate_limit, retriable=true, parses Retry-After', async () => {
    const agent = await mockAgent({
      provider: 'openai',
      mockResponse: { status: 429, headers: { 'retry-after': '30' } },
    })
    await expect(agent.send('hi')).rejects.toMatchObject({
      code: 'rate_limit',
      retriable: true,
      retryAfterMs: 30_000,
    })
  })

  it('does not stringify providerError into message', async () => {
    const agent = await mockAgent({
      provider: 'openai',
      mockResponse: { status: 500, body: { secret: 'leaked-internal-info' } },
    })
    try {
      await agent.send('hi')
    } catch (err) {
      expect(err.message).not.toContain('leaked-internal-info')  // secrets must not leak via message
      expect(err.providerError).toBeDefined()  // available for debugging
    }
  })

  it('AbortSignal trigger maps to code=aborted, retriable=false', async () => {
    const controller = new AbortController()
    const agent = await mockAgent({ provider: 'openai' })
    const promise = agent.send('hi', { signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toMatchObject({ code: 'aborted', retriable: false })
  })

  it('tool handler throw maps to code=tool_runtime_error', async () => {
    const agent = await mockAgent({
      provider: 'openai',
      tools: [defineAgentTool({
        name: 'broken',
        inputSchema: z.object({}),
        handler: () => { throw new Error('boom') },
      })],
      // ... mock provider to call this tool
    })
    await expect(agent.send('use broken')).rejects.toMatchObject({
      code: 'tool_runtime_error',
    })
  })
})
```

### Acceptance criteria

- [ ] `AgentRunError` extends `Error` with all fields above
- [ ] Mapping table covers OpenAI, Anthropic, OpenRouter (Google, Meta delegated by OpenRouter normalize OK)
- [ ] `providerError` available but NOT in `.message` (avoid secret leakage)
- [ ] Tests cover every `code` value with at least one positive case
- [ ] CHANGELOG entry under `Added` (new exports) + `Changed` (existing `AgentRunError` gains fields — non-breaking, only additive)
- [ ] `docs.md` section "Error Codes" with mapping table
- [ ] `docs/error-codes.md` standalone reference

---

## Gap 4 — Tool lifecycle hooks (MEDIUM-HIGH)

### Evidence

`@usetheo/sdk`'s `CustomTool` runtime executes tools opaquely. TheoKit's `trackAgentRun` (server/cost/track-agent-run.ts) wants to accumulate:
- Per-tool execution count
- Per-tool latency (p50/p99)
- Per-tool error rate

Today it can't — there's no hook. The only signal is the final `run.stream()` events (`tool_call`, `tool_result`).

### Proposed contract

Add hooks to `Agent.create`:

```ts
interface AgentOptions {
  // ...existing fields...

  /** Called when a tool starts executing. Use for audit log / metrics start. */
  onToolStart?: (event: {
    toolName: string
    args: unknown
    conversationId: string
    callId: string  // unique per invocation, matches onToolEnd/onToolError
  }) => void

  /** Called when a tool finishes successfully. */
  onToolEnd?: (event: {
    toolName: string
    args: unknown
    result: unknown
    conversationId: string
    callId: string
    durationMs: number
  }) => void

  /** Called when a tool handler throws. Synchronous (the SDK still raises AgentRunError). */
  onToolError?: (event: {
    toolName: string
    args: unknown
    error: Error
    conversationId: string
    callId: string
    durationMs: number
    attempt: number  // 1-indexed retry count (1 = first try)
  }) => void
}
```

### Tests

```ts
describe('Tool lifecycle hooks', () => {
  it('onToolStart fires before handler runs', async () => {
    const events: string[] = []
    const tool = defineAgentTool({
      name: 'spy',
      inputSchema: z.object({}),
      handler: () => { events.push('handler'); return 'ok' },
    })
    const agent = await mockAgent({
      tools: [tool],
      onToolStart: () => events.push('start'),
      onToolEnd: () => events.push('end'),
    })
    await agent.send('use spy')
    expect(events).toEqual(['start', 'handler', 'end'])
  })

  it('onToolEnd receives the result + durationMs', async () => {
    const calls: any[] = []
    const tool = defineAgentTool({
      name: 't',
      inputSchema: z.object({}),
      handler: async () => { await new Promise(r => setTimeout(r, 50)); return { ok: 1 } },
    })
    await mockAgent({ tools: [tool], onToolEnd: (e) => calls.push(e) }).send('use t')
    expect(calls[0].result).toEqual({ ok: 1 })
    expect(calls[0].durationMs).toBeGreaterThanOrEqual(50)
  })

  it('onToolError fires when handler throws', async () => {
    const calls: any[] = []
    const tool = defineAgentTool({
      name: 'boom',
      inputSchema: z.object({}),
      handler: () => { throw new Error('nope') },
    })
    await expect(
      mockAgent({ tools: [tool], onToolError: (e) => calls.push(e) }).send('use boom')
    ).rejects.toBeDefined()
    expect(calls[0].error.message).toBe('nope')
    expect(calls[0].attempt).toBe(1)
  })

  it('hook errors do not abort the run', async () => {
    const tool = defineAgentTool({
      name: 't',
      inputSchema: z.object({}),
      handler: () => 'ok',
    })
    const agent = await mockAgent({
      tools: [tool],
      onToolStart: () => { throw new Error('listener crashed') },
    })
    // Run should complete despite the listener throw — listener errors are swallowed
    await expect(agent.send('use t')).resolves.toBeDefined()
  })
})
```

### Acceptance criteria

- [ ] Three hooks: `onToolStart`, `onToolEnd`, `onToolError`
- [ ] `callId` is unique per tool invocation, identical across start/end pair
- [ ] Hook errors are swallowed (do not interrupt the agent run)
- [ ] `onToolError` fires BEFORE `AgentRunError` is thrown
- [ ] `durationMs` measured from start of handler to end (or error)
- [ ] CHANGELOG + docs

### TheoKit-side follow-up

`trackAgentRun` in `server/cost/track-agent-run.ts` consumes these hooks:

```ts
const agent = await createConversationHistory({
  ...,
  options: {
    apiKey,
    model: { id: modelId },
    tools,
    onToolStart: (e) => trackToolStart(e),
    onToolEnd: (e) => trackToolEnd(e),
    onToolError: (e) => trackToolError(e),
  },
})
```

---

## Gap 5 — Streaming abort propagation (MEDIUM)

### Evidence

Today's flow:
1. Browser opens SSE connection to TheoKit's `/api/chat`
2. TheoKit's `defineAgentEndpoint` calls `agent.send(message)` → `agent.stream()`
3. SDK calls the provider (OpenAI/Anthropic) and streams tokens back
4. Browser closes the tab / navigates away

The SDK has no `AbortSignal` parameter on `agent.send()` / `agent.stream()`. The provider call keeps running, **the user is charged for tokens they never received**.

### Proposed contract

```ts
interface Agent {
  send(input: string | { content: string }, opts?: { signal?: AbortSignal }): Promise<Run>
  stream(input: string | { content: string }, opts?: { signal?: AbortSignal }): AsyncIterable<SDKMessage>
}
```

When the signal aborts:
- Cancel the in-flight provider request (HTTP request abort, WebSocket close, whatever the provider client supports)
- Throw `AgentRunError({ code: 'aborted', retriable: false })`
- Do NOT persist partial assistant message (avoids broken history)

### Tests

```ts
describe('AbortSignal propagation', () => {
  it('aborts provider call when signal fires', async () => {
    const controller = new AbortController()
    const providerAbortSpy = vi.fn()
    const agent = await mockAgent({ onProviderAbort: providerAbortSpy })
    const promise = agent.send('hi', { signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toMatchObject({ code: 'aborted' })
    expect(providerAbortSpy).toHaveBeenCalled()
  })

  it('does not append partial message to history when aborted', async () => {
    const controller = new AbortController()
    const agent = await mockAgent({ conversationStorage: storage })
    const promise = agent.stream('hi', { signal: controller.signal })
    setTimeout(() => controller.abort(), 50)  // abort mid-stream
    try { for await (const _ of promise) {} } catch {}
    const history = await storage.getMessages(agent.id)
    expect(history.every(m => m.role !== 'assistant' || m.content.length > 0)).toBe(true)
  })
})
```

### Acceptance criteria

- [ ] `signal?: AbortSignal` on `send()` and `stream()`
- [ ] Provider request is actually aborted (HTTP request canceled, not just promise rejected)
- [ ] No partial state in conversation storage
- [ ] Throws `AgentRunError({ code: 'aborted' })`
- [ ] CHANGELOG + docs

### TheoKit-side follow-up

`defineAgentEndpoint` in `packages/theo/src/server/agent/define-agent-endpoint.ts` reads `request.signal` (Node IncomingMessage has it on res.on('close'); Web Request has it natively) and threads to `agent.send({ signal })`.

---

## Gap 6 — Conversation quota / abuse hooks (MEDIUM)

### Evidence

`Agent.getOrCreate(id)` accepts any conversationId. For a multi-tenant SaaS:
- User A creates 1 conversation/sec → 86,400 conversations/day
- Each conversation persists to storage forever (until manually evicted)
- Storage cost grows unbounded

There's no SDK-side hook to enforce "max N conversations per user" or "max M messages per conversation". TheoKit could do it at the route level, but the SDK API should expose the right hook.

### Proposed contract

```ts
interface AgentOptions {
  /**
   * Called BEFORE every `getOrCreate` / `create`. Throw to block creation.
   * Use for per-user / per-tenant quota enforcement.
   *
   * Example:
   *   onBeforeCreate: async ({ conversationId, userId }) => {
   *     const count = await db.countConversations(userId)
   *     if (count >= 100) throw new QuotaExceededError('100 conversations/user max')
   *   }
   */
  onBeforeCreate?: (event: { conversationId: string; userId?: string }) => Promise<void> | void

  /**
   * Called BEFORE every `agent.send`. Throw to block the call.
   * Use for per-user rate limits, per-conversation message caps, etc.
   */
  onBeforeSend?: (event: { conversationId: string; messageCount: number }) => Promise<void> | void
}
```

### Tests

```ts
describe('Quota hooks', () => {
  it('onBeforeCreate can block agent creation', async () => {
    const onBeforeCreate = vi.fn().mockRejectedValueOnce(new Error('quota'))
    await expect(Agent.getOrCreate('x', { ...opts, onBeforeCreate })).rejects.toMatchObject({
      message: 'quota',
    })
  })

  it('onBeforeSend can block individual messages', async () => {
    const agent = await Agent.getOrCreate('x', {
      ...opts,
      onBeforeSend: ({ messageCount }) => {
        if (messageCount >= 50) throw new Error('conversation too long')
      },
    })
    // ... send 50 messages, expect 51st to throw
  })
})
```

### Acceptance criteria

- [ ] Two hooks: `onBeforeCreate`, `onBeforeSend`
- [ ] Hook errors propagate (NOT swallowed — these are blockers, not observers)
- [ ] Hook runs BEFORE provider call / storage write (no side effects on rejection)
- [ ] CHANGELOG + docs with example for "100 conversations per user"

### TheoKit-side follow-up

Add `examples/saas-quota/` showing per-user quotas wired through Drizzle.

---

## Cross-cutting concerns

### Versioning strategy

These 6 gaps will likely ship as **multiple minor releases**:

| SDK version | Includes |
|-------------|----------|
| `^1.X.0-next.0` | Gap 1 (ConversationStorageAdapter) |
| `^1.Y.0-next.0` | Gap 2 (Agent.registry) |
| `^1.Z.0-next.0` | Gap 3 (AgentRunError discrimination) |
| `^1.W.0-next.0` | Gaps 4 + 5 + 6 (hooks bundle) |

Ship-or-batch is the SDK team's call. TheoKit can consume incrementally — each one unblocks one deploy category.

### Backward compatibility — non-negotiable

Per CLAUDE.md monorepo cross-project rules: **no breaking changes** to existing SDK consumers. Every new option is opt-in with sensible defaults. Existing apps not configuring the new fields keep working unchanged.

Validation: SDK CI MUST run the TheoKit test suite (or at least the openrouter-demo + full-stack-agent fixtures) against the new SDK version before publish. Cross-repo smoke test.

### Documentation

Every gap closure ships with:
1. CHANGELOG entry under `[Unreleased]` (Keep a Changelog format per CLAUDE.md)
2. `docs.md` section update
3. Recipe doc in `docs/recipes/` when applicable (Postgres/Redis adapters)
4. Updated example in `examples/` showing the new API in context

### Telemetry contract

For observability — the hooks should NEVER:
- Log secrets (API keys, user PII) into hook payloads
- Block the hot path (hook errors must be swallowed for observation hooks; only quota hooks block by design)
- Allocate excessive memory (event objects should be plain JSON-serializable shapes)

---

## Done definition

This handoff is **complete** when:

- [ ] All 6 gaps have shipped in `@usetheo/sdk` (some minor version on `next` tag)
- [ ] Each ships with: tests, CHANGELOG, `docs.md` section
- [ ] Cross-repo smoke test against TheoKit's openrouter-demo passes
- [ ] TheoKit core bumps `@usetheo/sdk` to the latest version that includes all 6
- [ ] TheoKit's `examples/openrouter-demo/server/routes/chat.ts` updated to:
  - Use `conversationStorage` (Postgres or Redis adapter in production builds)
  - Thread `signal` from request to `agent.send`
  - Wire `onToolStart`/`onToolEnd`/`onToolError` to `trackAgentRun`
  - Use `error.code` to render UI-appropriate retry CTAs

When done, TheoKit can honestly claim **"production-grade for serverless and multi-host deploys"** and the `theo-cloud` adapter milestone is unblocked (TheoCloud's hosted Postgres + Redis are the natural storage backends for these adapters).

---

## Sign-off

**Submitted by:** TheoKit core team (Paulo + agents)
**Repo this handoff is committed in:** `theokit/docs/handoff/2026-05-25-sdk-production-readiness-handoff.md`
**Mirror to SDK team:** copy this file to `theokit-sdk/docs/handoffs/from-theokit/2026-05-25-production-readiness.md` for the SDK side to track.
**Cross-link:** when the SDK team writes its implementation plan (`theokit-sdk/docs/plans/production-readiness-plan.md`), link back to this file as the originating evidence.

**Estimated SDK-side effort:** ~3-4 weeks of focused work (each gap is ~3-5 days; gap 1 is the heaviest).
