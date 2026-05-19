# Plan: TheoKit 0.3.0 Cutover Execution + Adjacent Coverage Gaps

> **Version 1.0** — Executes the 8-phase Enforcement Cutover playbook from `.claude/knowledge-base/reference/enforcement-cutover.md`, plus the immediately-adjacent coverage gaps identified in the last honesty pass. Outcome: theokit ships `0.3.0` under `latest` with CSRF default-on `strict` mode + CSP `enforce` mode + per-request nonce + Playwright coverage for all five templates + bundle budget in CI + community-quality scaffolding (CONTRIBUTING, issue templates). Out of scope (separate plans): deploy adapter validation in real prod, devtools overlay, documentation site, RSC adoption (decided NOT to adopt per `server-components-rsc.md`).

## Context

What exists today:
- TheoKit `0.2.0` shipped: bundle 193.90 KB gzipped, vitest 1333/1333, Playwright 21/21, dogfood 47/47, CSRF in `warn` mode, CSP in `report-only` mode, traceId via W3C Trace Context, Argon2id in `examples/agent-saas`, default scaffold redesigned with 20 TheoUI components.
- `.claude/knowledge-base/reference/enforcement-cutover.md` (commit `83c17d7`) — 819 lines of prior-art research: Vite future-flag pattern + Rails ActiveSupport::Deprecation + Next.js codemod + Astro CSP separation + TanStack migration-FROM doc shape.
- `CLAUDE.md` roadmap (commits `37974c6`, `585297e`): explicitly identifies the 0.3.0 cutover as "HIGH RISK — most dangerous release on the roadmap" with 6 pre-requisites.
- `nextjs-maturity-plan.md` is closed (12/16 tasks DONE, 47/47 dogfood) — Phase 5 (CSRF warn-first) and Phase 6 (CSP report-only) shipped in 0.2.0; this plan continues from where that one ended.

What's broken or missing:
1. Our own default scaffold's chat demo emits `csrf.warn` on every send because `useAgentStream` uses native fetch without attaching `X-Theo-Action: 1`. Verified live in the Playwright spec output (`{"event":"csrf.warn","method":"POST","path":"/api/chat",...}`). If we flipped to strict today, `create-theokit my-app && pnpm dev && submit chat` returns 403. Day-one embarrassment.
2. No `warnOnce` helper — every state-mutating request without the header re-emits the same warning. Logs would be flooded under load.
3. No `code` + `docsUrl` fields in the warn payload. Users can't navigate from warning to migration guide.
4. No `theokit check --upgrade-readiness 0.3` command. Users have no way to audit their app before upgrading.
5. No migration guide artifact at `docs/migrating/0.2-to-0.3.md`.
6. No per-request nonce machinery in the SSR HTML emitter. Without it, dropping `'unsafe-inline'` from default CSP breaks the framework's own SSR hydration data script.
7. No `disallowedRoutes` / `disallowedBehavior` config slot. Users can't escalate specific routes' warnings to 403 in CI before the cutover.
8. Only `template-default` has Playwright coverage. `dashboard`, `api-only`, `postgres`, `saas` ship blind — bugs like the black-page hydration regression from 2026-05-18 could lurk in any of them.
9. No bundle budget assertion in CI. The 193.90 KB gzipped figure could silently regress without anyone noticing.
10. No `CONTRIBUTING.md`, issue templates, PR templates. External contributors hit a blank wall.

Evidence:
- Playwright spec output (`tests/e2e/template-default.spec.ts` run, 2026-05-19): every chat POST emits `csrf.warn` to dev server stdout.
- `.claude/knowledge-base/reference/enforcement-cutover.md` §9.6 — 8 phases ordered, BLOCKING dep on `useAgentStream` fix.
- `CLAUDE.md` §"0.3.0 — Enforcement cutover (HIGH RISK)" — 6 pre-reqs documented.
- Honesty pass earlier in this session — 4 templates Playwright-uncovered + bundle budget + community scaffolding listed as gaps.

Why this plan, why now:
- The cutover is the single highest-risk release on the roadmap. Skipping any pre-req multiplies the chance of a day-one production failure for paying users (when 0.2.0 ships to npm `latest`).
- The adjacent quick wins (Playwright templates, bundle budget, CONTRIBUTING) are small, mechanical, and naturally bundle with the cutover release because they all touch the same release-engineering surface.

## Objective

**Done = `theokit@0.3.0` published to npm under `latest` tag with all six pre-reqs from the CLAUDE.md roadmap closed AND four additional template Playwright specs AND bundle budget CI gate AND community scaffolding files in place.**

Specific, measurable goals:
1. `useAgentStream` attaches `X-Theo-Action: 1` on every non-GET (zero `csrf.warn` in our own Playwright spec).
2. `warnOnce` helper exists, deduplicates by structured key.
3. `csrf.warn` payload includes `code` + `docsUrl` fields.
4. `theokit check --upgrade-readiness 0.3` exists, scans `app/**`, `server/**`, `public/index.html`, exits non-zero with `--strict` if violations found.
5. `docs/migrating/0.2-to-0.3.md` exists with prereqs + step-by-step + gotchas + grep audit commands.
6. Per-request nonce machinery threads through SSR HTML; Playwright spec asserts `<script nonce=...>` matches CSP `nonce-...`.
7. `disallowedRoutes` + `disallowedBehavior` config slots accept + match correctly.
8. `0.3.0-beta.0` published on npm `next` dist-tag with all five templates Playwright-passing (5 specs total).
9. Bundle budget assertion fails the build if `index-*.js` gzipped > 350 KB for default template.
10. `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/*.yml`, `.github/PULL_REQUEST_TEMPLATE.md` in place.
11. 4+ weeks of warn-mode telemetry from `0.2.0` (calendar gate — counts toward "wait period," not implementation).
12. `0.3.0` promoted to npm `latest` only after 1-week beta window with zero CRITICAL bug reports.

## ADRs

### D1 — Lint-only `theokit check --upgrade-readiness`, NOT a jscodeshift codemod
- **Decision:** Ship a static analyzer that reports violations with file:line + suggested fix, but NEVER modifies user source files.
- **Rationale:** Our 0.3.0 changes are config-shape stable (no `defineRoute`/`defineAction` API changes). The breaks are runtime semantic (missing header, inline scripts). Both classes need human review — auto-transforming `fetch(...)` to `theoFetch(...)` would change behavior in ways AST can't reason about (e.g., what if user explicitly wants raw fetch?). Adding `jscodeshift` is a 300+ KB dep that earns nothing.
- **Consequences:** + Smaller dep tree. + No formatting drift in user code. + User retains audit + fix control. − Slightly more user work than a one-liner codemod (acceptable trade — they validate every change).

### D2 — `warnOnce` keyed by structured fields, NOT formatted message string
- **Decision:** `warnOnce(key: string, payload: object)` where `key` is `${event}:${method}:${path}` (or similar discriminator), NOT the formatted JSON string.
- **Rationale:** Vite's `warnOnce` keys by message text. That dedupes correctly when message is constant, but if the message embeds dynamic data (timestamps, request IDs), the cache key becomes infinite — defeating the purpose. Structured keys explicitly say "this call site, this method, this path" and dedupe those uniformly.
- **Consequences:** + Predictable dedup behavior under load. + Greppable cache key in `Set<string>` for debugging. − Caller must provide stable key (one extra arg).

### D3 — Rails-style `disallowedRoutes` config, NOT global "strict-on-CI" environment toggle
- **Decision:** New config slot `config.security.disallowedRoutes: Array<string | RegExp>` + `disallowedBehavior: 'warn' | 'raise'`. Matching routes ALWAYS escalate to 403 regardless of `csrf` mode.
- **Rationale:** Borrowed from Rails `disallowed_warnings` / `disallowed_behavior`. Lets teams roll out strict mode per-route, not all-or-nothing. CI can set `disallowedRoutes: ['/api/auth/*']` to validate auth flows before flipping global default. The alternative (env-var-gated strict mode) couples to deploy infrastructure and obscures the intent.
- **Consequences:** + Per-route migration cadence. + In-app definition, not env-var coupling. − Two-config knobs to learn (`csrf` mode AND `disallowedRoutes`). Documented in migration guide.

### D4 — Per-request nonce auto-injected into SSR hydration script ONLY, user-authored inline scripts opt-in via `ctx.nonce`
- **Decision:** Framework auto-injects `nonce="..."` on the `__staticRouterHydrationData` script (the only inline script the framework emits). User-authored inline scripts (e.g., `<script>gtag('config', ...)</script>` in their `app/layout.tsx`) opt in via `ctx.nonce` passed explicitly.
- **Rationale:** Auto-injecting everywhere would require AST scanning of user JSX at SSR time — expensive and brittle. Letting users opt in keeps the framework's surface bounded. Astro does the same with `Astro.csp?.insertDirective`.
- **Consequences:** + Bounded framework surface. + Predictable behavior. − Documentation burden: migration guide must show users how to thread `ctx.nonce` to their own inline scripts.

### D5 — Beta on npm `next` dist-tag for exactly 1 week before `latest` promotion
- **Decision:** `theokit@0.3.0-beta.0` lands on `next` dist-tag. After 7 calendar days with zero CRITICAL bug reports in the pinned GitHub issue, run `npm dist-tag add theokit@0.3.0 latest`.
- **Rationale:** Every framework that shipped a default-flip cutover gracefully ran a canary/beta channel first (Next.js `@canary`, Vue `@next`, etc.). 1 week is short enough to keep user-base fork shallow but long enough for early adopters to find blocking bugs.
- **Consequences:** + Catches blockers before mass adoption. + Forces a real "wait for feedback" gate. − Slightly slower time-to-`latest`. Acceptable.

### D6 — Scope OUT: deploy adapter validation, devtools overlay, documentation site, RSC adoption
- **Decision:** Each of these is a separate plan. They are NOT in this plan's scope.
- **Rationale:** Each is large (1-3 weeks of dedicated work), depends on external infrastructure (Vercel project, MCP setup, docs hosting), and is independent of the cutover release. Bundling them dilutes focus and stretches timeline.
- **Consequences:** + Clean scope. + Each remains tracked in `CLAUDE.md` roadmap 0.4.0/0.5.0+. − Plan does NOT close every honesty-pass gap; 4 items remain open after this plan ships.

### D7 — `securityHeadersSchema` gets `scriptDirective` + `styleDirective` fields (Astro pattern)
- **Decision:** Add separate fields for `script-src` and `style-src` directives in the security headers schema. These are the natural anchor points for the per-request nonce.
- **Rationale:** Bundling all directives in a single CSP string couples nonce management to text munging. Astro separated these exactly because nonce/hash management is the sensitive directive surface (`referencias/astro/packages/astro/src/core/csp/config.ts:76-79`). Lifting the pattern here keeps the API clean.
- **Consequences:** + Cleaner config. + Nonce wiring is bounded. − Backward-compat: existing `csp` string overrides still work, but if user also sets `scriptDirective`, framework MUST merge correctly. Documented in migration guide.

## Dependency Graph

```
Phase 1 (BLOCKING) ──▶ Phase 2 ──▶ Phase 3 ──▶ Phase 4 ──▶ Phase 5 ──▶ Phase 6
       │                                            │            │
       │                                            │            └──▶ Phase 7 (Playwright + budget + community)
       │                                            │
       │                                            └─▶ (Phase 7 parallel with Phase 5 — independent surfaces)
       │
       └──────▶ Ships as 0.2.1 patch (independent of cutover, BUT BLOCKS cutover)

Phase 6 (waiting period, calendar-time, 4+ weeks) ──▶ Phase 8 (Beta) ──▶ Phase 9 (Promote) ──▶ Phase 10 (Dogfood QA)
```

Parallelism notes:
- Phase 1 ships as `0.2.1` patch — independent release, no other phase depends on its timing (only on its content).
- Phase 7 (Playwright + budget + community) can run in parallel with Phase 5 (`disallowedRoutes`). Different files.
- Phases 4 (nonce) and 5 (`disallowedRoutes`) can run in parallel after Phase 2 + 3.
- Phase 6 is purely calendar time (4+ weeks of warn-mode telemetry from 0.2.0 in production). Implementation work doesn't block on it, but PROMOTION to `next` tag (Phase 8) does.

---

## Phase 1: Hotfix 0.2.1 — `useAgentStream` attaches `X-Theo-Action: 1` (BLOCKING for everything)

**Objective:** Stop our own default scaffold from emitting `csrf.warn` on every chat send. Ship as `theokit@0.2.1` so existing users get the fix transparently before the cutover.

### T1.1 — `useAgentStream` and `consumeAgentStream` attach `X-Theo-Action: 1` on non-GET

#### Objective
Fix the hook + pure SSE primitive to attach the CSRF header. Without this, the default scaffold's chat demo returns 403 in 0.3.0 strict mode. Per `.claude/knowledge-base/reference/enforcement-cutover.md` §9.6 Phase 1, this is the BLOCKING fix that gates the entire cutover.

#### Evidence
Playwright `tests/e2e/template-default.spec.ts` web-server stdout (latest run): `{"event":"csrf.warn","method":"POST","path":"/api/chat","reason":"Missing X-Theo-Action header"}` emitted on every chat send. Counted 7+ warn lines per full spec run.

#### Files to edit
```
packages/theo/src/client/agent-stream-core.ts — pure consumeAgentStream(): merge X-Theo-Action header into fetch init for non-GET requests
packages/theo/src/client/use-agent-stream.ts — Re-confirm hook delegates to consumeAgentStream (no separate header logic)
tests/unit/use-agent-stream.test.ts — Add test asserting fetch call includes the header
tests/e2e/template-default.spec.ts — Assert chat POST request carries X-Theo-Action header; assert ZERO csrf.warn lines in dev-server stdout
```

#### Deep file dependency analysis
- `agent-stream-core.ts` exports `consumeAgentStream(path, { body, onEvent, fetch?, signal? })`. Currently builds `fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })`. Need to add `'X-Theo-Action': '1'` to headers ONLY when method is non-GET. Today the function only does POST, but defensive coding: future call sites might use PUT/PATCH/DELETE.
- `use-agent-stream.ts` calls `consumeAgentStream` via `useEffect` + `AbortController`. Change is purely in core; hook needs no logic change. Verify it still imports core correctly.
- `tests/unit/use-agent-stream.test.ts` already has 12 tests (3 parseSSEChunk + 6 consumeAgentStream + 3 architectural). Add 2 new tests covering header attachment.
- `tests/e2e/template-default.spec.ts` already asserts streaming response arrives. Add: (a) network listener captures the POST request; (b) header `x-theo-action: 1` present; (c) dev-server stdout has ZERO `csrf.warn` lines during the spec run.

Downstream impact:
- `template-default.spec.ts`'s existing assertion `chatHadCsrfHeader = false` (documenting current behavior) must invert to `chatHadCsrfHeader = true`.
- Dogfood check #19 already validates `useAgentStream` is exported. No change needed.

#### Deep Dives
**Header attachment logic (algorithm):**
```ts
const method = (init.method ?? 'GET').toUpperCase()
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
if (!SAFE_METHODS.has(method)) {
  init.headers = {
    ...(init.headers as Record<string, string> | undefined),
    'X-Theo-Action': '1',
  }
}
```

**Invariants:**
- GET/HEAD/OPTIONS requests MUST NOT carry the header (they're safe methods; CSRF policy skips them).
- Non-safe methods MUST always carry the header.
- User-provided `init.headers['X-Theo-Action']` (if explicitly set) MUST be preserved over the default `'1'`. Spread order matters: user's value goes last.

**Edge cases:**
- User passes `init.method` in lowercase (`'post'`) — `.toUpperCase()` normalizes.
- User uses Headers object instead of plain object — spread + assign supports both.
- User sets `'X-Theo-Action': null` to explicitly suppress — spread preserves their `null`; framework `1` doesn't overwrite.

#### Tasks
1. Read current `agent-stream-core.ts` to confirm fetch init shape.
2. Add `SAFE_METHODS` constant + header attachment block in `consumeAgentStream`.
3. Verify `use-agent-stream.ts` doesn't bypass — it must call `consumeAgentStream`, not build its own fetch.
4. Add 2 unit tests in `tests/unit/use-agent-stream.test.ts`.
5. Update `tests/e2e/template-default.spec.ts` to invert the header assertion + add stdout grep.
6. Update Playwright spec's `chatHadCsrfHeader` comment.
7. Run `npx vitest run tests/unit/use-agent-stream.test.ts && npx playwright test --project=template-default`.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_consumeAgentStream_attaches_X_Theo_Action_on_post() — Given a POST call, When consumeAgentStream invokes fetch, Then the request init headers include 'X-Theo-Action': '1' (MUST fail before implementation)
RED:     test_consumeAgentStream_skips_X_Theo_Action_on_get() — Given a GET call, When consumeAgentStream invokes fetch, Then headers DO NOT include 'X-Theo-Action'
RED:     test_consumeAgentStream_preserves_user_X_Theo_Action() — Given init.headers carries 'X-Theo-Action': 'custom', Then it survives the merge (no overwrite by framework default '1')
RED:     test_consumeAgentStream_attaches_on_lowercase_method() — Given init.method = 'post', Then header attached (method normalization works)
RED:     playwright e2e: chat POST request carries X-Theo-Action header (assert via page.on('request'))
RED:     playwright e2e: dev-server stdout has ZERO 'csrf.warn' lines during full chat session
GREEN:   Implement header attachment in agent-stream-core.ts (≤ 10 LOC change)
REFACTOR: None expected — single small attachment block
VERIFY:  npx vitest run tests/unit/use-agent-stream.test.ts && npx playwright test --project=template-default
```

BDD scenarios:
- **Happy path:** POST with header attached → server accepts; client receives SSE events.
- **Validation error:** GET request (safe method) does NOT carry the header.
- **Edge case:** Method case insensitivity (`'post'` lowercase → still attaches header).
- **Error scenario:** User-set `'X-Theo-Action'` value is preserved (not overwritten by framework default).

#### Acceptance Criteria
- [ ] `agent-stream-core.ts` attaches header on non-GET; skips on GET/HEAD/OPTIONS
- [ ] `tests/unit/use-agent-stream.test.ts` has 4 new assertions (16 total, was 12)
- [ ] `tests/e2e/template-default.spec.ts` asserts POST carries the header (assertion inverted from current `false`)
- [ ] Playwright spec asserts zero `csrf.warn` lines in webServer stdout during full session
- [ ] User-provided `X-Theo-Action` value preserved (spread order correct)
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run tests/unit/use-agent-stream.test.ts`
- [ ] Pass: `npx playwright test --project=template-default` (8/8 scenarios)
- [ ] Pass: full vitest suite still green (no regression)

#### DoD
- [ ] All tasks completed
- [ ] All tests passing (4 new unit + 2 updated e2e assertions)
- [ ] Zero TypeScript errors
- [ ] Zero lint warnings
- [ ] `npx playwright test` full suite green (21+/21+)
- [ ] CHANGELOG entry under `[Unreleased]` for `0.2.1` patch
- [ ] Ready to publish as `theokit@0.2.1` (release engineer's call on the version bump)

---

## Phase 2: `warnOnce` helper + structured warn payload + `theokit check --upgrade-readiness`

**Objective:** Give users the tooling to audit their app's exposure to the cutover BEFORE upgrading. Three deliverables, one phase because they all serve the same audit-then-migrate workflow.

### T2.1 — `warnOnce` helper in server logger

#### Objective
Dedupe identical warnings by structured key so logs don't flood under load. Per ADR D2: key by `event + method + path`, not formatted message.

#### Evidence
Vite ships `config.logger.warnOnce(msg)` (`referencias/vite/packages/vite/src/node/deprecations.ts:96`). Without it, a request loop with 1000 POSTs emits 1000 identical CSRF warnings. Production deployments would generate gigabytes of redundant log volume in days.

#### Files to edit
```
packages/theo/src/server/logger.ts — Add warnOnce(key, payload) helper backed by Set<string>
tests/unit/logger-warn-once.test.ts — (NEW) Tests dedup behavior
packages/theo/src/server/csrf.ts — enforceCsrf uses warnOnce when in warn mode (instead of bare console.warn)
```

#### Deep file dependency analysis
- `logger.ts` currently exports `logRequest` + types `LogLevel`, `RequestLog`, `TheoLogger`, `LoggerFn`. Adding `warnOnce` follows the existing in-house-helper pattern (no new dep).
- `csrf.ts` `enforceCsrf` currently calls `logger.warn(...)` via the optional CsrfLogger arg. Wire `warnOnce` as the default `warn` implementation.
- Downstream: `executeRoute` in `execute.ts` passes the CsrfLogger with a path field. No interface change required.

#### Deep Dives
**Data structure:** `const _warnOnceSeen = new Set<string>()` module-scoped. Key format: caller-provided string. Recommended convention: `'<event>:<method>:<path>'` (e.g. `'csrf.warn:POST:/api/login'`).

**Invariants:**
- Same `key` → only first call emits.
- Different `key` (e.g., different path) → each emits once.
- `Set.size` grows unbounded if app has many unique paths — acceptable for dev/short-lived processes. For long-running prod with thousands of unique paths, document the trade and consider TTL'd Map as future enhancement.

**Edge cases:**
- Empty string key → still deduped (1 emit). Document as "anonymous warnings dedupe globally."
- Process restart resets the Set. Each cold boot emits each warn once. Acceptable.

#### Tasks
1. Add `warnOnce(key: string, payload: Record<string, unknown>): void` to `logger.ts`.
2. Wire `enforceCsrf` to use `warnOnce` (via the existing `CsrfLogger.warn` callback — provided by `executeRoute`).
3. Update `executeRoute` in `execute.ts` to build the warn key.
4. New test file `tests/unit/logger-warn-once.test.ts` (5 tests).
5. Existing `tests/integration/csrf-protection.test.ts` should still pass — the `warnSpy` mock receives `console.warn` calls; with `warnOnce` deduping, a single test (repeated POSTs) should only emit once. Update assertions accordingly.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_warnOnce_emits_first_call() — Given new key, When warnOnce called, Then console.warn invoked once
RED:     test_warnOnce_dedupes_repeat_key() — Given same key called 5x, Then console.warn invoked exactly once
RED:     test_warnOnce_distinct_keys_emit_separately() — Given keys 'a' and 'b', Then console.warn invoked twice
RED:     test_warnOnce_payload_is_serialized_json() — Given payload {x:1}, Then console.warn receives JSON.stringify({x:1, warnOnce: true})
RED:     test_warnOnce_empty_key_dedupes() — Given empty string key called 3x, Then console.warn once
RED:     csrf-protection integration: 3 sequential POSTs without header to same path produce ONE warn line (not 3)
GREEN:   Implement warnOnce in logger.ts + wire into csrf.ts enforceCsrf
REFACTOR: Extract structured key builder if pattern repeats
VERIFY:  npx vitest run tests/unit/logger-warn-once.test.ts && npx vitest run tests/integration/csrf-protection.test.ts
```

BDD scenarios:
- **Happy path:** First warn emits, subsequent with same key suppressed.
- **Validation error:** Different keys emit separately (no false dedup).
- **Edge case:** Empty-string key behaves as a valid dedup key.
- **Error scenario:** `payload` is always serializable JSON (helper does NOT crash on circular refs — document or guard).

#### Acceptance Criteria
- [ ] `warnOnce(key, payload)` exported from `packages/theo/src/server/logger.ts`
- [ ] `enforceCsrf` uses `warnOnce` (verify via integration test: 3 POSTs → 1 warn)
- [ ] 5 unit tests for warnOnce
- [ ] CSRF integration test updated to reflect dedup
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`

#### DoD
- [ ] All unit tests green
- [ ] Integration test reflects dedup behavior (assertion updated, not removed)
- [ ] Zero TypeScript errors
- [ ] Logger surface stable (no breaking change to existing `logRequest`)

### T2.2 — Structured warn payload with `code` + `docsUrl`

#### Objective
Per ADR convergent-pattern #2 from `enforcement-cutover.md` §4: every framework with mature deprecation cycles includes a `code` (stable identifier) and `docsUrl` (link to migration guide) in the warn payload. Lifting that pattern here.

#### Evidence
Vite's `deprecations.ts:74` constructs `${docsURL}/changes/${deprecationCode[type].toLowerCase()}`. Each deprecation flag has a parallel entry in `deprecationCode: Record<keyof FutureOptions, string>`. Users grep their logs for the URL pattern to find all related warnings. TheoKit currently emits `{event, method, path, reason}` — no stable identifier, no link.

#### Files to edit
```
packages/theo/src/server/csrf.ts — Extend CsrfWarnPayload type + warning emission with code + docsUrl
tests/unit/csrf-warn-first.test.ts — Update payload shape assertions (4 of the 10 existing tests touch the payload)
```

#### Deep file dependency analysis
- `csrf.ts` defines `CsrfWarnPayload { event, method, path, reason }`. Adding `code: 'CSRF_STRICT_CUTOVER'` (constant string) and `docsUrl: 'https://theokit.dev/upgrade/csrf-strict-cutover'` (constant string).
- Downstream: `executeRoute` in `execute.ts` passes the logger that emits the payload. No interface change.
- Tests in `tests/unit/csrf-warn-first.test.ts` assert the payload shape (lines 74-82 — "Warn payload includes the request method and path for log correlation"). Update the assertion to also check `code` + `docsUrl`.

#### Deep Dives
**Constants:**
```ts
export const CSRF_WARN_CODE = 'CSRF_STRICT_CUTOVER' as const
export const CSRF_WARN_DOCS_URL = 'https://theokit.dev/upgrade/csrf-strict-cutover' as const
```

**Invariants:**
- `code` is a stable string literal — never localized, never templated. Greppable.
- `docsUrl` is a fully-qualified URL pointing to the migration guide. The guide MUST exist (Phase 3 dependency).

**Edge cases:**
- If `docs/migrating/0.2-to-0.3.md` doesn't exist yet (Phase 3 not landed), the URL 404s. Acceptable — code emission ships in Phase 2, guide ships in Phase 3, both within the same minor release.

#### Tasks
1. Add `code` + `docsUrl` to `CsrfWarnPayload` type.
2. Add the two constants.
3. Update `enforceCsrf` to populate them when calling `logger.warn`.
4. Update test assertions.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_warn_payload_includes_code_field() — Given warn-mode CSRF failure, When emit, Then payload.code === 'CSRF_STRICT_CUTOVER'
RED:     test_warn_payload_includes_docsUrl_field() — Given warn-mode failure, Then payload.docsUrl matches /^https:\/\/theokit\.dev\/upgrade\//
RED:     test_warn_payload_code_is_stable_across_calls() — 2 calls with different paths, Then both have identical code
RED:     test_warn_payload_shape_matches_zod_schema() — Type-test: CsrfWarnPayload includes code + docsUrl
GREEN:   Add the two constants + populate payload in enforceCsrf
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/csrf-warn-first.test.ts
```

BDD scenarios:
- **Happy path:** Payload includes both new fields with stable values.
- **Validation error:** N/A — pure additive.
- **Edge case:** Code stays identical regardless of method/path (it's the cutover identifier).
- **Error scenario:** N/A.

#### Acceptance Criteria
- [ ] `CsrfWarnPayload` type extended
- [ ] Constants exported and referenced
- [ ] 4 new test assertions
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`
- [ ] Pass: type test confirms shape

#### DoD
- [ ] Payload shape backwards-compat (existing fields preserved)
- [ ] Linting clean
- [ ] No regression

### T2.3 — `theokit check --upgrade-readiness 0.3` command

#### Objective
LINT-only scan of user's app + server source that reports anticipated 0.3.0 violations with file:line + suggested fix. Per ADR D1: no AST transforms, only reports. Exit non-zero by default in CI so PRs fail if violations present.

#### Evidence
`CLAUDE.md` 0.3.0 pre-req 5 explicitly calls for this. Without it, users have no way to assess their cutover exposure ahead of upgrade. Equivalent to Rails's `disallowed_warnings = :raise` pattern but at lint-time, not runtime.

#### Files to edit
```
packages/theo/src/cli/commands/upgrade-readiness.ts — (NEW) The command logic
packages/theo/src/cli/index.ts — Register the new command + flag
tests/unit/cli-upgrade-readiness.test.ts — (NEW) Tests scan + report
fixtures/upgrade-readiness-clean/ — (NEW) A fixture app with zero violations
fixtures/upgrade-readiness-dirty/ — (NEW) A fixture app with deliberate violations (raw fetch POST, inline script in index.html, dangerouslySetInnerHTML)
```

#### Deep file dependency analysis
- New command file `upgrade-readiness.ts` will be ≤ 250 LOC. It calls `fs.readFile` for `app/**/*.tsx`, `server/**/*.ts`, `public/index.html`, plus optionally any `*.html` files. Uses regex scanning (NOT AST) for: (a) `fetch(...)` calls with POST/PUT/PATCH/DELETE method that lack `X-Theo-Action` in nearby headers; (b) inline `<script>...</script>` blocks; (c) `dangerouslySetInnerHTML` calls.
- `cli/index.ts` registers the command via the existing pattern (look at how `check.ts` / `info.ts` are wired).
- Fixture projects under `fixtures/` follow the existing `template-default` shape (small `package.json`, minimal `app/` content).

#### Deep Dives
**Violation types and detection regex:**

| Rule | Regex | Severity |
|---|---|---|
| `csrf-missing-header` | `fetch\s*\(.*?\)\s*\{[^}]*method\s*:\s*['"](?:POST\|PUT\|PATCH\|DELETE)` with `'X-Theo-Action'` NOT present in same call-site block | HIGH |
| `inline-script` | `<script(?![^>]*src=)[^>]*>[^<]+<\/script>` in `.html` files | HIGH |
| `dangerously-set-inline-script` | `dangerouslySetInnerHTML\s*=\s*\{\{\s*__html\s*:\s*['"`].*?<script` | HIGH |
| `theofetch-replaceable` | `fetch\(.*?\)` where `theoFetch` is imported in same file but native `fetch` is used | INFO (info only, not blocking) |

**Report shape (output JSON when `--json` flag, human-readable otherwise):**
```json
{
  "status": "has-violations" | "ready",
  "violations": [
    {
      "file": "src/components/Login.tsx",
      "line": 42,
      "rule": "csrf-missing-header",
      "message": "POST without X-Theo-Action header — will return 403 in 0.3.0 strict mode",
      "fix": "Use theoFetch(path, { method: 'POST', body }) OR add headers: { 'X-Theo-Action': '1' }"
    }
  ]
}
```

**Invariants:**
- Tool is READ-only. Never writes to user files.
- Exit code: 0 if no HIGH violations, 1 if any HIGH violations (so CI fails). `--allow-warnings` overrides.
- Detection is best-effort regex. Document false-positive rate in `--help`.

**Edge cases:**
- File with binary content → skip with warning.
- `node_modules/**` → skip.
- Symlinked source → follow but cycle-detect.
- User's `dist/` or `build/` → skip.

#### Tasks
1. Create `upgrade-readiness.ts` with scan logic.
2. Wire into CLI router.
3. Create 2 fixture projects (clean + dirty).
4. Write 8 unit tests.
5. Document in `--help` output.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_scan_clean_fixture_reports_zero_violations() — Given fixture with theoFetch only, Then status=='ready' and exit=0
RED:     test_scan_dirty_fixture_reports_violations() — Given fixture with raw fetch POST, Then status=='has-violations' and violations.length > 0
RED:     test_inline_script_detection() — Given index.html with <script>gtag(...)</script>, Then rule=='inline-script' reported
RED:     test_dangerouslySetInnerHTML_with_script_detection() — Given React component with dangerouslySetInnerHTML containing <script>, Then rule reported
RED:     test_exit_code_1_on_high_violations() — Given dirty fixture, When run, Then process.exit code === 1
RED:     test_allow_warnings_flag_overrides_exit() — Given --allow-warnings, Then exit === 0 even with violations
RED:     test_json_output_shape() — Given --json, Then stdout is parseable JSON with violations array
RED:     test_skip_node_modules() — Given node_modules with fetch POST, Then NOT included in violations
GREEN:   Implement upgrade-readiness.ts + CLI wiring + fixtures
REFACTOR: Extract rule definitions to a registry for future-additions
VERIFY:  npx vitest run tests/unit/cli-upgrade-readiness.test.ts
```

BDD scenarios:
- **Happy path:** Clean app reports zero violations, exit 0.
- **Validation error:** Dirty app reports specific violations with file:line.
- **Edge case:** Empty app dir, missing `public/index.html`, symlinks.
- **Error scenario:** Read permission denied on a file — tool logs warning and continues, doesn't crash.

#### Acceptance Criteria
- [ ] Command runs: `npx theokit check --upgrade-readiness 0.3`
- [ ] Reports violations with file:line + suggested fix
- [ ] Exit non-zero on HIGH violations
- [ ] `--allow-warnings` flag overrides
- [ ] `--json` flag emits parseable JSON
- [ ] Clean fixture: zero violations
- [ ] Dirty fixture: 3+ violations (one per rule type)
- [ ] Skips `node_modules`, `dist`, `build`
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run tests/unit/cli-upgrade-readiness.test.ts`

#### DoD
- [ ] 8 unit tests green
- [ ] 2 fixture projects committed
- [ ] CLI command registered + help text
- [ ] Dogfood check #48 wired: command exists, fixtures present

---

## Phase 3: Migration guide artifact

**Objective:** Ship `docs/migrating/0.2-to-0.3.md` with everything a user needs to upgrade safely. Per ADR convergent-pattern #6 from `enforcement-cutover.md`: every framework with a graceful cutover publishes a per-major migration doc with prereqs + step-by-step + gotchas.

### T3.1 — Write `docs/migrating/0.2-to-0.3.md`

#### Objective
Single document covering: what changes in 0.3.0, how to audit your app, escape hatches, step-by-step migration, gotchas, FAQ. Linked from the `csrf.warn` payload's `docsUrl` field.

#### Evidence
Next.js's `version-15.mdx` (180+ lines, codemod usage + escape hatches + before/after diffs) is the model. TheoKit currently has zero migration doc — the existing `CHANGELOG.md` has entries per phase but no consolidated upgrade narrative.

#### Files to edit
```
docs/migrating/0.2-to-0.3.md — (NEW) The full migration guide
docs/migrating/README.md — (NEW) Index page listing all migration guides
tests/unit/migration-guide-shape.test.ts — (NEW) Markdown linter test asserting required sections exist
```

#### Deep file dependency analysis
- `docs/migrating/` directory doesn't exist yet. Create + add a README index for future per-major guides.
- The test file enforces the shape (section presence), not content (content is editorial).
- The `csrf.warn` payload's `docsUrl` (T2.2) points at `https://theokit.dev/upgrade/csrf-strict-cutover` — that URL must resolve to a section anchor IN this guide once published. Decision: launch the docs site with anchor redirects later; for now, README maps the URL anchor to a section heading.

#### Deep Dives
**Required sections (enforced by linter test):**
1. **TL;DR** — 3-bullet summary
2. **Prerequisites** — list 6 pre-reqs from CLAUDE.md
3. **Step-by-step migration**
   - 3.1 Run `theokit check --upgrade-readiness 0.3`
   - 3.2 Audit your `csrf.warn` logs (grep command + interpretation)
   - 3.3 Refactor each violation site (before/after code diffs)
   - 3.4 Audit inline scripts (grep + interpretation)
   - 3.5 Switch from `fetch(...)` to `theoFetch(...)` OR add `X-Theo-Action` header
   - 3.6 Test in `0.3.0-beta.0` first
   - 3.7 Promote to `0.3.0` after verifying
4. **Escape hatches** — `defineRoute({ csrf: false })`, `config.security.csrf: 'warn'`, `config.security.headers.cspMode: 'report-only'`
5. **Per-route gating with `disallowedRoutes`** — Rails-pattern escalation
6. **Gotchas** — list of 9 edge cases from `enforcement-cutover.md` §8
7. **FAQ** — 5-8 common questions
8. **Rollback** — how to revert if the upgrade goes wrong

**Code-snippet conventions:**
- All diff blocks use `diff` fenced code with `-`/`+` prefixes
- All grep commands are runnable as-is
- All config snippets show full `theo.config.ts` shape (not just the changed line)

**Invariants:**
- Document MUST contain anchor `#csrf-strict-cutover` (matches `docsUrl` from T2.2).
- All grep commands MUST be tested manually before commit (each one should produce expected output on a sample 0.2.x app).

#### Tasks
1. Create `docs/migrating/` directory.
2. Write `0.2-to-0.3.md` (~300 lines markdown).
3. Write `README.md` index.
4. Write the markdown linter test.
5. Verify the `#csrf-strict-cutover` anchor exists.
6. Run grep commands against a sample 0.2.x app to verify they work.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_migration_guide_exists() — Given docs/migrating/0.2-to-0.3.md path, Then file exists
RED:     test_guide_has_required_sections() — Given guide content, Then headings include TL;DR, Prerequisites, Step-by-step, Escape hatches, Gotchas, FAQ, Rollback
RED:     test_guide_has_csrf_strict_cutover_anchor() — Given content, Then contains '## CSRF Strict Cutover' or equivalent anchor matching the docsUrl
RED:     test_guide_links_resolve() — Given internal links, Then each href has a matching heading anchor
RED:     test_guide_grep_commands_have_explanation() — Given each ```bash block, Then preceded by explanatory paragraph
RED:     test_readme_lists_all_guides() — Given migrating/README.md, Then lists 0.2-to-0.3.md
GREEN:   Write the guide content
REFACTOR: None expected (content-shaped, not algorithmic)
VERIFY:  npx vitest run tests/unit/migration-guide-shape.test.ts
```

BDD scenarios:
- **Happy path:** Guide exists, has required sections, anchors resolve.
- **Validation error:** Missing section → linter test fails.
- **Edge case:** Empty file → fails the "required sections" test.
- **Error scenario:** Broken internal link → fails the link-resolution test.

#### Acceptance Criteria
- [ ] `docs/migrating/0.2-to-0.3.md` exists with all 8 required sections
- [ ] `docs/migrating/README.md` lists the guide
- [ ] All internal anchors resolve
- [ ] All grep commands manually verified against a 0.2.x sample app
- [ ] Markdown linter test passes
- [ ] Document is ≤ 500 lines (readable in one sitting)

#### DoD
- [ ] Linter test green
- [ ] Manual review by human (read through end-to-end)
- [ ] `docsUrl` from T2.2 points to a valid anchor in this doc

---

## Phase 4: Per-request nonce machinery for SSR

**Objective:** Thread a per-request `nonce` through the SSR HTML emitter so the `__staticRouterHydrationData` inline script can be CSP-strict (drop `'unsafe-inline'`). Per `enforcement-cutover.md` §8: this is the change with HIGH implementation risk — if the wiring has a bug, every SSR app breaks.

### T4.1 — Generate + thread per-request nonce through SSR

#### Objective
Generate a cryptographically random nonce per request, attach to context, inject into the inline script tag emitted by `entry-server.tsx`, and emit `nonce-<nonce>` in the CSP `script-src` directive. Document `ctx.nonce` API for user-authored inline scripts.

#### Evidence
`enforcement-cutover.md` §9.8 risk table: "SSR hydration nonce wiring has an edge case bug (re-introduces hydration bug from Phase 1)" — medium likelihood, high impact. The mitigation MUST be a Playwright assertion that `<script nonce=...>` matches CSP `nonce-...` on every SSR page.

#### Files to edit
```
packages/theo/src/server/nonce.ts — (NEW) generateNonce() helper
packages/theo/src/server/security-headers.ts — Add scriptDirective field, support nonce-<token> substitution in CSP string
packages/theo/src/router/entry-server.ts — Read ctx.nonce, emit <script nonce=...>
packages/theo/src/server/execute.ts — Generate nonce per request, attach to ctx, expose via res.locals or ctx.nonce
packages/theo/src/config/schema.ts — Extend securityHeadersSchema with scriptDirective + styleDirective fields
tests/unit/nonce.test.ts — (NEW)
tests/unit/security-headers-nonce.test.ts — (NEW)
tests/e2e/template-default.spec.ts — Add assertion: <script nonce="X"> in HTML matches Content-Security-Policy: ... 'nonce-X'
```

#### Deep file dependency analysis
- `nonce.ts` (NEW): exports `generateNonce(): string` returning a 22-character base64-encoded 16-byte random buffer. Pure function, uses `crypto.randomBytes(16).toString('base64')` (or Web Crypto `crypto.getRandomValues` in adapter contexts).
- `security-headers.ts` (Phase 6): currently emits the CSP string. Extend to accept a `nonce` param and inject `'nonce-<token>'` into `script-src`. New field `scriptDirective` per ADR D7.
- `entry-server.ts`: emits the inline script tag for hydration data. Change: `<script>` → `<script nonce="${ctx.nonce}">`.
- `execute.ts`: generate the nonce at request entry, attach to ctx + res header generation. Order: generate nonce BEFORE security headers are emitted.
- `schema.ts`: add `scriptDirective` and `styleDirective` to `securityHeadersSchema`. Backward-compat: optional fields, default undefined.

Downstream:
- `vite-plugin/api-middleware.ts` already calls `applySecurityHeaders` before handler. Need to thread the nonce through this chain.
- `route-manifest.ts` / `entry.ts` (client) — no change (client doesn't see the nonce).
- Existing CSP tests in `tests/unit/security-headers.test.ts` need updates for the new field.

#### Deep Dives
**Nonce generation:**
```ts
import { randomBytes } from 'node:crypto'
export function generateNonce(): string {
  return randomBytes(16).toString('base64')  // 24 chars including =, conventional length
}
```

**CSP string assembly:**
```ts
const scriptDirective = nonce
  ? `script-src 'self' 'nonce-${nonce}'`
  : `script-src 'self' 'unsafe-inline'`  // fallback for non-SSR or no-nonce path
```

**Invariants:**
- Each request gets a unique nonce.
- The same nonce appears in BOTH the response CSP header AND every framework-emitted `<script>` in the HTML.
- User-authored inline scripts that want to be CSP-strict MUST opt in via `ctx.nonce`.
- Static HTML (no SSR) doesn't need a nonce — `unsafe-inline` fallback only applies when there's no SSR.

**Edge cases:**
- Adapter context (Bun, Deno, Vercel Edge) without Node `crypto` — use Web Crypto API: `globalThis.crypto.getRandomValues(new Uint8Array(16))` + base64 encode.
- Request with no SSR (API-only route) — no nonce needed. Don't generate (waste).
- Streaming SSR with `renderToPipeableStream` — nonce generated ONCE per request, before stream open.

#### Tasks
1. Implement `nonce.ts` with both Node and Web Crypto paths.
2. Add `scriptDirective` + `styleDirective` to schema.
3. Update `applySecurityHeaders` to accept a `nonce` param.
4. Generate nonce in `execute.ts` (or earlier in the pipeline).
5. Thread to `entry-server.ts` (only for SSR routes).
6. Update Playwright spec to assert nonce match.
7. Write unit tests.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_generateNonce_returns_22_to_24_char_base64() — Given call, Then result matches /^[A-Za-z0-9+/=]{22,24}$/
RED:     test_generateNonce_is_unique() — Given 1000 calls, Then 0 collisions
RED:     test_csp_includes_nonce_when_provided() — Given buildSecurityHeaders({scriptDirective: 'self'}, {production: false}, 'abc123'), Then CSP contains "'nonce-abc123'"
RED:     test_csp_omits_nonce_when_no_ssr() — Given no nonce param, Then CSP uses 'unsafe-inline' fallback
RED:     test_entry_server_emits_script_with_nonce() — Given ctx.nonce='abc', When entry-server emits hydration data, Then HTML contains <script nonce="abc">
RED:     test_per_request_nonce_changes() — Given 2 requests, Then nonces differ (sample 10 requests)
RED:     test_edge_runtime_uses_webcrypto() — Given globalThis.crypto only (no node:crypto), Then nonce generated correctly
RED:     playwright e2e: assert response Content-Security-Policy contains the same nonce as <script nonce="..."> in HTML body
GREEN:   Implement nonce generation + thread through SSR + CSP wiring
REFACTOR: Extract nonce-context plumbing to a small helper if it sprawls
VERIFY:  npx vitest run tests/unit/nonce.test.ts tests/unit/security-headers-nonce.test.ts && npx playwright test --project=template-default
```

BDD scenarios:
- **Happy path:** SSR request → nonce generated → appears in HTML script tag AND CSP header.
- **Validation error:** N/A (additive — no existing behavior changes for non-SSR).
- **Edge case:** Edge runtime without `node:crypto` uses Web Crypto fallback.
- **Error scenario:** If nonce generation fails, fall back to `unsafe-inline` (don't crash).

#### Acceptance Criteria
- [ ] `generateNonce()` returns base64 string of 22-24 chars
- [ ] Each request gets a unique nonce
- [ ] CSP `script-src` includes the nonce when SSR is active
- [ ] `<script>` tags emitted by framework carry the same nonce
- [ ] Playwright spec asserts nonce match between header and HTML
- [ ] Edge runtime path uses Web Crypto fallback
- [ ] `scriptDirective` + `styleDirective` fields in schema
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `npx vitest run`
- [ ] Pass: `npx playwright test`
- [ ] Hydration not broken (Playwright "no black page" assertion still green)

#### DoD
- [ ] All tests green
- [ ] Playwright spec includes the nonce-match assertion
- [ ] Edge adapters (Bun, Vercel Edge, Cloudflare, Deno) tested via existing fixture builds
- [ ] CHANGELOG entry mentions the new schema fields

---

## Phase 5: `disallowedRoutes` escalation pattern (Rails-inspired)

**Objective:** Per ADR D3: per-route escalation that turns CSRF warnings into 403s for specific paths, regardless of global `csrf` mode. Enables progressive cutover (auth routes first, public routes later).

### T5.1 — Add `disallowedRoutes` + `disallowedBehavior` config + matcher + dispatch

#### Objective
Users add `config.security.disallowedRoutes: ['/api/auth/login', /^\/api\/admin\//]` and `disallowedBehavior: 'raise'`. Any matching route, when it would otherwise emit `csrf.warn`, instead returns 403 with code `CSRF_INVALID`.

#### Evidence
Rails's `ActiveSupport::Deprecation#disallowed_warnings` (read in `enforcement-cutover.md` §3.2) — gold-standard pattern. The behavior dispatcher routes matching warnings through `disallowed_behavior` (default `:raise`) instead of regular `behavior` (default `:stderr`).

#### Files to edit
```
packages/theo/src/config/schema.ts — Add disallowedRoutes + disallowedBehavior to securitySchema
packages/theo/src/server/csrf.ts — Extend enforceCsrf to accept disallowed config + dispatch logic
packages/theo/src/server/execute.ts — Pass disallowed config from middleware options
packages/theo/src/vite-plugin/api-middleware.ts — Read config + forward to executeRoute
tests/unit/csrf-disallowed-routes.test.ts — (NEW)
tests/integration/csrf-protection.test.ts — Add tests for the new dispatch path
```

#### Deep file dependency analysis
- Schema extension is purely additive — backward-compat preserved.
- `csrf.ts` `enforceCsrf` signature evolves: `(req, mode, logger?, disallowed?)` where `disallowed = { routes: string[], behavior: 'warn' | 'raise' }`. The function checks if the request path matches any entry; if matched AND validation fails, route through disallowed dispatch (return `{allow: false, reason}` even in warn mode).
- Matcher: exact string match OR `RegExp.test(path)`. No glob library.
- `executeRoute` already passes `csrfMode` as the 11th arg — add a 12th arg `disallowedConfig`.

#### Deep Dives
**Matcher algorithm:**
```ts
function matchDisallowed(path: string, patterns: Array<string | RegExp>): boolean {
  return patterns.some(p => {
    if (typeof p === 'string') return path === p
    if (p instanceof RegExp) return p.test(path)
    return false
  })
}
```

**Dispatch logic in `enforceCsrf`:**
```ts
const check = validateCsrf(req)
if (check.valid) return { allow: true }

const isDisallowed = disallowed && matchDisallowed(req.url ?? '', disallowed.routes)
if (isDisallowed && disallowed.behavior === 'raise') {
  return { allow: false, reason: check.reason }  // escalate to 403 even in warn mode
}

// regular dispatch (warn / strict / off)
...
```

**Invariants:**
- Empty `disallowedRoutes` (or undefined) → no behavior change.
- Match is path-only (not method-aware). If user wants method-specific, they use a RegExp.
- Disallowed behavior NEVER downgrades (a disallowed route in `off` mode still gets warn-only; disallowed.behavior='raise' only escalates IF the route would otherwise warn).

**Edge cases:**
- Trailing slash in path vs route — exact string match means `/api/login` ≠ `/api/login/`. Document this; users use RegExp for trailing-slash tolerance.
- Query string in path — `validateCsrf` already receives path without query in some adapters and with in others. Document: matcher uses `req.url` as-is.
- Path doesn't start with `/` (some adapters strip the leading slash) — document.

#### Tasks
1. Extend schema with the two new fields.
2. Implement `matchDisallowed` helper.
3. Extend `enforceCsrf` dispatch logic.
4. Thread config through `executeRoute` + middleware.
5. Write tests.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_disallowed_exact_string_match() — Given routes ['/api/login'], When path='/api/login', Then disallowed dispatch fires
RED:     test_disallowed_regex_match() — Given routes [/^\/api\/admin\//], When path='/api/admin/users', Then dispatch fires
RED:     test_disallowed_no_match() — Given routes ['/api/login'], When path='/api/other', Then NORMAL dispatch (warn or strict)
RED:     test_disallowed_raises_in_warn_mode() — Given mode='warn', behavior='raise', matched route, Then allow=false (escalate to 403)
RED:     test_disallowed_warn_behavior_does_not_escalate() — Given mode='warn', behavior='warn', Then normal warn dispatch
RED:     test_undefined_disallowed_passes_through() — Given no disallowed config, Then enforceCsrf behaves identically to current
RED:     test_disallowed_with_trailing_slash_mismatch() — Given route='/api/login', path='/api/login/', Then no match (exact string semantics documented)
RED:     test_disallowed_RegExp_handles_trailing_slash_tolerance() — Given route=/^\/api\/login\/?$/, path='/api/login/', Then match
RED:     integration test: POST to disallowed route returns 403 even in warn mode
GREEN:   Implement matchDisallowed + dispatch + wire through middleware
REFACTOR: Extract matcher to its own module if it grows past 1 function
VERIFY:  npx vitest run tests/unit/csrf-disallowed-routes.test.ts tests/integration/csrf-protection.test.ts
```

BDD scenarios:
- **Happy path:** Disallowed route + raise behavior + bad request → 403.
- **Validation error:** Disallowed route + valid CSRF header → 200 (escalation only fires on validation failure).
- **Edge case:** Trailing slash mismatch (documented behavior).
- **Error scenario:** Pattern is neither string nor RegExp → `matchDisallowed` returns false (don't crash).

#### Acceptance Criteria
- [ ] Schema fields exist + Zod-validated
- [ ] Matcher correctly handles strings + RegExp + mixed arrays
- [ ] Dispatch returns `{allow: false}` on disallowed match in warn mode
- [ ] 9 unit tests + 1 integration test
- [ ] No regression to existing CSRF behavior
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: full vitest suite

#### DoD
- [ ] All tests green
- [ ] Schema backward-compat preserved
- [ ] Migration guide T3.1 references this pattern in the "per-route gating" section

---

## Phase 6: Flip defaults (the actual cutover)

**Objective:** Change the default values in `securitySchema` from `'warn'` to `'strict'` (CSRF) and from `'report-only'` to `'enforce'` (CSP). Drop `'unsafe-inline'` from default CSP (now safe because nonce machinery from Phase 4 is in place).

> **WARNING:** This phase MUST NOT ship until Phases 1-5 are deployed AND Phase 6's calendar gate (4+ weeks of warn-mode telemetry from 0.2.0) has elapsed.

### T6.1 — Flip defaults in `securitySchema`

#### Objective
Single semantic change: defaults flip. Implementation is ≤ 5 LOC. Risk is exclusively about timing + downstream impact, not the change itself.

#### Evidence
All 6 pre-reqs from `CLAUDE.md` 0.3.0 section met. Phases 1-5 of THIS plan delivered. Calendar gate elapsed.

#### Files to edit
```
packages/theo/src/config/schema.ts — change defaults
packages/theo/src/server/security-headers.ts — change DEFAULT_CSP to drop 'unsafe-inline' for scripts
CHANGELOG.md — add [Unreleased] BREAKING banner
docs/migrating/0.2-to-0.3.md — update "this PR ships the flip" note
```

#### Deep file dependency analysis
- 3 lines change in `schema.ts`: defaults.
- `DEFAULT_CSP` constant in `security-headers.ts` — remove `'unsafe-inline'` from `script-src`. Note: `style-src 'unsafe-inline'` STAYS (Tailwind animations require it; documenting in guide).
- Existing tests that asserted the OLD defaults need updating to the NEW defaults. Specifically: `tests/unit/csrf-warn-first.test.ts` and `tests/unit/security-headers.test.ts`.
- Existing fixture configs that don't override `csrf` / `cspMode` will INHERIT the new defaults — must verify all fixtures still function.

#### Deep Dives
**Tests to flip (not delete — change assertion direction):**
```ts
// Before
expect(config.security.csrf).toBe('warn')
// After
expect(config.security.csrf).toBe('strict')

// Before
expect(headers['Content-Security-Policy-Report-Only']).toBeDefined()
// After
expect(headers['Content-Security-Policy']).toBeDefined()
expect(headers['Content-Security-Policy-Report-Only']).toBeUndefined()
```

**Invariants:**
- Users with EXPLICIT config (`csrf: 'warn'`, `cspMode: 'report-only'`) continue working unchanged.
- Users with NO security config now get the new strict defaults.
- All existing tests either (a) update their assertions or (b) explicitly opt into the old mode.

**Edge cases:**
- The `template-default` fixture doesn't set `csrf` or `cspMode` — it now gets the new defaults. The chat demo MUST work because Phase 1 already fixed `useAgentStream`.
- Fixtures that test specific behavior MUST opt into the mode they want (e.g., `tests/integration/csrf-protection.test.ts` already passes mode explicitly per test — no change needed).

#### Tasks
1. Change 3 defaults in `schema.ts`.
2. Edit `DEFAULT_CSP` to drop `'unsafe-inline'` for scripts.
3. Update affected test assertions (estimated 4 file touches).
4. Manually verify each fixture still builds + runs.
5. Update CHANGELOG with **BREAKING** banner.
6. Verify Playwright spec still green (this is the production-shape validation).

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_default_csrf_is_strict() — Given empty config, Then config.security.csrf === 'strict'
RED:     test_default_cspMode_is_enforce() — Given empty config, Then config.security.headers.cspMode === 'enforce'
RED:     test_default_csp_drops_unsafe_inline_for_scripts() — Given default CSP string, Then does NOT contain "script-src.*'unsafe-inline'"
RED:     test_explicit_warn_mode_still_works() — Given csrf: 'warn', Then enforceCsrf in warn mode behaves identically to 0.2.x warn-mode
RED:     test_explicit_report_only_mode_still_works() — Given cspMode: 'report-only', Then header is Content-Security-Policy-Report-Only
RED:     playwright e2e (template-default): chat POST succeeds (because Phase 1 wired the header)
RED:     playwright e2e: no CSP violations in console (assert via page.on('console') filter)
GREEN:   Flip defaults + drop unsafe-inline + update test assertions
REFACTOR: None expected
VERIFY:  npx vitest run && npx playwright test
```

BDD scenarios:
- **Happy path:** Default-config app + chat demo works (no 403, no CSP violations).
- **Validation error:** User explicitly opts into warn/report-only → behavior matches 0.2.x.
- **Edge case:** Fixture builds that don't set security config inherit new defaults.
- **Error scenario:** If user has inline scripts (gtag, etc.) without opting into `unsafe-inline`, they're blocked — this is INTENDED and documented.

#### Acceptance Criteria
- [ ] `schema.ts` defaults flipped
- [ ] `DEFAULT_CSP` drops `'unsafe-inline'` for scripts
- [ ] All existing tests updated + green
- [ ] `template-default` fixture still works end-to-end (Playwright spec)
- [ ] No CSP violations in console during Playwright runs
- [ ] CHANGELOG includes **BREAKING** banner
- [ ] Migration guide notes that this PR is the actual flip
- [ ] Pass: full vitest + Playwright suite

#### DoD
- [ ] All tests green
- [ ] All 6 fixtures (Tier 1 + template-default) verified manually
- [ ] CHANGELOG entry committed
- [ ] Ready for Phase 8 (beta release)

---

## Phase 7: Adjacent coverage gaps (parallel with Phase 5)

**Objective:** Close 3 adjacent gaps that fit the same release-engineering surface: Playwright specs for the 4 non-default templates, bundle budget assertion in CI, community scaffolding files.

### T7.1 — Playwright specs for the 4 non-default templates

#### Objective
Add `template-{dashboard,api-only,postgres,saas}.spec.ts` matching the pattern of `template-default.spec.ts`. Per `CLAUDE.md` 0.4.0 roadmap: "Playwright for the other four templates" — this plan moves that item into 0.3.0 because the cost is small and the regression catch is high.

#### Evidence
The black-page regression bug (2026-05-18) was caught by Playwright on the default template. Same class of bugs could exist in the other 4 templates today — we simply don't have coverage.

#### Files to edit
```
fixtures/template-dashboard/ — (NEW) Mirror of templates/dashboard
fixtures/template-api-only/ — (NEW) Mirror of templates/api-only
fixtures/template-postgres/ — (NEW) Mirror, but skip in CI if PG unavailable
fixtures/template-saas/ — (NEW) Mirror of templates/saas
tests/e2e/template-dashboard.spec.ts — (NEW)
tests/e2e/template-api-only.spec.ts — (NEW)
tests/e2e/template-postgres.spec.ts — (NEW; conditionally skipped)
tests/e2e/template-saas.spec.ts — (NEW)
playwright.config.ts — 4 new projects + webServer entries (ports 3461-3464)
pnpm-workspace.yaml — Add the 4 fixtures to workspace
```

#### Deep file dependency analysis
- Each fixture: ~ 8 files (`package.json`, `theo.config.ts`, `app/`, `server/`). Cost per fixture: ~ 30 minutes.
- Each spec: ~ 50-100 lines (same shape as `template-default.spec.ts`).
- `playwright.config.ts` already has 5 projects (4 existing + template-default). Add 4 more.
- `pnpm-workspace.yaml` extension — same pattern as `template-default`.
- Postgres fixture: spec uses `test.skip(!process.env.POSTGRES_URL, 'requires PG')` to skip when DB unavailable.

#### Deep Dives
**Per-template primary action** (from `enforcement-cutover.md` and roadmap):
- `dashboard`: navigate sidebar; assert URL changes.
- `api-only`: `fetch /api/health` returns JSON; assert response shape.
- `postgres`: hit a route that queries DB; skip if no PG.
- `saas`: click "Sign in as Demo"; assert dashboard renders.

**Common scenario set (each spec)**:
- App shell renders without console errors
- Regression: no black page (`<main>` visible + heading present)
- Primary action works
- (Where applicable) x-trace-id header present

**Invariants:**
- Each fixture is independent (own port, own dev server).
- Specs follow the same naming convention as `template-default.spec.ts`.

**Edge cases:**
- Postgres test on CI without PG → skip cleanly (not fail).
- Auth flow in saas: use the demo creds from `examples/agent-saas`.

#### Tasks
1. Create 4 fixture directories (copy from templates, adjust deps).
2. Add to `pnpm-workspace.yaml` + run `pnpm install`.
3. Write 4 Playwright specs.
4. Extend `playwright.config.ts`.
5. Run full Playwright suite + verify zero regressions.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     dashboard spec — renders shell + sidebar navigation works + no console errors
RED:     api-only spec — /api/health returns 200 with JSON + Content-Type correct
RED:     postgres spec — (when PG available) DB query route returns expected shape
RED:     saas spec — login flow works + dashboard renders + no console errors
RED:     each spec — regression "no black page" assertion (main visible, heading visible)
RED:     each spec — x-trace-id header present in primary fetch
GREEN:   Implement fixtures + specs + config wiring
REFACTOR: Extract common spec helpers (collectConsoleErrors, etc) to tests/e2e/helpers/
VERIFY:  npx playwright test
```

BDD scenarios per spec:
- **Happy path:** Template's primary feature works (defined per-template above).
- **Validation error:** N/A (read-mostly templates) or specific to each template.
- **Edge case:** Skip-when-unavailable for Postgres.
- **Error scenario:** No unhandled console errors during full session.

#### Acceptance Criteria
- [ ] 4 new fixtures committed
- [ ] 4 new Playwright specs
- [ ] `playwright.config.ts` has 9 projects total
- [ ] Full Playwright suite passes: 25+ scenarios (was 21)
- [ ] Postgres spec skips cleanly when PG unavailable
- [ ] Pass: `npx playwright test`

#### DoD
- [ ] All 4 templates pass their Playwright spec on dev machine
- [ ] CI workflow includes the new specs
- [ ] Dogfood check updated for 4 new templates

### T7.2 — Bundle budget assertion in CI

#### Objective
Fail the build if `index-*.js` gzipped for the default template exceeds 350 KB. Lock in the Phase 4 (code-splitting) win.

#### Evidence
Phase 4 of nextjs-maturity delivered 193.90 KB gzipped. Without a CI gate, any future PR can silently regress.

#### Files to edit
```
scripts/check-bundle-budget.sh — (NEW)
scripts/dogfood-smoke.sh — Add check #49 invoking the bundle budget script
.github/workflows/ci.yml — (NEW or existing — add bundle-budget job)
tests/unit/bundle-budget-script.test.ts — (NEW) tests the script behavior
```

#### Deep file dependency analysis
- `scripts/check-bundle-budget.sh` runs `cd fixtures/template-default && npx tsx ../../packages/theo/src/cli/index.ts build && wc -c .theo/client/assets/index-*.js | tail -1 | awk '{ print $1 }'` then compares to threshold (350 * 1024).
- Test file invokes the script with a mocked file, asserts exit code based on threshold.
- CI workflow: runs the script on every PR, fails the build if exit code non-zero.

#### Deep Dives
**Threshold definition:** 350 KB gzipped. Stored as `BUNDLE_BUDGET_KB=350` env var (overridable).

**Invariants:**
- Script exits 0 if bundle ≤ budget, 1 if exceeded.
- Script runs `theokit build` fresh each invocation (not cached).
- Build output path is canonical (`fixtures/template-default/.theo/client/assets/index-*.js`).

**Edge cases:**
- No build output found (build failed) → exit 2 with clear error.
- Multiple `index-*.js` files (rare) → use the largest one.

#### Tasks
1. Write the script.
2. Add to dogfood-smoke.sh.
3. Write the unit test.
4. CI workflow update (or new file if no workflow exists).

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_script_under_budget_exits_zero() — Given mocked file size 200KB gzipped, Then exit 0
RED:     test_script_over_budget_exits_one() — Given mocked file size 400KB, Then exit 1
RED:     test_script_no_build_output_exits_two() — Given no build artifacts, Then exit 2 with error message
RED:     test_dogfood_check_49_present() — Given scripts/dogfood-smoke.sh, Then contains 'bundle budget'
GREEN:   Write script + dogfood wiring + CI workflow update
REFACTOR: None expected
VERIFY:  bash scripts/check-bundle-budget.sh && bash scripts/dogfood-smoke.sh
```

BDD scenarios:
- **Happy path:** Current bundle (193 KB) ≤ 350 KB budget → green.
- **Validation error:** Bundle exceeds budget → red with clear error.
- **Edge case:** Build hasn't run yet → script runs build first.
- **Error scenario:** Build fails → script propagates exit code.

#### Acceptance Criteria
- [ ] Script runs and reports current bundle size
- [ ] Exit 0 if ≤ threshold, 1 if exceeded
- [ ] Dogfood check #49 wired
- [ ] CI workflow runs the script
- [ ] Pass: `bash scripts/dogfood-smoke.sh` (should now be 49/49)

#### DoD
- [ ] Script committed + executable bit set
- [ ] Dogfood passes
- [ ] CI runs the check on every PR

### T7.3 — Community scaffolding files

#### Objective
Add `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/*.yml`, `.github/PULL_REQUEST_TEMPLATE.md`. External contributors need a starting point.

#### Evidence
`CLAUDE.md` honesty pass: zero community scaffolding exists. Issue templates auto-format bug reports, reducing triage cost dramatically.

#### Files to edit
```
CONTRIBUTING.md — (NEW)
.github/ISSUE_TEMPLATE/bug_report.yml — (NEW)
.github/ISSUE_TEMPLATE/feature_request.yml — (NEW)
.github/ISSUE_TEMPLATE/config.yml — (NEW) disables blank issues
.github/PULL_REQUEST_TEMPLATE.md — (NEW)
SECURITY.md — (NEW) Security advisory process
CODE_OF_CONDUCT.md — (NEW) Standard Contributor Covenant
```

#### Deep file dependency analysis
- All standalone files. No code changes.
- Templates reference the migration guide + dogfood-smoke for contributors to validate before opening PRs.

#### Deep Dives
**CONTRIBUTING.md sections:** Quick start (`pnpm install`, `pnpm try:scaffold`, `pnpm dev`) → Local testing (`npx vitest run`, `npx playwright test`, `bash scripts/dogfood-smoke.sh`) → How to add a feature → How to add a fixture → How to write a Playwright spec → Branch + commit conventions.

**Bug report template fields:** TheoKit version, repro repo, expected vs actual, logs, output of `theokit info`.

**Security advisory process:** Email `security@usetheo.dev` (or GitHub Private Advisory) before public disclosure. 90-day embargo.

#### Tasks
1. Write each file using standard open-source patterns.
2. Reference internal docs (CHANGELOG, dogfood, migration guide).

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_contributing_md_exists()
RED:     test_issue_templates_present() — bug_report.yml + feature_request.yml + config.yml all exist
RED:     test_pr_template_exists()
RED:     test_security_md_exists()
RED:     test_code_of_conduct_exists()
RED:     test_contributing_references_dogfood_smoke()
GREEN:   Write all files
REFACTOR: None expected (content-shaped)
VERIFY:  npx vitest run tests/unit/community-scaffolding.test.ts
```

BDD scenarios:
- **Happy path:** All required files exist with required sections.
- **Validation error:** Missing file → test fails.
- **Edge case:** Template YAML is malformed → would be caught by GitHub's own template validation on push.
- **Error scenario:** N/A.

#### Acceptance Criteria
- [ ] All 7 files exist
- [ ] CONTRIBUTING references the migration guide + dogfood smoke
- [ ] Issue templates validate as valid YAML
- [ ] SECURITY.md describes the disclosure process
- [ ] Pass: `npx vitest run tests/unit/community-scaffolding.test.ts`

#### DoD
- [ ] Files committed
- [ ] Linter test green

---

## Phase 8: Beta release on npm `next` dist-tag

**Objective:** Per ADR D5: 1-week beta window before promoting to `latest`.

### T8.1 — Publish `theokit@0.3.0-beta.0` to npm `next` tag

#### Objective
Validate the cutover with early adopters. Catch CRITICAL bugs before mass adoption.

#### Evidence
ADR D5 + convergent-pattern #7 in `enforcement-cutover.md` §4.

#### Files to edit
```
packages/theo/package.json — version 0.3.0-beta.0
packages/create-theo/package.json — version 0.3.0-beta.0
CHANGELOG.md — Update [Unreleased] → [0.3.0-beta.0]
.github/workflows/release.yml — (Possibly NEW) automated release on tag
.changeset/*.md — Changeset entries (if using changesets)
```

#### Deep file dependency analysis
- Version bump in both publishable packages.
- CHANGELOG section moves from `[Unreleased]` to `[0.3.0-beta.0]` with today's date.
- npm publish command: `pnpm changeset publish --tag next` (or `npm publish --tag next` if not using changesets).

#### Deep Dives
**Pinned issue template for feedback:**
> "TheoKit 0.3.0-beta.0 is live on the `next` tag. Install via `npm install theokit@next`. Please report any regression from 0.2.x in this thread before 2026-MM-DD."

**Invariants:**
- The `next` tag NEVER points to a non-beta version.
- `latest` keeps pointing to `0.2.x` during the beta window.

**Edge cases:**
- User installs `theokit` (no tag) → gets `latest` = 0.2.x. Safe.
- User installs `theokit@next` → gets 0.3.0-beta. Opt-in.

#### Tasks
1. Bump versions in both packages.
2. Update CHANGELOG section header.
3. Run `pnpm build && pnpm test && bash scripts/dogfood-smoke.sh` — final validation.
4. `npm publish --tag next` (or via changesets).
5. Create pinned GitHub issue.
6. Announce on whatever public channels exist (Discord, Twitter, etc.).

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_package_json_version_matches() — Given packages/theo + packages/create-theo, Then both versions === '0.3.0-beta.0'
RED:     test_changelog_has_beta_section() — Given CHANGELOG.md, Then contains '## [0.3.0-beta.0]'
RED:     test_no_unreleased_section_remaining() — Given CHANGELOG, Then [Unreleased] is empty or absent
RED:     test_dist_tag_intent_documented() — Given .github/workflows/release.yml or scripts/release.sh, Then references --tag next
GREEN:   Run version bump + CHANGELOG move + npm publish
REFACTOR: None expected
VERIFY:  pnpm publish --tag next --dry-run (then real publish)
```

BDD scenarios:
- **Happy path:** `npm view theokit dist-tags` shows `next: 0.3.0-beta.0`, `latest: 0.2.x`.
- **Validation error:** Forgot to bump `create-theo` version → publish fails or installs mismatched packages.
- **Edge case:** User on Node 18 (out of support per 16+ requirement) → engines warning fires.
- **Error scenario:** Publish fails → rollback (don't promote to latest until verified).

#### Acceptance Criteria
- [ ] Both packages at 0.3.0-beta.0
- [ ] CHANGELOG updated
- [ ] `npm install theokit@next` works
- [ ] `npm install theokit` still gets 0.2.x
- [ ] Pinned issue exists
- [ ] One announcement made

#### DoD
- [ ] Packages live on npm
- [ ] Feedback channel open
- [ ] 7-day countdown starts

---

## Phase 9: Promote `0.3.0` to `latest`

**Objective:** After 1 week with zero CRITICAL bug reports, promote.

### T9.1 — Move dist-tag from `next` to `latest`

#### Objective
Mechanical promotion. The hard work was done in Phase 8 (waiting + triaging).

#### Evidence
Per ADR D5: 7 days minimum, zero CRITICAL.

#### Files to edit
```
packages/theo/package.json — version 0.3.0 (drop beta suffix)
packages/create-theo/package.json — version 0.3.0
CHANGELOG.md — Update [0.3.0-beta.0] → [0.3.0]
```

#### Deep file dependency analysis
- Version bump from `0.3.0-beta.0` to `0.3.0`.
- CHANGELOG header change.
- `npm dist-tag add theokit@0.3.0 latest` AFTER publish.

#### Tasks
1. Verify pinned issue: zero CRITICAL bug reports.
2. Bump versions.
3. Publish (`npm publish`).
4. Move dist-tag.
5. Announce.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_versions_at_0_3_0() — Given package.json files, Then version === '0.3.0'
RED:     test_changelog_has_stable_section() — Given CHANGELOG, Then [0.3.0] section with today's date
RED:     test_no_beta_suffix_in_published_version() — Given the version string, Then matches /^\d+\.\d+\.\d+$/
RED:     test_pinned_issue_has_zero_critical_label() — (manual check, but document the criterion)
GREEN:   Bump + publish + dist-tag move
REFACTOR: None expected
VERIFY:  npm view theokit dist-tags && npm install theokit (should get 0.3.0)
```

BDD scenarios:
- **Happy path:** `npm view theokit dist-tags` shows `latest: 0.3.0`.
- **Validation error:** Pinned issue has CRITICAL labels → DO NOT promote. Roll back to fix.
- **Edge case:** Version bump from beta-prerelease to stable — npm accepts this.
- **Error scenario:** Publish fails → rollback.

#### Acceptance Criteria
- [ ] Pinned issue closed with zero CRITICAL
- [ ] Versions at 0.3.0 (stable)
- [ ] CHANGELOG updated
- [ ] `npm install theokit` gets 0.3.0
- [ ] Announcement made

#### DoD
- [ ] 0.3.0 live as latest
- [ ] CLAUDE.md roadmap updated: 0.3.0 → DONE, move 0.4.0 items into focus

---

## Phase 10: Final Dogfood QA

**Objective:** Validate end-to-end that the cutover works in the wild.

### Execution

Run `/dogfood full`. Always full. No shortcuts.

Manual additional steps:
1. `npm create theokit@latest my-test-cutover` (uses 0.3.0)
2. `cd my-test-cutover && pnpm dev`
3. Send chat message — confirm no `csrf.warn` in stderr (Phase 1 + 6 working)
4. Inspect response headers in DevTools — confirm `Content-Security-Policy` (not Report-Only)
5. Inspect HTML source — confirm `<script nonce="...">` matches CSP nonce
6. `curl -X POST http://localhost:3000/api/chat -d '{}'` (no header) → expect 403
7. Re-run with `-H "X-Theo-Action: 1"` → expect 200

### Acceptance Criteria

- [ ] Health score >= 70/100 (target: 49/49 = 100% after T7.2 wires bundle check)
- [ ] Zero CRITICAL issues introduced by this plan's changes
- [ ] Zero HIGH issues in commands/features modified by this plan
- [ ] All 6 manual steps pass
- [ ] All 25+ Playwright scenarios green (was 21; +4 templates)
- [ ] Bundle budget green (≤ 350 KB)

### If Dogfood Fails

1. Identify which issues are caused by this plan's changes vs pre-existing.
2. Fix plan-caused CRITICAL + HIGH issues before declaring the plan complete.
3. Re-run `/dogfood full`.
4. Pre-existing issues are logged but do NOT block plan completion.

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | useAgentStream emits csrf.warn — our own demo breaks in 0.3.0 strict | T1.1 | Attach `X-Theo-Action: 1` for non-GET; assert in Playwright |
| 2 | No `warnOnce` helper — log flood under load | T2.1 | New helper + integration in `enforceCsrf` |
| 3 | `csrf.warn` payload missing `code` + `docsUrl` — not greppable + not navigable | T2.2 | Extend payload type + constants |
| 4 | No `theokit check --upgrade-readiness 0.3` command | T2.3 | New CLI subcommand + 2 fixtures |
| 5 | No migration guide artifact | T3.1 | `docs/migrating/0.2-to-0.3.md` with 8 required sections |
| 6 | No per-request nonce for SSR — can't drop `'unsafe-inline'` safely | T4.1 | `generateNonce()` + thread through SSR + CSP `script-src 'nonce-...'` |
| 7 | No `disallowedRoutes` config — can't escalate CSRF per-route in CI | T5.1 | Rails-pattern schema fields + matcher + dispatch |
| 8 | Defaults need to flip (`csrf: 'warn'` → `'strict'`, `cspMode: 'report-only'` → `'enforce'`) | T6.1 | Single semantic change with backward-compat opt-out preserved |
| 9 | 4 templates without Playwright (dashboard, api-only, postgres, saas) | T7.1 | 4 fixtures + 4 specs + config wiring |
| 10 | No bundle budget assertion in CI | T7.2 | `check-bundle-budget.sh` + dogfood check #49 + CI workflow |
| 11 | No CONTRIBUTING.md, issue templates, PR template, SECURITY.md, CoC | T7.3 | 7 community scaffolding files |
| 12 | No beta channel for 0.3.0 cutover | T8.1 | Publish 0.3.0-beta.0 on `next` tag + pinned feedback issue |
| 13 | Promote to latest only after zero-CRITICAL beta window | T9.1 | Mechanical version bump + dist-tag move |

**Coverage: 13/13 gaps covered (100%)**

Out of scope (decision in ADR D6, NOT counted as gap-uncovered):
- Deploy adapter validation in real prod → 0.4.0 plan
- Devtools overlay → 0.4.0 plan
- Documentation site → 0.4.0 plan
- TheoUI Tooltip bug → upstream (theo-ui#7)
- Load testing → separate plan
- RSC adoption → DEFERRED (server-components-rsc.md decision)

## Global Definition of Done

- [ ] All 10 phases completed
- [ ] All tests passing (Vitest + Playwright)
- [ ] Zero TypeScript errors (`tsc --noEmit`)
- [ ] Zero lint warnings
- [ ] Backward compatibility preserved (`csrf: 'warn'` + `cspMode: 'report-only'` still valid opt-out)
- [ ] Code-audit checks passing across all modified packages
- [ ] **Plan-specific criteria:**
  - [ ] `useAgentStream` attaches `X-Theo-Action: 1`
  - [ ] `warnOnce` dedupes structured-key warnings
  - [ ] `csrf.warn` payload includes `code` + `docsUrl`
  - [ ] `theokit check --upgrade-readiness 0.3` operational
  - [ ] `docs/migrating/0.2-to-0.3.md` exists + linter green
  - [ ] Per-request nonce in SSR; Playwright asserts header↔HTML match
  - [ ] `disallowedRoutes` + `disallowedBehavior` work
  - [ ] Defaults flipped: `csrf: 'strict'`, `cspMode: 'enforce'`, `DEFAULT_CSP` drops `'unsafe-inline'` for scripts
  - [ ] 4 new template Playwright specs green
  - [ ] Bundle budget enforced in CI
  - [ ] CONTRIBUTING + issue templates + PR template + SECURITY + CoC present
  - [ ] `theokit@0.3.0-beta.0` published on `next` tag for ≥ 7 days
  - [ ] `theokit@0.3.0` published as `latest` after zero-CRITICAL beta window
- [ ] **Dogfood QA PASS** — `/dogfood full` health score ≥ 70 (target 49/49)
- [ ] **Fixture proof** — every new framework feature has a reproducible fixture project in `fixtures/`

## Final Phase: Dogfood QA (MANDATORY)

> This phase runs AFTER all implementation phases are complete. The plan is NOT done until dogfood passes.

**Objective:** Validate that the implemented changes work as a real user would experience them, not just as unit tests assert.

### Execution

Already specified in **Phase 10** above. Run `/dogfood full`. Always full. No shortcuts. Plus the 6 manual steps.

### Acceptance Criteria

(see Phase 10)

### If Dogfood Fails

(see Phase 10)
