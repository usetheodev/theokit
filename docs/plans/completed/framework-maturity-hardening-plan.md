# Plan: Framework Maturity Hardening — close all production-readiness gaps

> **Version 1.0** — Closes every maturity gap surfaced in the 2026-05-21 honest
> assessment. Moves TheoKit from "MVP production-ready for early adopters" to
> "production-ready for teams" by adding the operational safety net the 0.3.0
> strict cutover needs (structured CSRF telemetry + static upgrade-readiness
> analyzer + migration guide), validating at least one deploy adapter in real
> production, completing E2E coverage for all six templates plus WebSocket,
> load testing the SSR streaming path, hardening the lowest-covered file
> (api-middleware.ts at 68.75%), and gating the 0.3.0 release behind a beta
> channel on npm. Net outcome: when 0.3.0 ships to `latest`, the framework
> has multiple defensive layers (warn telemetry, static check, migration
> guide, beta gate) instead of relying on the user to read the changelog
> carefully.

## Context

### What exists today

The 2026-05-21 maturity audit (this conversation) catalogued the following
**concrete, evidence-backed gaps**:

| # | Gap | Evidence |
|---|---|---|
| 1 | `useAgentStream` does not attach `X-Theo-Action: 1` on send | Default-template Playwright spec produces `csrf.warn` on every chat send (visible in test logs of commit `c814585`) |
| 2 | `theokit check --upgrade-readiness` does not exist | Roadmap in `CLAUDE.md` ("Pre-requisites — ALL must clear before flipping"), no command in `packages/theo/src/cli/commands/` |
| 3 | `csrf.warn` log goes to stdout with no structured sink | `packages/theo/src/server/csrf.ts::dispatchCsrfWarn` writes via `logger.warn`; no `sink` option in `defineConfig` |
| 4 | Migration guide 0.2 → 0.3 not written | `docs/migration/` empty, only `0.2.0` README banner is "Open" |
| 5 | No deploy adapter validated in real production | Roadmap explicit: "Open: validate at least one deploy adapter end-to-end". `examples/` has no Vercel target proof |
| 6 | Playwright covers only `template-default` + `devtools-overlay` | `tests/e2e/` lists 2 specs; `packages/create-theo/templates/{dashboard,api-only,postgres,saas}` have zero E2E |
| 7 | WebSocket has unit tests but no Chromium E2E | `tests/unit/define-websocket.test.ts` only; no `tests/e2e/*websocket*.spec.ts` |
| 8 | SSR streaming path never load tested | No `scripts/load-test*`, no entry in `deploy-evidence.jsonl` for streaming TTFB under load |
| 9 | `api-middleware.ts` coverage 68.75% lines / 41.17% branches | Coverage table from `pnpm test:coverage` post `c814585` |
| 10 | `theokit@0.2.0` not on npm `latest` | `npm view theokit version` (when run) shows pre-0.2.0 or scoped dev tags |
| 11 | No `0.3.0-beta.0` beta gate | No `next` tag on the npm registry; CSRF/CSP strict defaults already merged in `develop` but not gated by beta |

### Why now

Per `CLAUDE.md` TheoKit roadmap (and explicitly the 0.3.0 section): the strict
CSRF/CSP cutover is rated **"the most dangerous release on the roadmap because
it fails silently — no compile error, no test fail, only runtime breakage in
production"**. The defensive mechanisms designed to make that release safe
(warn-mode telemetry, static check, migration guide, beta gate) **do not yet
exist**. The code that flips defaults is merged in `develop`
(commit `3ee9dac`). Shipping 0.3.0 to `latest` without these safety nets
puts every adopter at risk of a silent production regression.

This plan is the prerequisite work before `0.3.0` can be promoted from `next`
to `latest`.

## Objective

**Done** = every gap in the table above has a verifiable resolution in code,
docs, or registry state, and `pnpm test`, `pnpm lint`, `pnpm test:coverage`,
`pnpm playwright test`, and the new load-test script all pass green.

Specific measurable goals:

1. `useAgentStream` emits `X-Theo-Action: 1` on every non-GET send (regression test).
2. `theokit check --upgrade-readiness 0.3` exists, exits non-zero on detected breakage, exits zero on clean code.
3. `csrf.warn` events flow through a configurable sink (Sentry adapter shipped + stdout default).
4. `docs/migration/0.2-to-0.3.md` exists with grep-able audit recipes + the static-check command reference.
5. At least one `examples/` deploys to Vercel and the live URL passes a smoke check (recorded in `deploy-evidence.jsonl`).
6. All six templates (`default`, `dashboard`, `api-only`, `postgres`, `saas`, plus `devtools-demo`) have Playwright specs.
7. WebSocket has a Chromium E2E spec covering upgrade + bidi + reconnect.
8. SSR streaming holds 1000 concurrent connections without memory growth above baseline + 50 MB.
9. `api-middleware.ts` coverage ≥ 80% lines / 75% branches.
10. `theokit@0.2.0` published to `latest`. `theokit@0.3.0-beta.0` published to `next`.

## Edge Cases (incorporated 2026-05-21 from edge-case-plan review)

This plan was reviewed against the `edge-case-plan` checklist. 12 MUST FIX
items surfaced and are folded into the relevant tasks below. The full review
table is in `docs/reviews/edge-case/framework-maturity-hardening-2026-05-21.md`.

Highlights woven into the tasks:
- **EC-1/2/3** (T1.1): `theokit check` must (a) handle absent `app/`, (b) exclude `node_modules/`, (c) refuse to run outside a TheoKit project.
- **EC-4/5** (T2.1): CSRF telemetry sink is fire-and-forget; warn-once dedup happens **after** successful delivery.
- **EC-6** (T3.1): Recipe test cannot depend on `jq` (CI portability) — use a Node-only equivalent.
- **EC-7** (T4.1): Vercel deploy hard-capped at 5 min via `timeout 300`.
- **EC-8/9** (T5.1): Playwright `webServer.timeout: 180_000` + `pg_isready` wait gate.
- **EC-10** (T6.1): `/__theo/test/disconnect-ws` gated to `NODE_ENV === 'test'`.
- **EC-11** (T7.1): Load-test baseline is **relative** (current ≤ prev × 1.2), not absolute.
- **EC-12** (T9.1): Multi-package publish is atomic — dry-run both first, real publish second.

## ADRs

### D1 — `theokit check` is a NEW top-level CLI command, not a flag on `dev`/`build`

**Decision:** Add a new command `theokit check` under
`packages/theo/src/cli/commands/check.ts`, with `--upgrade-readiness <version>`
as its first sub-flag. Reserved for future static-analysis additions
(e.g. `--security`, `--bundle`, `--deprecations`).

**Rationale:** Co-locating with `dev`/`build` (e.g. `theokit dev --check`)
would couple unrelated concerns and force CI users to spin up a dev server
just to lint config. A dedicated command is what every comparable framework
ships (`next lint`, `astro check`, `svelte-check`). Static analysis must
run in seconds without a running server.

**Consequences:** Enables future `theokit check --deprecations`,
`theokit check --bundle`, etc. without re-litigating CLI surface. Costs:
~50 LOC of CLI scaffold (commander option group).

### D2 — CSRF telemetry uses a pluggable sink, not a hardcoded HTTP exporter

**Decision:** `defineConfig({ security: { csrfTelemetry: { sink } } })` where
`sink` is `(event: CsrfWarnEvent) => void | Promise<void>`. Ship adapters in
`packages/theo/src/server/telemetry-sinks/` for `stdout` (default),
`opentelemetry`, and a thin `sentry` wrapper. NEVER POST events to a
TheoKit-owned endpoint by default — no anonymous reporting back to usetheo.dev
unless the user opts in explicitly.

**Rationale:** Frameworks that exfiltrate telemetry by default (looking at
Next.js telemetry) burn community trust. Pluggable sinks preserve the user's
control while still solving the "log lost in stdout" problem. Sentry/OTel
adapters are thin (~30 LOC each) because they delegate to first-party SDKs.

**Consequences:** No central dashboard, no anonymous aggregate stats for the
framework team. That's deliberate — the privacy posture matches the rest of
the framework. Multi-tenant aggregation (if ever needed) is opt-in via a
hosted aggregator the user runs themselves.

### D3 — Migration guide is auto-tested by an integration test

**Decision:** Every grep recipe in `docs/migration/0.2-to-0.3.md` is exercised
by a snapshot test (`tests/integration/migration-guide-recipes.test.ts`). If
the framework changes the warn-event payload shape or rename a field, the
test catches the doc drift.

**Rationale:** Migration docs rot fastest. The 2026-05-15 audit found
documentation drift on CSRF/CSP defaults already. Auto-testing the recipes
guarantees the doc + code never diverge silently.

**Consequences:** Adds ~50 LOC of fixture log data + assertion. Worth it.

### D4 — Vercel deploy validation uses an `examples/deploy-vercel/` project, not the default template

**Decision:** Add `examples/deploy-vercel/` with `vercel.json` checked in,
`theo.config.ts` with `adapter: 'vercel'`, and a `package.json` script
`deploy:smoke` that runs against the live Vercel preview deployment URL
(via `gh` Actions or local `vercel deploy --token`).

**Rationale:** Putting deploy validation in the default template would couple
"scaffold output" with "deploy proof" and make first-time users confused.
A dedicated example is the canonical way (Next.js does this with
`examples/with-vercel`, etc.).

**Consequences:** One more example to maintain. Acceptable — the validation
is now reproducible by any contributor with `vercel deploy --token`.

### D5 — Load testing uses `autocannon` (not k6, not custom)

**Decision:** Use `autocannon` (Node-native, ~30 KB transitive deps) for HTTP
load tests. Avoid `k6` (requires Go binary, slow dev loop, not npm-installable).
Custom load harness was considered and rejected — autocannon already covers
99% of HTTP perf needs.

**Rationale:** Lowest install friction. Already in the Node ecosystem.
`autocannon` ships streaming-aware metrics (`p99 latency`, `RPS`,
`bytes/sec`) — exactly what we need for SSR streaming.

**Consequences:** SSR streaming is HTTP/1.1 chunked, which autocannon handles.
If we later need WebSocket load testing, switch to `artillery` or `k6` then.
For now, autocannon is right-sized.

### D6 — Beta gate is `npm dist-tag` based, not branch based

**Decision:** `theokit@0.3.0-beta.0` is published to the `next` dist-tag on
npm. The `develop` branch continues to be the working branch; tagging a
version triggers `pnpm publish --tag next`. Promotion to `latest` is a manual
`npm dist-tag add theokit@0.3.0 latest` after the beta period.

**Rationale:** Branch-based gating (e.g. "0.3 branch in git, 0.2 in main")
adds branch maintenance overhead with zero user-facing benefit. Dist-tags
are the npm-native mechanism and what every mature framework uses
(React `next`, Vite `beta`, Next.js `canary`).

**Consequences:** Users must opt in with `npm install theokit@next`. Default
`npm install theokit` continues to install 0.2.x until the manual promotion.

### D7 — Each task ships with a fixture under `tests/fixtures/` (per project rule)

**Decision:** Reaffirms the project rule "every framework feature needs a
fixture". Every new code path in this plan gets a fixture in
`tests/fixtures/` (e.g. `tests/fixtures/upgrade-readiness-app/`,
`tests/fixtures/csrf-telemetry-app/`) so future regression tests can pin
the wire shape.

**Rationale:** Existing `.claude/rules/testing.md` enforces this; the plan
must follow the project's own rule.

**Consequences:** ~6 new fixture projects added. Each is ~5 files / ~50 LOC.

## Dependency Graph

```
Phase 0: useAgentStream fix
   │
   ├──▶ Phase 1: --upgrade-readiness CLI ────┐
   │                                          │
   ├──▶ Phase 2: Structured CSRF telemetry ──┤
   │                                          ▼
   │                              Phase 3: Migration guide 0.2 → 0.3
   │                                          │
   ├──▶ Phase 4: Vercel deploy validation ────┤
   │                                          │
   ├──▶ Phase 5: Playwright for 4 templates ──┤
   │                                          │
   ├──▶ Phase 6: WebSocket E2E ───────────────┤
   │                                          │
   ├──▶ Phase 7: Load testing SSR ────────────┤
   │                                          │
   └──▶ Phase 8: api-middleware coverage ─────┤
                                              │
                                              ▼
                              Phase 9: Release engineering
                              (publish 0.2 latest + 0.3-beta.0 next)
                                              │
                                              ▼
                              Phase 10: Dogfood QA (MANDATORY)
```

**Parallelism**: Phases 1, 2, 4, 5, 6, 7, 8 are independent after Phase 0 and
can be parallelized across engineers. Phase 3 blocks on Phase 1 + Phase 2.
Phase 9 blocks on everything. Phase 10 is the final gate.

---

## Phase 0: Foundation — `useAgentStream` attaches `X-Theo-Action: 1`

**Objective:** Unblock every downstream phase by making the default
scaffold's chat surface compatible with strict CSRF.

### T0.1 — `useAgentStream` sends `X-Theo-Action: 1` on every non-GET request

#### Objective
The `useAgentStream` React hook's underlying `fetch` call must include
`X-Theo-Action: 1` so the default scaffold's chat demo does not emit a
`csrf.warn` on every send (today) and does not return 403 (post-0.3.0).

#### Evidence
- Default template Playwright log (commit `c814585`) shows `csrf.warn` event
  on every chat message send: `{"event":"csrf.warn","path":"/api/chat",
  "reason":"Missing X-Theo-Action header"}`.
- `packages/theo/src/client/use-agent-stream.ts` calls
  `consumeAgentStream({ fetch })` which delegates to
  `packages/theo/src/client/agent-stream-core.ts`. Neither file attaches
  the header.
- `CLAUDE.md` 0.3.0 section: "Fix `useAgentStream` to attach
  `X-Theo-Action: 1` on every non-GET — blocks everything else (30 min of
  work)".

#### Files to edit
```
packages/theo/src/client/agent-stream-core.ts    — attach header in default fetch
packages/theo/src/client/use-agent-stream.ts     — pass header through if user
                                                   overrides fetch via options
tests/unit/agent-stream-core.test.ts             — RED test asserting header
tests/unit/use-agent-stream.test.ts              — RED test asserting hook
                                                   forwards header
tests/e2e/template-default.spec.ts               — assert no csrf.warn appears
                                                   in dev console during chat send
```

#### Deep file dependency analysis
- `agent-stream-core.ts::consumeAgentStream` accepts `headers?: Record<string,string>` (line 28). Today it spreads `options.headers` over `{ 'content-type': 'application/json', accept: 'text/event-stream' }`. Change: add `'X-Theo-Action': '1'` to the base headers, but allow user override (`{...base, ...options.headers}` order).
- `use-agent-stream.ts::useAgentStream` accepts `UseAgentStreamOptions` (line 36) with `headers?: Record<string,string>`. Today it forwards `options.headers` directly. No change needed once core attaches the header — the hook inherits it.
- Downstream: `packages/create-theo/templates/default/app/page.tsx` calls `useAgentStream({ url: '/api/chat' })` without overriding headers — picks up the new default automatically.
- Downstream: `examples/agent-saas/app/page.tsx` and `examples/devtools-demo/app/page.tsx` — same pattern, inherit fix.

#### Deep Dives
**Header precedence**: user-supplied `options.headers` overrides the default
to preserve the escape hatch for advanced fetchers that explicitly set
their own framing. Implementation order:

```ts
const finalHeaders = {
  'X-Theo-Action': '1',
  'content-type': 'application/json',
  accept: 'text/event-stream',
  ...options.headers,  // user override wins
}
```

**Edge case (intentional)**: a user who explicitly sets
`headers: { 'X-Theo-Action': undefined }` to opt out — `undefined` values
in a fetch headers init are dropped by the spec, so opt-out works
naturally.

#### Tasks
1. Read current `agent-stream-core.ts` to confirm header build site.
2. Add `X-Theo-Action: 1` to the base headers (before user spread).
3. Verify `use-agent-stream.ts` doesn't strip the header in the hook layer.
4. Add unit test asserting the header is in the fetch init.
5. Add Playwright assertion: no `csrf.warn` event in dev console after sending a chat message.
6. Update `tests/fixtures/use-agent-stream-react/` if needed to assert the new behavior.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     test_header_attached_on_default_fetch() —
         Given a call to consumeAgentStream with default options,
         When inspecting the fetch init,
         Then headers['X-Theo-Action'] === '1' (MUST fail before fix)

RED:     test_user_can_override_header() —
         Given consumeAgentStream({ headers: { 'X-Theo-Action': 'custom' } }),
         When inspecting the fetch init,
         Then headers['X-Theo-Action'] === 'custom' (validation: override path)

RED:     test_user_can_opt_out_with_undefined() —
         Given consumeAgentStream({ headers: { 'X-Theo-Action': undefined } }),
         When inspecting the fetch init,
         Then headers['X-Theo-Action'] is absent (edge case)

RED:     test_hook_forwards_header_through_to_core() —
         Given a mocked fetch + useAgentStream({ url: '/api/chat' }).send({}),
         When inspecting the mock's last call,
         Then the request headers include 'X-Theo-Action: 1' (error scenario:
         hook layer must not strip the header)

GREEN:   Add `'X-Theo-Action': '1'` to base headers in agent-stream-core.ts
         before the spread of options.headers.

REFACTOR: None expected (one-line addition).

VERIFY:  npx vitest run tests/unit/agent-stream-core.test.ts \
                       tests/unit/use-agent-stream.test.ts &&
         npx playwright test tests/e2e/template-default.spec.ts
```

#### Acceptance Criteria
- [ ] `tests/unit/agent-stream-core.test.ts` includes 4 new tests, all green
- [ ] `tests/e2e/template-default.spec.ts` no longer logs `csrf.warn` on send
- [ ] `tsc --noEmit` zero errors
- [ ] `eslint --max-warnings=0` clean
- [ ] Bundle size delta < +50 bytes gzipped (verified by `pnpm bundle:check`)

#### DoD
- [ ] All 4 RED → GREEN tests pass
- [ ] Playwright `template-default` spec green
- [ ] No `csrf.warn` event in default template chat flow
- [ ] Lint + format + typecheck clean
- [ ] Bundle budget still under 350 KB gzipped

---

## Phase 1: Static Upgrade Readiness Analyzer

**Objective:** Ship `theokit check --upgrade-readiness 0.3` so users can detect
breakage before they bump the version.

### T1.1 — `theokit check` CLI scaffold + detection engine

#### Objective
Add the `check` command with `--upgrade-readiness <version>` flag, plus the
AST-walker engine and three detection rules: CSRF custom fetcher, CSP inline
script, form action without CSRF.

#### Evidence
- `CLAUDE.md` 0.3.0 prerequisites: "theokit check --upgrade-readiness 0.3
  command that scans the user's app and reports anticipated breakage before
  they bump. Static analysis of route handlers, inline-script detection
  in app/**, lint-style report. ~ 2–3 days to implement."
- No file currently exists at `packages/theo/src/cli/commands/check.ts`.
- Existing pattern: `packages/theo/src/cli/commands/{dev,build,start,add}.ts`
  use commander + a `register(program)` export.

#### Files to edit
```
packages/theo/src/cli/commands/check.ts                (NEW) — command registration
packages/theo/src/cli/check/walker.ts                  (NEW) — AST walker (ts-morph)
packages/theo/src/cli/check/rules/csrf-custom-fetcher.ts  (NEW) — Rule 1
packages/theo/src/cli/check/rules/csp-inline-script.ts    (NEW) — Rule 2
packages/theo/src/cli/check/rules/form-without-csrf.ts    (NEW) — Rule 3
packages/theo/src/cli/check/rules/types.ts             (NEW) — Rule interface
packages/theo/src/cli/check/reporter.ts                (NEW) — lint-style output
packages/theo/src/cli/index.ts                         — register the command
tests/fixtures/upgrade-readiness-clean/                (NEW) — fixture with zero issues
tests/fixtures/upgrade-readiness-dirty/                (NEW) — fixture with 4 known issues
tests/unit/check-csrf-fetcher-rule.test.ts             (NEW)
tests/unit/check-csp-inline-rule.test.ts               (NEW)
tests/unit/check-form-csrf-rule.test.ts                (NEW)
tests/integration/check-cli.test.ts                    (NEW) — end-to-end CLI invocation
```

#### Deep file dependency analysis
- `cli/index.ts` already wires `dev`, `build`, `start`, `add`. Add one line: `check.register(program)`. Pattern unchanged.
- `cli/check/walker.ts` uses `ts-morph` (already in devDependencies, used by existing `scan` modules). It enumerates `.ts/.tsx` under `app/**` and `server/**`, returns a stream of source files.
- Each rule file exports a `Rule` (id, severity, scope: 'csrf'|'csp', detect(sourceFile) → Finding[]). The walker invokes every rule per file.
- `reporter.ts` formats `Finding[]` as either lint-style text (`file:line:col message`) or JSON (`--json` flag). Pattern mirrors `eslint --format`.
- Downstream: `packages/create-theo/templates/default/package.json` gets a new `"check": "theokit check --upgrade-readiness 0.3"` script.

#### Deep Dives
**Rule 1: CSRF custom fetcher detection** — scan for `CallExpression` whose
callee is the global `fetch` identifier (NOT `theoFetch` import), with a
property `method` in `{ 'POST', 'PUT', 'PATCH', 'DELETE' }`, where the
arguments do NOT include a property `X-Theo-Action`. Skip allow-listed
patterns (e.g. external URLs starting with `https://`, OR explicit
`// theokit-check-ignore csrf-fetcher` comment on the previous line).

**Rule 2: CSP inline script detection** — match `<script>` JSX elements
with `dangerouslySetInnerHTML` prop OR text children (literal string).
Also match `document.createElement('script')` followed by `.innerHTML` or
`.appendChild(textNode)`. Skip if a nonce attribute references `ctx.nonce`.

**Rule 3: Form action without CSRF** — match `<form>` JSX elements with
`action` prop pointing to a local `/api/__actions/...` URL OR `method="POST"`,
where no `<input type="hidden" name="_csrf">` child is present AND the form
is not the framework's `<Form>` component imported from `theokit/client`.

**Output format (lint-style)**:
```
app/checkout.tsx:14:5  error  fetch() POST without X-Theo-Action  csrf-custom-fetcher
app/layout.tsx:11:7    error  inline <script> without nonce       csp-inline-script
app/login.tsx:22:3     error  <form> POST without _csrf token     form-without-csrf

3 errors in 3 files
```

**Exit codes**: 0 = clean, 1 = warnings only, 2 = errors found.

#### Tasks
1. Create `cli/check/` directory + rule type interfaces.
2. Implement `walker.ts` using ts-morph (initialize Project, glob `app/**/*.{ts,tsx}` AND `server/**/*.ts`, return SourceFile[]).
3. **(EC-2)** Walker explicit excludes: `['**/node_modules/**', '**/dist/**', '**/.theo/**', '**/build/**']`.
4. **(EC-1)** If `app/**` returns 0 files, log warning and proceed with `server/**` only. If both empty, exit 0 with "No source files to check".
5. **(EC-3)** Before scanning, read cwd `package.json`. If `theokit` is absent from both `dependencies` and `devDependencies`, exit 1 with: `"Not a TheoKit project (theokit not in package.json). Run from your project root."`.
6. Implement Rule 1 (csrf-custom-fetcher).
7. Implement Rule 2 (csp-inline-script).
8. Implement Rule 3 (form-without-csrf).
9. Implement `reporter.ts` with lint-style + JSON output.
10. Create `cli/commands/check.ts` with commander wiring.
11. Register in `cli/index.ts`.
12. Create fixtures: `upgrade-readiness-clean/` (passes), `upgrade-readiness-dirty/` (3 issues, one per rule), `upgrade-readiness-no-app/` (only server/ exists), `upgrade-readiness-not-a-theokit-project/` (no theokit in package.json).
13. Add unit tests per rule + integration test for CLI invocation.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     test_csrf_fetcher_rule_detects_post_without_header() —
         Given a source file with fetch('/api/x', { method: 'POST' }),
         When running csrf-custom-fetcher rule,
         Then 1 Finding emitted at the call-expression line (happy path)

RED:     test_csrf_fetcher_rule_ignores_theofetch() —
         Given a source file with theoFetch.post('/api/x', body),
         When running the rule,
         Then 0 Findings (validation error scenario — must NOT false-positive)

RED:     test_csrf_fetcher_rule_ignores_external_urls() —
         Given fetch('https://stripe.com/api/x', { method: 'POST' }),
         When running the rule,
         Then 0 Findings (edge case: external POST is fine, CSRF is same-origin)

RED:     test_csrf_fetcher_rule_handles_unparseable_file() —
         Given a file with malformed TypeScript,
         When running the rule,
         Then exits with a "parse error" diagnostic, not a crash (error scenario)

(Same 4-scenario pattern repeated for Rule 2 and Rule 3)

RED:     test_cli_exits_2_when_errors_found() —
         Given the dirty fixture (3 known issues),
         When running `theokit check --upgrade-readiness 0.3`,
         Then exit code === 2 and stderr lists 3 findings

RED:     test_cli_exits_0_on_clean_fixture() —
         Given the clean fixture (0 issues),
         When running `theokit check --upgrade-readiness 0.3`,
         Then exit code === 0 and stdout reads "No upgrade-readiness issues"

RED:     test_cli_exits_1_outside_theokit_project() —  (EC-3)
         Given a cwd with no theokit in package.json,
         When running `theokit check --upgrade-readiness 0.3`,
         Then exit code === 1 with "Not a TheoKit project" message

RED:     test_cli_handles_missing_app_dir_gracefully() —  (EC-1)
         Given a project with only server/, no app/,
         When running the command,
         Then exit code === 0 with warning "No app/ directory; checked server/ only"

RED:     test_walker_excludes_node_modules() —  (EC-2)
         Given a project with node_modules/some-pkg/index.ts containing `fetch('/api/x', { method: 'POST' })`,
         When walker enumerates,
         Then that file is NOT in the source-file list

RED:     test_walker_respects_symlink_boundaries() —  (EC-14, SHOULD TEST)
         Given a symlink in app/external → /etc,
         When walker enumerates,
         Then files outside cwd are not included

GREEN:   Implement walker, 3 rules, reporter, CLI command in that order.

REFACTOR: Extract a common `findCallExpressions(sourceFile, predicate)` helper
          shared by rules 1 + 2 if duplication appears.

VERIFY:  npx vitest run tests/unit/check-*.test.ts \
                       tests/integration/check-cli.test.ts
```

#### Acceptance Criteria
- [ ] `theokit check --upgrade-readiness 0.3` runs against any project
- [ ] Exits 0/1/2 per spec
- [ ] All 4 BDD scenarios pass per rule (12 unit tests minimum)
- [ ] Integration test covers full CLI roundtrip against fixtures
- [ ] `--json` flag produces parseable JSON
- [ ] Documented in `packages/theo/README.md` under "CLI commands"

#### DoD
- [ ] 12 unit tests + 2 integration tests green
- [ ] Both fixtures committed
- [ ] CLI registered and visible in `theokit --help`
- [ ] Lint + format + typecheck clean
- [ ] No new runtime deps (ts-morph already in tree)

### T1.2 — `--fix` mode for trivial auto-refactors

#### Objective
Implement `theokit check --upgrade-readiness 0.3 --fix` that auto-rewrites
`fetch(url, { method: 'POST' })` calls to `theoFetch.post(url, body)` when
the rewrite is unambiguous (no spread, no dynamic method).

#### Evidence
- ESLint, prettier, and every modern linter ships `--fix`. Users expect
  this affordance. Without it, manually editing 50+ files in a large app
  is friction that delays upgrades.
- Out of the 3 rules, only Rule 1 has an unambiguous auto-fix; rules 2 + 3
  require user judgment.

#### Files to edit
```
packages/theo/src/cli/check/fixers/csrf-fetcher-fix.ts  (NEW) — AST transform
packages/theo/src/cli/check/fixers/types.ts             (NEW) — Fixer interface
packages/theo/src/cli/commands/check.ts                 — wire --fix flag
tests/unit/check-csrf-fetcher-fix.test.ts               (NEW)
tests/fixtures/upgrade-readiness-fixable/               (NEW) — fixture w/ before+after snapshots
```

#### Deep file dependency analysis
- `fixers/csrf-fetcher-fix.ts` uses ts-morph's `replaceWithText` API on the
  `CallExpression` node. It must preserve surrounding whitespace and JSDoc.
- The `check.ts` command grows a `--fix` flag. When passed, after detection,
  iterate findings, invoke the matching fixer if `fixer != null`, then
  `sourceFile.saveSync()`.
- Fixtures pin the exact before/after to catch silent regressions.

#### Deep Dives
**Safety guardrails**:
- Only fix when the call expression is exactly `fetch(url, { method: 'POST', ... })` with literal method and no spread (`...rest`).
- Body is preserved verbatim into `theoFetch.post(url, body)`.
- Headers are merged (theoFetch already attaches `X-Theo-Action`, so user headers go second).
- If the call is inside a JSX prop or template literal, skip (too risky).

**Idempotence**: running `--fix` twice on the same file must be a no-op.
Achieved by checking that the callee is the global `fetch` (not `theoFetch`)
before transforming.

#### Tasks
1. Create `fixers/csrf-fetcher-fix.ts` with the AST transform.
2. Add `--fix` flag to `check.ts`.
3. Apply fixers after detection if `--fix` is set; write files back.
4. Create `tests/fixtures/upgrade-readiness-fixable/` with `before/` and `expected-after/`.
5. Unit test: run fixer on `before/`, diff against `expected-after/`.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     test_fix_rewrites_simple_post_to_theofetch() —
         Given `fetch('/api/x', { method: 'POST', body: JSON.stringify(d) })`,
         When running --fix,
         Then file contains `theoFetch.post('/api/x', d)` (happy path)

RED:     test_fix_skips_spread_arguments() —
         Given `fetch('/api/x', { method: 'POST', ...opts })`,
         When running --fix,
         Then file is unchanged (validation: ambiguous, leave to human)

RED:     test_fix_idempotent_on_already_fixed_file() —
         Given a file already using theoFetch.post,
         When running --fix,
         Then file is unchanged (edge case)

RED:     test_fix_preserves_surrounding_whitespace_and_comments() —
         Given a file with JSDoc above the fetch call,
         When running --fix,
         Then JSDoc remains intact above the new theoFetch call
         (error scenario: code-mangling regressions)

GREEN:   Implement the fixer, wire into check command.

REFACTOR: None expected.

VERIFY:  npx vitest run tests/unit/check-csrf-fetcher-fix.test.ts
```

#### Acceptance Criteria
- [ ] `--fix` rewrites unambiguous calls
- [ ] Idempotent (running twice = no-op)
- [ ] Preserves comments + whitespace
- [ ] Returns exit code 0 if all detected issues were auto-fixed

#### DoD
- [ ] 4 BDD scenarios green
- [ ] Fixture before/after snapshot stable
- [ ] Lint + format + typecheck clean

---

## Phase 2: Structured CSRF Telemetry

**Objective:** Replace the `console.log("csrf.warn")` pattern with a
configurable sink so production deploys can aggregate the data instead of
losing it in stdout noise.

### T2.1 — Pluggable sink interface + Sentry/OTel adapters

#### Objective
Add `defineConfig({ security: { csrfTelemetry: { sink } } })` and ship three
adapters: stdout (default), Sentry, OpenTelemetry. Refactor
`dispatchCsrfWarn` to dispatch through the sink.

#### Evidence
- Today, `dispatchCsrfWarn` in `packages/theo/src/server/csrf.ts` calls
  `logger.warn` which writes to stdout. No mechanism to redirect.
- Users with Datadog/Sentry/CloudWatch lose these events in log noise.
- Sentry SDK is already a common dep in real SaaS apps; an adapter is
  ~30 LOC.

#### Files to edit
```
packages/theo/src/server/telemetry-sinks/types.ts        (NEW) — CsrfWarnEvent type, Sink interface
packages/theo/src/server/telemetry-sinks/stdout.ts       (NEW) — default sink (JSON line)
packages/theo/src/server/telemetry-sinks/sentry.ts       (NEW) — Sentry adapter
packages/theo/src/server/telemetry-sinks/opentelemetry.ts (NEW) — OTel adapter (Span event)
packages/theo/src/config/schema.ts                       — extend security schema
packages/theo/src/server/csrf.ts                         — dispatch through sink
tests/unit/csrf-telemetry-sink.test.ts                   (NEW)
tests/integration/csrf-warn-sentry-adapter.test.ts       (NEW)
tests/fixtures/csrf-telemetry-app/                       (NEW) — fixture
```

#### Deep file dependency analysis
- `config/schema.ts::SecuritySchema` gains a `csrfTelemetry: z.object({ sink: z.function().optional() }).optional()` field. The function shape is `(event: CsrfWarnEvent) => void | Promise<void>`.
- `csrf.ts::dispatchCsrfWarn` reads `config.security.csrfTelemetry?.sink ?? stdoutSink` and invokes it. The existing `logger.warn` call is preserved as a default fallback inside `stdoutSink`.
- Sentry adapter calls `Sentry.captureMessage(event.reason, { level: 'warning', tags: { route: event.path } })` — never imports `@sentry/node` directly; uses a user-supplied client.
- OTel adapter creates a span event on the current active span.

#### Deep Dives
**Event shape (`CsrfWarnEvent`)**:
```ts
interface CsrfWarnEvent {
  event: 'csrf.warn'
  timestamp: string  // ISO-8601
  method: string     // 'POST' etc.
  path: string       // request URL.pathname
  reason: 'Missing X-Theo-Action header' | 'Origin mismatch' | 'CORS preflight failed'
  code: 'CSRF_STRICT_CUTOVER'
  docsUrl: string
  requestId: string | undefined
  // Future: user-agent, IP (consent-required), etc. — NOT in v1.
}
```

**Sink contract**: must not throw. If it does, the framework catches and
logs to stdout (avoiding error loops).

**(EC-4) Fire-and-forget dispatch — CRITICAL**: `dispatchCsrfWarn` MUST
invoke the sink as `void Promise.resolve().then(() => safeInvokeSink(sink, event))`.
Never `await` the sink in the request path. A slow Sentry HTTP call or a
synchronous `fs.appendFileSync` in a user-provided sink CANNOT block the
request. This is non-negotiable — synchronous sinks under load are the
#1 way to take down a production server with telemetry.

**(EC-5) Dedup-after-delivery**: the `warnOnce` Set records the dedup key
**only inside the `.then()` callback** after the sink resolved successfully.
If the sink throws (and `safeInvokeSink` catches), the key is NOT added,
so the next identical event re-tries. This avoids the failure mode where
a broken sink silently swallows 1000 events but the framework reports
"all delivered" because dedup ran before.

**Backward compat**: if `csrfTelemetry` is absent, behavior is identical
to today (stdoutSink writes the same JSON line, deduped by `warnOnce`).

#### Tasks
1. Define `CsrfWarnEvent` + `Sink` interface in `telemetry-sinks/types.ts`.
2. Implement `stdout.ts` (writes JSON line via `process.stdout.write`).
3. Implement `sentry.ts` (accepts a `client` parameter, calls `client.captureMessage`).
4. Implement `opentelemetry.ts` (accepts a `tracer`, creates span event).
5. Extend `config/schema.ts` with the new field.
6. Refactor `csrf.ts::dispatchCsrfWarn` to dispatch through the configured sink.
7. Preserve `warnOnce` dedup at the sink layer (not the CSRF layer) — same key.
8. Create fixture `tests/fixtures/csrf-telemetry-app/` with custom sink.
9. Unit tests for each adapter (mocked client).
10. Integration test: full request → 403 → sink invoked with expected payload.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     test_default_sink_writes_json_to_stdout() —
         Given no csrfTelemetry config,
         When a CSRF warn is dispatched,
         Then a JSON line matching CsrfWarnEvent appears on stdout
         (happy path — backward compat)

RED:     test_custom_sink_receives_event_when_configured() —
         Given defineConfig({ security: { csrfTelemetry: { sink: fn } } }),
         When a CSRF warn is dispatched,
         Then fn is called once with the event payload
         (validation: config wiring)

RED:     test_sink_throwing_does_not_crash_request() —
         Given a sink that throws synchronously,
         When CSRF warn fires,
         Then the request completes normally and a fallback line is in stdout
         (error scenario: defensive sink contract)

RED:     test_warn_once_dedup_still_works_with_custom_sink() —
         Given a sink + 100 identical CSRF warns,
         When all 100 fire,
         Then the sink is invoked exactly once (edge case: dedup invariant)

RED:     test_slow_sink_does_not_block_request() —  (EC-4)
         Given a sink that sleeps 2s on every call,
         When 100 concurrent requests all trigger CSRF warn,
         Then every request completes in <100ms (assertion: request latency
         is independent of sink latency; dispatch is fire-and-forget)

RED:     test_failing_sink_does_not_silence_future_events() —  (EC-5)
         Given a sink that throws on first call but succeeds on retry,
         When the same warn event fires twice,
         Then sink is invoked twice (not once), proving dedup only
         records keys for successful deliveries

GREEN:   Implement sink dispatch in csrf.ts. Lift warnOnce dedup to sink layer.

REFACTOR: Extract `safeInvokeSink(sink, event)` helper that wraps the call
          in try/catch + falls back to stdout if the user sink throws.

VERIFY:  npx vitest run tests/unit/csrf-telemetry-sink.test.ts \
                       tests/integration/csrf-warn-sentry-adapter.test.ts
```

#### Acceptance Criteria
- [ ] Default behavior unchanged (regression check: existing CSRF tests still green)
- [ ] Sentry adapter accepts a generic `{ captureMessage }` client (no hard dep on `@sentry/node`)
- [ ] OTel adapter accepts a generic `{ tracer }` (no hard dep on `@opentelemetry/api`)
- [ ] Sink contract documented in JSDoc
- [ ] Fixture demonstrates usage with a custom sink

#### DoD
- [ ] 4 BDD scenarios green
- [ ] All 3 adapters implemented + tested
- [ ] No new npm deps (Sentry/OTel are user-supplied)
- [ ] Lint + format + typecheck clean
- [ ] Bundle delta < +1 KB gzipped

### T2.2 — `/__theo/csrf-readiness` aggregator endpoint

#### Objective
Optional in-app aggregator: when enabled, the framework counts `csrf.warn`
events in memory and exposes a JSON summary at `/__theo/csrf-readiness`
(dev only, opt-in for prod via config flag).

#### Evidence
- Even with structured telemetry, a developer running `pnpm dev` locally
  benefits from a single endpoint that shows "these 4 routes will break
  on 0.3.0" without needing to wire up Sentry first.
- Mirrors the Next.js `/_next/internal/...` pattern for dev-only
  introspection endpoints.

#### Files to edit
```
packages/theo/src/server/csrf-readiness-endpoint.ts     (NEW) — handler
packages/theo/src/vite-plugin/api-middleware.ts         — mount endpoint in dev
packages/theo/src/server/csrf-readiness-store.ts        (NEW) — in-memory counter
packages/theo/src/server/csrf.ts                        — call store.record on warn
packages/theo/src/devtools/components/CsrfReadinessTab.tsx (NEW) — devtools tab
tests/unit/csrf-readiness-store.test.ts                 (NEW)
tests/integration/csrf-readiness-endpoint.test.ts       (NEW)
tests/e2e/devtools-csrf-readiness-tab.spec.ts           (NEW)
```

#### Deep file dependency analysis
- `csrf-readiness-store.ts` exports a singleton with `record(event)`, `summary()`, and `reset()`. Stores `Map<routeKey, { count, firstSeen, lastSeen }>`. Bounded at 1000 routes (drop oldest).
- `api-middleware.ts` mounts the handler at `/__theo/csrf-readiness` only when `mode === 'development'` OR `config.security.csrfTelemetry?.exposeReadinessEndpoint === true`.
- Devtools tab calls `fetch('/__theo/csrf-readiness')` and renders the table.

#### Deep Dives
**Summary payload**:
```json
{
  "generatedAt": "2026-05-21T10:00:00Z",
  "totalEvents": 142,
  "routes": [
    { "path": "/api/chat", "count": 89, "reason": "Missing X-Theo-Action header", "lastSeen": "..." },
    { "path": "/api/checkout", "count": 53, "reason": "Origin mismatch", "lastSeen": "..." }
  ]
}
```

**Production exposure**: behind explicit opt-in only — prevents accidental
prod information disclosure. The endpoint also requires
`X-Theo-Action: 1` on its own POST `reset()` action.

#### Tasks
1. Create `csrf-readiness-store.ts` with bounded counter.
2. Create endpoint handler in `csrf-readiness-endpoint.ts`.
3. Mount in `api-middleware.ts` (dev by default, opt-in for prod).
4. Wire store.record() into `dispatchCsrfWarn`.
5. Create devtools tab `CsrfReadinessTab.tsx` (4 tabs → 5).
6. Unit tests for store (bounded eviction, reset).
7. Integration test for endpoint (POST without header, then GET, see 1 entry).
8. Playwright test for devtools tab.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     test_store_records_warn_and_summarizes() —
         Given a fresh store,
         When 3 events fire on /api/chat and 2 on /api/checkout,
         Then summary() returns two routes with counts 3 and 2 (happy path)

RED:     test_endpoint_404_in_prod_without_opt_in() —
         Given config without exposeReadinessEndpoint,
         When GET /__theo/csrf-readiness in prod build,
         Then 404 (validation: privacy default)

RED:     test_store_evicts_oldest_at_1001st_route() —
         Given 1001 distinct routes recorded,
         When summary() runs,
         Then 1000 entries returned, first-recorded route evicted (edge case)

RED:     test_reset_requires_csrf_header() —
         Given POST /__theo/csrf-readiness/reset without X-Theo-Action,
         When the request hits the endpoint,
         Then 403 (error scenario: own endpoint enforces CSRF)

GREEN:   Implement store, endpoint, devtools tab.

REFACTOR: None expected.

VERIFY:  npx vitest run tests/unit/csrf-readiness-store.test.ts \
                       tests/integration/csrf-readiness-endpoint.test.ts &&
         npx playwright test tests/e2e/devtools-csrf-readiness-tab.spec.ts
```

#### Acceptance Criteria
- [ ] Endpoint mounted only in dev OR with explicit opt-in
- [ ] Bounded store (1000 entries max)
- [ ] Reset endpoint itself CSRF-protected
- [ ] Devtools tab shows live counts

#### DoD
- [ ] 4 BDD scenarios green
- [ ] Endpoint integration test green
- [ ] Playwright devtools tab green
- [ ] Lint + format + typecheck clean

---

## Phase 3: Migration guide 0.2 → 0.3

**Objective:** Write the migration guide and pin it with an auto-tested
recipe assertion so future framework changes can't silently break the doc.

### T3.1 — `docs/migration/0.2-to-0.3.md` + recipe test

#### Objective
Write the migration guide covering CSRF strict, CSP enforce, and the new
`theokit check --upgrade-readiness` command. Auto-test the grep recipes
against a fixture so the guide can't rot.

#### Evidence
- `CLAUDE.md` 0.3.0 task list: "Write the 0.2.x migration guide (audit
  commands + checklist) — ship as part of the next 0.2.x patch". Still open.
- No file exists at `docs/migration/0.2-to-0.3.md`.
- ADR D3 (this plan) requires auto-test.

#### Files to edit
```
docs/migration/0.2-to-0.3.md                            (NEW) — the guide
docs/migration/fixtures/0.2-to-0.3-warn-log.jsonl       (NEW) — sample warn log
tests/integration/migration-guide-recipes.test.ts       (NEW) — recipe assertion
```

#### Deep file dependency analysis
- The guide references the `theokit check` command — depends on Phase 1 shipping first.
- The guide references the structured sink — depends on Phase 2.
- The recipe test uses the JSONL fixture as input to grep recipes documented in the guide. Each recipe is an `it('grep recipe N produces expected output', ...)` test that runs the documented shell command via execSync against the fixture.

#### Deep Dives
**Guide outline**:
1. What changed (CSRF strict, CSP enforce, AGENT_STREAM auto-header)
2. How to detect what will break in your app (`theokit check`)
3. How to grep your prod logs (recipes per sink type)
4. How to fix the 3 common patterns (custom fetcher, inline script, form action)
5. How to opt out per-endpoint (e.g. Stripe webhook: `csrf: false` + signature verification)
6. The beta channel (`npm install theokit@next`)

**Recipe example (in guide)** — TWO equivalents, no shell-tool dependency:
```bash
# Find every endpoint that will start failing on 0.3.0:
# Variant A — when you have jq (Linux/macOS dev machines):
grep '"event":"csrf.warn"' app.log | jq -r '.path' | sort -u

# Variant B — Node-only (works in CI / Windows / minimal containers):
node -e "process.stdin.on('data',d=>d.toString().split('\\n').filter(Boolean).forEach(l=>{try{console.log(JSON.parse(l).path)}catch{}}))" < app.log | sort -u
```

**(EC-6)** The auto-test uses **Variant B** so CI portability is preserved
(GitHub Windows runners, alpine containers, minimal CI environments may not
have `jq`). The guide ships both recipes so users pick what fits their env.

#### Tasks
1. Write the guide following the outline.
2. Create JSONL fixture with 5 synthetic warn events.
3. Write integration test that runs each documented shell recipe via `execSync` against the fixture.
4. Link the guide from `packages/theo/README.md` + monorepo `CLAUDE.md`.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     test_grep_recipe_lists_unique_paths() —
         Given the fixture JSONL,
         When running the documented grep|jq recipe,
         Then output is `/api/chat\n/api/checkout\n/api/upload` (happy path)

RED:     test_count_recipe_returns_total_events() —
         Given the fixture,
         When running the documented count recipe,
         Then output is `5` (validation: another doc recipe)

RED:     test_recipe_handles_jsonl_with_blank_lines() —
         Given a fixture with intermittent blank lines (real-log artifact),
         When running the recipe,
         Then output is unaffected (edge case)

RED:     test_recipe_fails_loudly_on_corrupt_jsonl() —
         Given a fixture with a malformed JSON line,
         When running the recipe,
         Then jq exits non-zero and the test catches it
         (error scenario: doc recipe robustness)

GREEN:   Write the guide. Implement the recipe test.

REFACTOR: None expected.

VERIFY:  npx vitest run tests/integration/migration-guide-recipes.test.ts
```

#### Acceptance Criteria
- [ ] Guide exists at `docs/migration/0.2-to-0.3.md`
- [ ] Linked from README + CLAUDE.md
- [ ] 4 recipe tests green
- [ ] Guide includes `theokit check --upgrade-readiness 0.3` invocation
- [ ] Guide includes `npm install theokit@next` instruction

#### DoD
- [ ] 4 BDD scenarios green
- [ ] Guide reviewed for clarity (human-readable, not LLM-padded)
- [ ] Cross-linked from at least 3 places (README, CLAUDE.md, devtools tab)

---

## Phase 4: Vercel deploy validation

**Objective:** Ship `examples/deploy-vercel/` and run it through a real
Vercel deployment, record the result.

### T4.1 — `examples/deploy-vercel/` + smoke script

#### Objective
Create a fully working example app, deploy it to Vercel (preview environment),
and add a smoke script that asserts the live URL serves the expected output.

#### Evidence
- Roadmap: "Validate at least one deploy adapter end-to-end in real production
  — Vercel is the lowest-friction path". Status: open.
- `packages/theo/src/adapters/vercel.ts` exists with unit tests but has never
  served a real request.
- `examples/agent-saas/` + `examples/devtools-demo/` exist but neither has a
  vercel.json or deploy script.

#### Files to edit
```
examples/deploy-vercel/                                 (NEW)
  ├── theo.config.ts                                    — adapter: 'vercel'
  ├── vercel.json                                       — vercel build config
  ├── app/page.tsx                                      — minimal route + assertion target
  ├── server/routes/health.ts                           — health check
  ├── package.json                                      — scripts: dev, build, deploy, smoke
  └── README.md                                         — how to deploy
scripts/deploy-smoke-vercel.sh                          (NEW) — runs vercel deploy + smoke
.github/workflows/deploy-vercel-smoke.yml               (NEW) — CI workflow
deploy-evidence.jsonl                                   (NEW or append) — recorded result
```

#### Deep file dependency analysis
- `examples/deploy-vercel/theo.config.ts` declares `adapter: 'vercel'`. The framework's `packages/theo/src/adapters/vercel.ts` is exercised end-to-end for the first time.
- `vercel.json` declares `builds` and `routes` per Vercel's expectation. The framework's build output must produce a directory layout that Vercel respects (this is what's never been validated in prod).
- `scripts/deploy-smoke-vercel.sh` requires `VERCEL_TOKEN` env var (CI secret). It runs **`timeout 300 vercel deploy --token "$VERCEL_TOKEN" --yes`** (5-min hard cap, EC-7), captures the URL, runs `curl --max-time 30` against `/` and `/api/health`, asserts 200.
- The CI workflow runs the smoke on every push to `develop` and `main`, but only when `examples/deploy-vercel/**` files change (to avoid burning Vercel deploy minutes on unrelated PRs).

#### Deep Dives
**Smoke assertions**:
1. `GET /` returns 200 with HTML containing `<h1>TheoKit deployed</h1>`
2. `GET /api/health` returns 200 with `{ ok: true, adapter: "vercel" }`
3. Response has `x-theo-deployed-by: vercel` header (framework adapter sets this)
4. SSR streaming actually streams (response has `transfer-encoding: chunked`)

**deploy-evidence.jsonl** entry format (matches existing framework convention):
```json
{"timestamp":"2026-05-21T...","adapter":"vercel","url":"https://...","durationSec":47,"status":"pass","commit":"<sha>"}
```

#### Tasks
1. Scaffold `examples/deploy-vercel/` minimal app.
2. Add `theo.config.ts` with Vercel adapter.
3. Add `vercel.json`.
4. Create `scripts/deploy-smoke-vercel.sh`.
5. Create `.github/workflows/deploy-vercel-smoke.yml`.
6. Run a real deploy locally with `VERCEL_TOKEN`, capture URL, append to `deploy-evidence.jsonl`.
7. Document in `examples/deploy-vercel/README.md` how to reproduce.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     test_smoke_script_passes_against_local_dev() —
         Given the example running on localhost:3000,
         When running the smoke script with LOCAL_URL,
         Then all 4 assertions pass (happy path — covers script logic
         before exposing CI to real Vercel)

RED:     test_smoke_script_fails_on_500_response() —
         Given a mock server returning 500 on /,
         When the smoke runs,
         Then exit code != 0 and stderr lists the failed assertion
         (validation: script catches breakage)

RED:     test_smoke_script_detects_non_streaming_response() —
         Given a mock server that buffers the response (no chunked encoding),
         When the smoke runs,
         Then assertion #4 fails (edge case: streaming detection)

RED:     test_smoke_script_handles_unreachable_url() —
         Given LOCAL_URL=http://localhost:65535,
         When the smoke runs,
         Then exit code != 0 with a "connection refused" message,
         not a stack trace (error scenario: script ergonomics)

GREEN:   Implement script with curl + grep + bash assertions.
         Run real Vercel deploy. Record evidence.

REFACTOR: None expected.

VERIFY:  bash scripts/deploy-smoke-vercel.sh --local &&
         (with VERCEL_TOKEN set) bash scripts/deploy-smoke-vercel.sh
```

#### Acceptance Criteria
- [ ] Example app builds and runs locally
- [ ] Smoke script passes against local dev
- [ ] At least one real Vercel deploy recorded in `deploy-evidence.jsonl`
- [ ] CI workflow exists and is gated on `examples/deploy-vercel/**`
- [ ] README documents reproduction steps

#### DoD
- [ ] 4 BDD scenarios green
- [ ] 1+ entry in `deploy-evidence.jsonl`
- [ ] CI workflow file committed (not necessarily enabled on `main` yet)
- [ ] Lint + format + typecheck clean

---

## Phase 5: Playwright for remaining templates

**Objective:** Add Playwright specs for `dashboard`, `api-only`, `postgres`,
`saas` — the four templates that currently have zero E2E coverage.

### T5.1 — Playwright specs for 4 templates

#### Objective
One spec per template, covering the template's primary user flow (e.g.
`saas` covers signup + dashboard; `postgres` covers a query through the
DB; `api-only` covers an authed API call; `dashboard` covers the metric
widgets rendering).

#### Evidence
- `packages/create-theo/templates/` contains 6 templates total.
- `tests/e2e/` lists 2 specs: `template-default.spec.ts`, `devtools-overlay.spec.ts`.
- 4 templates uncovered: roadmap explicitly mentions all 4 by name as "open".

#### Files to edit
```
tests/e2e/template-dashboard.spec.ts                    (NEW)
tests/e2e/template-api-only.spec.ts                     (NEW)
tests/e2e/template-postgres.spec.ts                     (NEW) — needs Postgres in CI
tests/e2e/template-saas.spec.ts                         (NEW) — needs Postgres in CI
playwright.config.ts                                    — add 4 new projects
.github/workflows/ci.yml                                — Postgres service for E2E job
```

#### Deep file dependency analysis
- `playwright.config.ts` already has 2 projects (`template-default`, `devtools`). Add 4 more, each with its own `webServer.command` that spins up the template via the create-theo scaffolder + `pnpm dev`. **(EC-8)** Each project declares `webServer.timeout: 180_000` — default 60s is too tight for first-run scaffold + `pnpm install` + dev boot.
- `tests/e2e/template-postgres.spec.ts` and `template-saas.spec.ts` need a real Postgres. The CI workflow gets a `postgres:16` service container. **(EC-9)** Before invoking Playwright, the workflow runs `until pg_isready -h localhost -U postgres -t 1; do sleep 1; done` with a 30s wallclock cap — Postgres healthcheck status alone is not enough; the service is "healthy" but ports/auth might not be ready.
- Each spec follows the same shape as `template-default.spec.ts`: scaffold the template into a temp dir, start dev server, hit URLs, assert.

#### Deep Dives
**dashboard template scenarios**:
- Home renders 4 metric widgets
- A click on a widget opens a drill-down panel
- The metric refresh button works (mock API responds, UI updates)

**api-only template scenarios**:
- `GET /api/health` returns 200 + JSON
- `POST /api/echo` with body returns the body
- `GET /api/missing` returns 404 with the expected error envelope

**postgres template scenarios**:
- App boots with `DATABASE_URL` set
- `GET /api/users` returns rows from a seeded table
- Migration applied on first dev run

**saas template scenarios**:
- Signup form submits, creates a user row, sets session
- Login form authenticates the same user
- Logout clears the session

#### Tasks
1. Add 4 specs to `tests/e2e/`.
2. Extend `playwright.config.ts` with 4 new projects.
3. Update `.github/workflows/ci.yml` E2E job with a Postgres service.
4. Verify each spec runs green locally with `npx playwright test`.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
For each of the 4 templates:

RED:     test_template_home_renders() —
         Given fresh scaffold + pnpm dev,
         When opening the home page,
         Then expected primary element is visible (happy path)

RED:     test_template_handles_missing_required_env() —
         Given DATABASE_URL unset (postgres/saas only),
         When booting,
         Then a clear error message is shown (validation)

RED:     test_template_handles_empty_state() —
         Given a template that lists records (saas users, postgres queries),
         When the DB is empty,
         Then UI shows the empty state, not a crash (edge case)

RED:     test_template_recovers_from_db_disconnect() —
         Given Postgres killed mid-test (postgres/saas only),
         When the next request fires,
         Then 503 with retry guidance, not a crash (error scenario)

GREEN:   Run scaffold, capture URLs, write assertions per spec.

REFACTOR: Extract a `scaffoldAndRun(template)` helper if duplication appears.

VERIFY:  npx playwright test tests/e2e/template-*.spec.ts
```

#### Acceptance Criteria
- [ ] 4 new specs, each with 4 BDD scenarios = 16 new Playwright tests
- [ ] All green locally
- [ ] CI workflow includes Postgres service for `postgres` and `saas`
- [ ] Existing `template-default` + `devtools` specs still green
- [ ] Total Playwright runtime under 5 min in CI

#### DoD
- [ ] All 16 BDD scenarios green
- [ ] CI workflow updated and validated on a feature branch
- [ ] No flake within 10 consecutive CI runs

---

## Phase 6: WebSocket E2E

**Objective:** Validate `defineWebSocket` in a real Chromium with upgrade
handshake, bidirectional messages, and reconnect.

### T6.1 — `defineWebSocket` Chromium E2E

#### Objective
Real browser test exercising the full WebSocket lifecycle: upgrade,
bidi echo, server-initiated close, client reconnect.

#### Evidence
- `tests/unit/define-websocket.test.ts` covers the API surface.
- `tests/unit/ws-scan.test.ts` covers the scanner.
- No file in `tests/e2e/` mentions `websocket` or `WebSocket`.
- Roadmap explicit: "WebSocket Playwright spec — `defineWebSocket` has unit tests but no real-browser test".

#### Files to edit
```
tests/fixtures/websocket-echo-app/                      (NEW) — minimal app w/ defineWebSocket
  ├── server/ws/chat.ts                                 — echo handler
  ├── app/page.tsx                                      — client connecting to /ws/chat
  └── theo.config.ts
tests/e2e/websocket-echo.spec.ts                        (NEW)
playwright.config.ts                                    — add ws-echo project
```

#### Deep file dependency analysis
- `server/ws/chat.ts` uses `defineWebSocket` to echo any message back.
- `app/page.tsx` creates a `new WebSocket('ws://localhost:3000/ws/chat')`, sends a message, displays the echo.
- The Playwright spec opens the page, types into an input, clicks send, waits for the echo to appear in the message list. Then kills the server (via `page.evaluate(() => window.__theo_kill_server)`) and asserts the client reconnects.

#### Deep Dives
**Server-kill simulation**: rather than actually killing the server (would
break the test runner), expose a `/__theo/test/disconnect-ws` route that
calls `ws.close(1011, 'server-killed-for-test')`. The client must handle
the abnormal close and attempt reconnect.

**(EC-10) CRITICAL — Endpoint gating**: `/__theo/test/disconnect-ws` MUST
only mount when `process.env.NODE_ENV === 'test'` OR config has explicit
`security.exposeTestEndpoints: true`. In dev/prod default, the path
returns 404. Without this guard, any user can DoS WS connections in
production with a single `curl POST`.

**Reconnect strategy** must be documented in the spec — exponential backoff
with cap. The test asserts: first reconnect attempt within 1s, second
within 3s, third within 7s (or whatever the docs say).

#### Tasks
1. Create the fixture app under `tests/fixtures/websocket-echo-app/`.
2. Create the Playwright spec.
3. Add the project to `playwright.config.ts`.
4. Verify locally.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     test_ws_upgrade_succeeds_in_chromium() —
         Given the echo fixture running,
         When the page loads and the WS connects,
         Then the connection state in the DOM reads "open" within 2s (happy path)

RED:     test_ws_rejects_origin_mismatch() —
         Given the page navigates from http://evil.example,
         When connecting,
         Then the upgrade is rejected (validation: defineWebSocket honors Origin check)

RED:     test_ws_handles_empty_message() —
         Given an open connection,
         When sending an empty string,
         Then echo receives and replays the empty string (edge case)

RED:     test_ws_reconnects_after_abnormal_close() —
         Given an open connection,
         When the server emits 1011,
         Then the client reconnects within 5s and resumes echo
         (error scenario)

RED:     test_disconnect_endpoint_returns_404_in_prod() —  (EC-10)
         Given the framework running with NODE_ENV=production AND
         security.exposeTestEndpoints unset,
         When POST /__theo/test/disconnect-ws,
         Then 404 (no DoS surface in production)

RED:     test_ws_reconnects_after_close_code_1006() —  (EC-16, SHOULD TEST)
         Given an open connection,
         When the underlying socket dies abnormally (code 1006, not clean
         1011 — simulated by closing the TCP socket without a close frame),
         Then the client reconnects (covers the real production failure
         mode of server crash, not just orderly shutdown)

GREEN:   Implement fixture + spec.

REFACTOR: None expected.

VERIFY:  npx playwright test tests/e2e/websocket-echo.spec.ts
```

#### Acceptance Criteria
- [ ] 4 BDD scenarios green in Chromium
- [ ] Origin check enforced (test asserts rejection)
- [ ] Reconnect behavior matches docs (timings asserted)

#### DoD
- [ ] All 4 scenarios green
- [ ] Fixture committed
- [ ] Playwright project registered

---

## Phase 7: Load testing SSR streaming

**Objective:** Prove the SSR streaming path holds under 1000 concurrent
connections without memory growth or latency cliffs.

### T7.1 — autocannon-based load harness + assertions

#### Objective
A scripted load test that runs against `examples/agent-saas/` (which uses
SSR + streaming), measures p99 latency, memory growth, and abort-on-disconnect
behavior. Asserts thresholds; fails CI if regressed.

#### Evidence
- Roadmap: "Load test the SSR streaming path — 1000 concurrent connections,
  leaky generators, slow LLM streams. Measure shell-flush TTFB,
  abort-on-disconnect behavior, memory pressure". Status: open.
- No file in `scripts/` mentions load testing.

#### Files to edit
```
scripts/load-test-streaming.mjs                         (NEW) — autocannon harness
scripts/load-test-baseline.json                         (NEW) — recorded baseline
tests/integration/load-test-baseline.test.ts            (NEW) — asserts on baseline file
.github/workflows/load-test.yml                         (NEW) — nightly CI job
```

#### Deep file dependency analysis
- `scripts/load-test-streaming.mjs` spawns `examples/agent-saas` via `pnpm build && pnpm start`, runs autocannon for 60s with 1000 connections against a known streaming endpoint, captures `process.memoryUsage()` deltas, and writes results to JSON.
- The baseline file pins the acceptable thresholds. The integration test runs the harness, then asserts results don't regress.
- Nightly CI catches regressions without burning every PR's CI budget.

#### Deep Dives
**Thresholds — RELATIVE, not absolute (EC-11)**:

CI runners have high variance (free-tier vs paid GitHub Actions, runner load).
Absolute thresholds (`p99 < 500ms`) produce flaky CI. Instead, every run
compares against the previous baseline in `scripts/load-test-baseline.json`:
- `p99 latency` ≤ baseline.p99 × **1.20** (20% regression budget)
- `RPS` ≥ baseline.RPS × **0.80**
- `memory growth` ≤ 50 MB **delta** (absolute — memory growth IS expected to be near-zero, so a flat cap is OK)
- `errors` = 0 (absolute — no 500s under load, ever)
- `aborted-on-disconnect` = 100% (absolute — leak protection)

Baseline updates: every successful main-branch run rewrites the baseline
(monotonic improvement is captured; regressions trigger CI red without
needing a human to retune the constants).

The very first run (no baseline file yet) records a baseline without
assertion failures. Subsequent runs gate against it.

**Leaky generator detection**: run 1000 requests where the server's generator
yields 1 chunk per 100ms for 10s, then have autocannon abort each connection
after 200ms. After all 1000 abort, idle 10s, then sample `process.memoryUsage()`.
If `heapUsed` grew >50 MB, the test fails.

#### Tasks
1. Add `autocannon` to devDependencies.
2. Write `scripts/load-test-streaming.mjs`.
3. Run once locally, capture baseline.
4. Write the integration test that validates baseline.
5. Add nightly CI workflow.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     test_load_p99_under_threshold() —
         Given the load script ran and produced results.json,
         When parsing,
         Then p99 latency < 500ms (happy path)

RED:     test_load_zero_errors() —
         Given results.json,
         When parsing,
         Then errors count === 0 (validation: no 500s under load)

RED:     test_load_memory_growth_under_50mb() —
         Given results.json,
         When parsing memoryDelta,
         Then heapUsedDelta < 50 MB (edge case: leaky generator detection)

RED:     test_load_abort_on_disconnect_100pct() —
         Given results.json,
         When parsing abortRate,
         Then 100% of aborted requests triggered onAbort
         (error scenario: leaked work on abort)

GREEN:   Implement script. Run baseline. Implement assertions.

REFACTOR: Extract result parser into a helper if reused.

VERIFY:  node scripts/load-test-streaming.mjs &&
         npx vitest run tests/integration/load-test-baseline.test.ts
```

#### Acceptance Criteria
- [ ] Script runs and produces `results.json` under 90s
- [ ] All 4 assertions pass against the captured baseline
- [ ] CI workflow committed
- [ ] Baseline checked in

#### DoD
- [ ] 4 BDD scenarios green
- [ ] Script reproducible
- [ ] Nightly CI workflow committed
- [ ] First baseline result documented in `docs/perf/streaming-baseline.md`

---

## Phase 8: api-middleware coverage hardening

**Objective:** Lift `packages/theo/src/vite-plugin/api-middleware.ts` from
68.75% lines / 41.17% branches to ≥80% / ≥75%.

### T8.1 — Targeted tests for api-middleware branches

#### Objective
Cover the uncovered branches (rate-limit 429 path, batch endpoint match, suggestion path, CSP report match) with focused tests.

#### Evidence
- Coverage report from commit `c814585`: `api-middleware.ts | 68.75 | 41.17`.
- Branches at 41% means more than half of conditional paths untested.

#### Files to edit
```
packages/theo/src/vite-plugin/api-middleware.ts         — (no production changes; new tests only)
tests/integration/api-middleware-rate-limit.test.ts     (NEW)
tests/integration/api-middleware-batch.test.ts          (NEW)
tests/integration/api-middleware-suggestion.test.ts     (NEW)
tests/integration/api-middleware-csp-report.test.ts     (NEW or extend existing)
```

#### Deep file dependency analysis
- The middleware is exercised end-to-end via Vite dev server. New tests boot a minimal Vite instance + mount the middleware, fire requests, assert responses. Pattern mirrors `tests/integration/csrf-disallowed-routes.test.ts`.

#### Deep Dives
**Rate-limit 429 path** (line 226): need to fire 11 requests in 1 second against a 10-req/sec route, assert the 11th returns 429. The existing `tests/integration/onda7-mandatory.test.ts` exercises rate-limit but doesn't go through this exact middleware path.

**Batch endpoint match** (line 230-231): POST `/api/__batch` with a valid envelope, assert the response shape and assert the batch handler was invoked.

**Suggestion path** (line 241): GET `/api/users/byyid` (typo), assert the 404 response includes `"Did you mean: /api/users/by-id?"`.

**CSP report match**: POST `/__theo/csp-report` with a valid report-only JSON, assert the configured reporter sink received it.

#### Tasks
1. Write 4 integration tests covering the 4 uncovered branches.
2. Verify coverage with `pnpm test:coverage --pool=forks --poolOptions.forks.singleFork=true`.
3. Confirm `api-middleware.ts` ≥ 80% lines / ≥75% branches.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     test_11th_request_returns_429() —
         Given a rate limit of 10/sec, 11 requests in 1s,
         When the 11th hits,
         Then 429 + Retry-After header (happy path: rate limit fires)

RED:     test_batch_endpoint_handles_valid_envelope() —
         Given POST /api/__batch with 3 sub-requests,
         When the middleware processes it,
         Then response is an array of 3 sub-results (validation)

RED:     test_suggestion_path_handles_close_typos() —
         Given GET /api/users/byyid when /api/users/by-id exists,
         When the middleware returns 404,
         Then the body includes "Did you mean: /api/users/by-id?" (edge case)

RED:     test_csp_report_endpoint_accepts_post_with_empty_body() —
         Given POST /__theo/csp-report with empty body,
         When the middleware processes it,
         Then 204 (error scenario: defensive parsing)

GREEN:   No production change — these branches already exist. Write tests
         that hit them.

REFACTOR: None expected.

VERIFY:  npx vitest run tests/integration/api-middleware-*.test.ts &&
         pnpm test:coverage --pool=forks --poolOptions.forks.singleFork=true
```

#### Acceptance Criteria
- [ ] 4 new integration tests green
- [ ] `api-middleware.ts` coverage ≥ 80% lines / ≥75% branches
- [ ] Global coverage unchanged or improved (no regression)

#### DoD
- [ ] 4 BDD scenarios green
- [ ] Coverage gate green
- [ ] Lint + format + typecheck clean

---

## Phase 9: Release engineering

**Objective:** Ship the work. Publish `theokit@0.2.0` to `latest` (the
warn-mode release) and `theokit@0.3.0-beta.0` to `next` (the strict-mode
beta gate).

### T9.1 — Publish `theokit@0.2.0` to `latest` + `theokit@0.3.0-beta.0` to `next`

#### Objective
Tag, publish, announce. Update README banner. Append to deploy-evidence.

#### Evidence
- Roadmap: `theokit@0.2.0` publish is open.
- ADR D6 (this plan): beta gate via npm `dist-tag`.

#### Files to edit
```
packages/theo/package.json                              — version bump
packages/create-theo/package.json                       — version bump
CHANGELOG.md                                            — entries for 0.2.0 and 0.3.0-beta.0
README.md                                               — version banner
.github/workflows/release.yml                           — verify publish path
deploy-evidence.jsonl                                   — append release entries
```

#### Deep file dependency analysis
- `package.json` versions go to `0.2.0` first, publish, then `0.3.0-beta.0` second, publish with `--tag next`.
- The CHANGELOG follows the existing Keep-a-Changelog format. Both versions get sections summarizing every gap closed in this plan.
- Release workflow already exists (changesets/action) — verify it doesn't auto-promote `next` to `latest`.

#### Deep Dives
**Publish sequence (ATOMIC — EC-12)**:
1. Verify `pnpm test`, `pnpm test:coverage`, `pnpm playwright test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm audit --prod --audit-level=high` all green.
2. `pnpm changeset add` documenting 0.2.0.
3. `pnpm changeset version` → version bumps, CHANGELOG.
4. Commit.
5. **DRY-RUN every package first**: `pnpm -r publish --dry-run --no-git-checks`.
   If any package's dry-run fails, abort — do NOT proceed to step 6.
6. Only if every dry-run succeeded: `pnpm -r publish --access public`
   (publishes to `latest`).
7. **(EC-12) Rollback guard**: if step 6 fails mid-way (e.g. `theokit@0.2.0` succeeds but `create-theokit@0.2.0` fails), execute
   `npm dist-tag rm theokit@0.2.0 latest` to revert what was already published, then exit non-zero. **Never leave the registry in a half-published state.**
8. Smoke-install: `npm install theokit@0.2.0` AND `npm install create-theokit@0.2.0` in fresh tmp dirs; both must resolve.
9. Bump to `0.3.0-beta.0` (theokit only — create-theokit stays at the latest stable).
10. Dry-run + publish theokit with `--tag next --access public`.

**Smoke after publish**:
```bash
mkdir /tmp/smoke && cd /tmp/smoke
npm install theokit
node -e 'console.log(require("theokit/package.json").version)' # expect 0.2.0
npm install theokit@next
node -e 'console.log(require("theokit/package.json").version)' # expect 0.3.0-beta.0
```

#### Tasks
1. Run full validation chain locally.
2. Add changeset entries for both versions.
3. Version + publish 0.2.0 to `latest`.
4. Version + publish 0.3.0-beta.0 to `next`.
5. Smoke-install both versions from npm.
6. Update README banner.
7. Append two entries to `deploy-evidence.jsonl`.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     test_published_0_2_0_resolves_from_npm() —
         Given a fresh dir,
         When running `npm install theokit`,
         Then version 0.2.0 installs (happy path — registry side)

RED:     test_published_0_3_0_beta_resolves_with_next_tag() —
         Given a fresh dir,
         When running `npm install theokit@next`,
         Then version 0.3.0-beta.0 installs (validation: dist-tag correctly set)

RED:     test_published_0_2_0_does_not_pull_beta() —
         Given `npm install theokit`,
         When parsing the resolved version,
         Then it is NOT 0.3.0-beta.0 (edge case: latest tag isolation)

RED:     test_published_packages_pass_publint() —
         Given the published tarballs,
         When running publint,
         Then all checks pass (error scenario: ship malformed packages)

RED:     test_smoke_install_retries_on_eresolve() —  (EC-17, SHOULD TEST)
         Given a simulated ENOTFOUND/EAI_AGAIN from npm CDN,
         When the smoke script tries `npm install theokit@<v>`,
         Then it retries 3 times with 5s backoff before declaring failure
         (npm CDN propagation can take up to 60s)

RED:     test_dry_run_blocks_partial_publish() —  (EC-12)
         Given a fake registry that rejects `create-theokit` (e.g. version
         already taken),
         When running the atomic publish script,
         Then dry-run fails fast and NO real publish is attempted; exit !=0

GREEN:   Execute publish sequence. Verify with smoke installs.

REFACTOR: None expected.

VERIFY:  bash scripts/post-publish-smoke.sh
```

#### Acceptance Criteria
- [ ] `theokit@0.2.0` resolves from npm `latest`
- [ ] `theokit@0.3.0-beta.0` resolves from npm `next`
- [ ] CHANGELOG entries written
- [ ] README banner updated
- [ ] `deploy-evidence.jsonl` appended with 2 release entries
- [ ] All 4 smoke assertions green

#### DoD
- [ ] Both versions published to correct dist-tags
- [ ] Smoke verification green
- [ ] Announcement post drafted (Discord + GitHub release notes)

---

## Phase 10: Dogfood QA (MANDATORY)

> This phase runs AFTER all implementation phases are complete. The plan is
> NOT done until dogfood passes.

**Objective:** Validate that the changes work as a real user would experience
them, not just as unit tests assert.

### Execution

Run `/dogfood full`. Always full. No shortcuts.

### Acceptance Criteria

- [ ] Health score ≥ 70/100
- [ ] Zero CRITICAL issues introduced by this plan's changes
- [ ] Zero HIGH issues in commands/features modified by this plan
- [ ] Any pre-existing issues documented (not caused by this plan)

### If Dogfood Fails

1. Identify which issues are caused by this plan's changes vs pre-existing.
2. Fix all plan-caused CRITICAL and HIGH issues before declaring the plan complete.
3. Re-run `/dogfood full` to confirm fixes.
4. Pre-existing issues are logged but do NOT block plan completion.

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | `useAgentStream` does not attach `X-Theo-Action` | T0.1 | Header attached in agent-stream-core; Playwright asserts absence of `csrf.warn` |
| 2 | `theokit check --upgrade-readiness` does not exist | T1.1, T1.2 | CLI command + 3 detection rules + `--fix` mode |
| 3 | `csrf.warn` log has no structured sink | T2.1 | Pluggable sink + Sentry + OTel adapters |
| 3b | No in-app readiness aggregator | T2.2 | `/__theo/csrf-readiness` endpoint + devtools tab |
| 4 | Migration guide 0.2 → 0.3 not written | T3.1 | Guide + recipe auto-test |
| 5 | No deploy adapter validated in real prod | T4.1 | `examples/deploy-vercel/` + smoke + `deploy-evidence.jsonl` entry |
| 6 | Playwright covers only 2 of 6 templates | T5.1 | Specs for `dashboard`, `api-only`, `postgres`, `saas` |
| 7 | WebSocket has no Chromium E2E | T6.1 | Echo-app fixture + 4-scenario spec |
| 8 | SSR streaming never load tested | T7.1 | autocannon harness + baseline + nightly CI |
| 9 | `api-middleware.ts` coverage 68.75% | T8.1 | 4 targeted tests; ≥80% lines / ≥75% branches |
| 10 | `theokit@0.2.0` not on npm `latest` | T9.1 | Published with full validation chain green |
| 11 | No `0.3.0-beta.0` beta gate | T9.1 | Published to `next` dist-tag |

**Coverage: 12/12 gaps covered (100%)**

## Global Definition of Done

- [ ] All 10 phases completed
- [ ] All tests passing (Vitest + Playwright + load harness)
- [ ] Zero TypeScript errors (`tsc --noEmit`)
- [ ] Zero lint warnings (`eslint --max-warnings=0`)
- [ ] Backward compatibility preserved (existing 1716 tests still green)
- [ ] Code-audit checks passing across all modified packages
- [ ] `theokit@0.2.0` resolvable via `npm install theokit`
- [ ] `theokit@0.3.0-beta.0` resolvable via `npm install theokit@next`
- [ ] `deploy-evidence.jsonl` includes at least 1 real Vercel deploy + 2 release entries
- [ ] Migration guide cross-linked from README, CLAUDE.md, devtools, CLI help
- [ ] Coverage gate green (`lines ≥ 80`, `branches ≥ 75`, `functions ≥ 80`, `statements ≥ 80`)
- [ ] Bundle budget green (template-default ≤ 350 KB gzipped)
- [ ] Audit gate green (`pnpm audit --prod --audit-level=high` exits 0)
- [ ] **Dogfood QA PASS** — `/dogfood full` health score ≥ 70, zero CRITICAL issues
- [ ] **Fixture proof** — every new framework surface has a reproducible fixture project in `tests/fixtures/`
