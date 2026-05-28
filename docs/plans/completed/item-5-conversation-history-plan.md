# Plan: Item #5 — `createConversationHistory` + session-cookie bridge

> **Version 1.0** — Ship `createConversationHistory(args)` as a TheoKit-native primitive that resolves a stable `agentId` from the visitor's session cookie (issuing one on first hit) and returns an `@usetheo/sdk` `Agent` resumed via `Agent.getOrCreate(agentId, options)`. Conversation turns auto-persist in `<cwd>/.theokit/agents/<agentId>/messages.jsonl` — zero-config. Optional `MemorySettings` passthrough lets consumers enable the SDK's facts-recall layer when needed. Closes Macro Roadmap item #5 in `CLAUDE.md`. Stack assumption (locked): TheoKit always uses `@usetheo/sdk` + `@usetheo/ui` — this primitive is sugar over what the SDK + the existing TheoKit session manager already ship, never a parallel implementation.

## Context

**What exists today (post item #4 / 2026-05-22):**

- `defineAgentEndpoint` + `defineAgentTool` + `streamAgentRun` (items #3 + #4) — agent route surface with tool calling.
- `Agent.create({ apiKey, model, tools })` + `Agent.send(message)` — one-shot agent invocation. Each call creates a NEW agent. Two consecutive requests from the same browser tab = two agents = zero shared context. Demo-only behaviour.
- SDK `Agent.getOrCreate(agentId, options)` (`theokit-sdk/packages/sdk/src/agent.ts:279`) — resume an agent by id; on `UnknownAgentError`, fall through to `Agent.create({ ...options, agentId })`. Built-in race recovery.
- SDK `<cwd>/.theokit/agents/<agentId>/messages.jsonl` — append-only JSONL of user/assistant turns. In-memory cache + hydration from disk on resume. Auto-compaction every 50 turns (default `DEFAULT_MAX_TURNS = 200`). See `theokit-sdk/packages/sdk/src/internal/runtime/agent-session.ts:1-60`.
- SDK `<cwd>/.theokit/agents/registry.json` — agent metadata (options without secrets, model, timestamps). See `theokit-sdk/packages/sdk/src/internal/runtime/agent-registry-store.ts:32-45`.
- SDK `AgentOptions.memory` (`MemorySettings`) — opt-in facts persistence with SQLite + FTS5 + optional embeddings. See `theokit-sdk/packages/sdk/src/types/agent.ts:213-256`. **Separate concern** from conversation history.
- TheoKit `createSessionManager<T>(config)` (`packages/theo/src/server/session.ts:83`) — AES-256-GCM cookie sessions with dual-key rotation. Generic `TSession` shape. Already used by `examples/agent-saas`.
- TheoKit `getCookie/setCookie/deleteCookie` (`packages/theo/src/server/cookies.ts`) — raw cookie helpers used by `createSessionManager`.

**What's broken / missing:**

1. **No conversation persistence in `template-default`.** User opens chat, sends `"my name is Paulo"`, closes tab, reopens. The fixture creates a fresh agent — model has no memory. The roadmap explicitly identifies this as item #5's gap.
2. **No bridge between session cookie and SDK agent id.** Even if a consumer manually calls `Agent.getOrCreate('user-123', ...)`, they have to derive `'user-123'` somehow — typically from `req.session?.userId`. That's ~5 lines of plumbing per route. Multiplied by every route that needs continuity = real friction.
3. **No primitive that handles the "anonymous visitor" path.** A user who never logs in still wants conversation continuity within the same browser tab. Requires generating a stable id + persisting it in a cookie BEFORE the SSE response starts streaming (cookies must be set before headers commit — EC concern for SSE).
4. **`defineAgentEndpoint` handler args don't expose `response`** (only `request`). Setting a cookie inside the SSE handler is awkward because `Response` headers are already committed by the time the generator yields. The bridge needs to read/write cookies BEFORE the agent runs.

**Evidence:**

- `template-default/server/routes/chat.ts` calls `Agent.create({...})` then `agent.dispose()` in `finally` — every request creates and tears down a fresh agent. Verified via code read at line 53.
- SDK `agent-session.ts:38-55` confirms: `appendSessionMessage` writes to `<cwd>/.theokit/agents/<agentId>/messages.jsonl` whenever `cwd !== undefined`. The path embeds the agentId, so persistence is per-agent.
- SDK `Agent.resume` (agent.ts:119-165) calls `hydrateRegistryFromDisk(persistenceCwd)` + replays the prior `messages.jsonl` automatically. Tested via SDK's own golden suite.
- The `messages.jsonl` lifecycle is **always-on** when an `agentId` is provided. There's no flag to disable it; it's the SDK's default behaviour.

**Memory pins:**

- [[project-stack-deps]] — TheoKit **always** uses `@usetheo/sdk` + `@usetheo/ui`. `createConversationHistory` wraps `Agent.getOrCreate`; does not re-implement persistence.
- [[feedback-sdk-is-evolvable]] — when TheoKit work needs an SDK change, write the SDK task into the plan; don't workaround.
- [[project-theokit-purpose]] — TheoKit is the framework someone uses to build their own agent app. Conversation continuity is the headline UX feature that turns the demo into a product.

## Objective

Ship `createConversationHistory(args)` so adding conversation persistence to an agent route is **one function call** + an optional config block (for advanced memory). Demonstrate it in the default scaffold with a Playwright spec that asserts continuity across page reloads.

**Measurable goals:**

1. Replace `Agent.create` + `agent.dispose` per-request with `createConversationHistory({...})` returning a re-attached agent. Diff in `template-default/server/routes/chat.ts` ≤ +10 LOC.
2. New visitor → agent id auto-generated + cookie set on first POST → subsequent POSTs reuse it.
3. Authenticated visitor (via existing `createSessionManager`) → agent id derived from session (e.g. `session.userId`) — no extra cookie issued.
4. Playwright proof: open chat, send `"my name is X"`, reload tab, send `"what's my name"`, assistant remembers (or at minimum receives the prior turn — assertion verifies the conversation length grew).
5. Backward compatible: existing item-4 chat.ts continues to compile and run unchanged when `createConversationHistory` is NOT used.
6. Type-safe surface: `expectTypeOf` test pins the return signature. Zero `any` in production code.
7. Dogfood `full` health ≥ 70/100 with zero plan-caused CRITICAL.

## ADRs

### D1 — Conversation persistence is via SDK `Agent.getOrCreate` + `messages.jsonl`, NOT TheoKit-owned storage

**Decision:** TheoKit's `createConversationHistory` is a thin orchestrator that resolves a stable `agentId` and calls `Agent.getOrCreate(agentId, options)`. It does NOT touch the filesystem itself, does NOT keep its own message store, does NOT introduce a new persistence schema.

**Rationale:**
- The SDK already persists turns automatically via `appendSessionMessage` → `<cwd>/.theokit/agents/<agentId>/messages.jsonl` whenever an `agentId` is set on the agent.
- Building a parallel TheoKit-owned message store would duplicate the SDK's responsibility and create a "which one is the source of truth" question on every restart.
- The SDK also handles compaction (every 50 appends, max 200 turns default), hydration on resume, and crash safety. Re-doing that work would be a regression.

**Consequences:**
- ✅ Zero new persistence code in TheoKit. The primitive is < 30 LOC of orchestration.
- ✅ Consumers who later want raw access to the messages.jsonl can read it directly via the SDK's `agent.conversation()` API (`theokit-sdk/.../types/run.ts:172`).
- ⛔ Conversation persistence requires writable `<cwd>/.theokit/`. Serverless platforms with read-only filesystems (Vercel Edge, CF Workers without R2) need a different approach — out of scope for item #5; documented as a known limitation tied to item #7.
- 🔁 If the SDK later changes the persistence location, TheoKit picks it up for free.

### D2 — `MemorySettings` (SDK facts layer) is OPT-IN passthrough, NOT default

**Decision:** `createConversationHistory` accepts `options.memory: MemorySettings` and forwards it verbatim to `Agent.getOrCreate`. Default is `undefined` (facts recall disabled). Consumers who want semantic facts recall enable it explicitly.

**Rationale:**
- The macro roadmap entry mentions "Memory layer" but the SDK has THREE separable layers: (1) conversation history (always-on, free), (2) agent registry (always-on, metadata only), (3) facts memory (opt-in, requires embedding provider for semantic recall, costs $$).
- For the 95% case (chat continuity across reloads), only Camada 1 is needed. Forcing Camada 3 by default would mean every TheoKit chat needs an embedding provider configured — a non-trivial requirement that breaks the "zero config" promise.
- The opt-in path stays available: `createConversationHistory({ ..., memory: { enabled: true, ... } })`.

**Consequences:**
- ✅ Zero-config conversation continuity for new TheoKit apps.
- ✅ Power users can enable facts recall by passing `memory` through.
- ⛔ The "agent remembers facts across SESSIONS" UX (vs across MESSAGES) requires explicit opt-in — documented in the fixture comments + README.

### D3 — `agentId` resolution order: explicit `args.agentId` → `args.session?.conversationId` → cookie → freshly generated UUID

**Decision:** The primitive resolves the agent id deterministically:

1. If `args.agentId` is explicitly provided → use it (caller wins).
2. Else if `args.session` has a `conversationId` field → use that (integrates with `createSessionManager` flow).
3. Else read the request's `theo_conversation` cookie → use its value.
4. Else generate a fresh `crypto.randomUUID()` and write it back to the response cookie.

**Rationale:**
- Three legitimate identity sources (explicit, auth session, anonymous cookie) each map to a real use case. Single-source designs force consumers into one bucket or the other.
- The fallback chain prefers the most-specific source first.
- `crypto.randomUUID()` is a Web Standard since Node 19 — no dep.

**Consequences:**
- ✅ Authenticated multi-device flows: pass `session.userId` as `agentId` → same conversation across phone + laptop.
- ✅ Anonymous flows: cookie keeps the visitor's continuity within their tab.
- ✅ Explicit override: a logout/reset button can pass a fresh UUID to clear conversation without rebuilding session infra.
- ⛔ Per-route `agentId` ambiguity when the same browser session uses multiple agent routes: the dedicated cookie name (`theo_conversation`) is shared across routes. Per-route partitioning is out of scope; documented.

### D4 — Cookie is set via raw `setCookie` (NOT `createSessionManager.createSession`) to avoid encrypted-cookie overhead

**Decision:** `createConversationHistory` uses `setCookie(res, 'theo_conversation', uuid, { httpOnly: true, sameSite: 'lax', maxAge: 30d, path: '/' })` directly. NOT the encrypted `createSessionManager` flow.

**Rationale:**
- The conversation id is not a secret — it's a routing key into the agent registry. If an attacker steals the cookie, they steal access to a conversation, NOT credentials. The cost-benefit tilts toward simplicity.
- The encrypted session manager uses AES-256-GCM with derived keys (~3-15ms per request — per `session.ts:108-115` constant-time guarantee). Adding that overhead to every chat send is unjustified for a non-secret cookie.
- `createSessionManager` is opinionated about cookie name + lifecycle; mixing the conversation id into the same cookie would require schema changes consumers may not want.

**Consequences:**
- ✅ Zero crypto overhead per request for anonymous flows.
- ✅ Independent cookie surface — power users can still use `createSessionManager` for auth in parallel.
- ⛔ Conversation id is browser-readable. Mitigation: `HttpOnly` flag prevents JS reads; the id is not security-bearing anyway.
- 🔁 Consumers wanting an encrypted conversation id can pass `args.agentId = await sessionManager.getSession(req)?.conversationId` explicitly.

## Dependency Graph

```
Phase 1 (createConversationHistory primitive)
   │
   ├─▶ Phase 2 (Fixture+template scaffold update — demonstrates persistence)
   │       │
   │       └─▶ Phase 3 (Playwright spec — assert continuity across reload)
   │                │
   │                └─▶ Phase 4 (Dogfood + roadmap update)
   │
   └─▶ Phase 2 (depends on Phase 1)
```

- **Phase 1** is the foundation. No other phase can start until it's GREEN.
- **Phase 2** depends on Phase 1.
- **Phase 3** depends on Phase 2 (Playwright drives the live fixture).
- **Phase 4** is the dogfood gate, runs last.

---

## Phase 1: `createConversationHistory` primitive

**Objective:** Ship the orchestrator helper in `packages/theo/src/server/`.

### T1.1 — Create `create-conversation-history.ts`

#### Objective

Implement the function that resolves a stable `agentId` from (explicit | session | cookie | fresh UUID) and returns an `@usetheo/sdk` `Agent` via `Agent.getOrCreate(agentId, options)`.

#### Evidence

- SDK `Agent.getOrCreate` is fully implemented and tested (verified in `agent.ts:279-296`).
- `messages.jsonl` persistence is automatic per `agent-session.ts:38-55`.
- TheoKit `setCookie`/`getCookie` already battle-tested via `createSessionManager` (`session.ts:96-103`).
- `defineAgentEndpoint` provides `request` to the handler (`define-agent-endpoint.ts:28-34`), so the primitive can read the existing cookie. Writing the cookie requires the `Response` object — for SSE, we use a "deferred Set-Cookie" approach via `Headers` on the response wrapper.
- `crypto.randomUUID()` is Node 19+ Web Standard. TheoKit's `engines` constraint already requires Node ≥ 22.12 (item #3 preflight), so it's available.

#### Files to edit

```
packages/theo/src/server/create-conversation-history.ts          — (NEW) the orchestrator
packages/theo/src/server/index.ts                                — export createConversationHistory + ConversationHistoryArgs type
tests/unit/create-conversation-history.test.ts                   — (NEW) 8 unit tests with mock Agent.getOrCreate
tests/unit/create-conversation-history.test-d.ts                 — (NEW) 3 type tests
```

#### Deep file dependency analysis

- **`packages/theo/src/server/create-conversation-history.ts`** (NEW) — Pure orchestration. Imports `getCookie` from `./cookies.js`. Type-imports the SDK's `Agent` (structural). Uses Node 22+ `crypto.randomUUID`.
- **`packages/theo/src/server/index.ts`** — Add the export after `streamAgentRun`. Same export pattern as `defineAgentTool` (item #4).
- **Tests** — Mock the SDK's `Agent.getOrCreate` via dependency injection (the primitive accepts a `_agentFactory` private arg for testing) OR via `vi.mock('@usetheo/sdk')`. Prefer DI to avoid module-level mocks bleeding into other tests.

#### Deep Dives

**Data structure:**

```typescript
export interface ConversationHistoryArgs {
  /** Request — for reading the conversation cookie. */
  request: Request | { headers?: { cookie?: string } | Headers; signal?: AbortSignal }
  /**
   * Response-like surface that accepts a `Set-Cookie` header. The primitive
   * appends a Set-Cookie line when issuing a new conversation id. Pass
   * `{ headers: new Headers() }` for tests; in production code, pass
   * a wrapper that the SSE response merges before sending headers.
   *
   * If absent, the primitive STILL reads the existing cookie but cannot
   * issue a new one — useful for read-only contexts.
   */
  response?: { headers: Headers }
  /** Explicit override — wins over session/cookie/uuid. */
  agentId?: string
  /** Auth session containing a `conversationId` field, optional. */
  session?: { conversationId?: string } | null
  /** SDK AgentOptions forwarded to Agent.getOrCreate. apiKey + model required. */
  options: SdkAgentOptions
  /** Cookie name override. Default: 'theo_conversation'. */
  cookieName?: string
  /** Cookie max-age in seconds. Default: 30 days. */
  cookieMaxAge?: number
}

export interface ConversationHistoryResult {
  /** The SDK Agent, ready to receive `agent.send(message)`. */
  agent: SdkAgent
  /** The resolved conversation id (useful for logging / debugging). */
  conversationId: string
  /** True when the id was newly generated (no prior cookie / session). */
  isNew: boolean
}
```

`SdkAgentOptions` and `SdkAgent` are structural-only types (mirror of SDK's `AgentOptions` and `SDKAgent` minimum surfaces).

**Algorithm:**

```typescript
// EC-1 (edge case review — MUST FIX): the agentId becomes a filesystem path
// component (`<cwd>/.theokit/agents/<agentId>/messages.jsonl`) inside the SDK.
// I grep'd the SDK — `Agent.getOrCreate` does NOT validate the char set. An
// attacker setting `Cookie: theo_conversation=../../../etc/passwd` could
// trigger arbitrary-path writes; an `agentId` with CRLF would inject HTTP
// headers via Phase 2's `setCookie`. The same regex kills both attacks.
const AGENT_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/
function isValidAgentId(s: string | undefined | null): s is string {
  return typeof s === 'string' && AGENT_ID_REGEX.test(s)
}

export async function createConversationHistory(
  args: ConversationHistoryArgs,
): Promise<ConversationHistoryResult> {
  const cookieName = args.cookieName ?? 'theo_conversation'
  const cookieMaxAge = args.cookieMaxAge ?? 60 * 60 * 24 * 30 // 30d

  // 1. Resolve agentId per ADR D3 — sources are validated; invalid values
  //    fall through (treated as "missing") rather than throw.
  let conversationId: string | undefined
  let isNew = false

  if (isValidAgentId(args.agentId)) {
    conversationId = args.agentId
  } else if (isValidAgentId(args.session?.conversationId)) {
    conversationId = args.session!.conversationId
  } else {
    const cookieValue = readCookieValue(args.request, cookieName)
    if (isValidAgentId(cookieValue)) {
      conversationId = cookieValue
    }
  }

  if (conversationId === undefined) {
    conversationId = crypto.randomUUID()
    isNew = true
    // Try to issue a Set-Cookie via the response-like surface.
    if (args.response !== undefined) {
      const cookie = serializeCookie(cookieName, conversationId, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: cookieMaxAge,
        path: '/',
      })
      args.response.headers.append('set-cookie', cookie)
    }
  }

  // 2. Resolve the agent via SDK (lazy import to avoid SDK runtime cost
  //    for consumers that never call this primitive).
  //
  // EC-2 (edge case review — MUST FIX): the SDK is an optional peer; if
  // the consumer never installed it, `import('@usetheo/sdk')` throws
  // `ERR_MODULE_NOT_FOUND`. Re-throw with an actionable message so the
  // log says "install the SDK" instead of a cryptic ESM error.
  let sdk: typeof import('@usetheo/sdk')
  try {
    sdk = await import('@usetheo/sdk')
  } catch (cause) {
    throw new Error(
      'createConversationHistory requires @usetheo/sdk. Install: pnpm add @usetheo/sdk',
      { cause },
    )
  }
  const agent = await sdk.Agent.getOrCreate(conversationId, args.options)

  return { agent, conversationId, isNew }
}
```

**Helpers (in same file):**

- `readCookieValue(request, name)` — minimal cookie parser. Reads `request.headers.cookie` (or `Headers.get('cookie')`), splits on `;`, trims, finds `name=value`. Returns `string | undefined`. ~10 LOC.
- `serializeCookie(name, value, options)` — builds `name=value; HttpOnly; SameSite=lax; Max-Age=...; Path=/`. ~10 LOC. (Could reuse `setCookie` logic, but `setCookie` writes to a `ServerResponse`, not a `Headers` — small duplication is cleaner than coupling.)

**Invariants:**

- BEFORE: caller has a request (Web `Request` or Node-like `{ headers: { cookie } }`).
- AFTER: `result.conversationId` is non-empty string; `result.agent` is a usable SDK Agent; if `result.isNew === true` AND `args.response` was provided, the response's `Headers` has a `Set-Cookie` line.
- AFTER: subsequent `agent.send(...)` calls persist turns to `<cwd>/.theokit/agents/<conversationId>/messages.jsonl` automatically (SDK's responsibility, not ours).

**Edge cases:**

- `args.agentId === ''` (empty string) — treated as "not provided", falls through to next source. (Matches the truthy-check pattern from existing TheoKit primitives.)
- `args.session = null` — explicit-null is allowed (auth flow not run). Falls through to cookie/uuid.
- `args.session.conversationId === undefined` — falls through.
- Cookie value with quotes / special chars — `readCookieValue` trims whitespace but does NOT decode. Conversation ids are UUIDs (safe ASCII) so this is fine. Documented.
- Multiple `Cookie` headers in the request — `Request.headers.get('cookie')` returns them comma-separated per RFC. Parser handles `;` AND `,` as separators.
- `args.response` is missing AND id needs to be generated — `result.isNew === true` is still set, but no Set-Cookie is issued. The next request from the same client will hit the same fallback and get a DIFFERENT id (no continuity). Documented as a caller responsibility.
- `crypto.randomUUID()` not available — Node < 19 OR ancient browser polyfill. TheoKit's engine constraint forbids Node < 22.12 so this is unreachable in production; tests use the global.
- Concurrent first-time requests from the same client — both generate different UUIDs; whichever response is processed first by the browser wins the Set-Cookie. The OTHER request's conversation becomes orphaned (no continuity from client side, but the agent still exists on disk and can be queried). Acceptable — documented edge case.
- `Agent.getOrCreate` throws (network, registry corruption) — propagates to caller. Caller wraps in try/catch via the `defineAgentEndpoint` outer generator → final `error` event.

#### Tasks

1. Create `packages/theo/src/server/create-conversation-history.ts` with the interfaces above.
2. Implement `readCookieValue` helper (RFC 6265 minimal parser).
3. Implement `serializeCookie` helper.
4. Implement `createConversationHistory` per the algorithm.
5. Use dynamic `import('@usetheo/sdk')` so consumers who never call the primitive don't load the SDK runtime.
6. Export from `packages/theo/src/server/index.ts`.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED: test_returns_existing_agent_when_cookie_present()
  Given a request with cookie 'theo_conversation=existing-uuid-123'
  And a mock Agent.getOrCreate that resolves with { id: 'existing-uuid-123' }
  When createConversationHistory(args) is called
  Then result.conversationId === 'existing-uuid-123'
  And result.isNew === false
  And Agent.getOrCreate was called with 'existing-uuid-123' as the first arg

RED: test_generates_new_uuid_when_no_cookie_no_session_no_explicit_id()
  Given a request with no cookie
  And a response with empty Headers
  When createConversationHistory(args) is called
  Then result.conversationId matches /^[0-9a-f-]{36}$/
  And result.isNew === true
  And response.headers.get('set-cookie') matches /theo_conversation=[0-9a-f-]{36}; HttpOnly; SameSite=lax; Max-Age=2592000; Path=\//

RED: test_explicit_agentId_wins_over_session_and_cookie()
  Given args.agentId = 'explicit-id'
  And args.session = { conversationId: 'session-id' }
  And a request with cookie 'theo_conversation=cookie-id'
  When createConversationHistory(args) is called
  Then result.conversationId === 'explicit-id'

RED: test_session_id_wins_over_cookie_when_no_explicit_id()
  Given args.session = { conversationId: 'session-id' }
  And a request with cookie 'theo_conversation=cookie-id'
  When createConversationHistory(args) is called
  Then result.conversationId === 'session-id'

RED: test_no_response_means_no_cookie_issued_but_id_still_generated()
  Given a request with no cookie
  And NO response in args
  When createConversationHistory(args) is called
  Then result.conversationId matches UUID regex
  And result.isNew === true
  (No assertion on cookie because response was not provided — documented behavior)

RED: test_empty_string_agentId_falls_through()
  Given args.agentId = ''
  And args.session = { conversationId: 'session-id' }
  When createConversationHistory(args) is called
  Then result.conversationId === 'session-id'

RED: test_null_session_falls_through_to_cookie()
  Given args.session = null
  And a request with cookie 'theo_conversation=cookie-id'
  When createConversationHistory(args) is called
  Then result.conversationId === 'cookie-id'

RED: test_propagates_agent_getorCreate_error()
  Given a mock Agent.getOrCreate that throws Error('registry corrupted')
  When createConversationHistory(args) is called
  Then it rejects with the same error

RED: test_rejects_path_traversal_agent_id_falls_through_to_uuid()  (EC-1)
  Given args.agentId = '../../../etc/passwd'
  And request has no cookie
  And response has empty Headers
  When createConversationHistory(args) is called
  Then result.conversationId matches /^[0-9a-f-]{36}$/ (fresh UUID — not the malicious string)
  And result.isNew === true

RED: test_rejects_crlf_in_explicit_agent_id_falls_through()  (EC-1)
  Given args.agentId = "abc\r\nSet-Cookie: evil=1"
  When createConversationHistory(args) is called
  Then result.conversationId matches UUID regex (rejected; fresh UUID generated)

RED: test_rejects_cookie_value_longer_than_128_chars_falls_through()  (EC-1)
  Given request cookie 'theo_conversation=' + 'a'.repeat(200)
  When createConversationHistory(args) is called
  Then result.conversationId matches UUID regex (rejected; fresh UUID generated)

RED: test_actionable_error_when_sdk_not_installed()  (EC-2)
  Given a runtime where `import('@usetheo/sdk')` throws ERR_MODULE_NOT_FOUND
  When createConversationHistory(args) is called
  Then it rejects with Error matching /requires @usetheo\/sdk.*pnpm add @usetheo\/sdk/

RED: test_concurrent_first_requests_each_get_their_own_uuid()  (EC-3, SHOULD TEST)
  Given two simultaneous calls with no existing cookie and independent response.headers
  When both promises resolve
  Then both result.isNew === true
  And the two conversationIds are distinct
  And both response.headers have an independent Set-Cookie line

RED: test_cookieMaxAge_zero_is_treated_as_missing_uses_30d_default()  (EC-4, SHOULD TEST)
  Given args.cookieMaxAge = 0
  When the cookie is serialized
  Then the Set-Cookie line includes Max-Age=2592000 (30d), NOT Max-Age=0
  (Decision: `??` lets 0 through which deletes the cookie immediately — almost
   certainly not the intent. Use `cookieMaxAge ?? DEFAULT` BUT also coerce
   non-positive to default.)

RED: test_readCookieValue_returns_first_match_on_duplicate_cookie_name()  (EC-5, SHOULD TEST)
  Given request.headers.cookie = 'theo_conversation=abc; theo_conversation=def'
  When readCookieValue is called
  Then it returns 'abc' (first wins; pins behavior so future refactor doesn't silently flip to last-wins)

RED (type): test_returns_agent_and_conversation_id_typed()
  When result = await createConversationHistory({...})
  Then expectTypeOf(result.agent).toMatchTypeOf<SdkAgent>()
  And expectTypeOf(result.conversationId).toEqualTypeOf<string>()
  And expectTypeOf(result.isNew).toEqualTypeOf<boolean>()

RED (type): test_accepts_minimal_options_with_apiKey_and_model()
  Given args.options = { apiKey: '...', model: { id: '...' } }
  When called
  Then it compiles without `as` casts

RED (type): test_accepts_full_options_including_tools_and_memory()
  Given args.options = { apiKey, model, tools, memory: { enabled: true } }
  When called
  Then it compiles (memory is opt-in passthrough per ADR D2)

GREEN: Implement the primitive per the algorithm above. Use dependency injection
       for SDK `Agent.getOrCreate` to enable unit testing without the SDK runtime.

REFACTOR: None expected — single-purpose orchestrator.

VERIFY:
  npx vitest run tests/unit/create-conversation-history.test.ts
  npx vitest run tests/unit/create-conversation-history.test-d.ts
```

BDD scenarios obrigatórios:
- **Happy path:** cookie present → existing agent resumed.
- **Validation error:** empty string agentId / null session → fallback works.
- **Edge case:** no response object → id generated but cookie not issued.
- **Error scenario:** SDK throws → propagates.

#### Acceptance Criteria

- [ ] `createConversationHistory` exported from `theokit/server`.
- [ ] `ConversationHistoryArgs` + `ConversationHistoryResult` type-exported.
- [ ] 11/11 tests GREEN (8 unit + 3 type).
- [ ] `pnpm tsc --noEmit` clean.
- [ ] `pnpm lint --max-warnings=0` clean.
- [ ] No `any` introduced (verify: `grep -nP '\\bany\\b' packages/theo/src/server/create-conversation-history.ts | grep -v "^[[:space:]]*\\*"`).
- [ ] Dynamic SDK import (no top-level `import { Agent } from '@usetheo/sdk'` in source).

#### DoD

- [ ] All 6 implementation tasks completed.
- [ ] All 11 tests GREEN.
- [ ] Zero TS errors.
- [ ] Zero lint warnings.
- [ ] Bundle size: client bundle unchanged (server-only primitive).

---

## Phase 2: Fixture + template scaffold update

**Objective:** Replace the `Agent.create` + `dispose` per-request pattern in `template-default` with `createConversationHistory` so the scaffold ships persistent chat by default.

### T2.1 — Update fixture chat.ts + mirror to template

#### Objective

Demonstrate conversation continuity in the canonical scaffold with a minimal diff.

#### Evidence

- Current `fixtures/template-default/server/routes/chat.ts` (66 LOC) creates+disposes per request — incompatible with continuity.
- Replacing `Agent.create` + `agent.dispose` with `createConversationHistory` removes the dispose path (the SDK keeps the agent registered for reuse) and adds a conversation id cookie.
- The fixture stays the canonical "what a new user sees first" — must show persistence by default.

#### Files to edit

```
fixtures/template-default/server/routes/chat.ts                       — refactor to createConversationHistory
packages/create-theo/templates/default/server/routes/chat.ts          — mirror
tests/unit/fixture-template-default-canonical-chat.test.ts            — update assertions to expect createConversationHistory
tests/unit/create-theo-default-template.test.ts                       — update assertions to mirror
```

#### Deep file dependency analysis

- **`fixtures/template-default/server/routes/chat.ts`** — currently uses `Agent.create({...tools: [currentTime]})` + `try { ... } finally { try { await agent.dispose() } catch (e) { ... } }`. Refactor to:
  1. Call `createConversationHistory({ request, response, options: {apiKey, model, tools: [currentTime]} })`.
  2. Drop the `dispose` block — the agent is intentionally kept alive for the next request.
  3. Surface a friendly error event when the response wrapper doesn't expose `Headers` (defensive — likely never hits in `defineAgentEndpoint`).
- **`packages/create-theo/templates/default/server/routes/chat.ts`** — byte-equal mirror (item #3's parity gate).
- **Tests** — update grep assertions:
  - REMOVE: `/agent\.dispose\(\)/` assertions
  - ADD: `/createConversationHistory\(/` assertion
  - ADD: `/conversationId/` for the optional log/debug surface
- **Anti-stack lint gate** — `tests/unit/scaffold-no-openai-anti-stack.test.ts` continues to pass (no `openai` mention introduced).

#### Deep Dives

**Response-Headers bridge for SSE:**

`defineAgentEndpoint` builds a `Response` internally. To let the route handler issue a `Set-Cookie` BEFORE the response headers commit, we need ONE of:

- **Option A (minimal):** extend `defineAgentEndpoint` to accept an optional `headers?: Headers` config that the wrapper merges into the SSE response. Caller writes to that Headers via `args.response`.
- **Option B (intrusive):** change the handler args to expose `response` directly. Larger surface change; touches type tests across item-3 and item-4.
- **Option C (caller-side):** `createConversationHistory` writes to a Headers object the caller passes; the caller then yields a synthetic `cookie` AgentEvent variant. Rejected — adds a new AgentEvent variant just for cookies; over-engineered.

**Decision: Option A.** Extend `AgentEndpointConfig` with an internal `cookieHeaders?: Headers` field that `createConversationHistory` and the handler share. The fixture creates `const cookieHeaders = new Headers()`, passes it to `createConversationHistory`, and the `defineAgentEndpoint` wrapper merges any `set-cookie` lines from that Headers into the final response.

Wait — looking again, `defineAgentEndpoint`'s handler returns events via `yield`; it doesn't return the Response directly. The Response is built by `defineAgentEndpoint` itself. The handler has no path to mutate the response headers.

Better: `defineAgentEndpoint` exposes `args.cookieHeaders: Headers` to the handler. The handler passes that into `createConversationHistory`. The wrapper merges them before constructing the Response.

This requires a small extension to `defineAgentEndpoint`:

```typescript
// In define-agent-endpoint.ts
export interface AgentEndpointHandlerArgs<TCtx = unknown, TBody = unknown> {
  // ...existing fields...
  /**
   * Cookies that should be issued on the SSE response. Append `set-cookie`
   * lines via `cookieHeaders.append('set-cookie', '...')` — they're merged
   * into the response before the stream starts.
   *
   * Used by `createConversationHistory` to issue the conversation id cookie
   * on first request.
   */
  cookieHeaders: Headers
}
```

And the wrapper:

```typescript
// In define-agent-endpoint.ts (the existing wrapper)
const cookieHeaders = new Headers()
const generator = config.handler({ ..., cookieHeaders })

// In the new Response:
const headers = new Headers(SSE_HEADERS)
for (const value of cookieHeaders.getSetCookie?.() ?? []) {
  headers.append('set-cookie', value)
}
return new Response(stream, { headers })
```

`Headers.getSetCookie()` is Node 20+ Web Standard. TheoKit's engine is ≥22.12 so it's available.

This is a **co-deliverable** of Phase 1, not Phase 2. Move it into Phase 1.

→ **Plan adjustment:** Phase 1 also extends `defineAgentEndpoint` to expose `cookieHeaders`. Phase 2 uses it.

**Updated chat.ts shape (target ≤ 75 LOC):**

```typescript
import { z } from 'zod'
import {
  defineAgentEndpoint,
  defineAgentTool,
  streamAgentRun,
  createConversationHistory,
  type AgentEvent,
} from 'theokit/server'

/**
 * Chat agent endpoint — persistent conversation via createConversationHistory.
 * Each browser tab gets a stable conversation id cookie on first visit;
 * subsequent requests resume the same agent (messages.jsonl auto-persists).
 *
 * Tool: current_time. Memory facts: opt-in via options.memory (off by default).
 * Provider: OPENROUTER_API_KEY (preferred) OR ANTHROPIC_API_KEY (direct).
 */

const currentTime = defineAgentTool({
  name: 'current_time',
  description: 'Get the current ISO timestamp on the server.',
  inputSchema: z.object({}),
  handler: () => new Date().toISOString(),
})

export const POST = defineAgentEndpoint({
  async *handler({ body, request, cookieHeaders }): AsyncGenerator<AgentEvent> {
    const safeBody =
      body !== null && typeof body === 'object' && !Array.isArray(body)
        ? (body as { message?: string })
        : {}
    const { message = '' } = safeBody
    const orKey = process.env.OPENROUTER_API_KEY
    const anKey = process.env.ANTHROPIC_API_KEY
    const apiKey = orKey !== undefined && orKey.length > 0 ? orKey : anKey
    const modelId =
      orKey !== undefined && orKey.length > 0
        ? 'openrouter/anthropic/claude-3.5-sonnet'
        : 'claude-sonnet-4-5-20250929'
    if (apiKey === undefined || apiKey.length === 0) {
      yield {
        type: 'error',
        message: 'Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY in your .env to enable the agent.',
      }
      return
    }
    const { agent } = await createConversationHistory({
      request,
      response: { headers: cookieHeaders },
      options: {
        apiKey,
        model: { id: modelId },
        tools: [currentTime],
      },
    })
    const run = await agent.send(message)
    yield* streamAgentRun(run)
    // Intentionally no agent.dispose() — the agent stays registered for the
    // next request (conversation continuity is the point).
  },
})
```

**LOC count estimate:** 50 lines including the import block and JSDoc. Well under the 75-line budget.

#### Tasks

1. Extend `define-agent-endpoint.ts` to expose `cookieHeaders: Headers` in the handler args.
2. Merge `cookieHeaders.getSetCookie()` into the SSE response Headers before yielding.
3. Add 2 unit tests in `tests/unit/define-agent-endpoint.test.ts`: cookies are forwarded; empty cookieHeaders = no extra Set-Cookie.
4. Update the fixture chat.ts to use `createConversationHistory`.
5. Mirror to the create-theokit template.
6. Update the fixture+template unit tests.

#### TDD + BDD

```
RED: test_define_agent_endpoint_exposes_cookie_headers_to_handler()
  Given a handler that calls cookieHeaders.append('set-cookie', 'foo=bar; Path=/')
  When the response is built
  Then the SSE Response.headers.getSetCookie() includes 'foo=bar; Path=/'

RED: test_define_agent_endpoint_no_cookie_when_handler_does_not_append()
  Given a handler that never touches cookieHeaders
  When the response is built
  Then Response.headers.getSetCookie() returns [] (no extra Set-Cookie lines)

RED: test_fixture_chat_imports_create_conversation_history()
  Given fixtures/template-default/server/routes/chat.ts
  When read
  Then it imports createConversationHistory from 'theokit/server'

RED: test_fixture_chat_does_not_dispose_agent_anymore()
  Given the same file
  When grep'd for /agent\.dispose\(\)/
  Then ZERO matches (agent intentionally kept alive)

RED: test_fixture_chat_passes_cookie_headers_to_create_conversation_history()
  Given the same file
  When grep'd for /createConversationHistory\([\s\S]*cookieHeaders/m
  Then >= 1 match

RED: test_template_chat_mirrors_fixture()
  Given packages/create-theo/templates/default/server/routes/chat.ts
  And fixtures/template-default/server/routes/chat.ts
  When read
  Then bodies are byte-equal modulo whitespace

RED: test_scaffold_anti_stack_still_passes()
  Given the updated fixture chat
  When the existing anti-stack test runs
  Then it still passes

GREEN: Wire cookieHeaders through defineAgentEndpoint; update fixture+template.

REFACTOR: None expected.

VERIFY:
  npx vitest run tests/unit/define-agent-endpoint.test.ts
  npx vitest run tests/unit/fixture-template-default-canonical-chat.test.ts
  npx vitest run tests/unit/create-theo-default-template.test.ts
  npx vitest run tests/unit/scaffold-no-openai-anti-stack.test.ts
```

BDD scenarios obrigatórios:
- **Happy path:** cookieHeaders forwarded to Response.
- **Validation error:** handler doesn't touch cookieHeaders → no extra cookies issued.
- **Edge case:** fixture+template byte-equal preserved.
- **Error scenario:** anti-stack lint gate unchanged.

#### Acceptance Criteria

- [ ] `define-agent-endpoint.ts` extended with `cookieHeaders` arg.
- [ ] Both fixture + template `chat.ts` updated; byte-equal modulo whitespace.
- [ ] LOC of `chat.ts` ≤ 75 lines.
- [ ] 7/7 tests GREEN (2 new for defineAgentEndpoint, 5 updated for fixture/template).
- [ ] Existing item-3 + item-4 tests still GREEN (`grep -c 'Tests' tests/unit/define-agent-endpoint.test.ts`).
- [ ] `pnpm tsc --noEmit` clean in fixture.

#### DoD

- [ ] All 6 implementation tasks completed.
- [ ] All 7 tests GREEN.
- [ ] Item-3 + item-4 regression: zero failures.
- [ ] Anti-stack lint still GREEN.

---

## Phase 3: Playwright spec — continuity across reload

**Objective:** Prove the wire end-to-end in real Chromium against a real LLM (or, in CI, against the friendly fake-key error event).

### T3.1 — Playwright continuity test

#### Objective

Open chat, send 2 messages, reload tab, send 3rd — assert the conversation cookie persisted AND `messages.jsonl` reflects 5 turns. Even in fake-key mode (no real LLM), the error events ARE persisted as turns; the cookie continuity assertion is what matters.

#### Evidence

- The existing `tests/e2e/template-default-canonical-chat.spec.ts` has 5 tests covering item-3 + item-4. Adding 2 new ones keeps the spec coherent.
- Browser cookie persistence works automatically in Playwright (page.context().cookies()).
- Asserting `messages.jsonl` content would require filesystem peek — out of scope; cookie assertion + 2-send round-trip is enough proof.

#### Files to edit

```
tests/e2e/template-default-canonical-chat.spec.ts       — append 2 new tests
playwright.config.ts                                    — no change (fixture port 3470 already configured)
```

#### Deep file dependency analysis

- The spec already collects console errors via `collectConsoleErrors`. Reuse.
- New tests:
  1. `item-5 — conversation cookie issued on first POST` — open page, send a message, assert `theo_conversation` cookie exists in `page.context().cookies()` with `HttpOnly: true` and value matching UUID regex.
  2. `item-5 — conversation persists across reload (cookie survives)` — send msg, get cookie value, reload, send msg, assert cookie value unchanged.

#### Tasks

1. Append 2 tests to the existing describe block.
2. Run the spec; expect 5 (existing) + 2 (new) = 7 passing.

#### TDD + BDD

```
RED: test_e2e_conversation_cookie_issued_on_first_post()
  Given a fresh browser context (no cookies)
  When the page loads and the user sends a message
  Then page.context().cookies() includes one named 'theo_conversation'
  And the cookie value matches /^[0-9a-f-]{36}$/i
  And cookie.httpOnly === true

RED: test_e2e_conversation_id_unchanged_after_reload()
  Given the user sent a first message → cookie A issued
  When the page is reloaded
  And the user sends a second message
  Then page.context().cookies() still includes 'theo_conversation' with the same value A

  Note (EC-6): both specs MUST await the SSE error/message text becoming visible
  BEFORE reading page.context().cookies(). The cookie is committed when response
  headers commit (before stream starts), but Playwright needs the body activity
  to reliably surface the cookie via context().cookies(). Skipping the wait
  → ~5% flake.

GREEN: The implementation in Phase 1 + 2 already supports this; tests just verify.

REFACTOR: None.

VERIFY:
  CI=true npx playwright test --project=template-default-canonical-chat
```

BDD scenarios obrigatórios:
- **Happy path:** cookie issued on first POST.
- **Validation error:** cookie format is valid UUID.
- **Edge case:** reload preserves cookie value.
- **Error scenario:** (covered implicitly — error events still issue cookies — same wire path).

#### Acceptance Criteria

- [ ] Spec has 7 total tests in the describe block.
- [ ] 7/7 PASS in CI mode in 2 consecutive runs (flake check).
- [ ] No new console errors introduced.

#### DoD

- [ ] All 2 tasks completed.
- [ ] 7/7 Playwright GREEN x 2 runs.

---

## Phase 4: Dogfood QA (mandatory)

**Objective:** Validate end-to-end that conversation continuity works as a real user would experience it.

### T4.1 — Run dogfood + update roadmap

#### Objective

Execute `/dogfood full`, capture findings, update `CLAUDE.md` macro roadmap row 5.

#### Evidence

- Item-3 + item-4 dogfood reports (`docs/audit/dogfood-2026-05-22.md`, `docs/audit/dogfood-2026-05-22-item-4.md`) are templates.
- Global DoD requires health ≥ 70.

#### Files to edit

```
docs/audit/dogfood-{YYYY-MM-DD}-item-5.md            — (NEW) the report
CLAUDE.md                                            — mark item #5 ✅ Done with evidence pointers
CHANGELOG.md                                         — add [Unreleased] entry under Added
```

#### Tasks

1. Execute `/dogfood full`.
2. Capture Health Score + item-5-specific validation table.
3. Save to `docs/audit/dogfood-{YYYY-MM-DD}-item-5.md`.
4. Update `CLAUDE.md` item #5 → ✅ Done.
5. Update `CHANGELOG.md` [Unreleased] → Added: `createConversationHistory` primitive.

#### TDD + BDD

```
RED: test_dogfood_health_score_at_least_70()
  Given the dogfood report
  When parsed
  Then Health Score >= 70/100
  And zero plan-caused CRITICAL

RED: test_changelog_unreleased_entry_present()
  Given CHANGELOG.md
  When grep'd in [Unreleased]
  Then 'createConversationHistory' is mentioned in 'Added'

RED: test_roadmap_item_5_marked_done()
  Given CLAUDE.md
  When the line '| 5 |' is read
  Then it contains '✅ Done'
  And links to docs/audit/dogfood-{date}-item-5.md

GREEN: Run /dogfood full and update the 3 files.

REFACTOR: N/A.

VERIFY:
  test -f docs/audit/dogfood-$(date +%Y-%m-%d)-item-5.md
  grep "createConversationHistory" CHANGELOG.md
  grep "^| 5 |.*✅ Done" CLAUDE.md
```

BDD scenarios obrigatórios:
- **Happy path:** dogfood ≥ 70, roadmap updated.
- **Validation error:** if dogfood < 70, plan-caused issues enumerated.
- **Edge case:** Node 22-only phases (3, 17) still blocked — documented as pre-existing.
- **Error scenario:** Playwright fails → fix before declaring done.

#### Acceptance Criteria

- [ ] Dogfood report at `docs/audit/dogfood-{YYYY-MM-DD}-item-5.md`.
- [ ] Health Score ≥ 70.
- [ ] Zero plan-caused CRITICAL.
- [ ] `CLAUDE.md` row 5 marked ✅ Done with evidence.
- [ ] `CHANGELOG.md` Added entry present.

#### DoD

- [ ] All 5 tasks completed.
- [ ] All 3 tests pass.
- [ ] Loop promise is genuinely TRUE.

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Conversation persistence primitive | T1.1 | `createConversationHistory` orchestrates `Agent.getOrCreate` + cookie bridge |
| 2 | Stable agent id resolution (explicit/session/cookie/uuid) | T1.1 (ADR D3) | 4-step fallback chain |
| 3 | Anonymous visitor continuity (no auth required) | T1.1 + T2.1 | Cookie auto-issued on first hit |
| 4 | Authenticated visitor continuity (multi-device) | T1.1 (ADR D3 step 2) | `args.session.conversationId` overrides cookie |
| 5 | Zero-config default | T2.1 + ADR D2 | Memory layer opt-in; conversation history always-on via SDK |
| 6 | Cookie issued BEFORE SSE response commits | T2.1 (defineAgentEndpoint extension) | `cookieHeaders: Headers` arg merged pre-stream |
| 7 | Type-safe surface | T1.1 (type tests) | `expectTypeOf` pins return shape |
| 8 | Demonstrable in default scaffold | T2.1 | Fixture + template updated |
| 9 | E2E proof — continuity across reload | T3.1 | Playwright spec |
| 10 | Backward compat with item-3 + item-4 chat | T1.1 (additive primitive) | Existing chat.ts compiles unchanged when primitive not imported |
| 11 | No new persistence layer (SDK owns it) | ADR D1 | Pure orchestration; no fs touches |
| 12 | No bundled embedding cost (Memory opt-in) | ADR D2 | `options.memory` passthrough |
| 13 | Cookie is not encrypted (perf decision) | ADR D4 | Raw cookie; auth flow remains separate |
| 14 | Roadmap status reflects shipped work | T4.1 | CLAUDE.md item #5 marked ✅ |
| 15 | Dogfood gate | T4.1 | Mandatory phase |
| 16 | Fixture proof | T2.1 + T3.1 | Updated fixture + Playwright spec |
| 17 | EC-1 — path traversal + header injection via cookie/explicit agentId | T1.1 (algorithm + 3 tests) | `isValidAgentId` regex `^[a-zA-Z0-9_-]{1,128}$` at all 3 entry points; reject silently (fall through to UUID) |
| 18 | EC-2 — cryptic ESM error when SDK not installed | T1.1 (algorithm + test) | Wrap `import('@usetheo/sdk')` in try/catch; throw actionable "Install: pnpm add @usetheo/sdk" |
| 19 | EC-3 — concurrent first-requests race | T1.1 (SHOULD TEST) | Test pins independent UUIDs + independent Set-Cookies |
| 20 | EC-4 — `cookieMaxAge: 0` deletes cookie immediately | T1.1 (SHOULD TEST + algorithm tweak) | Coerce non-positive to default 30d |
| 21 | EC-5 — duplicate cookie name → first vs last wins ambiguity | T1.1 (SHOULD TEST) | Test pins first-wins |
| 22 | EC-6 — Playwright cookie read races SSE completion | T3.1 (SHOULD TEST + wait) | Both specs await error/message visibility before `context().cookies()` |
| 23 | EC-7 — SDK cold-start hydration tax | DOCUMENT | Out of scope; future SDK optimization |
| 24 | EC-8 — abandoned conversations accumulate forever | DOCUMENT | Out of scope; manual `Agent.delete` for known-stale ids until GC ships |
| 25 | EC-9 — serverless silently loses persistence | DOCUMENT | Tied to item #7 (deploy adapter validation) |

**Coverage: 25/25 gaps covered (100%)** — including 2 MUST FIX + 4 SHOULD TEST + 3 DOCUMENT from edge-case-plan review.

**Edge case review:** `docs/reviews/edge-case-plan/item-5-conversation-history-edge-cases-2026-05-22.md` — full audit with rationale, sourced grep of SDK code confirming the SDK does not validate agentId chars.

## Global Definition of Done

- [ ] All 4 phases completed (1 → 2 → 3 → 4 sequential)
- [ ] All RED → GREEN tests passing (~20 new tests across phases)
- [ ] Zero TypeScript errors (`tsc --noEmit` clean across `packages/theo`)
- [ ] Zero lint warnings (`eslint --max-warnings=0`)
- [ ] Backward compatibility preserved (item-3 + item-4 chat continues to compile and run)
- [ ] Code-audit checks passing across `packages/theo/src/server/`
- [ ] `CHANGELOG.md [Unreleased]` updated with item #5 entry
- [ ] `CLAUDE.md` macro roadmap item #5 marked `✅ Done` with evidence
- [ ] **Fixture proof** — `fixtures/template-default/` exercises continuity; Playwright asserts cookie survives reload
- [ ] **Dogfood QA PASS** — `/dogfood full` health ≥ 70, zero plan-caused CRITICAL
- [ ] LOC delta in `chat.ts` ≤ +10 lines vs item-4 baseline (66 lines → ≤ 75 lines)
- [ ] Bundle delta: client bundle unchanged; server bundle ≤ +3 KB gzipped (orchestrator is small)

## Final Phase: Dogfood QA (MANDATORY)

> Runs AFTER all 3 implementation phases. The plan is NOT done until dogfood passes.

**Objective:** Validate end-to-end that adding the primitive doesn't regress anything AND that the fixture demonstrates persistence as advertised.

### Execution

```
/dogfood full
```

Plus a **manual smoke** for this plan:

```bash
cd /home/paulo/Projetos/usetheo/theokit/fixtures/template-default
echo "OPENROUTER_API_KEY=sk-or-v1-<key>" > .env
pnpm dev
# (in another terminal)
# First request — no cookie, expect Set-Cookie in response
curl -i -X POST http://localhost:5173/api/chat \
  -H "Content-Type: application/json" -H "X-Theo-Action: 1" \
  -d '{"message":"My name is Paulo. Remember this."}' 2>&1 | grep -i 'set-cookie\|theo_conversation'
# Extract conversation id from Set-Cookie. Then second request with that cookie:
curl -X POST http://localhost:5173/api/chat \
  -H "Content-Type: application/json" -H "X-Theo-Action: 1" \
  -H "Cookie: theo_conversation=<id>" \
  -d '{"message":"What is my name?"}'
# EXPECT: SSE wire includes a message event with "Paulo" in the content.
# ALSO verify: ls .theokit/agents/<id>/messages.jsonl exists and has 4 lines
```

### Acceptance Criteria

- [ ] Health score ≥ 70/100.
- [ ] Zero plan-caused CRITICAL.
- [ ] Manual smoke above passes (or the message persistence is visible in `messages.jsonl` even if LLM hallucinates).
- [ ] Existing pre-Node-22 limitations remain documented.

### If Dogfood Fails

1. Identify which issues are caused by this plan vs pre-existing.
2. Fix plan-caused CRITICAL + HIGH before declaring complete.
3. Re-run `/dogfood full`.

---

## Out of scope (intentional)

- **Multi-process conversation sharing.** `<cwd>/.theokit/agents/<id>/messages.jsonl` is local-filesystem. Horizontal scaling (multiple Node processes) requires a shared filesystem or an SDK plugin that swaps the storage backend. Out of scope.
- **Serverless deploy targets with read-only fs.** Vercel Edge / CF Workers (without R2 binding) can't use the default persistence. Documented as a limitation; tied to item #7 (deploy adapter validation).
- **Conversation reset / delete endpoint.** Users may want a "start over" button. The SDK has `Agent.delete(agentId)`. Wiring a TheoKit primitive for this is item-6 or later.
- **Memory facts UI surface.** The SDK's facts memory has `memory_search` / `memory_get` tools. Exposing those in TheoUI is item-6 territory.
- **Encrypted cookie option.** Per ADR D4, the conversation id is non-secret. Consumers wanting encryption derive the id from `createSessionManager.getSession(req)?.conversationId` and pass it explicitly via `args.agentId`.
- **Per-route conversation partitioning.** All chat routes share the same `theo_conversation` cookie by default. Consumers wanting per-route partition pass `cookieName: 'theo_conversation_routeX'`.
- **Cross-tab synchronization.** Two tabs from the same browser share the cookie → same conversation. No additional sync logic.
