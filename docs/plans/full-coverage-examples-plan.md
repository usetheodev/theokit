# Plan: Full Coverage Examples — TheoKit 100%

> **Version 1.1** — Edge-case review applied: 3 MUST FIX incorporated (EC-1 fixtures-as-test-fixtures clarification, EC-2 production secret guard, EC-3 phase reordering). Bring the TheoKit fixture and template surface from ~42% to **100%** coverage of public API. Today, features that ship in `theokit@0.1.0-alpha.5` (including just-published `defineAgentEndpoint`, `useAgentStream`, `theokit/react-query`) have no reproducible example in the repo. 6 of 8 deploy adapters are advertised on `theokit build --target` but have no fixture. Auth/sessions/cookies have zero examples even though they're a critical MicroSaaS need. This plan adds **24 new fixtures**, **1 new template**, **migrates the `default` template to use the canonical agent APIs**, and **expands the dogfood smoke** to lock the coverage in CI. Expected outcome: every documented feature has a fixture that compiles, runs, and is checked on every dogfood pass.

## Context

**Coverage audit (2026-05-17):**

| Domain | Coverage | Notes |
|---|---|---|
| Server primitives | 5/8 (63%) | Missing: `defineChannel`, `defineAgentEndpoint`, `defineTheoIntegration` |
| Auth / Sessions / Cookies | 0/3 (0%) | `createSessionManager`, `requireAuth`, cookies — zero fixtures |
| Client primitives | 0/4 (0%) | `theoFetch` typed, `useAgentStream`, `createBatcher`, `theokit/react-query` |
| Routing | 4/7 (57%) | Missing: `loading.tsx`, dynamic `[id]`, catch-all `[...slug]` |
| SSR | 1/2 (50%) | Streaming SSR has no fixture |
| Body parser | 1/2 (50%) | Multipart upload has no fixture |
| Adapters | 2/8 (25%) | 6 deploy targets published without fixture |
| CLI commands | 3/9 (33%) | `check`, `add`, `info`, `docker`, `generate`, `routes` |
| Misc server | 1/3 (33%) | `rate-limit` and custom `transformer` |
| TheoUI integration | 0/1 fixture | Exists in `default` template but no isolated CI gate |

**Total: ~22 features covered / ~52 public API surface ≈ 42%.**

**Direct evidence:**

- `git log --oneline -- packages/theo/src/server/define-agent-endpoint.ts` → file landed in commit `4b97fee` (2026-05-17) with **zero fixtures** consuming it.
- `grep -l "defineAgentEndpoint" fixtures/` → no matches.
- `grep -l "useAgentStream" fixtures/` → no matches.
- `grep -l "createSessionManager" fixtures/ packages/create-theo/templates/` → no matches.
- `packages/create-theo/templates/default/server/routes/chat.ts` uses `defineRoute` + manual `ReadableStream` SSE assembly — i.e., the template ships an open-coded version of `defineAgentEndpoint` even though we've already published the helper. This is the most public-facing inconsistency in the project right now.
- `theokit build --target bun` advertised in `packages/theo/CHANGELOG.md` — but `fixtures/` has no Bun fixture. Same for `deno-deploy`, `cloudflare`, `vercel`, `netlify`, `aws-lambda`.

## Objective

**Every documented TheoKit feature has a fixture (or test+template) that compiles, runs, and is locked in dogfood CI.**

- 24 new fixtures created under `tests/fixtures/`
- 1 new template (`saas`) added to `packages/create-theo/templates/`
- `default` template migrated to use `defineAgentEndpoint` + `useAgentStream` (canonical APIs from alpha.5)
- Dogfood smoke expanded from 19/19 to ~43/43 with one check per new fixture
- All adapter fixtures use a **shared base app** to avoid duplication; only `theo.config.ts` differs per target
- Adapter fixtures are **compile-only** (assert emit, not deploy) — full deploy would need cloud credentials and isn't reproducible in CI

## ADRs

### D1 — Fixtures live under `tests/fixtures/`, not `examples/`

**Decision:** Continue using `tests/fixtures/` as the canonical example directory. Don't introduce a parallel `examples/` directory.

**Rationale:** The repo already has 18 fixtures under `tests/fixtures/`, integration tests reference them, and `pnpm-workspace.yaml` doesn't need to know about a separate examples path. Splitting into two directories creates drift and a second "where does this live?" decision. Naming them "fixtures" is honest — they're test fixtures that double as runnable examples.

**Consequences:** Anyone exploring the repo for usage examples needs to know to look in `tests/fixtures/`. We mitigate this with a `tests/fixtures/README.md` index that lists each fixture and what it demonstrates.

### D2 — Adapter fixtures are compile-only

**Decision:** Fixtures for `bun`, `deno-deploy`, `cloudflare`, `vercel`, `netlify`, `aws-lambda` validate that `theokit build --target X` emits the expected output files — they do **not** actually deploy to those platforms.

**Rationale:** A real deploy needs cloud credentials, costs money, and breaks the "fixture runs in CI on every PR" promise. Compile-only catches 80% of regressions (wrong entry file, broken codegen, missing config) at 0% of the cost. We've already had two regressions in adapter codegen during alpha track — compile-only would have caught both.

**Consequences:** A fixture that compiles cleanly is not proof the deploy works in production. Tracked as a known limitation in `tests/fixtures/README.md`. Real-deploy validation moves to a separate Playwright job that runs nightly with cloud credentials (out of scope for this plan).

### D3 — One base app, six adapter configs

**Decision:** All 6 adapter fixtures share a single base app (1 page + 1 server route + 1 client component). Only `theo.config.ts` `build.target` and any adapter-specific config differs.

**Rationale:** Adapter behavior is the **codegen output**, not the user code. The app itself doesn't change between Bun and Vercel. Duplicating the app across 6 fixtures creates drift (a fix in one is forgotten in 5). Shared base means a single source of truth for "what a minimal TheoKit app looks like" while still proving each adapter compiles.

**Consequences:** The 6 fixtures share a parent directory (`adapter-targets/`). Each one is a thin wrapper. Tests must be careful to validate the **emitted output** per target, not just that the app code is correct.

### D4 — Migrate template `default` to canonical APIs (breaking template behavior, not user code)

**Decision:** `packages/create-theo/templates/default/server/routes/chat.ts` is rewritten to use `defineAgentEndpoint`. `packages/create-theo/templates/default/app/page.tsx` is rewritten to use `useAgentStream`. The wire format and UX stay identical.

**Rationale:** Shipping the canonical helper (`defineAgentEndpoint`) on npm while the template scaffolds open-coded SSE is the strongest signal of distrust we could send. New users would scaffold the project, see `defineRoute` + manual `ReadableStream` framing, and conclude the helper isn't ready. We just shipped these APIs in `theokit@0.1.0-alpha.5` — the template must use them.

**Consequences:** Anyone who scaffolded with `0.1.0-alpha.4` keeps their manual SSE code working (it's still valid). Newly scaffolded `0.1.0-alpha.6` projects use the helpers. The template diff is ~20 lines per file. We bump `create-theokit` to `0.1.0-alpha.5` and `theokit` to `0.1.0-alpha.6` as part of this plan.

### D5 — One new template (`saas`), not three

**Decision:** Add a single `saas` template that demonstrates auth + sessions + postgres + an agent endpoint protected by `requireAuth`. Defer `admin`, `monorepo`, and other templates to future plans.

**Rationale:** Templates have a maintenance cost (every framework change touches every template). Three new templates is two too many for the value. `saas` is the most common MicroSaaS shape and covers the highest-value feature gap (auth + sessions). The other shapes can wait.

**Consequences:** Templates list stays at 5 (default, dashboard, api-only, postgres, **saas**). `theokit add saas` registry already has a slot.

### D6 — CLI commands tested via unit tests, not fixture projects

**Decision:** `theokit check`, `add`, `info`, `docker`, `generate`, `routes` are validated by unit tests that exercise the command handlers with stubbed filesystem and spawn — not by fixture projects.

**Rationale:** A CLI command operates on a project directory; building 6 minimal fixtures just so each command has a target adds significant directory churn for low signal. Unit tests with DI stubs already cover the command logic in `tests/unit/cli-*.test.ts`. The gap is that tests exist but **dogfood doesn't gate them** — they can be skipped or rot. This plan adds dogfood checks that grep for the test files and assert their existence.

**Consequences:** "100% example coverage" for CLI means "every command has at least one unit test that runs in CI", not "every command has a fixture project". This is honest and matches the user-facing contract (the command exists and behaves predictably).

### D7 — Every fixture has a `README.md`

**Decision:** Each fixture under `tests/fixtures/` ships with a `README.md` that explains: what feature it demonstrates, how to run it (`pnpm theokit dev`), and the expected output.

**Rationale:** Fixtures double as docs for the most curious users. The maintenance cost (one paragraph per fixture) is trivial. The discovery cost without it is huge.

**Consequences:** Plan adds 24 READMEs. Dogfood asserts that each fixture has one.

### D8 — Dogfood expanded with one check per fixture (compile + canonical assertion)

**Decision:** `scripts/dogfood-smoke.sh` grows from 19 checks to ~43. Each new check validates that a specific fixture exists, has a `README.md`, and contains the canonical API call it claims to demonstrate (`grep` assertion).

**Rationale:** The whole point of these fixtures is to **lock** the surface in CI. Without a dogfood check, a refactor that breaks the example silently regresses coverage. Greps are cheap, deterministic, and resistant to formatting changes.

**Consequences:** Dogfood runtime grows by ~3s (24 extra greps). Health score arithmetic shifts (≥80% threshold = ≥35/43). The script stays readable because checks are uniform — one block per fixture.

## Dependency Graph

```
Phase 0 (audit/snapshot)
        │
        ▼
Phase 2a (T2.2 — agent-endpoint-mock fixture) ──┐
                                                │
                                                ▼
Phase 1 (template default migration — T1.1+T1.2) ──┐
                                                   │
                       ┌───────────────────────────┘
                       ▼
              Phase 2b (T2.1, T2.3 remaining server) ──┐
              Phase 3 (auth/sessions)                  ──┤
              Phase 4 (client primitives)              ──┼──▶ Phase 11 (dogfood expand)
              Phase 5 (routing advanced)               ──┤
              Phase 6 (SSR + body parser)              ──┤
              Phase 7 (misc server)                    ──┤
              Phase 8 (adapters x6)                    ──┤
              Phase 9 (TheoUI auto-inject)             ──┘
                       │
                       ▼
              Phase 10 (saas template) ──▶ Phase 12 (Dogfood QA)
```

- **Phase 0** (snapshot) first.
- **Phase 2a** (T2.2 only — agent-endpoint-mock fixture) MUST land before Phase 1 (EC-3: template migration needs wire-format reference fixture to validate byte-compatibility).
- **Phase 1** (template migration) sequential after 2a.
- **Phase 2b** (remaining T2.1, T2.3) + **Phases 3–9** are independent and can run in parallel after Phase 1.
- **Phase 11** (dogfood expansion) depends on all fixtures existing.
- **Phase 10** (saas template) depends on Phase 3 (auth pattern) and Phase 2a (`defineAgentEndpoint` proven).
- **Phase 12** (Dogfood QA) is final.

---

## Phase 0: Snapshot and Index

**Objective:** Document the current state and provide an index file so the fixture directory stays navigable as it grows from 18 to 42 entries.

### T0.1 — Fixtures index README

#### Objective
Add `tests/fixtures/README.md` that lists every fixture with a one-line description of what it demonstrates. Provides a single discovery point.

#### Evidence
`ls tests/fixtures/` returns 18 names with no descriptions; today the only way to know what `middleware-context` demonstrates is to read its files. After this plan it grows to 42 — discovery without an index is a non-starter.

#### Files to edit
```
tests/fixtures/README.md — (NEW) index of all fixtures
```

#### Deep file dependency analysis
- **`tests/fixtures/README.md`** does not exist today. Created as a flat Markdown table. No other file depends on it; it's pure documentation.

#### Deep Dives
Format:

```markdown
# TheoKit Fixtures

Each subdirectory is a minimal TheoKit project that exercises one feature. These are **test fixtures consumed by integration tests** — NOT standalone runnable projects. `tests/fixtures/` is intentionally outside the `pnpm-workspace.yaml` member list, so fixtures don't have their own `node_modules`. They work via the monorepo's resolution walk-up.

## To exercise a fixture

```bash
# Run the integration test that drives the fixture
npx vitest run tests/integration/fixture-<name>.test.ts

# Or run all fixture tests
npx vitest run tests/integration/fixture-
```

## To use a fixture as a starting point for your own project

The fixtures show **API usage patterns**, not deployable apps. To start your own TheoKit project, use the scaffolder:

```bash
npm create theokit my-app
```

You can then copy the relevant code patterns from any fixture into your scaffolded project.

## Index

| Fixture | Demonstrates | Phase |
|---|---|---|
| basic-valid-app | minimal valid project structure | base |
| server-routes-basic | `defineRoute` with Zod | base |
| ... |
```

Invariants:
- One row per directory in `tests/fixtures/`
- Each row has a verifiable description (anyone reading should be able to predict what files the fixture contains)

Edge cases:
- Future fixture added without index entry → dogfood check fails (T9.x grep)
- Fixture renamed → index update is part of the rename PR

#### Tasks
1. Enumerate all 18 existing fixtures
2. Write one-line description for each by reading their `app/` and `server/` directories
3. Create the README with the table sorted alphabetically
4. Add dogfood check (T9.1) that asserts every directory has a matching index row

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_fixtures_index_lists_every_directory() — Given tests/fixtures/, When reading README.md, Then every subdirectory appears as a table row
RED:     test_fixtures_index_has_no_orphan_rows() — Given README rows, Then every row corresponds to an actual subdirectory (no removed fixtures still indexed)
RED:     test_fixtures_index_has_header_table() — Given README, Then it contains a Markdown table with columns: Fixture / Demonstrates / Phase
RED:     test_fixtures_index_explains_test_command() — Given README, Then it documents `npx vitest run tests/integration/fixture-` as the exercise path (EC-1: NOT `pnpm theokit dev` which would fail without workspace membership)
RED:     test_fixtures_index_points_to_scaffolder_for_standalone_use() — Given README, Then it mentions `npm create theokit` as the way to get a runnable project
GREEN:   Write README.md with all rows
REFACTOR: None expected.
VERIFY:  npx vitest run tests/unit/fixtures-index.test.ts
```

BDD scenarios:
- **Happy path** — index exists, every directory is documented, every row matches a directory
- **Validation error** — orphan row (fixture deleted but row stayed) → test fails
- **Edge case** — empty `tests/fixtures/` (no subdirs) → test passes trivially (empty table is valid)
- **Error scenario** — README missing → test asserts `fs.existsSync` fails with clear message

#### Acceptance Criteria
- [ ] `tests/fixtures/README.md` exists and lists 18 baseline fixtures
- [ ] Each row has Fixture / Demonstrates / Phase columns
- [ ] Anchored to ground truth (`fs.readdirSync('tests/fixtures')`)
- [ ] Pass: TypeScript strict (no .ts changes)
- [ ] Pass: Vitest test `tests/unit/fixtures-index.test.ts`
- [ ] Pass: Lint check (none — Markdown only)

#### DoD
- [ ] README committed
- [ ] Test green
- [ ] Dogfood check for orphan rows in place (added in T9.1)

---

## Phase 1: Template `default` Migration — Use Canonical APIs

**Objective:** The just-published `defineAgentEndpoint` and `useAgentStream` are the canonical TheoKit way to build an agent. Make the scaffolded project demonstrate them instead of open-coding the wire format.

### T1.1 — `server/routes/chat.ts` uses `defineAgentEndpoint`

#### Objective
Rewrite the mock chat route to use `defineAgentEndpoint`. Wire format identical; ~30 lines of manual SSE assembly removed.

#### Evidence
Today `packages/create-theo/templates/default/server/routes/chat.ts` does:
```ts
return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream', ... } })
```
We just shipped `defineAgentEndpoint` in `theokit/server` that does exactly this. Shipping the helper without using it in the scaffold is the #1 inconsistency in the project right now (ADR D4).

#### Files to edit
```
packages/create-theo/templates/default/server/routes/chat.ts — rewrite to use defineAgentEndpoint
tests/unit/scaffold-default-agent.test.ts — update test to grep for defineAgentEndpoint
```

#### Deep file dependency analysis
- **`server/routes/chat.ts`** in template: today wraps `defineRoute` and manually builds SSE response. After this task: imports `defineAgentEndpoint` from `theokit/server`, body becomes `async *handler() { yield event1; yield event2; yield event3 }`.
- **`scaffold-default-agent.test.ts`**: line 38 currently asserts `expect(chat).toContain("from 'theokit/server'")`. We add assertion that source contains `defineAgentEndpoint` and does NOT contain manual `new Response(.., text/event-stream)` builder.

#### Deep Dives
New `chat.ts` shape:
```ts
import { defineAgentEndpoint, type AgentEvent } from 'theokit/server'

export const POST = defineAgentEndpoint({
  async *handler({ request }) {
    const body = await request.json() as { message: string }
    yield { type: 'message', content: `Recebi: "${body.message}"` }
    yield { type: 'tool_call', name: 'search', args: { q: body.message } }
    yield { type: 'message', content: 'Pronto. (Mock — conecte seu LLM aqui.)' }
  },
})
```

Wire format unchanged: `data: {"type":"message","content":"..."}\n\n`. Headers set by helper. Abort handling for free.

Edge cases:
- User scaffolded on `0.1.0-alpha.5` and wants to migrate → compat: keep `defineRoute`+manual variant working (already does, it's just user code)
- Test for both old and new wire format are valid → keep SSE-grep loose (`text/event-stream OR data:` line)

#### Tasks
1. **PREREQUISITE (EC-3):** T2.2 (agent-endpoint-mock fixture) MUST be complete first — its integration test is the wire-format reference.
2. Rewrite `chat.ts` to use `defineAgentEndpoint`
3. Run `grep -rln "/api/chat" tests/` and confirm each existing test against the new wire format
4. Wire-format byte-comparison check: curl the new chat route in dev, capture output, diff against T2.2 fixture output. Both must produce `data: {"type":"message","content":"..."}\n\ndata: ...` with identical separators and ordering.
5. Update unit test assertions
6. Update template README mention

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_default_chat_uses_defineAgentEndpoint() — Given chat.ts, Then source contains `defineAgentEndpoint(` import
RED:     test_default_chat_no_manual_sse() — Given chat.ts, Then source does NOT contain `new Response.*event-stream`
RED:     test_default_chat_yields_agent_events() — Given chat.ts, Then handler is async generator (`async \*handler`)
RED:     test_default_chat_validates_body_message() — Given chat.ts, Then source reads `body.message` from request
GREEN:   Rewrite chat.ts
REFACTOR: Drop unused TextEncoder/ReadableStream imports
VERIFY:  npx vitest run tests/unit/scaffold-default-agent.test.ts
```

BDD scenarios:
- **Happy path** — chat.ts uses `defineAgentEndpoint` and yields 3 events
- **Validation error** — wire format must remain SSE; if generator doesn't yield AgentEvent shape, test fails
- **Edge case** — empty body (no `message` field) — handler should still respond with one error event
- **Error scenario** — runtime in dev: hitting `/api/chat` returns SSE with 3 chunks

#### Acceptance Criteria
- [ ] `chat.ts` is ≤ 25 lines (vs current ~50 lines)
- [ ] Imports `defineAgentEndpoint`
- [ ] Wire format unchanged (validated via T2.2 fixture curl)
- [ ] Pass: `tests/unit/scaffold-default-agent.test.ts`
- [ ] Pass: TypeScript strict
- [ ] Pass: Vitest green

#### DoD
- [ ] chat.ts rewritten
- [ ] All assertions updated
- [ ] Wire format byte-comparable

### T1.2 — `app/page.tsx` uses `useAgentStream`

#### Objective
Replace the manual `fetch` + `ReadableStream` + `TextDecoder` + `split('\n\n')` parser in the default page with the published `useAgentStream` hook.

#### Evidence
Today the page is ~40 lines of SSE parser logic. The hook published in alpha.5 reduces it to ~15 lines. Same reason as T1.1: ship the helper, use the helper.

#### Files to edit
```
packages/create-theo/templates/default/app/page.tsx — rewrite to use useAgentStream hook
tests/unit/scaffold-default-agent.test.ts — assert hook usage
```

#### Deep file dependency analysis
- **`app/page.tsx`**: today imports `{ useState }` from React, builds a manual SSE consumer. After: imports `useAgentStream` from `theokit/client`, state managed by hook.
- **Test**: grep that `useAgentStream` is imported and called.

#### Deep Dives
New page shape:
```tsx
'use client'
import { useState } from 'react'
import { AgentComposer, AgentTimeline, type AgentEvent as AgentRow } from '@usetheo/ui'
import { useAgentStream } from 'theokit/client'

export default function Page() {
  const [composer, setComposer] = useState('')
  const { events, send, status } = useAgentStream<{ message: string }>('/api/chat')

  const rows: AgentRow[] = events.map((e, i) => ({
    id: String(i),
    type: e.type === 'tool_call' ? 'tool' : 'command',
    label: e.type === 'message' ? e.content
         : e.type === 'tool_call' ? `tool: ${e.name}`
         : e.type === 'error' ? `error: ${e.message}`
         : e.type,
    status: e.type === 'error' ? 'failed' : 'success',
    timestamp: new Date().toISOString(),
  }))

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 24, gap: 16 }}>
      <header>
        <h1>Theo Agent</h1>
        <p>Status: {status}</p>
      </header>
      <section style={{ flex: 1, overflowY: 'auto' }}>
        <AgentTimeline events={rows} />
      </section>
      <footer>
        <AgentComposer
          value={composer}
          onValueChange={setComposer}
          onSubmit={() => { if (composer.trim()) { send({ message: composer }); setComposer('') } }}
        />
      </footer>
    </main>
  )
}
```

Edge cases:
- Hook in StrictMode (double mount) → already handled by hook's AbortController cleanup
- Composer submit while stream active → hook's `send` cancels old stream

#### Tasks
1. Rewrite page.tsx
2. Drop manual SSE parser code
3. Update tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_default_page_uses_useAgentStream() — Given page.tsx, Then source imports `useAgentStream` from 'theokit/client'
RED:     test_default_page_no_manual_parser() — Given page.tsx, Then source does NOT contain `getReader()` or `TextDecoder`
RED:     test_default_page_passes_path_to_hook() — Given page.tsx, Then `useAgentStream('/api/chat')` is called
RED:     test_default_page_maps_runtime_events_to_visual() — Given page.tsx, Then there's a map from runtime AgentEvent to AgentRow
GREEN:   Rewrite page.tsx
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/scaffold-default-agent.test.ts
```

BDD scenarios:
- **Happy path** — page uses hook and maps events to AgentTimeline rows
- **Validation error** — page must still be `'use client'` directive at top
- **Edge case** — empty `events` array → still renders empty timeline (no crash)
- **Error scenario** — hook status `error` → header text reflects it

#### Acceptance Criteria
- [ ] `page.tsx` ≤ 40 lines
- [ ] No `getReader()` or `TextDecoder` references
- [ ] Hook imported and called with `/api/chat`
- [ ] Pass: `tests/unit/scaffold-default-agent.test.ts`
- [ ] Pass: TypeScript strict

#### DoD
- [ ] page.tsx rewritten
- [ ] Manual parser code deleted

---

## Phase 2: Server Primitives — Missing Fixtures

**Objective:** Add fixtures for the three server primitives without examples: `defineChannel`, `defineAgentEndpoint`, `defineTheoIntegration`.

### T2.1 — `fixtures/define-channel/`

#### Objective
Minimal fixture demonstrating `defineChannel` for pub/sub-style WebSocket channels.

#### Evidence
`grep -rl defineChannel fixtures/` → 0 hits. The primitive is exported from `theokit/server` and listed in alpha-track changelog but has no runnable demonstration.

#### Files to edit
```
tests/fixtures/define-channel/package.json — (NEW) workspace member
tests/fixtures/define-channel/theo.config.ts — (NEW) minimal config
tests/fixtures/define-channel/index.html — (NEW)
tests/fixtures/define-channel/app/page.tsx — (NEW) connects to channel via client
tests/fixtures/define-channel/server/channels/notifications.ts — (NEW) defineChannel
tests/fixtures/define-channel/README.md — (NEW)
tests/unit/fixture-define-channel.test.ts — (NEW)
```

#### Deep file dependency analysis
- All files NEW. No existing file changes.
- `tsconfig.json` at repo root globs `tests/fixtures/**` — no edit needed.

#### Deep Dives
`defineChannel` API signature (from `packages/theo/src/server/define-channel.ts`):
- Channel has a name (route path), authorize hook, onJoin / onLeave / onMessage callbacks
- Fixture demonstrates a `notifications` channel that broadcasts to all connected clients

Edge cases:
- Channel without authorize → all connections accepted
- onMessage that throws → channel manager swallows + logs (existing behavior)

#### Tasks
1. Create fixture skeleton (package.json + theo.config.ts + tsconfig if needed)
2. Implement `server/channels/notifications.ts` with `defineChannel`
3. Implement `app/page.tsx` that connects to the channel (using browser WebSocket)
4. README explaining usage
5. Unit test asserting fixture structure

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_fixture_define_channel_exists() — Given tests/fixtures/define-channel, Then dir exists with package.json
RED:     test_fixture_uses_defineChannel_api() — Given server/channels/notifications.ts, Then file imports & calls defineChannel
RED:     test_fixture_has_authorize_hook() — Given channel source, Then authorize callback is defined
RED:     test_fixture_has_readme() — Given fixture, Then README.md explains the channel demo
GREEN:   Create files
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/fixture-define-channel.test.ts
```

BDD scenarios:
- **Happy path** — fixture compiles, channel module imports defineChannel correctly
- **Validation error** — README must mention `defineChannel`
- **Edge case** — channel route path must start with `/` (defineChannel invariant)
- **Error scenario** — missing authorize → fixture must demonstrate the default-allow behavior in README

#### Acceptance Criteria
- [ ] Fixture compiles (`tsc --noEmit` from fixture root)
- [ ] All 6 files present
- [ ] Pass: `tests/unit/fixture-define-channel.test.ts`
- [ ] Dogfood check #20 added (T9.x)

#### DoD
- [ ] Fixture created
- [ ] Tests green

### T2.2 — `fixtures/agent-endpoint-mock/`

#### Objective
Isolated fixture (not the template) that proves `defineAgentEndpoint` works end-to-end with a mock async generator. Has integration test that POSTs and reads the SSE stream.

#### Evidence
`defineAgentEndpoint` was published in alpha.5. No fixture exists. Once T1.1 lands, the template uses it — but template is for users, not for CI. A standalone fixture lets CI prove the wire format on every PR independent of TheoUI bloat.

#### Files to edit
```
tests/fixtures/agent-endpoint-mock/package.json — (NEW)
tests/fixtures/agent-endpoint-mock/theo.config.ts — (NEW)
tests/fixtures/agent-endpoint-mock/server/routes/agent.ts — (NEW) defineAgentEndpoint emitting 4 event types
tests/fixtures/agent-endpoint-mock/README.md — (NEW)
tests/integration/fixture-agent-endpoint.test.ts — (NEW) HTTP integration test
```

#### Deep file dependency analysis
- `server/routes/agent.ts`: imports `defineAgentEndpoint`, yields 4 events (one per AgentEvent variant)
- Integration test: spawns dev server (via existing `startDevServer` helper), POSTs to `/api/agent`, reads SSE chunks, asserts 4 chunks with correct shapes

#### Deep Dives
The route yields ALL 4 AgentEvent variants:
```ts
export const POST = defineAgentEndpoint({
  async *handler() {
    yield { type: 'message', content: 'hello' }
    yield { type: 'tool_call', name: 'search', args: { q: 'theo' } }
    yield { type: 'tool_result', name: 'search', data: { hits: 0 } }
    yield { type: 'error', message: 'simulated error' }
  },
})
```

This makes the fixture the **wire-format contract reference**. Anyone wanting to know "what does an AgentEvent look like on the wire?" reads this fixture.

Edge cases:
- Abort mid-stream → fixture has a second route `/api/agent-infinite` to test abort behavior
- Generator throws → covered by including `error` event in the happy path

#### Tasks
1. Create fixture
2. Write integration test using `startDevServer` + `fetch`
3. README documenting the wire format

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_agent_endpoint_fixture_responds_sse() — Given dev server, When POST /api/agent, Then response Content-Type === 'text/event-stream'
RED:     test_agent_endpoint_yields_4_events() — Given response, When reading body, Then 4 chunks each parseable as AgentEvent
RED:     test_agent_endpoint_event_types_complete() — Given chunks, Then types are exactly [message, tool_call, tool_result, error]
RED:     test_agent_endpoint_aborts_infinite_stream() — Given /api/agent-infinite + signal, When aborted, Then stream closes < 500ms
GREEN:   Implement route + fixture infra
REFACTOR: Extract SSE parser helper if reused
VERIFY:  npx vitest run tests/integration/fixture-agent-endpoint.test.ts
```

BDD scenarios:
- **Happy path** — 4 events come out in order
- **Validation error** — POST without body → 200 (no validation declared); test asserts behavior matches
- **Edge case** — empty generator → 200, no chunks (covered by unit test in `tests/unit/define-agent-endpoint.test.ts` already)
- **Error scenario** — error event is the 4th chunk; assert `type === 'error'`

#### Acceptance Criteria
- [ ] Fixture compiles
- [ ] Integration test passes (POST → 4 chunks)
- [ ] Wire format documented in README
- [ ] Dogfood check #21

#### DoD
- [ ] Fixture committed
- [ ] Integration test green
- [ ] README serves as wire-format ref

### T2.3 — `fixtures/define-integration/`

#### Objective
Fixture demonstrating `defineTheoIntegration` (build-time integration with hooks like `theo:config:setup`, `theo:build:start`).

#### Evidence
`defineTheoIntegration` was added in cross-domain-uplift. Zero fixtures consume it. Documentation says it's "the Astro Integrations pattern" but there's no place a user can point at to see it work.

#### Files to edit
```
tests/fixtures/define-integration/package.json — (NEW)
tests/fixtures/define-integration/theo.config.ts — (NEW) registers the integration
tests/fixtures/define-integration/integrations/banner.ts — (NEW) integration that injects a virtual module
tests/fixtures/define-integration/app/page.tsx — (NEW) imports the virtual module
tests/fixtures/define-integration/README.md — (NEW)
tests/unit/fixture-define-integration.test.ts — (NEW)
```

#### Deep file dependency analysis
- `integrations/banner.ts`: calls `defineTheoIntegration({ name: 'banner', hooks: { 'theo:config:setup': (ctx) => ctx.addVirtualModule('virtual:integration:banner/text', `export default "hello from integration"`) } })`
- `app/page.tsx`: imports `'virtual:integration:banner/text'` and renders it

Virtual module ID prefix invariant (EC-6 from prior plan): must start with `virtual:integration:<name>/`. Fixture demonstrates the correct prefix.

#### Deep Dives
Integration receives a context with `addVirtualModule` and `addRoute`. Fixture uses `addVirtualModule` because it's the simpler demonstration; `addRoute` is mentioned in README but not exercised (covered separately by existing unit tests in `tests/unit/vite-integrations.test.ts`).

Edge cases:
- Virtual ID prefix violation → throw (covered in unit tests, README mentions)
- Route collision → throw (covered in unit tests)

#### Tasks
1. Create fixture
2. Write integration that adds a virtual module
3. Page consumes virtual module
4. Test asserts the file structure and the virtual ID prefix usage

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_define_integration_fixture_exists() — Given dir, Then package.json + theo.config.ts present
RED:     test_integration_uses_addVirtualModule() — Given banner.ts, Then it calls addVirtualModule with 'virtual:integration:banner/' prefix
RED:     test_app_imports_virtual_module() — Given page.tsx, Then it imports 'virtual:integration:banner/text'
RED:     test_integration_registered_in_config() — Given theo.config.ts, Then integrations array includes banner
GREEN:   Create files
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/fixture-define-integration.test.ts
```

BDD scenarios:
- **Happy path** — fixture compiles, virtual module resolves at build time
- **Validation error** — bad virtual prefix would throw at config:setup; README explains
- **Edge case** — integration with no hooks → valid (no-op integration); not demonstrated but valid
- **Error scenario** — duplicate integration names → throws (covered by unit tests, doc'd in README)

#### Acceptance Criteria
- [ ] Fixture compiles
- [ ] Virtual module ID has correct prefix
- [ ] README explains the pattern
- [ ] Dogfood check #22

#### DoD
- [ ] Fixture committed
- [ ] Tests green

---

## Phase 3: Auth / Sessions / Cookies

**Objective:** Single comprehensive fixture demonstrating session management, auth, and cookies — the foundation for any real MicroSaaS.

### T3.1 — `fixtures/sessions-auth/`

#### Objective
End-to-end fixture: a login route that creates a session via `createSessionManager`, a protected route that uses `requireAuth`, and a logout route that clears the session. Uses `getCookie`/`setCookie`.

#### Evidence
0 fixtures cover any of these three primitives. They're the most common feature gap when building a SaaS. New users today have to read source code to understand the pattern.

#### Files to edit
```
tests/fixtures/sessions-auth/package.json — (NEW)
tests/fixtures/sessions-auth/theo.config.ts — (NEW)
tests/fixtures/sessions-auth/server/context.ts — (NEW) wires SessionManager into ctx
tests/fixtures/sessions-auth/server/routes/login.ts — (NEW) creates session
tests/fixtures/sessions-auth/server/routes/me.ts — (NEW) requireAuth-protected
tests/fixtures/sessions-auth/server/routes/logout.ts — (NEW) clears session
tests/fixtures/sessions-auth/app/page.tsx — (NEW) demo UI
tests/fixtures/sessions-auth/README.md — (NEW)
tests/integration/fixture-sessions-auth.test.ts — (NEW)
```

#### Deep file dependency analysis
- **`server/context.ts`**: creates a `SessionManager` instance with a hardcoded secret (`SECRET=demo-only-do-not-use`). README emphasizes this is demo-grade.
- **`server/routes/login.ts`**: POSTs username/password (Zod-validated), creates session via manager, sets cookie via `setCookie`.
- **`server/routes/me.ts`**: uses `requireAuth(ctx)` to get the session; returns 401 if absent.
- **`server/routes/logout.ts`**: deletes cookie via `deleteCookie`, invalidates session.

#### Deep Dives
Cookie config:
- name: `theo_session`
- httpOnly: true
- sameSite: 'lax'
- secure: false (demo; README warns to set true in prod)
- maxAge: 60 * 60 * 24 * 7 (7 days)

Session encryption: AES-256-GCM (existing behavior of `createSessionManager`)

**EC-2 Production secret guard (MUST FIX from edge-case review):** Implement a helper `assertProductionSecret(secret: string): void` co-located with `createSessionManager` that:
- In dev (NODE_ENV !== 'production'): emits a `console.warn` if secret matches `/CHANGE_ME|demo|placeholder/i`
- In prod (NODE_ENV === 'production'): **throws** if secret matches those patterns OR if length < 32 chars

Fixture `.env.example`:
```
# REQUIRED: replace with 32+ random chars before production deploy.
# Dev server will warn; prod server will refuse to boot.
SECRET=CHANGE_ME_TO_RANDOM_32_CHARS_OR_REFUSE_TO_BOOT
```

Edge cases:
- No cookie → `requireAuth` throws `AuthRequiredError`
- Tampered cookie → decryption fails, treated as no session
- Expired session → manager returns null
- Placeholder SECRET in production → server boot fails fast with clear error
- Placeholder SECRET in dev → console.warn each minute (idempotent)

#### Tasks
1. Create fixture skeleton
2. Implement `assertProductionSecret` helper in `packages/theo/src/server/session.ts` (or co-located file)
3. Implement context.ts with session manager (invokes assertProductionSecret on init)
4. Implement 3 routes
5. Implement page.tsx UI (form for login, button for logout, display for `/me`)
6. README with security notes
7. Integration test: login → /me → logout → /me + placeholder-secret tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_login_sets_session_cookie() — Given POST /login with valid credentials, Then response has Set-Cookie header with `theo_session=`
RED:     test_me_returns_401_without_session() — Given GET /me without cookie, Then status === 401
RED:     test_me_returns_200_with_session() — Given GET /me with valid cookie, Then status === 200 and body has username
RED:     test_logout_clears_cookie() — Given POST /logout, Then Set-Cookie has Max-Age=0
RED:     test_tampered_cookie_returns_401() — Given GET /me with mutated cookie, Then status === 401 (not 500)
RED:     test_dev_warns_on_placeholder_secret() — Given NODE_ENV !== 'production' + SECRET='CHANGE_ME...', Then console.warn is called (EC-2)
RED:     test_prod_refuses_to_boot_on_placeholder_secret() — Given NODE_ENV === 'production' + placeholder SECRET, Then assertProductionSecret throws (EC-2)
RED:     test_prod_refuses_short_secret() — Given NODE_ENV === 'production' + SECRET length < 32, Then throws (EC-2)
GREEN:   Implement routes, context, and assertProductionSecret helper
REFACTOR: Extract session config to a shared module
VERIFY:  npx vitest run tests/integration/fixture-sessions-auth.test.ts
```

BDD scenarios:
- **Happy path** — login → me → logout → me unauthorized
- **Validation error** — POST /login with missing fields → 422 (Zod)
- **Edge case** — login twice without logout → second session replaces first; cookie updated
- **Error scenario** — tampered cookie → 401, no 500 (auth gate doesn't leak crypto errors)

#### Acceptance Criteria
- [ ] All 9 files present
- [ ] Integration test passes 5 scenarios
- [ ] README has explicit "production checklist" section
- [ ] Pass: TypeScript strict
- [ ] Dogfood check #23

#### DoD
- [ ] Fixture committed
- [ ] Integration tests green
- [ ] README security warnings clear

---

## Phase 4: Client Primitives

**Objective:** Each client primitive gets a fixture or test demo. Critical because today users have to read source code to know how to use `theoFetch` (typed) or `createBatcher`.

### T4.1 — `fixtures/typed-client/`

#### Objective
Fixture demonstrating end-to-end type inference from `defineRoute` Zod schemas to `theoFetch` client calls.

#### Evidence
The pitch line "tipagem real do server até o client" has no demo. Users have to figure out the `import type { GET } from '../server/routes/users'` pattern from source code or unit tests.

#### Files to edit
```
tests/fixtures/typed-client/package.json — (NEW)
tests/fixtures/typed-client/theo.config.ts — (NEW)
tests/fixtures/typed-client/server/routes/users.ts — (NEW) GET/POST with Zod
tests/fixtures/typed-client/app/page.tsx — (NEW) consumes via theoFetch
tests/fixtures/typed-client/README.md — (NEW)
tests/unit/fixture-typed-client.test-d.ts — (NEW) type test
```

#### Deep file dependency analysis
- `server/routes/users.ts`: exports `GET` (Zod query: `search?: string`, returns `User[]`) and `POST` (Zod body: `{ name, email }`, returns `User`)
- `app/page.tsx`: `import type { GET, POST } from '../server/routes/users'` + `theoFetch<typeof GET>('/api/users', { query: { search: 'theo' } })` — TypeScript autocompletes `query.search` as string

#### Deep Dives
The type test (`test-d.ts`) is the proof:
```ts
import { expectTypeOf } from 'vitest'
import { theoFetch, type InferResponse, type InferQuery } from 'theokit/client'
import type { GET } from '../../tests/fixtures/typed-client/server/routes/users.ts'

test('GET query is inferred from Zod schema', () => {
  expectTypeOf<InferQuery<typeof GET>>().toEqualTypeOf<{ search?: string }>()
})

test('GET response is inferred from handler return type', () => {
  expectTypeOf<InferResponse<typeof GET>>().toEqualTypeOf<User[]>()
})
```

Edge cases:
- Zod refinement → inferred type stays narrow
- Response is union → inference preserves the union
- Handler returns `Response` directly → `InferResponse` returns `Response`

#### Tasks
1. Create routes with rich Zod schemas
2. Create page consuming routes via theoFetch
3. Write type tests asserting inference

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_GET_query_type_inference() — Given GET with z.object({search:z.string().optional()}), Then InferQuery is {search?: string}
RED:     test_POST_body_type_inference() — Given POST with z.object({name,email}), Then InferBody enforces both fields
RED:     test_GET_response_inference() — Given handler returns User[], Then InferResponse === User[]
RED:     test_theoFetch_call_type_check() — Given page.tsx, Then theoFetch<typeof GET> compiles with correct shape
GREEN:   Implement routes and page
REFACTOR: None
VERIFY:  npx vitest --typecheck.only run tests/unit/fixture-typed-client.test-d.ts
```

BDD scenarios:
- **Happy path** — inference works for query, body, response
- **Validation error** — wrong query shape → tsc error (this IS the test value)
- **Edge case** — optional fields with `.optional()` → inferred as `T | undefined`
- **Error scenario** — handler that throws → InferResponse still typed correctly

#### Acceptance Criteria
- [ ] Type tests pass
- [ ] Fixture compiles
- [ ] README explains the import-type pattern
- [ ] Dogfood check #24

#### DoD
- [ ] Type tests green
- [ ] Page demonstrates the autocomplete win

### T4.2 — `fixtures/use-agent-stream-react/`

#### Objective
Standalone fixture for `useAgentStream` in a React component (separate from the `default` template, which has TheoUI). Pure React, no TheoUI dep — proves the hook is usable without the visual library.

#### Evidence
`useAgentStream` is React-only but the unit tests only exercise the pure `consumeAgentStream` primitive plus source-code grep. No actual rendered React component exists.

#### Files to edit
```
tests/fixtures/use-agent-stream-react/package.json — (NEW)
tests/fixtures/use-agent-stream-react/theo.config.ts — (NEW)
tests/fixtures/use-agent-stream-react/server/routes/agent.ts — (NEW) defineAgentEndpoint
tests/fixtures/use-agent-stream-react/app/page.tsx — (NEW) plain React with useAgentStream
tests/fixtures/use-agent-stream-react/README.md — (NEW)
tests/unit/fixture-use-agent-stream-react.test.ts — (NEW)
```

#### Deep file dependency analysis
- `app/page.tsx` uses `useAgentStream` directly + native HTML (button, ul, li) — no `@usetheo/ui`
- Demonstrates the hook works in any React app

#### Deep Dives
Page shape:
```tsx
'use client'
import { useState } from 'react'
import { useAgentStream } from 'theokit/client'

export default function Page() {
  const [msg, setMsg] = useState('')
  const { events, send, status, reset } = useAgentStream<{ message: string }>('/api/agent')
  return (
    <main>
      <h1>Agent stream (no TheoUI)</h1>
      <p>Status: {status}</p>
      <ul>{events.map((e, i) => <li key={i}>{JSON.stringify(e)}</li>)}</ul>
      <input value={msg} onChange={(e) => setMsg(e.target.value)} />
      <button onClick={() => send({ message: msg })}>Send</button>
      <button onClick={reset}>Reset</button>
    </main>
  )
}
```

Edge cases:
- Component unmount mid-stream → hook AbortController fires (already unit tested)
- Multiple sends in quick succession → only last stream wins

#### Tasks
1. Create fixture
2. Implement plain React page
3. Test asserts file structure and hook usage

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_fixture_uses_useAgentStream() — Given page.tsx, Then imports useAgentStream from 'theokit/client'
RED:     test_fixture_no_theoui_dep() — Given package.json, Then deps do NOT include @usetheo/ui
RED:     test_fixture_uses_native_html() — Given page.tsx, Then has <button>, <input>, <ul> (no AgentComposer etc.)
RED:     test_fixture_demonstrates_send_and_reset() — Given page.tsx, Then both send() and reset() are wired to buttons
GREEN:   Create files
REFACTOR: None
VERIFY:  npx vitest run tests/unit/fixture-use-agent-stream-react.test.ts
```

BDD scenarios:
- **Happy path** — hook used in plain React
- **Validation error** — TheoUI must NOT be a dep (gate against accidental coupling)
- **Edge case** — empty events array → renders empty list (no crash)
- **Error scenario** — status === 'error' is reflected in UI

#### Acceptance Criteria
- [ ] No `@usetheo/ui` in deps
- [ ] Hook used directly
- [ ] Dogfood check #25

#### DoD
- [ ] Fixture committed
- [ ] Plain-React proof in place

### T4.3 — `fixtures/batching/`

#### Objective
Fixture demonstrating `createBatcher` collapsing same-microtask client calls into a single transport call.

#### Evidence
`createBatcher` is exported but no example shows the microtask-collapse behavior, which is the whole point of the primitive.

#### Files to edit
```
tests/fixtures/batching/package.json — (NEW)
tests/fixtures/batching/theo.config.ts — (NEW)
tests/fixtures/batching/server/routes/__theo_batch__.ts — (NEW) batch endpoint
tests/fixtures/batching/server/routes/users.ts — (NEW) downstream route
tests/fixtures/batching/app/page.tsx — (NEW) UI that triggers 3 simultaneous fetches
tests/fixtures/batching/README.md — (NEW)
tests/unit/fixture-batching.test.ts — (NEW)
```

#### Deep file dependency analysis
- `app/page.tsx`: creates a batcher pointing at `/api/__theo_batch__` and dispatches 3 calls in same tick
- README documents the contract: same microtask = 1 transport call

#### Deep Dives
Demonstrates EC-10 from cross-domain-uplift (per-item error isolation): one of the 3 calls fails server-side, only that promise rejects.

Edge cases:
- 32+ dispatches → splits into multiple transport calls (`max: 32` default)
- Network failure → all pending promises in that batch reject

#### Tasks
1. Create fixture with batch endpoint route
2. Page demonstrates 3-simultaneous-call pattern
3. README explains the contract

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_batching_fixture_uses_createBatcher() — Given page.tsx, Then imports createBatcher from 'theokit/client'
RED:     test_batching_endpoint_exists() — Given server/routes, Then __theo_batch__.ts is present
RED:     test_dispatches_in_same_tick_marked() — Given page source, Then dispatches are called synchronously (not awaited between)
RED:     test_readme_documents_microtask_contract() — Given README, Then mentions 'same microtask' or 'tick' boundary
GREEN:   Create fixture
REFACTOR: None
VERIFY:  npx vitest run tests/unit/fixture-batching.test.ts
```

BDD scenarios:
- **Happy path** — 3 dispatches → 1 transport call (documented behavior)
- **Validation error** — README must explain what counts as "same microtask"
- **Edge case** — single dispatch still works (no batching needed)
- **Error scenario** — per-item error isolation demonstrated

#### Acceptance Criteria
- [ ] Fixture compiles
- [ ] README explains contract
- [ ] Dogfood check #26

#### DoD
- [ ] Fixture committed

### T4.4 — `fixtures/react-query-integration/`

#### Objective
Fixture using `buildUseTheoQueryConfig` from `theokit/react-query` with actual `@tanstack/react-query`.

#### Evidence
`theokit/react-query` subpath was published in alpha.5 (this very session). No fixture consumes it. The README in `packages/theokit-react-query/` is gone now (we deleted the package).

#### Files to edit
```
tests/fixtures/react-query-integration/package.json — (NEW) includes @tanstack/react-query dep
tests/fixtures/react-query-integration/theo.config.ts — (NEW)
tests/fixtures/react-query-integration/server/routes/users.ts — (NEW) GET endpoint
tests/fixtures/react-query-integration/app/page.tsx — (NEW) useQuery + buildUseTheoQueryConfig
tests/fixtures/react-query-integration/app/layout.tsx — (NEW) wraps in QueryClientProvider
tests/fixtures/react-query-integration/README.md — (NEW)
tests/unit/fixture-react-query.test.ts — (NEW)
```

#### Deep file dependency analysis
- `app/layout.tsx`: creates `QueryClient` + wraps children in `QueryClientProvider`
- `app/page.tsx`: imports `useQuery` from tanstack, `buildUseTheoQueryConfig` from `theokit/react-query`, `theoFetch` from `theokit/client`, type-only `GET` from server route

#### Deep Dives
Key win demonstrated: **stable queryKey from inline-object query**. Page renders with a search input — typing changes `{query:{search:input}}` inline, but `stableQueryKey` produces the same key when the content matches; no infinite refetch.

Edge cases:
- React 19 + tanstack v5 ergonomics (already validated; this fixture pins the version)
- SSR: tanstack supports hydration; out of scope for this fixture (covered by ssr-streaming fixture later)

#### Tasks
1. Create fixture with deps
2. Layout sets up QueryClientProvider
3. Page demonstrates useQuery + buildUseTheoQueryConfig
4. README explains EC-10 stable key win

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_fixture_uses_subpath() — Given page.tsx, Then imports from 'theokit/react-query'
RED:     test_fixture_has_react_query_dep() — Given package.json, Then deps include @tanstack/react-query
RED:     test_layout_wraps_QueryClientProvider() — Given layout.tsx, Then JSX includes <QueryClientProvider>
RED:     test_page_uses_buildUseTheoQueryConfig() — Given page.tsx, Then it calls buildUseTheoQueryConfig
GREEN:   Create files
REFACTOR: None
VERIFY:  npx vitest run tests/unit/fixture-react-query.test.ts
```

BDD scenarios:
- **Happy path** — useQuery + adapter compose
- **Validation error** — page calls `theoFetch` with `typeof GET` for type inference
- **Edge case** — inline `{ query: { search } }` doesn't cause infinite refetch (EC-10 win)
- **Error scenario** — useQuery handles `theoFetch` errors

#### Acceptance Criteria
- [ ] Fixture compiles
- [ ] README explains stable-key win
- [ ] Dogfood check #27

#### DoD
- [ ] Fixture committed

---

## Phase 5: Routing — Missing Patterns

**Objective:** Cover `loading.tsx`, dynamic `[id]`, and catch-all `[...slug]`.

### T5.1 — `fixtures/loading-states/`

#### Objective
Fixture with `loading.tsx` per segment — demonstrates the Suspense fallback wiring.

#### Evidence
`loading.tsx` is documented but no fixture demonstrates the per-segment fallback.

#### Files to edit
```
tests/fixtures/loading-states/package.json — (NEW)
tests/fixtures/loading-states/theo.config.ts — (NEW)
tests/fixtures/loading-states/app/page.tsx — (NEW) — top-level page
tests/fixtures/loading-states/app/loading.tsx — (NEW)
tests/fixtures/loading-states/app/slow/page.tsx — (NEW) — Suspense-deferred component
tests/fixtures/loading-states/app/slow/loading.tsx — (NEW) — segment-specific fallback
tests/fixtures/loading-states/README.md — (NEW)
tests/unit/fixture-loading-states.test.ts — (NEW)
```

#### Deep file dependency analysis
- `app/slow/page.tsx`: uses `React.lazy` or `Suspense` with a deferred resource (sleep promise) so the fallback actually renders
- `app/slow/loading.tsx`: exports a default React component showing "Loading slow…"

#### Deep Dives
Routing convention recap:
- `loading.tsx` at any segment level → automatically wrapped in `<Suspense fallback={Loading}>`
- Closest `loading.tsx` wins

Edge cases:
- Missing root `loading.tsx` → no top-level fallback (acceptable)
- Async server-render fallback → covered by ssr-streaming fixture later

#### Tasks
1. Create fixture
2. Implement slow segment with deferred resource
3. Both levels of loading.tsx

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_root_loading_exists() — Given app/loading.tsx, Then file exists and exports default
RED:     test_segment_loading_exists() — Given app/slow/loading.tsx, Then file exists
RED:     test_slow_page_uses_suspense() — Given app/slow/page.tsx, Then source uses Suspense or React.lazy
RED:     test_loading_components_are_visible() — Given loading files, Then default exports are React components (function returning JSX)
GREEN:   Create files
REFACTOR: None
VERIFY:  npx vitest run tests/unit/fixture-loading-states.test.ts
```

BDD scenarios:
- **Happy path** — both loading fallbacks present and structurally valid
- **Validation error** — loading.tsx without default export → router ignores; assert default export present
- **Edge case** — segment with deferred page but no loading.tsx → falls back to parent
- **Error scenario** — error.tsx vs loading.tsx don't conflict (separate fixture covers error.tsx)

#### Acceptance Criteria
- [ ] Both loading.tsx files present
- [ ] slow/page.tsx demonstrates Suspense
- [ ] Dogfood check #28

#### DoD
- [ ] Fixture committed

### T5.2 — `fixtures/dynamic-routes/`

#### Objective
Single fixture covering both `[id]` dynamic segments and `[...slug]` catch-all.

#### Evidence
`fixtures/adapter-static/` has dynamic routes in its `static-paths.ts`, but no fixture exercises them as runtime SPA segments.

#### Files to edit
```
tests/fixtures/dynamic-routes/package.json — (NEW)
tests/fixtures/dynamic-routes/theo.config.ts — (NEW)
tests/fixtures/dynamic-routes/app/page.tsx — (NEW) index with links
tests/fixtures/dynamic-routes/app/blog/[id]/page.tsx — (NEW) dynamic segment
tests/fixtures/dynamic-routes/app/docs/[...slug]/page.tsx — (NEW) catch-all
tests/fixtures/dynamic-routes/server/routes/posts/[id].ts — (NEW) typed API with id
tests/fixtures/dynamic-routes/README.md — (NEW)
tests/unit/fixture-dynamic-routes.test.ts — (NEW)
```

#### Deep file dependency analysis
- `app/blog/[id]/page.tsx`: uses `useParams()` from react-router to read `id`
- `app/docs/[...slug]/page.tsx`: reads `slug` (array) via `useParams`
- `server/routes/posts/[id].ts`: uses `params` Zod schema for typed `id`

#### Deep Dives
Param convention:
- `[id]` → single string param
- `[...slug]` → array of strings, splits on `/`

Edge cases:
- Empty `[...slug]` → empty array; assert page renders fallback
- `[id]` with invalid value (e.g., expected number) → 422 if Zod-validated server-side

#### Tasks
1. Create fixture
2. Three page files demonstrating params
3. One server route demonstrating typed params
4. README

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_dynamic_segment_file_exists() — Given app/blog/[id]/page.tsx, Then file exists
RED:     test_catchall_segment_file_exists() — Given app/docs/[...slug]/page.tsx, Then file exists
RED:     test_server_route_typed_params() — Given posts/[id].ts, Then params schema is defined with Zod
RED:     test_pages_use_useParams() — Given dynamic pages, Then they import useParams from react-router
GREEN:   Create files
REFACTOR: None
VERIFY:  npx vitest run tests/unit/fixture-dynamic-routes.test.ts
```

BDD scenarios:
- **Happy path** — both routing patterns work
- **Validation error** — server route with bad id → Zod rejects
- **Edge case** — catch-all with empty path → params.slug === []
- **Error scenario** — page receives missing param → react-router routes elsewhere

#### Acceptance Criteria
- [ ] Both dynamic patterns present
- [ ] Typed server route param
- [ ] Dogfood check #29

#### DoD
- [ ] Fixture committed

---

## Phase 6: SSR Streaming + Multipart Upload

**Objective:** Cover streaming SSR and multipart body parsing.

### T6.1 — `fixtures/ssr-streaming/`

#### Objective
Fixture demonstrating `ssrStreaming: true` in `theo.config.ts` + Suspense boundary that streams progressively.

#### Evidence
Streaming SSR landed in cross-domain-uplift T6.1. Existing `fixtures/ssr-basic/` is single-shot only.

#### Files to edit
```
tests/fixtures/ssr-streaming/package.json — (NEW)
tests/fixtures/ssr-streaming/theo.config.ts — (NEW) ssrStreaming: true
tests/fixtures/ssr-streaming/app/page.tsx — (NEW) Suspense boundary wrapping deferred component
tests/fixtures/ssr-streaming/app/SlowFeed.tsx — (NEW) component with sleep
tests/fixtures/ssr-streaming/index.html — (NEW)
tests/fixtures/ssr-streaming/README.md — (NEW)
tests/integration/fixture-ssr-streaming.test.ts — (NEW)
```

#### Deep file dependency analysis
- `theo.config.ts`: `defineConfig({ ssrStreaming: true })`
- `app/page.tsx`: `<Suspense fallback="Loading feed..."><SlowFeed /></Suspense>`
- `app/SlowFeed.tsx`: throws a promise that resolves in 200ms (Suspense protocol)

#### Deep Dives
Integration test:
1. Build the fixture
2. Start production server
3. Open HTTP response stream
4. Assert first chunk arrives < 50ms (shell ready)
5. Assert SlowFeed content arrives < 500ms (Suspense resolved)
6. Assert `Transfer-Encoding: chunked` header

Edge cases:
- Client disconnects mid-stream → server aborts (EC-11 from prior plan)
- Stream error → 500 with `custom500Html` (if configured)

#### Tasks
1. Create fixture
2. SlowFeed using Suspense protocol
3. Integration test checking chunked headers + multi-chunk arrival

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_config_enables_streaming() — Given theo.config.ts, Then ssrStreaming: true
RED:     test_response_is_chunked() — Given production fetch /, Then Transfer-Encoding header is 'chunked'
RED:     test_shell_arrives_before_feed() — Given streamed response, Then first chunk contains shell, later chunk contains feed
RED:     test_client_abort_closes_stream() — Given client closes mid-stream, Then server stops emitting within 100ms
GREEN:   Create files
REFACTOR: None
VERIFY:  npx vitest run tests/integration/fixture-ssr-streaming.test.ts
```

BDD scenarios:
- **Happy path** — streamed response, shell first, feed second
- **Validation error** — ssrStreaming: false → single-shot (covered by ssr-basic)
- **Edge case** — Suspense boundary with no fallback → React errors; assert behavior
- **Error scenario** — feed component throws → error boundary renders, stream still closes cleanly

#### Acceptance Criteria
- [ ] Fixture builds
- [ ] Streamed response demonstrated
- [ ] Dogfood check #30

#### DoD
- [ ] Fixture committed
- [ ] Integration test green

### T6.2 — `fixtures/multipart-upload/`

#### Objective
Fixture with a route accepting multipart/form-data uploads via `parseRequestBody`.

#### Evidence
`parseRequestBody` supports multipart (via busboy on Node/Bun) but no fixture demonstrates it.

#### Files to edit
```
tests/fixtures/multipart-upload/package.json — (NEW)
tests/fixtures/multipart-upload/theo.config.ts — (NEW)
tests/fixtures/multipart-upload/server/routes/upload.ts — (NEW)
tests/fixtures/multipart-upload/app/page.tsx — (NEW) <form enctype="multipart">
tests/fixtures/multipart-upload/README.md — (NEW)
tests/integration/fixture-multipart.test.ts — (NEW)
```

#### Deep file dependency analysis
- `server/routes/upload.ts`: POST handler, calls `parseRequestBody(request)`, expects `{ file: UploadedFile, description: string }`
- `app/page.tsx`: HTML form with `<input type="file">` and a text field

#### Deep Dives
Limits demonstrated in README:
- File size limit (configurable via `BodyParserOptions`)
- Field count limit

Edge cases:
- Empty file upload → `UploadedFile.size === 0`; assert handler validates
- Multiple files with same field name → array vs single (README clarifies)
- Non-multipart POST → `parseRequestBody` returns parsed JSON

#### Tasks
1. Create fixture
2. Route handler reading file + text
3. HTML form
4. Integration test POSTing real multipart

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_multipart_route_exists() — Given upload.ts, Then exports POST
RED:     test_multipart_uses_parseRequestBody() — Given upload.ts, Then imports parseRequestBody
RED:     test_multipart_integration_upload() — Given multipart POST with file, Then response includes filename and size
RED:     test_multipart_rejects_no_file() — Given POST without file field, Then 422
GREEN:   Create files
REFACTOR: None
VERIFY:  npx vitest run tests/integration/fixture-multipart.test.ts
```

BDD scenarios:
- **Happy path** — file uploaded, response acknowledges
- **Validation error** — missing file field → 422
- **Edge case** — empty file (0 bytes) → still accepted; handler decides
- **Error scenario** — file too large → 413 (busboy limit)

#### Acceptance Criteria
- [ ] Multipart upload integration test green
- [ ] README documents size limits
- [ ] Dogfood check #31

#### DoD
- [ ] Fixture committed

---

## Phase 7: Misc Server — Rate Limit + Custom Transformer

**Objective:** Cover rate limiting and custom response transformer (alternative to default superjson).

### T7.1 — `fixtures/rate-limit/`

#### Objective
Fixture with `createRateLimiter` enforcing 5 requests / 10 seconds on a route.

#### Evidence
`createRateLimiter` exists but no fixture shows the API.

#### Files to edit
```
tests/fixtures/rate-limit/package.json — (NEW)
tests/fixtures/rate-limit/theo.config.ts — (NEW)
tests/fixtures/rate-limit/server/routes/api.ts — (NEW)
tests/fixtures/rate-limit/README.md — (NEW)
tests/integration/fixture-rate-limit.test.ts — (NEW)
```

#### Deep file dependency analysis
- `theo.config.ts`: includes `rateLimit: { windowMs: 10_000, max: 5 }`
- `server/routes/api.ts`: regular GET, no auth — relies on framework-level rate limit

#### Deep Dives
Rate limit is enforced at the api middleware layer (not per-route). README explains.

Edge cases:
- 5 requests OK → 6th returns 429
- Different IPs are tracked separately
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`

#### Tasks
1. Create fixture
2. Configure rate limit
3. Integration test: 5 OK + 1 throttled

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_rate_limit_config_present() — Given theo.config.ts, Then rateLimit.windowMs === 10_000
RED:     test_5_requests_ok() — Given fresh client, When 5 GET /api, Then all return 200
RED:     test_6th_returns_429() — Given after 5 requests, When 6th GET, Then status === 429
RED:     test_retry_after_header() — Given 429 response, Then Retry-After header present
GREEN:   Create files
REFACTOR: None
VERIFY:  npx vitest run tests/integration/fixture-rate-limit.test.ts
```

BDD scenarios:
- **Happy path** — 5 ok, 6th throttled
- **Validation error** — config without `windowMs` → ignored
- **Edge case** — different IPs counted separately
- **Error scenario** — clock skew → window resets correctly

#### Acceptance Criteria
- [ ] Integration test passes
- [ ] Dogfood check #32

#### DoD
- [ ] Fixture committed

### T7.2 — `fixtures/custom-transformer/`

#### Objective
Fixture using a custom `TheoTransformer` (not the default superjson) to demonstrate the pluggable contract.

#### Evidence
`resolveTransformer` accepts strings or custom objects but no example shows a custom one.

#### Files to edit
```
tests/fixtures/custom-transformer/package.json — (NEW)
tests/fixtures/custom-transformer/theo.config.ts — (NEW) serialization: customTransformer
tests/fixtures/custom-transformer/transformer.ts — (NEW) implements TheoTransformer interface
tests/fixtures/custom-transformer/server/routes/data.ts — (NEW) returns Date object
tests/fixtures/custom-transformer/app/page.tsx — (NEW) parses Date
tests/fixtures/custom-transformer/README.md — (NEW)
tests/unit/fixture-custom-transformer.test.ts — (NEW)
```

#### Deep file dependency analysis
- `transformer.ts`: minimal custom transformer that wraps `JSON.stringify` + ISO date revival
- Both server (sendJson) and client (theoFetch) use this transformer

#### Deep Dives
Custom transformer shape:
```ts
import type { TheoTransformer } from 'theokit/server'
export const isoDateTransformer: TheoTransformer = {
  name: 'iso-date',
  serialize: (v) => JSON.stringify(v, (k, val) => val instanceof Date ? `__DATE__${val.toISOString()}` : val),
  deserialize: (raw) => JSON.parse(raw, (k, val) => typeof val === 'string' && val.startsWith('__DATE__') ? new Date(val.slice(8)) : val),
}
```

Edge cases:
- Missing serialize or deserialize → `resolveTransformer` throws (covered by unit tests)
- Custom transformer with bugs → tests demonstrate Date round-trip

#### Tasks
1. Create fixture with custom transformer
2. Server route returning Date
3. Client parsing Date back

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_custom_transformer_implements_interface() — Given transformer.ts, Then exports object with name+serialize+deserialize
RED:     test_config_uses_custom_transformer() — Given theo.config.ts, Then serialization === custom transformer
RED:     test_route_returns_date() — Given /api/data, Then response body contains ISO date marker
RED:     test_client_receives_real_date() — Given page.tsx, Then result.timestamp is a Date instance
GREEN:   Create files
REFACTOR: None
VERIFY:  npx vitest run tests/unit/fixture-custom-transformer.test.ts
```

BDD scenarios:
- **Happy path** — Date serialized + revived
- **Validation error** — transformer missing fields → fixture build fails
- **Edge case** — nested Date → still revived correctly
- **Error scenario** — malformed marker → falls through as string

#### Acceptance Criteria
- [ ] Fixture compiles
- [ ] Date round-trip works
- [ ] Dogfood check #33

#### DoD
- [ ] Fixture committed

---

## Phase 8: Deploy Adapters — Shared Base + 6 Configs

**Objective:** Compile-only fixtures for the 6 adapters that lack one. Use a shared base app (ADR D3) to avoid duplication.

### T8.1 — Adapter base + Bun

#### Objective
Create the shared adapter base app and the first per-target fixture (`adapter-bun`). Subsequent tasks (T8.2-T8.6) follow the same pattern.

#### Evidence
`theokit build --target bun` was published in cross-domain-uplift. No fixture validates its emit.

#### Files to edit
```
tests/fixtures/adapter-targets/_base/app/page.tsx — (NEW) shared
tests/fixtures/adapter-targets/_base/app/layout.tsx — (NEW) shared
tests/fixtures/adapter-targets/_base/server/routes/health.ts — (NEW) shared
tests/fixtures/adapter-targets/_base/index.html — (NEW) shared
tests/fixtures/adapter-targets/bun/package.json — (NEW)
tests/fixtures/adapter-targets/bun/theo.config.ts — (NEW) target: 'bun'
tests/fixtures/adapter-targets/bun/README.md — (NEW)
tests/integration/fixture-adapter-bun.test.ts — (NEW)
```

#### Deep file dependency analysis
- Each per-target fixture imports from `../_base/` via symlinks OR via a shared workspace ref. Decision: **symlinks** (simpler than workspace deps for fixtures).
- Each fixture has its own `theo.config.ts` setting the target

#### Deep Dives
Test asserts:
1. `pnpm theokit build --target bun` exits 0
2. `.theo/bun/server.mjs` is emitted
3. Emitted entry contains `Bun.serve` reference
4. Emitted entry does NOT contain `node:http` import

Edge cases:
- Bun adapter run in non-Bun runtime → emitted file has runtime guard (existing behavior)
- Old `.theo/` artifacts → build cleans

#### Tasks
1. Create `_base/` shared app
2. Create `bun/` fixture pointing to it via symlinks
3. Integration test that runs build and asserts emit

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_bun_fixture_targets_bun() — Given theo.config.ts, Then build.target === 'bun'
RED:     test_bun_build_emits_server_mjs() — Given build, Then .theo/bun/server.mjs exists
RED:     test_bun_entry_uses_Bun_serve() — Given emitted file, Then grep 'Bun.serve' returns hit
RED:     test_bun_entry_no_node_http() — Given emitted file, Then grep 'node:http' returns no hits
GREEN:   Create fixture + base
REFACTOR: None
VERIFY:  npx vitest run tests/integration/fixture-adapter-bun.test.ts
```

BDD scenarios:
- **Happy path** — build succeeds, emits Bun entry
- **Validation error** — wrong target name → build aborts with clear error
- **Edge case** — `.theo/` exists from prior build → cleaned
- **Error scenario** — emitted file imports a non-Bun-compatible API → fixture catches it (greps)

#### Acceptance Criteria
- [ ] Base shared
- [ ] Bun fixture compiles
- [ ] Dogfood check #34

#### DoD
- [ ] T8.1 complete

### T8.2 — Adapter Deno Deploy

#### Objective
Same pattern as T8.1 but for `deno-deploy` target.

#### Files to edit
```
tests/fixtures/adapter-targets/deno-deploy/package.json — (NEW)
tests/fixtures/adapter-targets/deno-deploy/theo.config.ts — (NEW)
tests/fixtures/adapter-targets/deno-deploy/README.md — (NEW)
tests/integration/fixture-adapter-deno-deploy.test.ts — (NEW)
```

#### Deep file dependency analysis
Symlinks to `_base/`. Config sets `target: 'deno-deploy'`. Test asserts `.theo/deno/server.ts` emitted and contains `Deno.serve`.

#### Deep Dives
Same shape as Bun. Different emit expectations:
- File extension `.ts` (Deno consumes TS directly)
- Imports use `npm:` specifiers
- `Deno.env.get` instead of `process.env`

#### Tasks
1. Create fixture
2. Write integration test

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_deno_emits_server_ts() — .theo/deno/server.ts exists
RED:     test_deno_uses_npm_specifier() — emitted file grep 'npm:theokit'
RED:     test_deno_uses_Deno_env() — grep 'Deno.env' present
RED:     test_deno_runtime_guard() — grep 'typeof Deno' presence guard
GREEN:   Create fixture
REFACTOR: None
VERIFY:  npx vitest run tests/integration/fixture-adapter-deno-deploy.test.ts
```

BDD scenarios mirror T8.1 (happy, validation, edge, error).

#### Acceptance Criteria
- [ ] Fixture compiles
- [ ] Dogfood check #35

#### DoD
- [ ] T8.2 complete

### T8.3 — Adapter Cloudflare

#### Objective
Same pattern for `cloudflare` target.

#### Files to edit
```
tests/fixtures/adapter-targets/cloudflare/package.json — (NEW)
tests/fixtures/adapter-targets/cloudflare/theo.config.ts — (NEW)
tests/fixtures/adapter-targets/cloudflare/wrangler.toml — (NEW)
tests/fixtures/adapter-targets/cloudflare/README.md — (NEW)
tests/integration/fixture-adapter-cloudflare.test.ts — (NEW)
```

#### Deep file dependency analysis
Cloudflare adapter emits `.theo/cloudflare/worker.mjs`. README explains wrangler.toml is required for real deploy (but fixture is compile-only per ADR D2).

#### Deep Dives
Tests:
- `.theo/cloudflare/worker.mjs` emitted
- Contains `export default { fetch(request) { ... } }` Workers shape
- Uses web-shim (createWebShim from theokit/adapters/web-shim)

Edge cases:
- Static assets handling (workers can't serve static files natively — adapter uses workers-sites)

#### Tasks
1. Create fixture
2. wrangler.toml stub
3. Integration test

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_cf_emits_worker_mjs() — file exists
RED:     test_cf_exports_default_fetch() — grep 'export default' and 'fetch(' patterns
RED:     test_cf_uses_web_shim() — grep 'createWebShim' import
RED:     test_cf_no_node_imports() — no 'node:' imports
GREEN:   Create fixture
REFACTOR: None
VERIFY:  npx vitest run tests/integration/fixture-adapter-cloudflare.test.ts
```

#### Acceptance Criteria
- [ ] Fixture compiles
- [ ] Dogfood check #36

#### DoD
- [ ] T8.3 complete

### T8.4 — Adapter Vercel

#### Objective
Same pattern for `vercel` target.

#### Files to edit
```
tests/fixtures/adapter-targets/vercel/package.json — (NEW)
tests/fixtures/adapter-targets/vercel/theo.config.ts — (NEW)
tests/fixtures/adapter-targets/vercel/vercel.json — (NEW) edge function config
tests/fixtures/adapter-targets/vercel/README.md — (NEW)
tests/integration/fixture-adapter-vercel.test.ts — (NEW)
```

#### Deep file dependency analysis
Vercel adapter emits `.theo/vercel/index.js` and `.vercel/output/config.json` (build output v3).

#### Deep Dives
Tests assert:
- Build output v3 config emitted
- Function entry exists
- Routes config respects Theo routing

#### Tasks
1. Create fixture
2. vercel.json edge config
3. Integration test

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_vercel_emits_build_output() — .vercel/output/config.json exists
RED:     test_vercel_function_entry() — function index.js exists
RED:     test_vercel_routes_config_valid() — config.json parses + has routes array
RED:     test_vercel_no_node_only_imports_for_edge() — if edge target, no Node-only imports
GREEN:   Create fixture
REFACTOR: None
VERIFY:  npx vitest run tests/integration/fixture-adapter-vercel.test.ts
```

#### Acceptance Criteria
- [ ] Fixture compiles
- [ ] Dogfood check #37

#### DoD
- [ ] T8.4 complete

### T8.5 — Adapter Netlify

#### Objective
Same pattern for `netlify` target.

#### Files to edit
```
tests/fixtures/adapter-targets/netlify/package.json — (NEW)
tests/fixtures/adapter-targets/netlify/theo.config.ts — (NEW)
tests/fixtures/adapter-targets/netlify/netlify.toml — (NEW)
tests/fixtures/adapter-targets/netlify/README.md — (NEW)
tests/integration/fixture-adapter-netlify.test.ts — (NEW)
```

#### Deep file dependency analysis
Netlify adapter emits `.netlify/functions/theo.mjs` + merges `netlify.toml`. README mentions the EC-2 non-destructive merge from cross-domain-uplift T1.3.

#### Deep Dives
Tests assert:
- Function file emitted
- netlify.toml has `/api/*` redirect to function
- Existing user content in netlify.toml preserved

#### Tasks
1. Create fixture with custom existing netlify.toml content
2. Integration test asserting merge preserves user content

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_netlify_emits_function() — .netlify/functions/theo.mjs exists
RED:     test_netlify_toml_redirect_added() — netlify.toml grep '/api/*' redirect
RED:     test_netlify_user_content_preserved() — pre-existing [build] block still present
RED:     test_netlify_idempotent() — running build twice doesn't duplicate redirect
GREEN:   Create fixture
REFACTOR: None
VERIFY:  npx vitest run tests/integration/fixture-adapter-netlify.test.ts
```

#### Acceptance Criteria
- [ ] Fixture compiles
- [ ] toml merge idempotent
- [ ] Dogfood check #38

#### DoD
- [ ] T8.5 complete

### T8.6 — Adapter AWS Lambda

#### Objective
Same pattern for `aws-lambda` target.

#### Files to edit
```
tests/fixtures/adapter-targets/aws-lambda/package.json — (NEW)
tests/fixtures/adapter-targets/aws-lambda/theo.config.ts — (NEW)
tests/fixtures/adapter-targets/aws-lambda/README.md — (NEW)
tests/integration/fixture-adapter-aws-lambda.test.ts — (NEW)
```

#### Deep file dependency analysis
AWS Lambda adapter emits `.theo/aws/handler.mjs` for API Gateway HTTP API v2.

#### Deep Dives
Tests assert:
- Handler file emitted
- Exports `handler` function
- Pure helpers `eventV2ToRequestShape` referenced
- Binary content types handled (base64 encoding)

#### Tasks
1. Create fixture
2. Integration test asserting handler shape

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_aws_emits_handler_mjs() — file exists
RED:     test_aws_exports_handler_fn() — module.exports.handler or export const handler
RED:     test_aws_event_v2_conversion() — grep 'eventV2ToRequestShape' or shape utility
RED:     test_aws_binary_encoding() — grep base64 handling for binary types
GREEN:   Create fixture
REFACTOR: None
VERIFY:  npx vitest run tests/integration/fixture-adapter-aws-lambda.test.ts
```

#### Acceptance Criteria
- [ ] Fixture compiles
- [ ] Dogfood check #39

#### DoD
- [ ] T8.6 complete

---

## Phase 9: TheoUI Auto-Inject Isolated Fixture

**Objective:** Dedicated fixture proving TheoUI auto-injection without going through the full template.

### T9.1 — `fixtures/theoui-autoinject/`

#### Objective
Minimal fixture: declares `@usetheo/ui` in deps, runs dev, asserts entry-client contains CSS + Provider.

#### Evidence
TheoUI auto-injection has unit tests but no isolated fixture. Today the only "proof" is the `default` template, which mixes many features. A fixture that ONLY exercises auto-injection catches regressions cleanly.

#### Files to edit
```
tests/fixtures/theoui-autoinject/package.json — (NEW) with @usetheo/ui
tests/fixtures/theoui-autoinject/theo.config.ts — (NEW) with ui: { theme: 'noir' }
tests/fixtures/theoui-autoinject/app/page.tsx — (NEW) imports nothing from @usetheo/ui directly
tests/fixtures/theoui-autoinject/index.html — (NEW)
tests/fixtures/theoui-autoinject/README.md — (NEW)
tests/integration/fixture-theoui-autoinject.test.ts — (NEW)
```

#### Deep file dependency analysis
- `theo.config.ts`: `ui: { theme: 'noir', fonts: 'cdn' }`
- Test starts dev server, fetches `/@theo/entry-client`, asserts CSS imports + Provider wrap + theme === 'noir'

#### Deep Dives
This is the only fixture where the page does NOT import from `@usetheo/ui`. Auto-injection happens in the generated entry-client; the page is bare. Test ensures the wrap is automatic regardless of what the user code imports.

Edge cases:
- `ui: false` → no injection (covered by separate test)
- `ui: { fonts: 'cdn' }` → fonts-cdn.css imported instead of fonts.css

#### Tasks
1. Create fixture
2. Integration test fetching entry-client

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_entry_client_imports_styles_css() — Given /@theo/entry-client, Then content includes 'styles.css'
RED:     test_entry_client_imports_fonts_cdn() — Given fonts: 'cdn', Then content includes 'fonts-cdn.css'
RED:     test_entry_client_wraps_provider() — Then content includes 'TheoUIProvider'
RED:     test_entry_client_uses_noir_theme() — Then content includes `defaultTheme: 'noir'`
GREEN:   Create fixture
REFACTOR: None
VERIFY:  npx vitest run tests/integration/fixture-theoui-autoinject.test.ts
```

BDD scenarios:
- **Happy path** — CSS + Provider auto-injected
- **Validation error** — typo'd theme in config → schema rejects
- **Edge case** — ui: false → no injection (asserted via separate negative test)
- **Error scenario** — @usetheo/ui not in deps → no injection

#### Acceptance Criteria
- [ ] Fixture builds
- [ ] Integration test asserts all 4 contents
- [ ] Dogfood check #40

#### DoD
- [ ] T9.1 complete

---

## Phase 10: New Template — `saas`

**Objective:** Add a `saas` template that combines auth + sessions + postgres + an agent endpoint protected by `requireAuth`. This is the natural shape of a MicroSaaS.

### T10.1 — `packages/create-theo/templates/saas/`

#### Objective
New scaffolder template. Output: a working SaaS skeleton with auth + sessions + postgres + agent.

#### Evidence
Three of the locked narrative themes ("Build the system you describe", "Build and ship AI Agents", PaaS as destination) all benefit from a SaaS template. Today users assemble auth + agent themselves; this template ships the integration.

#### Files to edit
```
packages/create-theo/templates/saas/package.json.tmpl — (NEW)
packages/create-theo/templates/saas/theo.config.ts — (NEW)
packages/create-theo/templates/saas/tsconfig.json — (NEW)
packages/create-theo/templates/saas/_gitignore — (NEW)
packages/create-theo/templates/saas/.env.example — (NEW)
packages/create-theo/templates/saas/drizzle.config.ts — (NEW)
packages/create-theo/templates/saas/index.html — (NEW)
packages/create-theo/templates/saas/db/index.ts — (NEW)
packages/create-theo/templates/saas/db/schema.ts — (NEW) — users + sessions table
packages/create-theo/templates/saas/server/context.ts — (NEW) — wires SessionManager + db
packages/create-theo/templates/saas/server/routes/login.ts — (NEW)
packages/create-theo/templates/saas/server/routes/logout.ts — (NEW)
packages/create-theo/templates/saas/server/routes/me.ts — (NEW)
packages/create-theo/templates/saas/server/routes/agent.ts — (NEW) — defineAgentEndpoint + requireAuth
packages/create-theo/templates/saas/app/layout.tsx — (NEW)
packages/create-theo/templates/saas/app/page.tsx — (NEW) — login/logout/agent UI
packages/create-theo/templates/saas/public/.gitkeep — (NEW)
tests/unit/scaffold-saas-template.test.ts — (NEW)
```

#### Deep file dependency analysis
- Postgres template is the closest existing template; saas builds on it
- Agent route uses `requireAuth(ctx)` first; if no session → 401 BEFORE the stream starts
- Schema includes `users` (id, email, password_hash) and `sessions` (id, user_id, expires_at)

#### Deep Dives
Template scaffolder rules apply:
- `{{name}}` in package.json.tmpl is replaced
- `_gitignore` renamed to `.gitignore`

Security disclaimers in README:
- SECRET in .env.example uses the `CHANGE_ME_TO_RANDOM_32_CHARS` placeholder pattern (EC-2)
- Dev server warns on placeholder; prod server refuses to boot (`assertProductionSecret` helper from T3.1)
- Production secrets via env

Edge cases:
- User scaffolds saas without postgres available → graceful error in dev server explaining DATABASE_URL is required
- Migration not run → routes that touch db return 500 with helpful message
- Placeholder SECRET in production → server refuses to boot (EC-2)

#### Tasks
1. Copy postgres template structure
2. Add auth routes
3. Add agent route with requireAuth
4. Update db/schema.ts with users + sessions
5. README + tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_saas_template_files_present() — Given saas/, Then all expected files exist
RED:     test_saas_agent_uses_requireAuth() — Given agent.ts, Then source calls requireAuth
RED:     test_saas_agent_uses_defineAgentEndpoint() — Given agent.ts, Then imports defineAgentEndpoint
RED:     test_saas_login_validates_with_zod() — Given login.ts, Then body schema is Zod object
RED:     test_saas_db_schema_has_users_and_sessions() — Given schema.ts, Then both tables defined
RED:     test_saas_env_example_uses_placeholder_pattern() — Given .env.example, Then SECRET matches /CHANGE_ME/ (EC-2)
RED:     test_saas_context_calls_assertProductionSecret() — Given context.ts, Then assertProductionSecret(secret) is invoked at init (EC-2)
GREEN:   Create template
REFACTOR: Dedup with postgres template if needed
VERIFY:  npx vitest run tests/unit/scaffold-saas-template.test.ts
```

BDD scenarios:
- **Happy path** — template scaffolds, structure is valid
- **Validation error** — login without email → 422
- **Edge case** — scaffold with `--bare`+saas → error (saas template requires the full surface)
- **Error scenario** — no DATABASE_URL → server logs helpful error on first request

#### Acceptance Criteria
- [ ] All template files present
- [ ] Tests green
- [ ] `npx create-theokit my-saas --template=saas` produces working scaffold
- [ ] Dogfood check #41

#### DoD
- [ ] Template committed
- [ ] Scaffolder list updated (`api-only, dashboard, default, postgres, saas`)

---

## Phase 11: Dogfood Expansion + Index

**Objective:** Lock the coverage. Every fixture must be greppable from dogfood. Health score scales correctly.

### T11.1 — Dogfood checks #20-#41

#### Objective
Extend `scripts/dogfood-smoke.sh` with one check per new fixture (greps for canonical API calls).

#### Evidence
Without dogfood gates, fixtures can rot silently. T9.1 in this plan adds the rule "every framework feature must have a fixture"; this task makes that gate testable in CI.

#### Files to edit
```
scripts/dogfood-smoke.sh — extend MAX to 41, add 22 new check blocks
tests/unit/fixtures-index.test.ts — (NEW) asserts README index matches directory
```

#### Deep file dependency analysis
- Each new check follows the existing pattern: `echo "→ <name>"; if grep -q 'pattern' <file>; then pass; else fail; fi`
- Health threshold scales: 16/19 (~84%) → 35/43 (~81%)

#### Deep Dives
Check block template:
```sh
# 20. defineChannel fixture
echo "→ defineChannel fixture"
if [ -f tests/fixtures/define-channel/server/channels/notifications.ts ] \
   && grep -q "defineChannel" tests/fixtures/define-channel/server/channels/notifications.ts \
   && [ -f tests/fixtures/define-channel/README.md ]; then
  pass "define-channel fixture present"
else
  fail "define-channel fixture missing or incomplete"
fi
```

Edge cases:
- Fixture path renamed → check fails fast
- File present but missing canonical grep → check fails (catches "fixture exists but doesn't actually demonstrate the feature")

#### Tasks
1. Write 22 check blocks
2. Update MAX and threshold
3. Add fixtures-index unit test

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_dogfood_threshold_updated() — Given script, Then MAX === 41
RED:     test_dogfood_checks_each_new_fixture() — For each new fixture, Then grep its name in dogfood script
RED:     test_dogfood_pass_when_fixtures_ok() — Given valid repo state, When running script, Then exit 0
RED:     test_dogfood_fail_when_fixture_missing() — Given mv away a fixture, Then exit != 0 with clear message
GREEN:   Add checks
REFACTOR: Extract repeated grep pattern into a helper if reused 5+ times
VERIFY:  bash scripts/dogfood-smoke.sh && echo "OK"
```

BDD scenarios:
- **Happy path** — all checks pass, 41/41
- **Validation error** — fixture missing → check fails with name
- **Edge case** — fixture moved → check fails (does not silently pass)
- **Error scenario** — script error itself → exits with non-zero, message clear

#### Acceptance Criteria
- [ ] 22 new checks added
- [ ] MAX === 41
- [ ] Health threshold ≥35
- [ ] All checks green on current repo

#### DoD
- [ ] Dogfood script updated and runs clean

---

## Phase 12: Final Dogfood QA (MANDATORY)

> Per `/to-plan` skill rules: every plan must end with a Dogfood QA phase.

**Objective:** Validate the entire repo end-to-end after all phases.

### Execution

```bash
bash scripts/dogfood-smoke.sh
```

Plus a smoke per-fixture: pick 3 random fixtures, run `pnpm theokit dev` in each, assert HTTP 200 on `/`.

### Acceptance Criteria
- [ ] Dogfood score ≥35/41 (≥85%)
- [ ] Zero CRITICAL issues
- [ ] Random fixture smoke: 3/3 boot OK
- [ ] Pre-existing issues documented

### If Dogfood Fails
1. Identify plan-caused vs pre-existing
2. Fix plan-caused CRITICALs
3. Re-run dogfood

---

## Coverage Matrix

Every gap from the audit maps to a task.

| # | Gap | Task | Resolution |
|---|---|---|---|
| 1 | `defineChannel` no fixture | T2.1 | New fixture `define-channel` |
| 2 | `defineAgentEndpoint` no isolated fixture | T2.2 | New fixture `agent-endpoint-mock` |
| 3 | `defineTheoIntegration` no fixture | T2.3 | New fixture `define-integration` |
| 4 | `createSessionManager` no fixture | T3.1 | `sessions-auth` fixture |
| 5 | `requireAuth` no fixture | T3.1 | Same fixture |
| 6 | Cookies no fixture | T3.1 | Same fixture |
| 7 | `theoFetch` typed E2E | T4.1 | `typed-client` fixture |
| 8 | `useAgentStream` standalone React | T4.2 | `use-agent-stream-react` fixture |
| 9 | `createBatcher` no fixture | T4.3 | `batching` fixture |
| 10 | `theokit/react-query` no fixture | T4.4 | `react-query-integration` fixture |
| 11 | `loading.tsx` no fixture | T5.1 | `loading-states` fixture |
| 12 | Dynamic `[id]` no fixture | T5.2 | `dynamic-routes` fixture (combined) |
| 13 | Catch-all `[...slug]` no fixture | T5.2 | Same fixture |
| 14 | Streaming SSR no fixture | T6.1 | `ssr-streaming` fixture |
| 15 | Multipart upload no fixture | T6.2 | `multipart-upload` fixture |
| 16 | Rate limit no fixture | T7.1 | `rate-limit` fixture |
| 17 | Custom transformer no fixture | T7.2 | `custom-transformer` fixture |
| 18 | Bun adapter no fixture | T8.1 | `adapter-targets/bun` |
| 19 | Deno Deploy adapter no fixture | T8.2 | `adapter-targets/deno-deploy` |
| 20 | Cloudflare adapter no fixture | T8.3 | `adapter-targets/cloudflare` |
| 21 | Vercel adapter no fixture | T8.4 | `adapter-targets/vercel` |
| 22 | Netlify adapter no fixture | T8.5 | `adapter-targets/netlify` |
| 23 | AWS Lambda adapter no fixture | T8.6 | `adapter-targets/aws-lambda` |
| 24 | TheoUI auto-inject no isolated fixture | T9.1 | `theoui-autoinject` fixture |
| 25 | Template default uses manual SSE not helper | T1.1 + T1.2 | Migrate to canonical APIs |
| 26 | No saas template | T10.1 | New `saas` template |
| 27 | Fixtures directory has no index | T0.1 | `tests/fixtures/README.md` |
| 28 | CLI commands not tracked by dogfood | T11.1 | Dogfood checks reference CLI tests |
| 29 | Dogfood doesn't gate new fixtures | T11.1 | 22 new checks |

**Coverage: 29/29 gaps covered (100%) + 3 edge cases from review (EC-1, EC-2, EC-3) incorporated.**

## Global Definition of Done

- [ ] All phases completed
- [ ] 24 new fixtures created (Phases 2-9)
- [ ] 1 new template (Phase 10)
- [ ] Template `default` migrated to canonical APIs (Phase 1)
- [ ] 22 new dogfood checks (Phase 11)
- [ ] All tests passing (Vitest + Playwright where applicable)
- [ ] Zero TypeScript errors (`tsc --noEmit`)
- [ ] Zero lint warnings
- [ ] Backward compatibility preserved (existing user code still works)
- [ ] `tests/fixtures/README.md` exists and is complete
- [ ] **Dogfood QA PASS** — health score ≥35/41 (≥85%), zero CRITICAL issues
- [ ] **Fixture proof** — every framework feature from the audit has a fixture or test+template

## Final Phase: Dogfood QA (MANDATORY)

Same as Phase 12 above. Listed here per skill template requirement.

### Execution
`bash scripts/dogfood-smoke.sh`

### Acceptance Criteria
- [ ] Score ≥35/41
- [ ] Zero CRITICAL
- [ ] Zero HIGH in changed features
- [ ] Pre-existing issues documented

### If Dogfood Fails
1. Triage plan-caused vs pre-existing
2. Fix plan-caused
3. Re-run
4. Pre-existing → log, don't block
