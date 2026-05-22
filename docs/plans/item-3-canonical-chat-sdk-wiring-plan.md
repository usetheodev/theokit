# Plan: Item #3 — Canonical `chat.ts` wires `@usetheo/sdk`

> **Version 1.0** — Replace the `import { OpenAI }` mock in the default scaffold with a 6-line snippet that calls `@usetheo/sdk` `Agent.prompt` directly. Ship a small SDK PR (`throwOnError: true` option in `AgentOptions`) so the snippet collapses from 10 lines (status-check pattern) to 6 lines (try/catch pattern). Add a Node ≥ 22.12 preflight to `create-theokit` so users don't hit cryptic SDK runtime errors. Outcome: `npm create theokit my-app && pnpm add @usetheo/sdk && echo ANTHROPIC_API_KEY=… >> .env && pnpm dev` produces a working chat thread without the developer ever importing a raw provider SDK.

## Context

**What exists today:**
- Default scaffold (`packages/create-theo/templates/default/server/routes/chat.ts` + `fixtures/template-default/server/routes/chat.ts`) ships a **mock** that yields 3 hardcoded `AgentEvent`s. The comment example points at `import { OpenAI } from 'openai'` — violating the locked stack assumption (TheoKit always wires `@usetheo/sdk`, see [[project-stack-deps]]).
- `@usetheo/sdk` is NOT a `dependencies` of the scaffold's `package.json.tmpl`. Tutorial requires an explicit `pnpm add @usetheo/sdk` step.
- `Agent.prompt(message, options)` returns `Promise<RunResult>` where `result.status` may be `'error'` and `result.result` may be `undefined`. A naive `result.result ?? ''` snippet silently swallows API rejections (verified empirically 2026-05-22 with `sk-ant-fake-for-tutorial`: Anthropic returned 401, SDK wrapped it as `{ status: 'error', error: { message: 'Anthropic API error: auth_failed (HTTP 401)', code: 'anthropic_auth_failed', provider: 'anthropic' } }`, but `result.result === undefined` would render `''` to the user with no error path).
- SDK declares `engines.node: ">=22.12.0"`. Users on Node 20 hit cryptic `node:sqlite` / `better-sqlite3` ABI mismatch errors mid-chat without any preflight warning.
- Item #1 of the macro roadmap (`useAgentStream` sends `X-Theo-Action: 1`) is **already done** (`agent-stream-core.ts:75`, commit `ffa93b6`), so CSRF strict default (`packages/theo/src/config/schema.ts:154`) does not block the client-side flow.

**Evidence** (from item #2 empirical experiment, documented in `theokit/CLAUDE.md` § "Frictions surfaced by item #2"):
- Real curl trace: `POST /api/chat` with fake key → `data: {"type":"error","message":"Anthropic API error: auth_failed (HTTP 401)"}` proves the SSE wire works end-to-end when the snippet branches on `result.status`.
- 10-line snippet shipped in `README.md` "Your first agent in 5 minutes" (item #2 done 2026-05-22).
- 4 frictions enumerated in CLAUDE.md require this item to resolve them: comment anti-stack, SDK not a default dep, naive snippet trap, Node version preflight.

**Why now:** Item #3 is the first **Phase B (Convergence)** item; it consumes the open frictions that item #2 surfaced. Items #4 (`defineAgentTool`) and #5 (`createConversationHistory`) depend on the SDK + scaffold being canonically wired — without this, every later wrapper inherits the same confusion.

## Objective

`npm create theokit my-app && pnpm add @usetheo/sdk && echo ANTHROPIC_API_KEY=… >> .env && pnpm dev` produces a working chat thread using the canonical 6-line `Agent.prompt({ throwOnError: true })` snippet, with no `import { OpenAI }` artefact in the scaffold, no Node-version cryptic crash, and no silent-error snippet trap.

Specific measurable goals:
1. SDK ships `throwOnError?: boolean` on `AgentOptions`; default `false` (non-breaking). When `true`, `Agent.prompt` throws `AgentRunError` (extends `TheokitAgentError`) carrying `code` + `message` + `provider` + `raw`.
2. Default scaffold's `chat.ts` (both `fixtures/template-default/` and `packages/create-theo/templates/default/`) calls `Agent.prompt(message, { apiKey, model, throwOnError: true })` in a `try/catch` — 6 lines essence.
3. Scaffold `package.json.tmpl` ships `@usetheo/sdk: ^1.0.0` as a `dependencies` entry by default (no manual `pnpm add` step).
4. `create-theokit` CLI prints a clear preflight error and exits with code 1 if `process.version` < 22.12.0.
5. `README.md` tutorial updates to show the 6-line essence (after SDK PR lands).
6. Empirical reproduction: clean scaffold → preflight passes → mock-replace is exactly the snippet in `README.md` → real Anthropic key → live chat works; fake key → AgentErrorCard renders the SDK's exact error message.

## ADRs

### D1 — Add `throwOnError?: boolean` to `AgentOptions` instead of changing default behaviour

- **Decision:** Extend `AgentOptions` with an optional `throwOnError?: boolean` (default `false`). When `true`, `Agent.prompt` (and `Agent.create` + `agent.send` + `run.wait` path) reject the returned promise with an `AgentRunError` carrying the full error metadata, instead of resolving with `{ status: 'error', error }`.
- **Rationale:** Three options were considered.
  - (a) **Change the default** to throw on error: breaks every existing SDK consumer that branches on `result.status`. Rejected — breaking change for trivial sugar.
  - (b) **Return a different `result.result` type** (e.g., `string | null` instead of `string | undefined`): forces narrowing but doesn't simplify the snippet meaningfully (still need to branch). Rejected — UX neutral.
  - (c) **Add `throwOnError` opt-in option**: zero-risk additive change. Tutorial uses the opt-in form (6 lines: `try { await Agent.prompt(…, { throwOnError: true }) } catch (err) { yield … }`). Documentation continues to teach the status-check pattern as the lower-level escape hatch.
- **Consequences:** SDK gains 1 new option. New error class `AgentRunError` in `@usetheo/sdk` errors hierarchy. Tutorial snippet drops 3 lines (status check + fallback). Long-term: opens path to consider flipping the default at SDK v2.0 with a migration shim — out of scope here.

### D2 — Scaffold ships `@usetheo/sdk` as a default dep (not opt-in)

- **Decision:** `packages/create-theo/templates/default/package.json.tmpl` includes `"@usetheo/sdk": "^1.0.0"` under `dependencies`.
- **Rationale:** Per the locked stack assumption ([[project-stack-deps]]), TheoKit's default scaffold consumes the SDK. Making it an opt-in `pnpm add` step adds a tutorial step that 100% of users hit and 0% want to skip. The bundle cost is zero (SDK is server-side only, never reaches the client bundle — verified by absence of `@usetheo/sdk` in any `app/` import).
- **Consequences:** First `pnpm install` after `create-theokit` pulls SDK + its peers (sqlite drivers). Marginal disk hit, no runtime hit. Mocks in `chat.ts` keep working without SDK calls — the mock returns hardcoded events; the SDK is dormant until the developer wires `Agent.prompt`.

### D3 — Tutorial snippet teaches `throwOnError: true` as canonical (not the status-check pattern)

- **Decision:** `README.md` "Your first agent in 5 minutes" snippet uses `try { await Agent.prompt(message, { ..., throwOnError: true }) } catch (err) { yield { type: 'error', message: err.message } }`.
- **Rationale:** The 6-line form is closer to the developer's mental model ("LLM call → throw → catch"). The status-check pattern (10 lines, `if (result.status === 'error')`) is a SDK-level escape hatch for users who want to handle structured errors without `try/catch` (e.g., logging path). Tutorial teaches the simpler form; SDK docs (`theokit-sdk/docs.md`) teach both.
- **Consequences:** Tutorial reads "5 lines + try/catch" instead of "10 lines + status branch". Defends against the silent-error trap empirically discovered in item #2. Sets expectation that `@usetheo/sdk` follows idiomatic Node/JS error conventions when configured to.

### D4 — Node version preflight runs at scaffold time, not at `theokit dev` time

- **Decision:** `create-theokit` CLI (`packages/create-theo/src/cli.ts`) checks `process.version` early; if `< 22.12.0`, prints actionable error (`Required: Node ≥ 22.12.0 (SDK). Got: Node X.Y.Z. Use 'nvm install 22 && nvm use 22' and retry.`) and exits 1.
- **Rationale:** Two layers were considered.
  - (a) **Runtime preflight in `theokit dev`**: catches users who downgrade Node mid-project. Higher coverage but adds a startup check to every dev boot. Rejected — too aggressive for a niche fault.
  - (b) **Scaffold-time preflight**: catches the 90% case where the user starts fresh. Tutorial's `cd my-app && pnpm dev` will succeed because the scaffold step already filtered.
- **Consequences:** Users on Node 20 see a clear error at `npx create-theokit`, before any files are written. No mid-project surprise on Node downgrade — that's a `theokit dev` enhancement for later (out of scope here, tracked as `dev-server-reliability-engineer` task).

## Dependency Graph

```
Phase 1 (SDK throwOnError + AgentRunError) ──▶ T5.0 (SDK publish to npm)
                                              │
                                              ▼
                            Phase 2 (TheoKit chat.ts canonical — fixture + template)
                                              │
                            ┌─────────────────┼─────────────────┐
                            │                                   │
                            ▼                                   ▼
            Phase 3 (Scaffold package.json.tmpl    Phase 5 T5.1 (README 6-line — needs T5.0)
             ships @usetheo/sdk)

            Phase 4 (create-theokit Node preflight) — parallel to Phases 1-3

Phase 6 (Dogfood QA — full) — depends on EVERYTHING
```

**Sequential blockers:** Phase 1 (SDK code) blocks T5.0 (publish). T5.0 blocks T5.1 (README pulls SDK from npm). Phase 2 blocks Phase 3 (template parity).
**Parallel-eligible:** Phase 4 (Node preflight) independent of all others. Phases 2 and 3 can be parallel after Phase 1 lands locally (workspace symlink).

---

## Phase 1: SDK — `throwOnError` option + `AgentRunError`

**Objective:** Extend `@usetheo/sdk` so `Agent.prompt` can throw on error instead of returning `{ status: 'error' }`. Additive, non-breaking, documented in `theokit-sdk/docs.md` + CHANGELOG.

### T1.1 — Add `AgentRunError` to SDK errors hierarchy

#### Objective
Add a new error class `AgentRunError` (extends `TheokitAgentError`) that carries `code` + `provider` + `raw` from a failed `RunResult`. Exported publicly from `@usetheo/sdk`.

#### Evidence
- Existing hierarchy (`theokit-sdk/packages/sdk/src/errors.ts`) has `AuthenticationError`, `RateLimitError`, `ConfigurationError`, `NetworkError`, `UnknownAgentError`, `UnsupportedRunOperationError` — all extending `TheokitAgentError`. New class follows the same shape (no new hierarchy per ADR D65 of the SDK).
- Empirical: `RunResult.error` carries `{ message: 'Anthropic API error: auth_failed (HTTP 401)', code: 'anthropic_auth_failed', provider: 'anthropic', raw: '{...}' }` — these fields go into the new error.

#### Files to edit
```
theokit-sdk/packages/sdk/src/errors.ts — add AgentRunError class
theokit-sdk/packages/sdk/src/index.ts  — export AgentRunError
theokit-sdk/packages/sdk/tests/errors-agent-run-error.test.ts — RED + GREEN (NEW)
```

#### Deep file dependency analysis
- **`errors.ts`**: today exports the hierarchy described above. New class joins the file; no existing exports change. Downstream: `index.ts` re-exports.
- **`index.ts`**: today exports all error classes. Adding `AgentRunError` is a one-line append. Downstream: any consumer (TheoKit included) gains the new public type.
- **`tests/errors-agent-run-error.test.ts`** (NEW): RED tests for instanceof + field shape.

#### Deep Dives
- **`AgentRunError` shape:**
  ```ts
  export class AgentRunError extends TheokitAgentError {
    override readonly name: string = 'AgentRunError'
    readonly provider?: string
    readonly raw?: string
    constructor(message: string, opts: { code: ErrorCode; provider?: string; raw?: string; cause?: unknown }) {
      super(message, { code: opts.code, cause: opts.cause })
      this.provider = opts.provider
      this.raw = opts.raw
    }
  }
  ```
- **Invariants:** `AgentRunError instanceof TheokitAgentError === true`. `.code` is the SDK's stable error code (e.g., `'anthropic_auth_failed'`). `.provider` is the provider id from the original `RunResult.error.provider`.
- **Edge case:** if `RunResult.error` lacks `provider` or `raw` (some error paths), the constructor accepts undefined; serialized JSON omits the field.

#### Tasks
1. Add `AgentRunError` class to `theokit-sdk/packages/sdk/src/errors.ts` after `UnknownAgentError`.
2. Append `AgentRunError` to the `export { … }` block in `theokit-sdk/packages/sdk/src/index.ts`.
3. Create `theokit-sdk/packages/sdk/tests/errors-agent-run-error.test.ts` with the RED tests below.
4. Run vitest, confirm RED.
5. Implement minimal code; run vitest, confirm GREEN.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     it('AgentRunError is instanceof TheokitAgentError', ...) — Given new AgentRunError('x', { code: 'agent_run_failed' }), Then `instanceof TheokitAgentError === true` (MUST fail before class exists)
RED:     it('AgentRunError carries provider + raw fields', ...) — Given new AgentRunError('x', { code: 'agent_run_failed', provider: 'anthropic', raw: '{"e":1}' }), Then .provider === 'anthropic' AND .raw === '{"e":1}'
RED:     it('AgentRunError.code surfaces in caught error', ...) — Given try { throw new AgentRunError('x', { code: 'rate_limited' }) } catch (e), Then e.code === 'rate_limited'
RED:     it('AgentRunError is exported from @usetheo/sdk barrel', ...) — import { AgentRunError } from '../../src/index.js'; expect(typeof AgentRunError === 'function')
GREEN:   Add the class to errors.ts + re-export from index.ts
REFACTOR: None expected — class is leaf, no shared state
VERIFY:  pnpm --filter @usetheo/sdk test tests/errors-agent-run-error.test.ts
```

**BDD scenarios:**
- **Happy path:** Construct `AgentRunError` with all fields → all fields readable + `instanceof` chain works.
- **Validation error:** Construct without `code` → TypeScript prevents at compile time (strict types).
- **Edge case:** Construct with undefined `provider` + `raw` → fields are undefined, no error.
- **Error scenario:** Throw + catch → caller can branch on `error.code` and `error.provider`.

#### Acceptance Criteria
- [ ] `AgentRunError` class added to `errors.ts`
- [ ] Re-exported from `index.ts`
- [ ] 4 RED tests above become GREEN
- [ ] `instanceof TheokitAgentError` test passes
- [ ] Pass: `pnpm --filter @usetheo/sdk tsc --noEmit`
- [ ] Pass: SDK existing test suite (zero regressions)

#### DoD
- [ ] All tasks completed and validated
- [ ] `pnpm --filter @usetheo/sdk test tests/errors-agent-run-error.test.ts` green
- [ ] `pnpm --filter @usetheo/sdk build` clean (DTS includes AgentRunError)
- [ ] `theokit-sdk/packages/sdk/CHANGELOG.md` `[Unreleased]` updated with the addition

---

### T1.2 — Add `throwOnError` to `AgentOptions` + `Agent.prompt` impl

#### Objective
Add `throwOnError?: boolean` to `AgentOptions`. When `true`, `Agent.prompt` (after `agent.send` + `run.wait`) inspects `result.status`; if `'error'`, throws `AgentRunError` instead of returning. `agent.dispose()` still runs (try/finally preserves resource hygiene).

#### Evidence
- Current `Agent.prompt` impl: `theokit-sdk/packages/sdk/src/agent.ts` — 11 lines, returns `result.wait()` directly.
- `AgentOptions` interface lives in `theokit-sdk/packages/sdk/src/types/agent.ts` line ~335.
- Empirical: a failing `Agent.prompt` returns `{ status: 'error', error: { message, code, provider, raw } }` — these are the fields the new `AgentRunError` needs to surface.

#### Files to edit
```
theokit-sdk/packages/sdk/src/types/agent.ts — add throwOnError?: boolean to AgentOptions
theokit-sdk/packages/sdk/src/agent.ts — extend Agent.prompt impl with status check + throw
theokit-sdk/packages/sdk/tests/agent-prompt-throw-on-error.test.ts — RED + GREEN (NEW)
```

#### Deep file dependency analysis
- **`types/agent.ts`**: `AgentOptions` is the contract for `Agent.create` / `Agent.prompt`. Adding `throwOnError?: boolean` is additive (no migration). Downstream: every consumer gets autocomplete on the new option.
- **`agent.ts`**: `static prompt(message, options)` body changes to (a) accept `options.throwOnError`, (b) after `run.wait()`, if `throwOnError === true && result.status === 'error'`, construct + throw `AgentRunError(result.error.message, { code: result.error.code, provider: result.error.provider, raw: result.error.raw })`. The `finally { agent.dispose() }` block is preserved.
- **`tests/agent-prompt-throw-on-error.test.ts`** (NEW): uses the SDK's existing fake-provider test infra (look at `tests/golden/agent/` for the pattern).

#### Deep Dives
- **API surface:**
  ```ts
  export interface AgentOptions {
    // ... existing fields
    /**
     * When `true`, `Agent.prompt` (and any helper that goes through `run.wait()`)
     * rejects with `AgentRunError` instead of resolving with `{ status: 'error' }`.
     * Default `false` (backwards-compatible).
     */
    throwOnError?: boolean
  }
  ```
- **`Agent.prompt` updated impl** (12 lines vs 11):
  ```ts
  static async prompt(message: string, options: AgentOptions): Promise<AgentPromptResult> {
    const agent = await Agent.create(options)
    try {
      const run = await agent.send(message)
      const result = await run.wait()
      if (options.throwOnError === true && result.status === 'error' && result.error !== undefined) {
        throw new AgentRunError(result.error.message, {
          code: result.error.code,
          provider: result.error.provider,
          raw: result.error.raw,
        })
      }
      return result
    } finally {
      await agent.dispose()
    }
  }
  ```
- **Invariants:** When `throwOnError === false` (default), behaviour is byte-identical to today. When `throwOnError === true`, the resolved promise is always `status === 'finished'` (`'cancelled'` is not an error, doesn't throw).
- **Edge case:** `result.error` could theoretically be undefined even when `status === 'error'` (malformed RunResult). The check `result.error !== undefined` guards: if undefined, fall through and return — defensive.

#### Tasks
1. Add `throwOnError?: boolean` to `AgentOptions` in `types/agent.ts`.
2. Update `Agent.prompt` body in `agent.ts` per the snippet above.
3. Create `tests/agent-prompt-throw-on-error.test.ts` with RED tests.
4. Use the SDK's existing fake-provider test helpers (`tests/golden/agent/`) to mock a 401.
5. Verify RED → GREEN cycle.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     it('throwOnError=true: throws AgentRunError on 401', ...) — Given fake provider returning 401, When Agent.prompt(msg, { ..., throwOnError: true }), Then promise rejects with instanceof AgentRunError + .code includes 'auth' + .provider matches
RED:     it('throwOnError=true: still returns result on success', ...) — Given fake provider returning 200, When Agent.prompt(msg, { ..., throwOnError: true }), Then resolved value has status==='finished' AND result.result is defined
RED:     it('throwOnError=false: returns status=error (no throw)', ...) — Given fake provider returning 401, When Agent.prompt(msg, { ..., throwOnError: false }), Then resolves with { status: 'error', error: { ... } } (existing behaviour, regression guard)
RED:     it('throwOnError undefined: defaults to false', ...) — Given option omitted, When Agent.prompt fails, Then resolves (does NOT throw)
RED:     it('agent.dispose() runs even when throwOnError throws', ...) — Spy on dispose; trigger throw; expect dispose to have been called
RED (EC-2): it('throwOnError=true: does NOT throw on cancelled status', ...) — Given run cancelled mid-flight (abort signal), When throwOnError=true, Then resolves with { status: 'cancelled' } — cancel ≠ error
RED (EC-3): it('throwOnError=true: skipped when result.error is undefined (malformed RunResult)', ...) — Given fake RunResult { status: 'error', error: undefined }, When throwOnError=true, Then resolves (defensive guard fires, no AgentRunError constructed from undefined)
GREEN:   Add the option to type + the branch + AgentRunError throw in Agent.prompt
REFACTOR: Extract the error-construction snippet to a private helper if used elsewhere (likely yes — Agent.create + agent.send path might need same logic later; mark as TODO if not done here)
VERIFY:  pnpm --filter @usetheo/sdk test tests/agent-prompt-throw-on-error.test.ts
```

**BDD scenarios:**
- **Happy path:** opt-in works; success returns normally.
- **Validation error:** N/A (option is boolean, TypeScript validates).
- **Edge case:** option omitted → existing behaviour preserved.
- **Error scenario:** opt-in fails → throws AgentRunError; dispose still runs.

#### Acceptance Criteria
- [ ] `AgentOptions.throwOnError?: boolean` declared with JSDoc
- [ ] `Agent.prompt` honours the option per spec
- [ ] All 5 RED tests above GREEN
- [ ] Existing `Agent.prompt` tests unchanged (zero regression)
- [ ] Pass: `pnpm --filter @usetheo/sdk tsc --noEmit`
- [ ] Pass: full SDK suite green except pre-existing Node-22-only tests (sqlite ABI; documented in earlier session)

#### DoD
- [ ] All tasks completed
- [ ] `theokit-sdk/docs.md` updated — `Agent` section gets a paragraph + `throwOnError` row in options table
- [ ] `theokit-sdk/packages/sdk/CHANGELOG.md` `[Unreleased]` updated:
  ```
  ### Added
  - `AgentOptions.throwOnError?: boolean` — when true, `Agent.prompt` rejects
    with `AgentRunError` (new public class) instead of resolving with
    `{ status: 'error' }`. Default false (non-breaking).
  ```
- [ ] `pnpm --filter @usetheo/sdk build` — DTS includes new option + new error class

---

## Phase 2: TheoKit — Canonical `chat.ts` using SDK

**Objective:** Update both copies of the default scaffold (`fixtures/template-default/` for tests, `packages/create-theo/templates/default/` for `create-theokit`) so `server/routes/chat.ts` uses the 6-line `Agent.prompt({ throwOnError: true })` pattern. Remove every `import { OpenAI }` reference from comments.

### T2.1 — Canonical `chat.ts` in `fixtures/template-default/`

#### Objective
Rewrite `fixtures/template-default/server/routes/chat.ts` to use `@usetheo/sdk` `Agent.prompt(message, { ..., throwOnError: true })` in a `try/catch`. Update comment to point at the SDK pattern, not OpenAI.

#### Evidence
- Empirical experiment from item #2: this exact wiring works against real Anthropic and surfaces fake-key errors as SSE `data: {"type":"error","message":"..."}`.
- Restored fixture (item #2 cleanup) currently has the mock.

#### Files to edit
```
fixtures/template-default/server/routes/chat.ts — rewrite (NEW body, same export name)
fixtures/template-default/package.json — add @usetheo/sdk to dependencies
pnpm-workspace.yaml — append '../theokit-sdk/packages/sdk' so the workspace resolves the SDK symlink
```

#### Deep file dependency analysis
- **`chat.ts`**: today is the 3-yield mock. After: 6-line `try { Agent.prompt(...) } catch { yield error }`. Tested via `tests/integration/fixture-template-default-*.test.ts` if such test exists, otherwise a new playwright spec (T2.2).
- **`package.json`**: today lacks `@usetheo/sdk`. After: add `"@usetheo/sdk": "workspace:*"`. Downstream: `pnpm install` must succeed; SDK symlinks into `node_modules/@usetheo/sdk`.
- **`pnpm-workspace.yaml`**: add sibling SDK path. Will warn if `../theokit-sdk/packages/sdk` doesn't exist on a contributor's machine, but won't fail (pnpm tolerates missing workspace globs).

#### Deep Dives
- **Canonical 6-line snippet** (the body of the handler):
  ```ts
  const { message = '' } = (body ?? {}) as { message?: string }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) { yield { type: 'error', message: 'Set ANTHROPIC_API_KEY in .env.' }; return }
  try {
    const result = await Agent.prompt(message, { apiKey, model: { id: 'claude-sonnet-4-5-20250929' }, throwOnError: true })
    yield { type: 'message', content: result.result ?? '' }
  } catch (err) {
    yield { type: 'error', message: err instanceof Error ? err.message : String(err) }
  }
  ```
- **Invariants:** zero `import { OpenAI }` in the file (grep gate in T2.3 lint check). Mock semantics gone — the file is no longer a "demo that works without API key"; it requires `ANTHROPIC_API_KEY` to render meaningful content.
- **Edge case:** missing API key surfaces a friendly `AgentErrorCard` (yield `{ type: 'error', message: 'Set ANTHROPIC_API_KEY in .env.' }`).

#### Tasks
1. Rewrite `chat.ts` body with the 6-line snippet.
2. Add `"@usetheo/sdk": "workspace:*"` to `fixtures/template-default/package.json` `dependencies`.
3. Append sibling SDK path to `pnpm-workspace.yaml`.
4. `pnpm install` and confirm SDK symlinked into `fixtures/template-default/node_modules`.
5. Run any existing template-default integration test to confirm no regression.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_canonical_chat_imports_sdk() — Given fixtures/template-default/server/routes/chat.ts, When grep, Then contains 'import { Agent } from '@usetheo/sdk'' AND does NOT contain 'openai'
RED:     test_canonical_chat_uses_throw_on_error() — Given chat.ts, When read, Then contains 'throwOnError: true' AND contains 'try {' / 'catch'
RED:     test_canonical_chat_handles_missing_api_key() — Given chat.ts handler called with empty env, Then first yielded event has type==='error' AND message contains 'ANTHROPIC_API_KEY'
RED:     test_fixture_package_json_includes_sdk() — Given fixtures/template-default/package.json parsed, Then dependencies['@usetheo/sdk'] === 'workspace:*'
RED (EC-4): test_chat_handles_non_object_body() — Given POST with body='raw string' or body=[1,2,3], When handler runs, Then yields { type: 'error', message: /expected.*object/i }. Update snippet to guard via `typeof body === 'object' && !Array.isArray(body)` before cast.
RED (EC-5): test_chat_handles_empty_agent_reply() — Given Agent.prompt resolves with { status: 'finished', result: undefined }, When handler runs, Then yields { type: 'message', content: '' } (no throw, empty content acceptable)
GREEN:   Apply the file edits + pnpm install
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/fixture-template-default-canonical-chat.test.ts
```

**BDD scenarios:**
- **Happy path:** real API key + valid message → `result.result` yielded as message.
- **Validation error:** empty body → message default `''`, agent receives empty prompt (acceptable; provider handles).
- **Edge case:** missing `ANTHROPIC_API_KEY` → yields error with actionable text.
- **Error scenario:** invalid API key → `AgentRunError.message` yielded via the catch branch as `{ type: 'error', message: 'Anthropic API error: auth_failed (HTTP 401)' }`.

#### Acceptance Criteria
- [ ] `chat.ts` body matches the 6-line snippet
- [ ] `@usetheo/sdk` listed in `fixtures/template-default/package.json`
- [ ] `pnpm install` clean (no missing-peer warning for `@usetheo/sdk`)
- [ ] `grep -c "openai" fixtures/template-default/server/routes/chat.ts` → 0
- [ ] All 4 RED tests GREEN
- [ ] `npx tsc --noEmit` in `fixtures/template-default/` shows no new errors (pre-existing layout/page errors documented separately)

#### DoD
- [ ] All tasks done
- [ ] `pnpm dev` boots in `fixtures/template-default/` with `ANTHROPIC_API_KEY` set; live curl to `/api/chat` returns valid SSE event
- [ ] Tests above green
- [ ] No regression in full `pnpm test` suite

---

### T2.2 — Integration test for canonical chat fixture (Playwright)

#### Objective
Add a Playwright spec that boots `fixtures/template-default/` with a fake `ANTHROPIC_API_KEY`, opens the page in headless Chromium, types into the composer, hits Send, and asserts the rendered `AgentErrorCard` shows the 401 message.

#### Evidence
- Item #2 manual curl proved the wire works. Playwright spec automates the dev → UI roundtrip.
- Existing pattern: `tests/e2e/template-default.spec.ts` (already covers other scenarios for the same fixture).

#### Files to edit
```
tests/e2e/template-default-canonical-chat.spec.ts (NEW) — Playwright spec
```

#### Deep file dependency analysis
- **`template-default-canonical-chat.spec.ts`** (NEW): mirrors the existing template-default spec pattern (`test.beforeAll` boots dev server with env var, `test` interacts with `ChatComposer`, `expect` looks at rendered `AgentErrorCard`).

#### Deep Dives
- **Test outline:**
  1. `beforeAll`: spawn `pnpm exec theokit dev --port 4193` with `ANTHROPIC_API_KEY=sk-ant-fake-for-playwright`.
  2. Open `http://localhost:4193/`.
  3. Wait for `ChatComposer` (`[aria-label="Message"]` or similar).
  4. Type "hello agent" + click Send (`[aria-label="Send"]`).
  5. Wait for `AgentErrorCard` rendered (data-testid or role=alert).
  6. Expect inner text to contain "auth_failed" or "401".
  7. `afterAll`: kill server.
- **Invariants:** Test is deterministic — fake key always returns 401, message stable, render stable.
- **Edge case:** if dev server boot fails (e.g., port conflict), `beforeAll` rejects with a clear message.

#### Tasks
1. Create the spec file with the outline above.
2. Run `npx playwright test tests/e2e/template-default-canonical-chat.spec.ts` (or workspace alias).
3. Confirm GREEN locally.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test('chat shows error card on auth_failed', ...) — Given dev server boots with fake ANTHROPIC_API_KEY, When user types and sends, Then AgentErrorCard renders with text matching /auth_failed|401/
RED:     test('chat composer is rendered on initial load', ...) — Given page loaded, Then ChatComposer textarea is present and focusable
RED:     test('Send button is disabled when composer empty', ...) — Given empty composer, Then Send button has aria-disabled='true' or similar
RED:     test('SSE stream surfaces single error event (no partial message)', ...) — After error, no message bubble is rendered AND error card is exactly 1
RED (EC-6): test.setTimeout(15_000) + waitFor AgentErrorCard with { timeout: 10_000 } — Anthropic call with fake key takes 1-5s; default Playwright timeout enough but explicit values prevent CI-slow flake
GREEN:   Implement spec; rely on T2.1 wiring being already done
REFACTOR: None expected — Playwright spec is a leaf
VERIFY:  npx playwright test tests/e2e/template-default-canonical-chat.spec.ts
```

**BDD scenarios:**
- **Happy path:** fake key → error card visible (we can't test real key in CI; covered by manual smoke).
- **Validation error:** empty composer → Send disabled.
- **Edge case:** server slow → loading indicator shows; test should poll, not race.
- **Error scenario:** dev server crashes mid-test → `afterAll` kills cleanly, no zombie.

#### Acceptance Criteria
- [ ] Spec file created
- [ ] 4 scenarios above pass on CI
- [ ] No flake on 5 consecutive runs
- [ ] Pass: `npx playwright test`

#### DoD
- [ ] Spec passes locally
- [ ] No zombie dev-server processes after run
- [ ] Added to `playwright.config.ts` test discovery glob (if not auto-discovered)

---

### T2.3 — Lint gate: no `import { OpenAI }` / no `openai` in scaffold templates

#### Objective
Add a unit test that greps `fixtures/template-default/` and `packages/create-theo/templates/default/` for `openai` substring; fails if found. Prevents regression to the anti-stack pattern.

#### Evidence
- Empirical: the previous mock comment used `import { OpenAI } from 'openai'`. Anyone copy-pasting the example would violate the locked stack.
- This is a "stop-the-line" guard.

#### Files to edit
```
tests/unit/scaffold-no-openai-anti-stack.test.ts (NEW)
```

#### Deep file dependency analysis
- **`scaffold-no-openai-anti-stack.test.ts`** (NEW): standalone vitest unit test that reads scaffold files and asserts absence of `openai`.

#### Deep Dives
- **Algorithm:**
  ```ts
  const FILES_TO_SCAN = [
    'fixtures/template-default/server/routes/chat.ts',
    'packages/create-theo/templates/default/server/routes/chat.ts',
  ]
  for (const file of FILES_TO_SCAN) {
    const content = readFileSync(resolve(ROOT, file), 'utf-8').toLowerCase()
    expect(content, `${file} must not reference 'openai' (locked stack: @usetheo/sdk)`).not.toContain('openai')
  }
  ```
- **Invariants:** scanning is case-insensitive; matches both `import { OpenAI }` and `openai.chat.completions.create` etc.
- **Edge case:** a future feature might legitimately mention OpenAI (e.g., comment "use OpenAI as alternative" in a docs file). For scope, scanner only touches the two scaffold chat.ts files — narrow target.

#### Tasks
1. Create the test file.
2. Run vitest; confirm RED (against pre-T2.1 state — but T2.1 is dependency, so test will be RED only between T2.1 implementation start and T2.1 GREEN).
3. After T2.1 lands, this test stays GREEN.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test('fixtures/template-default chat.ts contains no openai reference') — Given chat.ts, Then content does NOT contain 'openai' case-insensitive
RED:     test('packages/create-theo/templates/default chat.ts contains no openai reference') — same for create-theo template
RED:     test('both files reference @usetheo/sdk Agent') — Given both files, Then each contains "import { Agent }" AND "@usetheo/sdk"
RED:     test('gate file lists both targets (defends against missing file in array)') — Given test source, Then FILES_TO_SCAN.length === 2
GREEN:   T2.1 + T3.1 land their chat.ts edits → these all become GREEN
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/scaffold-no-openai-anti-stack.test.ts
```

**BDD scenarios:**
- **Happy path:** both files are canonical SDK; test passes.
- **Validation error:** if a future PR re-introduces `openai` mention, test fails before merge.
- **Edge case:** file missing → `readFileSync` throws ENOENT; test surfaces clearly.
- **Error scenario:** N/A.

#### Acceptance Criteria
- [ ] Test file created
- [ ] Both targets scanned
- [ ] 4 RED tests GREEN after T2.1 + T3.1
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] Test passes
- [ ] No false positives (case-insensitive scan working)

---

## Phase 3: Scaffold — `packages/create-theo/templates/default/`

**Objective:** Mirror the T2.1 changes into the `create-theokit` scaffold so `npx create-theokit my-app` generates the canonical chat.

### T3.1 — Canonical `chat.ts` in `packages/create-theo/templates/default/`

#### Objective
Identical body to T2.1 — apply the 6-line snippet to the template that `create-theokit` copies into new projects.

#### Evidence
- The two `chat.ts` files (fixture + scaffold template) must stay in sync; the lint test T2.3 already pins this.
- Without this, `create-theokit my-app` produces a project that violates the locked stack.

#### Files to edit
```
packages/create-theo/templates/default/server/routes/chat.ts — rewrite (same 6-line snippet as T2.1)
packages/create-theo/templates/default/package.json.tmpl — add @usetheo/sdk to dependencies
```

#### Deep file dependency analysis
- **`chat.ts`**: identical change as T2.1 (literally same content). Downstream: T2.3 lint, T3.2 dogfood.
- **`package.json.tmpl`**: today lacks `@usetheo/sdk`. After: add `"@usetheo/sdk": "^1.0.0"` (NOT `workspace:*` — published scaffold uses semver-ranged real package). Downstream: every new `create-theokit my-app` install pulls the SDK.

#### Deep Dives
- **Why `^1.0.0` here vs `workspace:*` in T2.1:** the fixture uses workspace protocol so the local SDK source links; the scaffold template ships to npm and consumers install from registry.
- **Invariants:** the two `chat.ts` files have identical bodies (modulo whitespace). Pinned by T2.3.

#### Tasks
1. Copy the T2.1 `chat.ts` body verbatim into the template path.
2. Add `"@usetheo/sdk": "^1.0.0"` to `package.json.tmpl` `dependencies` (between `theokit` and `@usetheo/ui` for diff readability).
3. Run any existing create-theo test (`tests/unit/create-theo-*.test.ts`).

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_template_default_chat_matches_fixture() — Given both chat.ts files, When compared (whitespace-normalized), Then they have identical bodies (defends drift)
RED (EC-7): test_template_default_package_includes_sdk_via_regex() — package.json.tmpl has Mustache placeholders ({{name}}) so JSON.parse FAILS. Use regex grep `/"@usetheo\/sdk":\s*"\^1/` against raw file content
RED:     test_template_default_chat_uses_throw_on_error() — Given chat.ts, Then contains 'throwOnError: true'
RED:     test_template_default_chat_does_not_mention_openai() — case-insensitive
GREEN:   Apply edits
REFACTOR: Extract shared snippet to a constant if the duplication grows (NOT needed at v1)
VERIFY:  npx vitest run tests/unit/create-theo-default-template.test.ts (or new file)
```

**BDD scenarios:**
- **Happy path:** scaffold generates canonical chat.ts; SDK in dependencies.
- **Validation error:** `package.json.tmpl` invalid JSON (template placeholder breaks parser) → test surfaces.
- **Edge case:** fixture and template drift in whitespace → test ignores whitespace, fails on real diff.
- **Error scenario:** missing file → ENOENT.

#### Acceptance Criteria
- [ ] `chat.ts` matches fixture body
- [ ] `package.json.tmpl` includes `@usetheo/sdk` dep
- [ ] 4 RED tests GREEN
- [ ] T2.3 lint test now GREEN for both files

#### DoD
- [ ] Tasks done
- [ ] `pnpm test` green
- [ ] Manual smoke: `pnpm try:scaffold && cat my-test/server/routes/chat.ts` shows the canonical snippet AND `cat my-test/package.json` shows the SDK dep

---

## Phase 4: `create-theokit` Node version preflight

**Objective:** Add a preflight check to `create-theokit` CLI that errors clearly if `process.version < 22.12.0`. Exits before writing any files.

### T4.1 — Node ≥ 22.12 preflight

#### Objective
At the entry of `create-theokit` CLI, parse `process.version`; if `< 22.12.0`, print an actionable error and exit code 1.

#### Evidence
- SDK declares `engines.node: ">=22.12.0"`. Without preflight, users on Node 20 get cryptic `better-sqlite3` ABI errors when the chat endpoint first calls `Agent.prompt`.
- Empirical: in item #2, I (Claude) am on Node 20.19.2 — the dev server still booted (Vite + TheoKit core works), but the SDK chat call failed with a confusing message buried in vite logs.

#### Files to edit
```
packages/create-theo/src/cli.ts — add preflight at entry
packages/create-theo/src/preflight-node.ts (NEW) — pure version-check function (testable)
tests/unit/create-theo-node-preflight.test.ts (NEW) — RED + GREEN
```

#### Deep file dependency analysis
- **`cli.ts`**: today parses argv + calls scaffold logic. After: first line of `main()` calls `assertNodeVersion(process.version)`. Downstream: every `npx create-theokit` invocation.
- **`preflight-node.ts`** (NEW): exports `assertNodeVersion(version: string, minimum?: string): void`. Pure function — testable without subprocess. Throws `Error` with actionable message if `version < minimum`.
- **`create-theo-node-preflight.test.ts`** (NEW): unit tests on the pure function.

#### Deep Dives
- **Algorithm:**
  ```ts
  export const MIN_NODE_VERSION = '22.12.0'

  export function assertNodeVersion(currentRaw: string, minimum: string = MIN_NODE_VERSION): void {
    // Strip leading 'v' if present (process.version is 'v22.12.0')
    const current = currentRaw.replace(/^v/, '')
    if (compareSemver(current, minimum) < 0) {
      throw new Error(
        `create-theokit requires Node ${minimum} or later (the @usetheo/sdk peer engines floor).\n` +
        `  Detected: Node ${current}\n` +
        `  Fix:      nvm install 22 && nvm use 22  (or your version manager equivalent)`
      )
    }
  }
  ```
- **`compareSemver`**: tiny inline helper, splits on `.`, parseInts, compares major → minor → patch. No `semver` package dep needed (avoids the bloat).
- **Invariants:** `assertNodeVersion('22.12.0')` does not throw. `assertNodeVersion('22.11.9')` throws. `assertNodeVersion('20.19.2')` throws. `assertNodeVersion('23.0.0')` does not throw.
- **Edge case:** pre-release versions like `'23.0.0-rc.1'` — `compareSemver` treats `'23'` > `'22'` and returns 0 for patch comparison. Acceptable.

#### Tasks
1. Create `preflight-node.ts` with `assertNodeVersion` + `compareSemver`.
2. Wire into `cli.ts` main entry.
3. RED tests on the pure function.
4. Smoke test: simulate `process.version = 'v20.19.2'` (monkey-patch in test) and assert throw with expected message.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test('Node 22.12.0 passes', ...) — Given current='22.12.0', Then no throw
RED:     test('Node 22.11.9 throws with actionable message', ...) — Given current='22.11.9', Then throws AND message contains 'nvm install 22'
RED:     test('Node 20.19.2 throws (real downgrade scenario)', ...) — Given current='20.19.2', Then throws AND message contains '22.12.0' (minimum)
RED:     test('Node 23.0.0 passes (forward compat)', ...) — Given current='23.0.0', Then no throw
RED:     test('handles v-prefix from process.version', ...) — Given current='v22.12.0', Then no throw (process.version always has v-prefix)
RED:     test('throws ONCE before any FS write', ...) — Integration: spy on writeFileSync; call cli with --version flag forced to 20; expect writeFileSync NOT called
GREEN:   Implement preflight-node.ts + cli.ts wiring
REFACTOR: None expected — pure function
VERIFY:  npx vitest run tests/unit/create-theo-node-preflight.test.ts
```

**BDD scenarios:**
- **Happy path:** Node 22.12.0+ → preflight passes → scaffold continues.
- **Validation error:** Node 22.11 → preflight throws → user sees actionable message.
- **Edge case:** weird version string (`'22.12.0-nightly'`) → parsed as 22.12.0, passes.
- **Error scenario:** Node 18 → preflight throws → scaffold writes zero files.

#### Acceptance Criteria
- [ ] `preflight-node.ts` created with `assertNodeVersion` + `MIN_NODE_VERSION`
- [ ] `cli.ts` calls it first thing in `main`
- [ ] 6 RED tests GREEN
- [ ] No `semver` package added (kept zero-dep)
- [ ] Pass: `npx tsc --noEmit`

#### DoD
- [ ] Tasks done
- [ ] Manual smoke: `node --version` on Node 20 → `npx create-theokit my-test` → prints actionable error, exit 1, no `my-test/` directory created
- [ ] Tests green

---

## Phase 5: Docs sync — `README.md` "Your first agent in 5 minutes"

**Objective:** Update the tutorial snippet from the 10-line status-check pattern to the 6-line `throwOnError: true` pattern. Updates only happen AFTER Phase 1 lands AND the SDK is published to npm (T5.0 below).

### T5.0 — Publish `@usetheo/sdk` to npm with `throwOnError` (EC-1 MUST FIX)

> **Status: DEFERRED (operator gate).** Implementation in this loop covers everything **except** the actual `pnpm publish` call. The SDK code change (T1.1 + T1.2 above) IS done, tests are green, `CHANGELOG.md [Unreleased]` is updated, `docs.md` reflects the new option. What is NOT done in the loop: the version bump + `pnpm publish` + npm registry propagation — these require real npm publish credentials operated by a human. **T5.1 in this loop uses the workspace symlink** to validate the README snippet works end-to-end against the locally-linked SDK; once T5.0 is operated externally, T5.1's snippet works for npm consumers too without any code change. The TODO is operational, not code.

#### Objective
Bump `@usetheo/sdk` minor version (additive change), publish to npm, wait for registry propagation. Required before T5.1 so the tutorial's `pnpm add @usetheo/sdk` pulls a version that contains the new option.

#### Evidence
- Without this task, the README's 6-line snippet (T5.1) fails immediately for any new user: `pnpm add @usetheo/sdk` brings the previous SDK version, TypeScript errors on `throwOnError`. EC-1 from edge-case review.

#### Files to edit
```
theokit-sdk/packages/sdk/package.json — version bump (e.g., 1.0.0 → 1.1.0)
theokit-sdk/packages/sdk/CHANGELOG.md — promote [Unreleased] to [1.1.0] with date
```

#### Deep file dependency analysis
- **`package.json`**: version field bump. Downstream: every npm install of `@usetheo/sdk` after publish.
- **`CHANGELOG.md`**: convert `[Unreleased]` section to dated `[1.1.0]`. Downstream: release notes.

#### Deep Dives
- **Why minor (1.0.0 → 1.1.0):** additive change (new optional field + new public error class). No breaking. Semver minor.
- **Release command** (per SDK's `theokit-sdk/CLAUDE.md` release policy): `pnpm --filter @usetheo/sdk publish --access public` after CI green. Verify `npm view @usetheo/sdk version` after ~1 min.

#### Tasks
1. Bump version in `theokit-sdk/packages/sdk/package.json`.
2. Promote CHANGELOG `[Unreleased]` to `[1.1.0] - YYYY-MM-DD`.
3. Commit + tag SDK side.
4. `pnpm --filter @usetheo/sdk publish`.
5. Wait + verify `npm view @usetheo/sdk@1.1.0 version` returns `1.1.0`.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_sdk_published_has_throw_on_error() — Given `npm view @usetheo/sdk@latest engines`, When response has expected version, Then version >= 1.1.0 (manual gate; not auto-test, see verification)
RED:     test_sdk_package_version_bumped() — Given theokit-sdk/packages/sdk/package.json parsed, Then version is exactly the planned bump (e.g., '1.1.0')
RED:     test_sdk_changelog_section_dated() — Given CHANGELOG, Then has section starting '## [1.1.0]' followed by ISO date
RED:     test_sdk_changelog_unreleased_emptied_or_absent() — Given CHANGELOG, Then [Unreleased] section is empty OR removed (avoid double-billing)
GREEN:   Execute bump + publish; tests pass after files updated
REFACTOR: None — release artifact
VERIFY:  pnpm view @usetheo/sdk@latest version && pnpm --filter @usetheo/sdk test
```

**BDD scenarios:**
- **Happy path:** publish succeeds → registry returns new version → TheoKit `pnpm add @usetheo/sdk` brings it.
- **Validation error:** publish fails (auth) → blocks T5.1; surface clearly.
- **Edge case:** registry cache delay → `npm view` returns old version for ~5 min; wait + retry.
- **Error scenario:** version conflict (someone else published same version) → re-bump + republish.

#### Acceptance Criteria
- [ ] SDK version bumped to next minor
- [ ] CHANGELOG dated entry
- [ ] `npm view @usetheo/sdk@<new-version>` returns the version
- [ ] `pnpm --filter @usetheo/sdk publish` exits 0
- [ ] T5.1 can proceed (blocking gate cleared)

#### DoD
- [ ] Tasks done
- [ ] Manual: `cd /tmp && mkdir t && cd t && pnpm init -y && pnpm add @usetheo/sdk && node -e "const {AgentRunError} = require('@usetheo/sdk'); console.log(!!AgentRunError)"` prints `true`

---

### T5.1 — Update README tutorial snippet to 6-line essence

#### Objective
Reduce the snippet in `README.md` § "Your first agent in 5 minutes" from 10 lines (status-check) to 6 lines (try/catch + throwOnError). Remove the "5 things to notice" bullet about checking status — it becomes the simpler try/catch idiom.

#### Evidence
- Item #2 README ships the 10-line snippet because Phase 1 hasn't landed.
- After Phase 1, the 6-line snippet is correct AND consistent with the canonical chat.ts in scaffolds (T2.1, T3.1).

#### Files to edit
```
README.md — replace the snippet + adjust the "5 things to notice" list
```

#### Deep file dependency analysis
- **`README.md`**: today has the 10-line snippet. After: 6-line snippet. Downstream: anyone reading the tutorial.

#### Deep Dives
- **6-line snippet:**
  ```typescript
  import { Agent } from '@usetheo/sdk'
  import { defineAgentEndpoint, type AgentEvent } from 'theokit/server'

  export const POST = defineAgentEndpoint({
    async *handler({ body }): AsyncGenerator<AgentEvent> {
      const { message = '' } = (body ?? {}) as { message?: string }
      const apiKey = process.env.ANTHROPIC_API_KEY!
      try {
        const result = await Agent.prompt(message, { apiKey, model: { id: 'claude-sonnet-4-5-20250929' }, throwOnError: true })
        yield { type: 'message', content: result.result ?? '' }
      } catch (err) {
        yield { type: 'error', message: err instanceof Error ? err.message : String(err) }
      }
    },
  })
  ```
- **Invariants:** snippet still 100% type-safe. Still imports only from the locked stack (`@usetheo/sdk` + `theokit/server`). Error path preserves the same `AgentEvent` shape consumers already render.
- **Edge case:** API key missing → the empty string assertion (`apiKey!`) will pass to SDK, which throws `AuthenticationError` → caught by the try/catch → user sees the SDK's error message. (Slightly less friendly than the explicit `'Set ANTHROPIC_API_KEY in .env.'` message; counterbalance: snippet is shorter. Tutorial mentions both forms.)

#### Tasks
1. Open README.md, locate the snippet, replace it with the 6-line essence.
2. Update the "5 things to notice" sub-list — drop the status-check item, add the throw-on-error item.
3. Update step durations if needed (Step 4 was "2 min"; stays 2 min — the snippet got smaller but the explanation is the same density).

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test('README tutorial snippet uses throwOnError: true') — Given README.md, When grep, Then contains 'throwOnError: true' in the "Your first agent" section
RED (EC-8): test('README tutorial snippet does NOT include status check — SCOPED to tutorial section') — Scope the grep to the section between '## Your first agent' heading and the next '## ' heading; only inside that slice assert NO `result.status` match. Avoids false positive if 'result.status' appears in a future advanced docs section.
RED:     test('README tutorial snippet still references @usetheo/sdk') — same scoped section, Then contains 'import { Agent } from '@usetheo/sdk''
RED:     test('README tutorial does NOT reference openai') — case-insensitive grep on the scoped tutorial section, Then no match
GREEN:   Apply the README edit
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/readme-tutorial-snippet.test.ts
```

**BDD scenarios:**
- **Happy path:** README has the 6-line snippet with throwOnError.
- **Validation error:** README somehow gets reverted to the OpenAI mock by a bad merge → test fails.
- **Edge case:** README structure shifts (heading text changes) → test should locate the section by heading, not line number.
- **Error scenario:** snippet block missing → test fails clearly.

#### Acceptance Criteria
- [ ] README snippet updated
- [ ] "5 things to notice" updated to match
- [ ] 4 RED tests GREEN
- [ ] No new lint warnings on README (markdownlint, if configured)

#### DoD
- [ ] Tasks done
- [ ] Tests green
- [ ] Diff between README snippet and scaffold chat.ts is whitespace-only (consistency)

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Mock comment in `chat.ts` references `import { OpenAI }` — violates locked stack | T2.1, T3.1, T2.3 | Replace + lint gate |
| 2 | `@usetheo/sdk` is not a default dep of the scaffold | T2.1 (fixture), T3.1 (template) | Add to `package.json` |
| 3 | `Agent.prompt` returns `result.result === undefined` silently on error | T1.1, T1.2, T5.1 | SDK `throwOnError` option + tutorial uses it |
| 4 | Node ≥ 22.12 required by SDK; no preflight | T4.1 | `create-theokit` preflight + clear error message |
| 5 | Tutorial canonical snippet is 10 lines (overly defensive) | T5.1 | Reduce to 6 lines using `throwOnError: true` |
| 6 | Naive "happy path" snippet engana developer (silent error) | T1.2 (SDK), T2.1, T3.1, T5.1 | Throw semantics + try/catch idiom |
| 7 | Fixture and scaffold template can drift over time | T2.3 (lint), T3.1 (test pinning identity) | Lint gate + parity test |
| 8 | New `AgentRunError` class not exported | T1.1, T1.2 | Add class + barrel export + tests |
| 9 | Playwright coverage for canonical chat round-trip | T2.2 | New spec under `tests/e2e/` |
| 10 | SDK published version on npm must contain `throwOnError` before tutorial 6-line goes live (EC-1) | T5.0 | New publish task gating T5.1 |
| 11 | Devtools pre-transform error in dev server log (cosmetic) | Out of scope — tracked separately | Separate `dev-server-reliability-engineer` task |
| 12 | Pre-existing TS errors in template default (`Badge.size`, `AgentErrorCardProps.description`, `AgentErrorCard kind="model"` runtime crash, `QuickAction.label` ReactNode→string narrow) | **FIXED 2026-05-22** during T2.2 Playwright debugging — `kind="model"` → `kind="generic"`, `description`→`detail`, `action`→`actions`, `Badge.size` removed, label typeof narrow. Playwright 3/3 green. | T2.2 spec body |

**Coverage: 11/12 gaps covered (92%)** — 1 gap (11, devtools cosmetic) explicitly deferred to other workstream.

## Global Definition of Done

- [ ] All 6 phases completed (Phase 1 SDK + Phases 2-5 TheoKit + Phase 6 Dogfood)
- [ ] All RED → GREEN tests passing (~25 new tests across phases)
- [ ] Zero TypeScript errors (`tsc --noEmit` clean in TheoKit + SDK)
- [ ] Zero lint warnings
- [ ] Backward compatibility preserved (`throwOnError` defaults to `false`; no behaviour change for existing SDK consumers)
- [ ] Code-audit checks passing across `packages/theo/`, `packages/create-theo/`, `theokit-sdk/packages/sdk/`
- [ ] `theokit-sdk/CHANGELOG.md` + `theokit-sdk/docs.md` updated
- [ ] `packages/theo/CHANGELOG.md` updated with item #3 entry
- [ ] `CLAUDE.md` macro roadmap: item #3 marked `✅ Done`
- [ ] **Fixture proof** — `fixtures/template-default/` is the reproducible fixture; Playwright spec automates the chat-error round-trip
- [ ] **Dogfood QA PASS** — `/dogfood full` health score ≥ 70, zero CRITICAL issues introduced by this plan

## Final Phase: Dogfood QA (MANDATORY)

> Runs AFTER all 5 implementation phases. The plan is NOT done until dogfood passes.

**Objective:** Validate that the canonical wiring works as a real user would experience it: fresh scaffold → preflight → install → chat → see real error / real reply.

### Execution

```
/dogfood full
```

Always full. No shortcuts.

Plus a **manual smoke** specifically for this plan:

```bash
# Clean room
rm -rf /tmp/dogfood-item-3 && cd /tmp
nvm use 20  # Force the failure path
npx --yes create-theokit dogfood-item-3
# EXPECT: error about Node ≥ 22.12, exit 1, no directory created
test ! -d /tmp/dogfood-item-3 && echo "preflight OK"

nvm use 22
npx --yes create-theokit dogfood-item-3
cd dogfood-item-3
cat package.json | grep '@usetheo/sdk'  # EXPECT: present
cat server/routes/chat.ts | grep 'throwOnError'  # EXPECT: present
cat server/routes/chat.ts | grep -i 'openai' && echo "FAIL — anti-stack leak"
pnpm install
echo "ANTHROPIC_API_KEY=sk-ant-fake" >> .env
pnpm dev &
sleep 8
curl -s -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" -H "X-Theo-Action: 1" \
  -d '{"message":"hi"}'
# EXPECT: data: {"type":"error","message":"Anthropic API error: auth_failed (HTTP 401)"}
```

### Acceptance Criteria

- [ ] Health score >= 70/100
- [ ] Zero CRITICAL issues introduced by this plan's changes
- [ ] Zero HIGH issues in `create-theokit`, scaffold, or `Agent.prompt`
- [ ] Manual smoke above passes
- [ ] Any pre-existing issues documented (not caused by this plan)

### If Dogfood Fails

1. Identify which issues are caused by this plan vs pre-existing.
2. Fix all plan-caused CRITICAL and HIGH issues before declaring complete.
3. Re-run `/dogfood full` to confirm fixes.
4. Pre-existing issues are logged but do NOT block plan completion.

---

## Cross-repo notes

This plan touches TWO repos: `theokit/` and `theokit-sdk/`. Per [[feedback-sdk-is-evolvable]], SDK changes (Phase 1) are first-class tasks in this plan, not workarounds.

- **Phase 1** lives in `theokit-sdk/`. Implement, build, test, update `theokit-sdk/docs.md` + `CHANGELOG.md`, commit on the SDK side.
- **Phases 2-5** live in `theokit/`. They DEPEND on Phase 1 being landed (workspace symlink to local SDK suffices in dev; for `npx create-theokit my-app`, the published SDK on npm must contain `throwOnError` — coordinate release timing).
- **Phase 6 (Dogfood)** validates the full cross-repo round-trip.

Stack assumption ([[project-stack-deps]]) verified across every deliverable: every scaffold path imports `@usetheo/sdk` or `@usetheo/ui`; no raw provider SDK appears as canonical.

---

## Audit trail — Edge-case review incorporation (2026-05-22)

Reviewed via `/edge-case-plan item-3-canonical-chat-sdk-wiring`. 12 edges found (1 MUST FIX, 7 SHOULD TEST, 4 DOCUMENT).

**MUST FIX incorporated:**
1. **EC-1** (SDK release timing) → New task **T5.0 — Publish `@usetheo/sdk`** added as gate between Phase 1 and T5.1. Dependency graph + Coverage Matrix updated.

**SHOULD TEST incorporated (RED tests added):**
- T1.2: +2 tests — EC-2 (cancelled status doesn't throw), EC-3 (defensive guard on `result.error === undefined`)
- T2.1: +2 tests — EC-4 (non-object body handling), EC-5 (empty agent reply)
- T2.2: +1 test — EC-6 (explicit Playwright timeout)
- T3.1: +1 test — EC-7 (package.json.tmpl parsed via regex, not JSON.parse)
- T5.1: +1 test (refined) — EC-8 (README scoped grep to tutorial section)

**DOCUMENT (accepted risks):**
- EC-9: SDK has no default timeout — SDK responsibility, not TheoKit. Tutorial will mention "stop and retry" as troubleshooting.
- EC-10: Message size cap not validated — Anthropic API returns clear error.
- EC-11: `npx create-theokit@latest` cache lag (5-10 min) — documented in CHANGELOG.
- EC-12: `Agent.dispose()` errors lose original throw — pre-existing SDK behaviour, out of scope.
