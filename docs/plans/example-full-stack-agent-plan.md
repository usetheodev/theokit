# Plan: `examples/full-stack-agent` — single complete agent demo

> **Version 1.0** — Ship ONE complete reference example at `examples/full-stack-agent/` that exercises every primitive from Phase B of the macro roadmap (Agent.create + 8 tools via `defineAgentTool` + `streamAgentRun` + `createConversationHistory`) AND demonstrates the SDK's multi-channel gateway by serving the SAME agent over both a TheoUI-based web chat AND a Telegram bot. Provider is OpenRouter (`OPENROUTER_API_KEY`) so any model the user prefers (Anthropic, OpenAI, Llama, etc.) works through one key. Includes the fix for two production blockers discovered during item #5 dogfood (`theokit start` serves empty shell because SSR file resolution looks for `.js` while build emits `.mjs`; `theokit start` never applies security headers in production). Closes Macro Roadmap item #6 (`examples/chat-anthropic + agent-with-tools + agent-with-memory`) by COLLAPSING the three proposed examples into ONE COMPLETE example per user direction.

## Context

**What exists today (post item #5 / 2026-05-22):**

- Phase B primitives all shipped:
  - `defineAgentTool` + `streamAgentRun` (item #4) — TheoKit sugar over SDK `CustomTool` contract + Run.stream → AgentEvent SSE bridge.
  - `createConversationHistory` (item #5) — agentId resolution + Agent.getOrCreate + cookie bridge via `cookieHeaders: Headers` on `defineAgentEndpoint`.
- `fixtures/template-default/` has ~80% of the demo: TheoUI chat surface (ChatThread + ChatComposer + ToolCallCard + AgentErrorCard + EmptyState + QuickActionChips + ContextWindowBar + CommandPalette), canonical `chat.ts` with 1 tool (`current_time`), Playwright 7/7 GREEN.
- `@usetheo/sdk` ships `Agent.create` + `Agent.getOrCreate` + `Agent.resume` (cross-repo, ADR D22).
- `@usetheo/gateway` + `@usetheo/gateway-telegram` ship in `theokit-sdk/packages/gateway*` — adapter contract (`BasePlatformAdapter`), `GatewayRunner` orchestrator, `SessionRouter` for agentId mapping. Telegram adapter wraps `grammy`. README at `theokit-sdk/packages/gateway-telegram/README.md` shows the minimum wiring pattern.

**What's broken or missing:**

1. **No standalone example.** `fixtures/template-default/` is a fixture (workspace symlinks, no README, test-flavoured). New users running `npx create-theokit my-app` get the scaffold but no "look, here's a complete shipping example with N tools + persistence + Telegram" reference. Pre-existing item #6 entry on the macro roadmap proposed 3 separate examples (chat-anthropic, agent-with-tools, agent-with-memory) — user directed (2026-05-22) to collapse to ONE complete example.
2. **`theokit start` doesn't SSR (PROD BLOCKER).** Verified empirically during item #5 dogfood: `cd fixtures/ssr-basic && theokit build && theokit start` serves `<div id="root"></div>` (empty shell). Cause: `packages/theo/src/cli/commands/start.ts:85` resolves `dist/server/entry-server.js` but `tsup` build emits `dist/server/entry-server.mjs`. `existsSync` returns false → `ssrEnabled` stays false → no SSR.
3. **`theokit start` doesn't apply CSP / security headers in prod (PROD BLOCKER).** Verified empirically: `curl -i http://localhost:3491/` against built ssr-basic returns no `Content-Security-Policy` or `Cache-Control` headers. Dev mode wires security via `packages/theo/src/vite-plugin/api-middleware.ts`; the prod server in `cli/commands/start.ts` has zero `buildSecurityHeaders` calls. Without this, the 0.3.0 cutover's `cspMode: 'enforce'` default is cosmetic in production.
4. **Telegram gateway never exercised in TheoKit-land.** SDK ships the gateway primitives; no TheoKit-side example, fixture, or test consumes them. Acceptance: zero validation that `Agent.resume(sessionId)` from a Telegram bot resumes the SAME agent that the web cookie created (cross-channel continuity check is a documentation claim today).

**Evidence:**

- `node -e "import('./fixtures/ssr-basic/.theo/server/entry-server.mjs').then(m => console.log(Object.keys(m)))"` ✅ — module exports `render`. SSR works at module level; only `start.ts` extension lookup is broken.
- Confirmed gap empirically during this session (2026-05-22): boot `ssr-basic` with `theokit start --port 3491` → response body `<div id="root"></div>`, no CSP header.
- `theokit-sdk/packages/gateway-telegram/README.md` shows 25 lines of integration code is enough for a working bot.
- `theokit-sdk/packages/gateway/README.md` §"Minimal example" — `GatewayRunner + SessionRouter + Agent.resume` is the pattern.

**Memory pins:**

- [[project-stack-deps]] — TheoKit always uses `@usetheo/sdk` + `@usetheo/ui`. The example MUST use both; no raw provider SDK or hand-rolled UI.
- [[feedback-sdk-is-evolvable]] — if the demo surfaces SDK gaps, write SDK tasks into this plan.
- [[project-theokit-purpose]] — the example is the "app the agent lives in" made concrete. It's the most visible artifact for a new visitor evaluating TheoKit.

## Objective

Ship `examples/full-stack-agent/` so a new visitor can `git clone` + `pnpm install` + set `OPENROUTER_API_KEY` (and optionally `TELEGRAM_BOT_TOKEN`) + `pnpm dev` AND get a real chat with 8 working tools + persistence across reload AND the same agent answering from Telegram. PLUS `theokit build && theokit start` produces a real production SSR server with full security headers.

**Measurable goals:**

1. `examples/full-stack-agent/` ships as a real workspace package with its own `package.json`, `README.md`, `.env.example`, `theo.config.ts`.
2. 8 tools registered via `defineAgentTool`: `current_time`, `calculator`, `random_number`, `web_fetch` (allowlist), `workspace_read`, `workspace_write`, `web_search` (DuckDuckGo HTML), `echo`.
3. Web UI shows ToolCallCard for each tool invocation with status + args + result.
4. Conversation persists across page reload (cookie + `createConversationHistory`).
5. Telegram bot — same agentId scheme (Telegram chat id → agentId) — answers in private chat; ignores groups unless mentioned (`shouldRespondInChat` policy from `@usetheo/gateway-telegram`).
6. `theokit build` succeeds; `theokit start` boots a production server that SSRs the page (root div populated) AND sets full CSP + Cache-Control headers.
7. New Playwright spec asserts the end-to-end web behavior (3 tools fired, cookie persisted, prod SSR not empty).
8. Dogfood `full` health ≥ 70/100 with zero plan-caused CRITICAL.

## ADRs

### D1 — ONE complete example, not three separate ones

**Decision:** Ship a single `examples/full-stack-agent/` instead of the originally-planned `examples/chat-anthropic` + `examples/agent-with-tools` + `examples/agent-with-memory` (item #6 macro roadmap entry).

**Rationale:**
- Three separate examples create three places for the truth to drift. If a primitive changes, three READMEs and three fixtures need updates.
- A new visitor browsing `examples/` and seeing 3 demos has to decide which to read first; one COMPLETE demo answers "what's the canonical way to build a real agent app with TheoKit?" in one place.
- The 4 primitives of Phase B are designed to compose. Splitting them across examples HIDES the composition — the very thing the visitor wants to learn.
- User direction (2026-05-22 thread): "Vamos ter somente uma demo mas que seja COMPLETA".

**Consequences:**
- ✅ Single source of truth. One README, one `chat.ts`, one set of tools.
- ✅ Visitor sees the FULL stack working together — composition is visible.
- ⛔ "Minimal example" use case (someone who wants the smallest possible chat) is NOT served. Mitigation: the `template-default` scaffold remains the minimum; `examples/full-stack-agent/` is the maximum.
- 🔁 If the demo gets too dense (>200 LOC of route handler), split into `examples/full-stack-agent-minimal/` and `examples/full-stack-agent-full/` — future call, not this plan.

### D2 — OpenRouter as default provider — not Anthropic-direct

**Decision:** `OPENROUTER_API_KEY` is the documented + tested default. `ANTHROPIC_API_KEY` is a fallback for users who already have it.

**Rationale:**
- OpenRouter is one API key that unlocks every major model (Anthropic, OpenAI, Llama, Mistral, etc.). Lowering the "I need to sign up for Anthropic AND OpenAI separately" barrier for a demo trying to make a first impression.
- The SDK's model-identifier parser handles `openrouter/anthropic/claude-3.5-sonnet` natively (`theokit-sdk/.../internal/llm/model-identifier.ts:7`). Zero adapter code on our side.
- Item #5 fixture/template already supports both with `OPENROUTER_API_KEY` preferred; this just makes it the explicit canonical path.
- User direction (2026-05-22): "usando OPENROUTER-KEY".

**Consequences:**
- ✅ One API key for the visitor to obtain. Lowest possible signup friction for a demo.
- ✅ Model swapping by env var (`MODEL_ID=openrouter/openai/gpt-4o`) without code change.
- ⛔ OpenRouter adds a small per-token markup vs going direct. Documented in README as a deliberate demo trade-off, not a production recommendation.

### D3 — Telegram bot in the same Node process as the web server

**Decision:** The demo runs ONE Node process that handles both:
- HTTP requests via `theokit start` (web UI + `/api/chat` SSE endpoint).
- Telegram inbound via `@usetheo/gateway` + `@usetheo/gateway-telegram` long-polling (NOT webhook).

**Rationale:**
- Same-process means same `Agent.getOrCreate` registry — no cross-process state sync. Cross-channel resumption (web user → Telegram user with same `userId`) becomes trivial.
- Long-polling avoids needing a public webhook URL for the demo (running locally is enough). Webhooks add ngrok/CloudFlared-tunnel complexity that distracts from the demo's point.
- `theokit start` already runs the Node HTTP server. Hooking the gateway runner into the same process is a single `runner.start()` call in `server/telegram-bot.ts` (or similar boot file) wired from `theo.config.ts` or `package.json` script.

**Consequences:**
- ✅ One process to deploy, one `OPENROUTER_API_KEY` env, no cross-process IPC.
- ⛔ Long-polling makes the demo unsuitable for high-throughput production. Documented in README — "for production Telegram with multiple instances, switch to webhook mode (`grammy` supports both)".
- 🔁 If multi-process scaling becomes needed, the gateway runner is detachable; can be moved to a separate process later without changing the rest of the codebase.

### D4 — agentId scheme: `web-<uuid>` cookie OR `tg-<chatId>` Telegram-derived

**Decision:** The demo uses a CHANNEL-PREFIXED agentId scheme:
- Web visitors: `web-<uuid>` (UUID from the `theo_conversation` cookie issued by `createConversationHistory`).
- Telegram users: `tg-<chatId>` (Telegram chat id, stable per chat — DM or group).
- The two namespaces are DISJOINT. A user's web conversation and their Telegram conversation are SEPARATE agents unless they explicitly share an id (out of scope for the demo).

**Rationale:**
- Telegram chat id is stable and non-secret. Using it directly as agentId means the same Telegram user always resumes the same conversation across bot restarts (free continuity, no extra cookie/session storage).
- Channel prefix prevents collisions: `web-` namespace and `tg-` namespace can never overlap. A user with multiple devices in web still maps to one cookie value, and their Telegram is its own thread.
- Both prefixes pass the `^[a-zA-Z0-9_-]{1,128}$` validation enforced by `isValidAgentId` (item #5 EC-1 hardening — path traversal + CRLF injection guards).

**Consequences:**
- ✅ Free Telegram continuity: bot restart → same conversation resumes for every chat id.
- ✅ Web + Telegram conversations are independent in the demo (Telegram user can chat without any web touch and vice versa).
- ⛔ Cross-channel handoff ("connect my Telegram to my web session") is OUT of scope. README documents the extension pattern.
- 🔁 If future demos want unified identity (one Auth0 user sees web+Telegram as one conversation), they use `createConversationHistory({ session: { conversationId: authUserId } })` for web and `agentId: authUserId` on Telegram. Plan: not item-6.

### D5 — Tools live in `server/tools/` as one file per tool

**Decision:** Each `defineAgentTool` call lives in its own file under `server/tools/<name>.ts`. `server/routes/chat.ts` imports them via `import * as tools from '../tools/index.js'`.

**Rationale:**
- 8 tools inlined in `chat.ts` would push it past 300 LOC. Splitting per-file keeps each tool's input schema + handler co-located and reviewable in isolation.
- `tools/index.ts` re-exports the catalog — one place to look at "what can this agent do".
- Visitors learning by reading have a `server/tools/web_search.ts` they can copy as a starting point for their own tool. The pattern is repeatable.

**Consequences:**
- ✅ Easy to copy a single tool file into another project.
- ✅ Diffs touching one tool don't conflict with diffs touching another.
- ⛔ More files (8 + index.ts) vs one big file. Acceptable — the README's tool table maps each file 1:1.

### D6 — Workspace tools sandboxed to `.theokit/workspace/<agentId>/`

**Decision:** `workspace_read` and `workspace_write` operate ONLY on files under `<cwd>/.theokit/workspace/<agentId>/`. Path traversal (`../`), absolute paths, and any path resolving outside the sandbox are rejected with a Zod-level error.

**Rationale:**
- An LLM that can write arbitrary files anywhere on the host is a security incident waiting to happen. Demo or not, the example sets the safe-by-default pattern.
- Per-agentId scoping (not a single shared dir) prevents one conversation's files from leaking into another. Aligns with the `messages.jsonl` per-agentId persistence pattern from the SDK (item #5 ADR D1).
- `.theokit/workspace/` lives alongside `.theokit/agents/` (the conversation registry). One `.gitignore` rule covers both.

**Consequences:**
- ✅ LLM cannot exfiltrate `.env` or read system files.
- ✅ Per-conversation namespace makes "clean up my agent" trivial (`rm -rf .theokit/workspace/web-<uuid>`).
- ⛔ Tool API takes a relative path only — README documents the constraint with examples ("`docs/notes.md` ✅, `../../etc/passwd` ✗").

### D7 — `web_fetch` and `web_search` use allowlists / fixed providers

**Decision:**
- `web_fetch` accepts ONLY HTTPS URLs whose hostname matches an allowlist (configurable via env `WEB_FETCH_ALLOWLIST`, default `wikipedia.org, en.wikipedia.org, github.com, raw.githubusercontent.com, api.github.com, news.ycombinator.com, ddg.gg, html.duckduckgo.com`).
- `web_search` is hard-wired to DuckDuckGo HTML endpoint (`https://html.duckduckgo.com/html/?q=<query>`) — no API key required, parsed via a small DOM-extract function.

**Rationale:**
- `web_fetch` without an allowlist is an SSRF (server-side request forgery) waiting to happen. An LLM tricked into fetching `http://169.254.169.254/latest/meta-data/iam/security-credentials/` (AWS metadata service) would leak credentials.
- DuckDuckGo HTML has been stable for years and explicitly allows scraping (vs Google's terms). Zero API key keeps the demo easy to run.

**Consequences:**
- ✅ Demo is safe to run on shared infrastructure. No SSRF risk.
- ✅ Zero API key for search.
- ⛔ DuckDuckGo HTML is web-scraping — if their HTML structure changes, the parser breaks. Mitigation: defensive parser + unit test pinning the current shape; CI doesn't depend on DDG availability (unit test uses a fixture HTML).

## Dependency Graph

```
Phase 0 (Bug fixes — prod SSR + CSP)          (PARALLEL to Phase 1-3 setup)
   │
   │     ┌─────▶ Phase 1 (Skeleton: example dir + package.json + README)
   │     │
   │     │       └─▶ Phase 2 (Tools — 8 files in server/tools/)
   │     │                │
   │     │                └─▶ Phase 3 (Wire route — chat.ts uses tools + createConversationHistory)
   │     │                          │
   │     │                          └─▶ Phase 4 (Telegram gateway)
   │     │                                    │
   │     │                                    └─▶ Phase 5 (Playwright + integration tests)
   │     │
   ▼     ▼
Phase 6 (Dogfood + roadmap update) ◀────────────  Phase 5
```

- **Phase 0** can run in parallel with Phase 1-3 setup since they touch different files. MUST complete before Phase 5 (Playwright asserts prod SSR works).
- **Phase 1** is the foundation. Phase 2-5 are sequential.
- **Phase 4 (Telegram)** depends on Phase 3 because it reuses the same `Agent.getOrCreate` + tool catalog.
- **Phase 6** is the dogfood gate; must run LAST.

---

## Phase 0: Prod blocker fixes (parallel)

**Objective:** Make `theokit start` actually SSR the page AND emit security headers in production.

### T0.1 — Fix SSR file resolution: try `.mjs` then `.js`

#### Objective

`theokit start` looks for `dist/server/entry-server.js`, but tsup emits `.mjs`. Fix: try both extensions.

#### Evidence

- `packages/theo/src/cli/commands/start.ts:85` — `const ssrServerPath = resolve(distDir, 'server/entry-server.js')`.
- `fixtures/ssr-basic/.theo/server/` directory listing shows `entry-server.mjs` (verified 2026-05-22).
- `cd fixtures/ssr-basic && theokit build && theokit start` → response body `<div id="root"></div>` (empty shell, no SSR output).

#### Files to edit

```
packages/theo/src/cli/commands/start.ts — try .mjs before .js for entry-server resolution
tests/unit/start-ssr-resolution.test.ts — (NEW) RED-first
```

#### Deep file dependency analysis

- **`start.ts`** — single-shot resolution at module init. Changing from `.js` to "try `.mjs` then `.js`" preserves backward compat (any build that emits `.js` still works). No downstream impact.
- **New test** — pure unit test that mocks `existsSync` to assert resolution order.

#### Deep Dives

**Algorithm:**

```typescript
const SSR_EXTENSIONS = ['.mjs', '.js'] as const
function resolveSsrEntry(distDir: string): string | null {
  for (const ext of SSR_EXTENSIONS) {
    const path = resolve(distDir, `server/entry-server${ext}`)
    if (existsSync(path)) return path
  }
  return null
}
```

**Invariants:**
- BEFORE: function existed inline as `const ssrServerPath = resolve(distDir, 'server/entry-server.js')`.
- AFTER: `resolveSsrEntry` returns the first existing path OR `null` (then SSR stays disabled — same behavior as missing `.js` today).

**Edge cases:**
- Both `.js` and `.mjs` present (unlikely but possible after a misconfigured build) — `.mjs` wins per array order. Documented in JSDoc.
- Neither exists → SSR stays disabled (`ssrEnabled = false`). Same as today.

#### Tasks

1. Extract `resolveSsrEntry(distDir)` helper.
2. Update `start.ts` line ~85 to use it.
3. Add unit test asserting `.mjs` preferred over `.js`.

#### TDD + BDD

```
RED: test_resolveSsrEntry_prefers_mjs_over_js()
  Given a distDir where both server/entry-server.mjs and server/entry-server.js exist
  When resolveSsrEntry is called
  Then it returns the .mjs path

RED: test_resolveSsrEntry_falls_back_to_js_if_mjs_missing()
  Given distDir with only server/entry-server.js
  When called
  Then returns the .js path

RED: test_resolveSsrEntry_returns_null_when_neither_exists()
  Given distDir with no entry-server file
  When called
  Then returns null (SSR stays disabled)

RED: test_resolveSsrEntry_uses_resolve_for_absolute_path()
  Given a relative distDir
  When called
  Then returned path is absolute

GREEN: Implement resolveSsrEntry helper + update start.ts call site.

REFACTOR: None expected.

VERIFY:
  npx vitest run tests/unit/start-ssr-resolution.test.ts
```

BDD scenarios obrigatórios:
- **Happy path:** `.mjs` found → returned.
- **Validation error:** N/A (no input validation).
- **Edge case:** neither extension exists → null.
- **Error scenario:** filesystem permission error on existsSync → propagates (caller's concern).

#### Acceptance Criteria

- [ ] 4/4 unit tests GREEN.
- [ ] `cd fixtures/ssr-basic && theokit build && theokit start --port 3493` returns HTML where `<div id="root">` is populated (SSR happened).
- [ ] `pnpm tsc --noEmit` clean.
- [ ] `pnpm lint --max-warnings=0` clean.

#### DoD

- [ ] All 3 implementation tasks completed.
- [ ] All 4 tests GREEN.
- [ ] Manual prod-server smoke verified (curl + grep `SSR Hello Theo`).

---

### T0.2 — Apply security headers in `theokit start`

#### Objective

The prod server in `start.ts` never calls `buildSecurityHeaders`. Add the call so CSP + Cache-Control + X-Frame-Options + X-Content-Type-Options + Referrer-Policy + Permissions-Policy land on every HTML response in production.

#### Evidence

- `packages/theo/src/cli/commands/start.ts` grep for `applySecurityHeaders|buildSecurityHeaders|securityHeaders` → zero matches.
- `curl -i http://localhost:3491/` against built ssr-basic shows no `Content-Security-Policy` header.
- Dev server applies via `packages/theo/src/vite-plugin/api-middleware.ts` (existing); prod has no equivalent.

#### Files to edit

```
packages/theo/src/cli/commands/start.ts — call buildSecurityHeaders on every HTML response; generate per-request nonce when SSR is enabled
tests/integration/start-csp-headers.test.ts — (NEW) integration test booting a fixture + curl-ing
```

#### Deep file dependency analysis

- **`start.ts`** — the request orchestrator block (line ~128 onwards). For every `200 OK` HTML response (SSR + static index.html fallback), add a `Set-Header` loop using `buildSecurityHeaders(config.securityHeaders, { production: true }, { nonce })`.
- **`buildSecurityHeaders`** already exists at `packages/theo/src/server/security-headers.ts` — no changes needed.
- **`generateNonce`** exists at `packages/theo/src/server/nonce.ts` — no changes needed.
- The new integration test asserts the prod server emits the headers — closes the loop with the T4.1 nonce Playwright work from the 0.3.0 cutover plan.

#### Deep Dives

**Algorithm (inside the request handler):**

```typescript
// EC-6 (edge case review — MUST FIX): generate nonce UNCONDITIONALLY (every
// request, regardless of SSR vs API vs static). The cost is ~16 bytes of
// randomness per request — negligible. Conditional generation creates dev/prod
// header divergence (dev's api-middleware.ts already nonces every response)
// and half-keeps the 0.3.0 promise of "every response carries the nonce".
const nonce = generateNonce()
const headers = buildSecurityHeaders(
  config.securityHeaders ?? {},
  { production: true },
  { nonce },
)
for (const [k, v] of Object.entries(headers)) {
  if (v !== undefined) res.setHeader(k, v)
}
```

The nonce is also passed to `ssrRender(url, { nonce })` so the rendered HTML's `<script>` tags carry it (T4.1 wiring from item #5 session). API responses get the nonce in CSP too (matches dev mode exactly).

**Invariants:**
- BEFORE: prod HTML response has no `Content-Security-Policy` header.
- AFTER: every 2xx HTML response carries the full security header stack matching dev mode's behavior.

**Edge cases:**
- `config.securityHeaders` undefined → `buildSecurityHeaders({})` → returns defaults. Same as dev.
- API routes returning JSON — still get security headers but no nonce (no inline scripts in JSON).
- Static assets (.js, .css, .png) — security headers OPTIONAL; today they don't get them. We add them too for consistency. CSP doesn't break static asset delivery.
- Static index.html fallback (SSR not enabled) — gets headers but no nonce.

#### Tasks

1. Import `buildSecurityHeaders` + `generateNonce` in `start.ts`.
2. Generate nonce per-request when `ssrEnabled === true`.
3. Build + apply headers on every response branch (SSR HTML, static index.html, JSON 404/500, etc.).
4. Thread nonce into `ssrRender(url, { nonce })` so the SSR module emits `<script nonce="...">`.
5. Update `ssr-basic` Playwright `ssr-nonce` spec to ALSO run against prod build (new project or webServer mode).
6. Add integration test that boots prod server programmatically + curls.

#### TDD + BDD

```
RED: test_prod_start_emits_csp_header()
  Given fixture/ssr-basic built and prod server booted on port P
  When GET / is requested
  Then response.headers['content-security-policy'] is defined
  And contains "script-src 'self'"

RED: test_prod_start_emits_cache_control_when_nonce_used()
  Given prod server with SSR
  When GET / is requested
  Then response.headers['cache-control'] contains 'private' and 'no-store' (EC-3)

RED: test_prod_start_ssr_html_contains_nonce_matching_csp()
  Given prod SSR
  When GET / is requested
  Then HTML contains <script nonce="X">window.__staticRouterHydrationData
  And CSP header contains 'nonce-X'

RED: test_prod_start_api_route_has_security_headers_AND_nonce()  (EC-6)
  Given an API route returning JSON
  When GET /api/health
  Then response has CSP + X-Frame-Options + X-Content-Type-Options
  And CSP DOES contain 'nonce-X' (unconditional generation — matches dev mode)
  (EC-6 supersedes the original 'no nonce for JSON' design — generating
   unconditionally avoids dev/prod header divergence.)

GREEN: Wire buildSecurityHeaders + generateNonce + ssrRender(url, {nonce}) in start.ts.

REFACTOR: Extract a `applySecurityHeadersToResponse(res, nonce)` helper if used >3 times.

VERIFY:
  npx vitest run tests/integration/start-csp-headers.test.ts
```

BDD scenarios obrigatórios:
- **Happy path:** GET / on prod SSR → full CSP + nonce + Cache-Control.
- **Validation error:** N/A.
- **Edge case:** SSR disabled → headers still set but no nonce.
- **Error scenario:** 500 from handler → headers still set (defense-in-depth).

#### Acceptance Criteria

- [ ] 4/4 integration tests GREEN.
- [ ] `curl -i http://localhost:<prod-port>/` against built `ssr-basic` shows `Content-Security-Policy: ...; script-src 'self' 'nonce-X'; ...` + `Cache-Control: private, no-store`.
- [ ] `pnpm tsc --noEmit` clean.
- [ ] `pnpm lint` clean.

#### DoD

- [ ] All 6 implementation tasks completed.
- [ ] All 4 integration tests GREEN.
- [ ] Manual prod curl verified.
- [ ] No regression in dev mode (api-middleware.ts CSP path unchanged).

---

## Phase 1: Example skeleton

**Objective:** Create the example directory with package.json, README, env example, theo config, and minimal app/page.tsx + server/routes/health.ts so it boots before any tools are wired.

### T1.1 — Bootstrap `examples/full-stack-agent/`

#### Objective

Standalone workspace package with the minimum files needed to `pnpm install` + `theokit dev` and see a chat surface.

#### Evidence

- `examples/` directory exists with prior examples (`agent-saas/`, `devtools-demo/`, etc.). New example slots in beside them.
- `pnpm-workspace.yaml` already globs `examples/*` (verified — `examples/agent-saas` builds via the same root install).
- `fixtures/template-default/` ships the canonical TheoUI chat shell we'll reuse. Copy the `app/` directory + `theo.config.ts` + base files.

#### Files to edit

```
examples/full-stack-agent/package.json                       — (NEW) workspace member, declares deps
examples/full-stack-agent/README.md                          — (NEW) run instructions + tool catalog + Telegram setup
examples/full-stack-agent/.env.example                       — (NEW) OPENROUTER_API_KEY + TELEGRAM_BOT_TOKEN placeholders
examples/full-stack-agent/.gitignore                         — (NEW) .env, .theokit/, .theo/, node_modules
examples/full-stack-agent/theo.config.ts                     — (NEW) ssr: true + security defaults
examples/full-stack-agent/index.html                         — (NEW) shell with #root + script tag
examples/full-stack-agent/app/page.tsx                       — copy from fixtures/template-default with minor tweaks
examples/full-stack-agent/app/layout.tsx                     — copy from fixtures/template-default
examples/full-stack-agent/server/routes/health.ts            — (NEW) defineRoute('GET') returning { ok: true }
tests/unit/example-full-stack-agent-skeleton.test.ts         — (NEW) asserts skeleton exists + package.json valid
```

#### Deep file dependency analysis

- **`package.json`** — declares `"theokit": "^0.2.0"`, `"@usetheo/sdk": "^1.0.0"`, `"@usetheo/ui": "^0.2.0"`, `"@usetheo/gateway": "^0.1.0"`, `"@usetheo/gateway-telegram": "^0.1.0"`, `"grammy": "^1.30.0"`, `"zod": "^3.24.0"`, `"react": "^19.0.0"`, `"react-dom": "^19.0.0"`. Scripts: `dev`, `build`, `start`, `bot`.
- **`.env.example`** — documented placeholders (`OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`, `WEB_FETCH_ALLOWLIST`, `MODEL_ID`). NEVER includes real secrets.
- **`theo.config.ts`** — `defineConfig({ ssr: true, securityHeaders: { cspMode: 'enforce' } })`. Demonstrates the 0.3.0 enforce default works.
- **`app/page.tsx`** — reused TheoUI chat surface from `fixtures/template-default/app/page.tsx`. Same component imports; same EmptyState + QuickActionChips defaults. Adjust copy to "Full-Stack Agent Demo" headings.
- **`server/routes/health.ts`** — minimum API endpoint to verify the framework wiring is alive. Returns `{ ok: true, version: '...' }`.

#### Deep Dives

**Workspace integration:** `pnpm-workspace.yaml` already globs `examples/*` per its content (`packages: ['packages/*', 'examples/*']`). No workspace config change needed.

**Reusing fixture's app/page.tsx:** the TheoUI chat surface from `fixtures/template-default/app/page.tsx` is 290 LOC. Copying as-is avoids re-inventing the React component tree. The diff is purely cosmetic (headings, EmptyState copy).

**Invariants:**
- BEFORE: `examples/full-stack-agent/` doesn't exist.
- AFTER: `cd examples/full-stack-agent && pnpm install && pnpm dev` boots a server with the same chat surface as `template-default` but no tools wired yet (Phase 2's job).

**Edge cases:**
- `pnpm install` from monorepo root vs from inside `examples/full-stack-agent/` — both must work. Test by running both.
- TheoUI hasn't been versioned bumped past `0.2.0` — verify `^0.2.0` resolves at install time.

#### Tasks

1. Create directory structure.
2. Write package.json with dep declarations.
3. Write README.md skeleton (sections: Run, Tools, Telegram, Deploy, Architecture).
4. Write .env.example.
5. Write .gitignore.
6. Write theo.config.ts.
7. Write index.html shell.
8. Copy app/page.tsx + app/layout.tsx from fixtures/template-default; adjust headings.
9. Write server/routes/health.ts.
10. Run `pnpm install` to verify deps resolve.
11. Run `pnpm dev` from example dir; curl `/api/health` and `/`; verify both 200 OK.

#### TDD + BDD

```
RED: test_example_package_json_has_required_deps()
  Given examples/full-stack-agent/package.json
  When parsed
  Then dependencies include theokit, @usetheo/sdk, @usetheo/ui, @usetheo/gateway, @usetheo/gateway-telegram, grammy, zod, react, react-dom

RED: test_example_env_example_has_no_real_secrets()
  Given .env.example
  When read
  Then it does NOT contain values matching /sk-[a-zA-Z0-9]{20,}/

RED: test_example_health_route_returns_ok()
  Given the example booted on port P (programmatic)
  When GET /api/health
  Then 200 OK with { ok: true }

RED: test_example_root_returns_html_with_root_div()
  Given the example booted
  When GET /
  Then 200 OK with HTML containing <div id="root">

GREEN: Implement all 11 tasks.

REFACTOR: None.

VERIFY:
  npx vitest run tests/unit/example-full-stack-agent-skeleton.test.ts
  cd examples/full-stack-agent && pnpm dev (manual verify in browser)
```

BDD scenarios obrigatórios:
- **Happy path:** example boots, `/api/health` returns 200.
- **Validation error:** package.json missing dep → test fails.
- **Edge case:** `.env.example` accidentally has real secret → test fails.
- **Error scenario:** root path 500 (build error) → caught by spec.

#### Acceptance Criteria

- [ ] All 11 files exist.
- [ ] `pnpm install` from monorepo root succeeds.
- [ ] `cd examples/full-stack-agent && pnpm dev` boots without error.
- [ ] `curl http://localhost:<port>/api/health` returns 200 OK JSON.
- [ ] `curl http://localhost:<port>/` returns HTML with `<div id="root">`.
- [ ] `pnpm tsc --noEmit` clean in example.
- [ ] All 4 tests GREEN.

#### DoD

- [ ] Skeleton boots in dev mode end-to-end.
- [ ] No `any` in production code.
- [ ] README ≥ 100 lines covering Run + Tools + Telegram + Deploy + Architecture (placeholders OK for sections that depend on later phases).

---

## Phase 2: 8 tools via `defineAgentTool`

**Objective:** Implement each of the 8 tools in `server/tools/<name>.ts` with unit tests and an `index.ts` catalog.

### T2.1 — Pure tools (3): `current_time`, `calculator`, `random_number`

#### Objective

Three deterministic tools with no I/O. Pin the contract `defineAgentTool({ name, description, inputSchema, handler })` for visitors learning the pattern.

#### Evidence

- `fixtures/template-default/server/routes/chat.ts` already has `current_time` inline — verified working in item #4 Playwright. Extract to its own file as the canonical pattern.
- `calculator` and `random_number` are bog-standard agent tools that demonstrate Zod schema validation (`expression: z.string()`, `min: z.number(), max: z.number()`).

#### Files to edit

```
examples/full-stack-agent/server/tools/current-time.ts   — (NEW)
examples/full-stack-agent/server/tools/calculator.ts     — (NEW)
examples/full-stack-agent/server/tools/random-number.ts  — (NEW)
examples/full-stack-agent/server/tools/index.ts          — (NEW) export catalog
tests/unit/example-pure-tools.test.ts                    — (NEW) handler smoke + Zod validation
```

#### Deep file dependency analysis

- **`current-time.ts`** — `inputSchema: z.object({})` (no args); handler returns `new Date().toISOString()`.
- **`calculator.ts`** — `inputSchema: z.object({ expression: z.string().min(1) })`; handler parses via a SAFE eval (allowlist `+ - * / ( ) . 0-9` chars only, throws on anything else). NO `eval()` / `Function()` — both are unsafe.
- **`random-number.ts`** — `inputSchema: z.object({ min: z.number().int(), max: z.number().int() }).refine(d => d.max > d.min)`; handler returns `Math.floor(Math.random() * (max - min + 1)) + min`.
- **`index.ts`** — `export const TOOLS = [currentTime, calculator, randomNumber, ...]`.

#### Deep Dives

**`calculator` safe-eval:** Allowlist `/^[\d\s+\-*/().]+$/` — if the input matches the regex, it's safe to evaluate. **EC-2 (edge case review — MUST FIX): MUST use a recursive-descent parser; `eval` / `Function` / `vm` are FORBIDDEN even though the regex would block most payloads. Unit test asserts the source file contains zero matches for `/\beval\s*\(|new\s+Function\s*\(|require\s*\(\s*['"]vm['"]\s*\)/`.** ~30 LOC for the recursive-descent parser. Handles `2 + 3 * (4 - 1)`. Rejects functions, variables, or any non-arithmetic input. **EC-1 (edge case review — MUST FIX): after evaluation, `if (!Number.isFinite(result)) throw new Error('result not finite (overflow or division by zero)')` — `Infinity`/`NaN` serialize as `null` via JSON.stringify and confuse the LLM.**

**Invariants:**
- BEFORE: 3 tool files don't exist; `current_time` is inline in `fixtures/template-default`.
- AFTER: 3 tool files importable as `import { currentTime } from './tools/current-time.js'`.

**Edge cases:**
- `calculator` with empty string → Zod rejects via `.min(1)`.
- `calculator` with malicious input `__proto__` or `process.exit()` → allowlist regex rejects (chars not in `+ - * / ( ) . 0-9 \s`).
- `random_number` with `max <= min` → Zod `refine` rejects.
- `random_number` with very large range (Number.MAX_SAFE_INTEGER) → still works (`Math.random` returns 0..1).

#### Tasks

1. Implement `current-time.ts`.
2. Implement `calculator.ts` with safe-eval helper.
3. Implement `random-number.ts` with `refine` validation.
4. Implement `index.ts` catalog.
5. Write 12 unit tests (4 per tool).

#### TDD + BDD

```
RED: test_current_time_returns_iso_string()
  Given the currentTime tool
  When handler({}) is called
  Then it returns a string matching ISO 8601 regex

RED: test_calculator_evaluates_basic_expression()
  Given calculator
  When handler({ expression: '2 + 3 * 4' })
  Then returns '14'

RED: test_calculator_rejects_function_call()
  Given calculator
  When handler({ expression: 'process.exit()' })
  Then throws Error matching /invalid|disallowed/i

RED: test_calculator_rejects_empty_string()
  Given calculator
  When handler({ expression: '' })
  Then rejects (Zod min(1))

RED: test_calculator_rejects_infinity_division_by_zero()  (EC-1)
  Given calculator
  When handler({ expression: '1/0' })
  Then throws Error matching /not finite|overflow|division by zero/

RED: test_calculator_source_does_not_use_eval_or_Function()  (EC-2)
  Given the calculator source file
  When read as text
  Then it contains ZERO matches for /\beval\s*\(|new\s+Function\s*\(|require\s*\(\s*['"]vm['"]\s*\)/
  (Pins the "recursive-descent only" implementation choice — prevents silent
   refactor to `new Function('return '+expr)` which would re-introduce RCE.)

RED: test_random_number_returns_int_in_range()
  Given randomNumber
  When handler({ min: 1, max: 10 }) is called 100 times
  Then every result is integer in [1, 10]

RED: test_random_number_rejects_max_le_min()
  Given randomNumber
  When handler({ min: 5, max: 3 })
  Then rejects (refine)

RED: test_index_exports_all_three_tools()
  Given tools/index.ts
  When imported
  Then TOOLS array has length 3 (plus more added in later tasks)

GREEN: Implement 3 tool files + index.

REFACTOR: Extract safe-eval to a separate function if needed by other tools later.

VERIFY:
  npx vitest run tests/unit/example-pure-tools.test.ts
```

BDD scenarios obrigatórios:
- **Happy path:** all three return correctly for valid input.
- **Validation error:** calculator rejects empty / invalid chars; random rejects max ≤ min.
- **Edge case:** calculator with whitespace-only input rejected; random with min=max rejected.
- **Error scenario:** calculator with `__proto__` rejected.

#### Acceptance Criteria

- [ ] 12 unit tests GREEN.
- [ ] `pnpm tsc --noEmit` clean.
- [ ] `pnpm lint` clean.
- [ ] Zero `any` in tool source.

#### DoD

- [ ] All 5 implementation tasks completed.
- [ ] All 12 tests GREEN.

---

### T2.2 — Web tools (2): `web_fetch`, `web_search`

#### Objective

Two tools that talk to the public internet. `web_fetch` with hostname allowlist (D7). `web_search` hard-wired to DuckDuckGo HTML.

#### Evidence

- ADR D7: allowlist for fetch, fixed DDG for search.
- DDG HTML endpoint: `https://html.duckduckgo.com/html/?q=...` — returns HTML with `<a class="result__a" href="...">` for each result. Stable since 2018.
- `fetch` is a Web Standard in Node 18+; no extra dep.

#### Files to edit

```
examples/full-stack-agent/server/tools/web-fetch.ts       — (NEW)
examples/full-stack-agent/server/tools/web-search.ts      — (NEW)
examples/full-stack-agent/server/tools/_allowlist.ts      — (NEW) shared allowlist parser
examples/full-stack-agent/server/tools/index.ts           — append web-fetch + web-search to TOOLS
tests/unit/example-web-tools.test.ts                      — (NEW) using msw or fetch mock
```

#### Deep file dependency analysis

- **`web-fetch.ts`** — input `{ url: z.string().url() }`, handler validates `new URL(url).hostname` against allowlist (default in `_allowlist.ts`, overridable via `WEB_FETCH_ALLOWLIST` env), then `fetch(url, { signal: AbortSignal.timeout(10_000) })`, returns first 4 KB of response text.
- **`web-search.ts`** — input `{ query: z.string().min(1) }`, handler `fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query))`, parses with regex (`<a class="result__a"...href="(.+?)".+?>(.+?)<\/a>`), returns top 5 results as JSON.
- **`_allowlist.ts`** — pure module: reads `process.env.WEB_FETCH_ALLOWLIST` (comma-separated) at first use; falls back to hardcoded defaults. Exports `isHostAllowed(hostname: string): boolean`.

#### Deep Dives

**Allowlist semantics:**
- Exact match OR **subdomain match with dot boundary** (`wikipedia.org` matches `en.wikipedia.org` AND `wikipedia.org` itself, but NOT `evilwikipedia.org`). **EC-3 (edge case review — MUST FIX): the naive `hostname.endsWith('wikipedia.org')` would let `evilwikipedia.org` through (classic cookie-suffix bug). Use `hostname === entry || hostname.endsWith('.' + entry)` — the leading dot guarantees a subdomain boundary.**
- Case-insensitive.
- IPv4/IPv6 literals BLOCKED (no exact match in allowlist → reject). Defense against SSRF to AWS metadata service.

**DuckDuckGo HTML parser:**
- Defensive: if `<a class="result__a">` not found, return `{ results: [], note: 'DDG HTML structure changed; parser needs update' }`. Test verifies graceful degradation.
- HTML entity decoding for `&amp;`, `&#39;`, etc. — use a small inline decoder, no external dep.

**Invariants:**
- BEFORE: `fetch` calls from LLM tools have no host allowlist → SSRF vector.
- AFTER: `web_fetch` rejects non-allowlisted hosts with clear error; `web_search` only ever calls DDG.

**Edge cases:**
- `web_fetch` URL with `file://` scheme → Zod `.url()` rejects (only HTTP/HTTPS).
- `web_fetch` URL with auth (`https://user:pass@host/`) → allowlist check ignores userinfo, but the LLM sending creds is logged for audit.
- `web_fetch` non-2xx response → returns `{ status: code, body: '...' }` so the LLM can react.
- `web_fetch` timeout (>10s) → throws AbortError; tool dispatch reports `tool_call status=error`.
- `web_search` empty query → Zod rejects.
- `web_search` DDG returns 0 results → returns `{ results: [], query: '...' }`.

#### Tasks

1. Implement `_allowlist.ts` with env-var parsing + default hostnames.
2. Implement `web-fetch.ts` with Zod URL + hostname check + 10s timeout + 4 KB cap.
3. Implement `web-search.ts` with DDG HTML fetch + parser + top-5 result extraction.
4. Append to `tools/index.ts`.
5. Write 12 unit tests using `vi.fn` to mock `globalThis.fetch`.

#### TDD + BDD

```
RED: test_web_fetch_allows_wikipedia()
  Given allowlist includes 'wikipedia.org'
  And fetch returns 200 with body 'wiki content'
  When handler({ url: 'https://en.wikipedia.org/wiki/Test' })
  Then returns body capped at 4 KB

RED: test_web_fetch_rejects_localhost()
  Given default allowlist
  When handler({ url: 'http://localhost:8080/' })
  Then throws Error matching /not in allowlist/i

RED: test_web_fetch_rejects_aws_metadata()
  When handler({ url: 'http://169.254.169.254/latest/meta-data/' })
  Then throws (Zod URL fail OR allowlist fail)

RED: test_web_fetch_rejects_evilwikipedia_org_lookalike()  (EC-3)
  Given allowlist includes 'wikipedia.org'
  When handler({ url: 'https://evilwikipedia.org/test' })
  Then throws Error matching /not in allowlist/i
  (Pins the dot-boundary subdomain match — prevents the classic cookie-suffix bug.)

RED: test_web_fetch_timeout_after_10s()
  Given fetch hangs
  When handler called
  Then rejects with AbortError within 11s

RED: test_web_search_returns_top_5_from_ddg_html()
  Given DDG HTML fixture with 10 result anchors
  When handler({ query: 'test' })
  Then returns array of length 5

RED: test_web_search_graceful_when_ddg_structure_changes()
  Given DDG HTML without result anchors
  When handler({ query: 'test' })
  Then returns { results: [], note: '...' } — no throw

RED: test_web_search_decodes_html_entities()
  Given DDG result title 'foo &amp; bar'
  When handler called
  Then result title is 'foo & bar'

GREEN: Implement 2 tools + allowlist helper.

REFACTOR: If allowlist logic is reused by another tool, the helper is already extracted.

VERIFY:
  npx vitest run tests/unit/example-web-tools.test.ts
```

BDD scenarios obrigatórios:
- **Happy path:** allowed URL fetched; DDG search returns results.
- **Validation error:** non-URL string rejected (Zod); blocked hostname rejected.
- **Edge case:** DDG returns 0 results, parser returns empty array gracefully.
- **Error scenario:** fetch timeout, fetch network error → propagates as tool_call(error).

#### Acceptance Criteria

- [ ] 12 unit tests GREEN.
- [ ] `pnpm tsc --noEmit` clean.
- [ ] `pnpm lint` clean.
- [ ] Zero `any`.
- [ ] Allowlist defaults documented in `.env.example` comment.

#### DoD

- [ ] All 5 implementation tasks completed.
- [ ] 12 tests GREEN.

---

### T2.3 — Workspace tools (2): `workspace_read`, `workspace_write`

#### Objective

Sandbox `<cwd>/.theokit/workspace/<agentId>/` per ADR D6. LLM can read + write files there; nothing else.

#### Evidence

- ADR D6: per-agentId sandbox prevents cross-conversation leakage AND host filesystem access.
- `agentId` available via the route handler's `request` (parsed from cookie) + `createConversationHistory` returning `conversationId`. Pass via a tool-factory pattern (handler closure captures the id) OR via a per-request tool builder (Phase 3 wires).

#### Files to edit

```
examples/full-stack-agent/server/tools/workspace-read.ts   — (NEW)
examples/full-stack-agent/server/tools/workspace-write.ts  — (NEW)
examples/full-stack-agent/server/tools/_workspace.ts       — (NEW) sandbox path resolver
examples/full-stack-agent/server/tools/index.ts            — note: workspace tools require agentId → exported as builders, not direct instances
tests/unit/example-workspace-tools.test.ts                 — (NEW)
```

#### Deep file dependency analysis

- **`_workspace.ts`** — `resolveSafePath(agentId, relativePath)`. Validates `agentId` against `^[a-zA-Z0-9_-]{1,128}$` (same regex as `createConversationHistory`). Validates `relativePath` doesn't escape (`path.resolve(base, relativePath).startsWith(base)`). **EC-4 (edge case review — MUST FIX): the Zod schema for `path` MUST reject NUL bytes (`\0`) via `.refine(p => !p.includes('\0'), 'NUL byte not allowed')`. Without it, `notes.md\0../../../etc/passwd` passes the lexical startsWith check (string starts with base) but `fs.writeFile` may truncate the filename at NUL on some Node versions — inconsistent + security-relevant.** Returns absolute path OR throws.
- **`workspace-read.ts`** — exports `buildWorkspaceRead(agentId): CustomTool`. Handler: `await fs.readFile(safePath, 'utf8')`. 4 KB cap. Throws ENOENT for missing file (LLM gets `tool_call(error)`).
- **`workspace-write.ts`** — exports `buildWorkspaceWrite(agentId): CustomTool`. Handler: `await fs.mkdir(dirname(safePath), { recursive: true }); await fs.writeFile(safePath, content, 'utf8')`. 100 KB cap per write.
- **`index.ts`** — instead of exporting `workspaceRead` directly, export a factory `buildTools(agentId)` that returns `[currentTime, calculator, randomNumber, webFetch, webSearch, ...buildWorkspaceRead(agentId), buildWorkspaceWrite(agentId), echo]`.

#### Deep Dives

**Why builders, not instances:** the workspace tools need `agentId` at construction time to bake the sandbox path into the handler closure. Tools that don't need `agentId` (`current_time`, etc.) are exported as singletons.

**Path resolution:**
```typescript
function resolveSafePath(agentId: string, relativePath: string): string {
  if (!isValidAgentId(agentId)) throw new Error('invalid agentId')
  const base = path.resolve(process.cwd(), '.theokit/workspace', agentId)
  const absolute = path.resolve(base, relativePath)
  if (!absolute.startsWith(base + path.sep) && absolute !== base) {
    throw new Error(`path traversal blocked: ${relativePath}`)
  }
  return absolute
}
```

**Invariants:**
- BEFORE: no workspace tools; LLM has no persistent state beyond conversation history.
- AFTER: LLM can stash notes / draft content / lists in `<cwd>/.theokit/workspace/<agentId>/<relativePath>`.

**Edge cases:**
- `..` in path → `resolveSafePath` rejects.
- Symlink inside workspace pointing outside → `realpath` would resolve but we use `path.resolve` (lexical). Mitigation: use `fs.realpath` AFTER write to assert the file lives in sandbox; if not, throw + cleanup.
- Write to existing directory path → fs.writeFile fails with EISDIR. Tool catches and returns clear error.
- Read non-existent file → return `{ error: 'not_found' }` instead of throwing (LLM can branch on existence).
- Disk full → handler errors propagate as tool_call(error). Acceptable.

#### Tasks

1. Implement `_workspace.ts` with `resolveSafePath`.
2. Implement `workspace-read.ts` builder.
3. Implement `workspace-write.ts` builder.
4. Refactor `tools/index.ts` to expose `buildTools(agentId)` factory.
5. Write 12 unit tests using a tmp dir fixture.

#### TDD + BDD

```
RED: test_workspace_resolves_safe_relative_path()
  Given agentId 'web-abc', relativePath 'notes.md'
  When resolveSafePath is called
  Then returns <cwd>/.theokit/workspace/web-abc/notes.md

RED: test_workspace_blocks_dotdot_traversal()
  Given relativePath '../../../etc/passwd'
  When resolveSafePath is called
  Then throws Error matching /traversal blocked/

RED: test_workspace_blocks_absolute_path()
  Given relativePath '/etc/passwd'
  When resolveSafePath
  Then throws

RED: test_workspace_blocks_invalid_agentId()
  Given agentId 'web; rm -rf /'
  When resolveSafePath
  Then throws

RED: test_workspace_blocks_nul_byte_in_path()  (EC-4)
  Given relativePath 'notes.md\0../../../etc/passwd'
  When resolveSafePath OR Zod schema parse
  Then throws Error matching /NUL byte not allowed/
  (Pins the Zod refine that prevents NUL-byte filename truncation attacks on
   fs.writeFile.)

RED: test_workspace_write_then_read_roundtrip()
  Given a tmp cwd
  When write({ path: 'notes.md', content: 'hello' }) then read({ path: 'notes.md' })
  Then read returns 'hello'

RED: test_workspace_read_missing_file_returns_not_found()
  When read({ path: 'missing.md' })
  Then returns { error: 'not_found' } — no throw

RED: test_workspace_write_respects_100kb_cap()
  When write with content of 200 KB
  Then rejects with size error

GREEN: Implement 3 files.

REFACTOR: Extract size-cap helper if reused.

VERIFY:
  npx vitest run tests/unit/example-workspace-tools.test.ts
```

BDD scenarios obrigatórios:
- **Happy path:** write then read roundtrip.
- **Validation error:** invalid agentId rejected.
- **Edge case:** read non-existent → graceful.
- **Error scenario:** path traversal blocked.

#### Acceptance Criteria

- [ ] 12 unit tests GREEN.
- [ ] `pnpm tsc --noEmit` clean.
- [ ] `pnpm lint` clean.
- [ ] `tools/index.ts` exports `buildTools(agentId)` factory.

#### DoD

- [ ] All 5 implementation tasks completed.
- [ ] 12 tests GREEN.
- [ ] Sandbox validated against `..`, absolute paths, symlinks, malformed agentId.

---

### T2.4 — `echo` tool (1)

#### Objective

Trivial tool that returns its input verbatim. Used in the demo's `EmptyState` quick-actions to give the visitor a 0-friction "yes, the agent calls tools" moment.

#### Files to edit

```
examples/full-stack-agent/server/tools/echo.ts            — (NEW)
examples/full-stack-agent/server/tools/index.ts           — append echo to TOOLS
tests/unit/example-echo-tool.test.ts                      — (NEW)
```

#### Deep Dives

**Input:** `z.object({ text: z.string().max(1000) })`. **Handler:** returns `text` verbatim.

#### Tasks

1. Implement `echo.ts`.
2. Append to index.
3. Write 4 unit tests.

#### TDD + BDD

```
RED: test_echo_returns_text_verbatim()
  When handler({ text: 'hi' })
  Then returns 'hi'

RED: test_echo_rejects_text_over_1000_chars()
  When handler({ text: 'a'.repeat(1001) })
  Then rejects (Zod max)

RED: test_echo_handles_empty_string()
  When handler({ text: '' })
  Then returns '' (no throw — empty is allowed)

RED: test_echo_handles_unicode()
  When handler({ text: '日本語 🚀' })
  Then returns '日本語 🚀'

GREEN: Implement.

REFACTOR: None.

VERIFY:
  npx vitest run tests/unit/example-echo-tool.test.ts
```

BDD scenarios obrigatórios: all 4 above match the 4 mandatory categories.

#### Acceptance Criteria + DoD

- [ ] 4/4 tests GREEN.
- [ ] tsc / lint clean.
- [ ] index.ts exports `echo`.

---

## Phase 3: Wire route + UI

**Objective:** `server/routes/chat.ts` calls `createConversationHistory` → builds `Agent.create({ tools: buildTools(conversationId) })` → `streamAgentRun`. UI updates QuickActionChips to reflect the new tool catalog.

### T3.1 — `server/routes/chat.ts`

#### Objective

Final route handler that exercises all four Phase B primitives + 8 tools.

#### Files to edit

```
examples/full-stack-agent/server/routes/chat.ts          — (NEW) ~70 LOC
tests/unit/example-chat-route.test.ts                    — (NEW) regex grep + shape assertions
```

#### Deep Dives

**Shape:**
```typescript
import { defineAgentEndpoint, createConversationHistory, streamAgentRun, type AgentEvent } from 'theokit/server'
import { buildTools } from '../tools/index.js'

export const POST = defineAgentEndpoint({
  async *handler({ body, request, cookieHeaders }): AsyncGenerator<AgentEvent> {
    // Parse body (defensive)
    // Pick provider (OPENROUTER_API_KEY required; ANTHROPIC_API_KEY fallback)
    // createConversationHistory → conversationId + agent
    // (no extra Agent.create — createConversationHistory returns an Agent already configured with tools)
    // const run = await agent.send(message)
    // yield* streamAgentRun(run)
  },
})
```

Key wrinkle: `createConversationHistory` accepts `options.tools` passthrough to `Agent.getOrCreate`. The agentId is resolved BEFORE the tools list (which depends on agentId for workspace tools). Solution: resolve the conversationId FIRST via a pre-check, then call `createConversationHistory` with the tools array built from that id:

```typescript
// Read or generate the conversation id without creating the agent yet
const probedId = getCookieValue(request) ?? crypto.randomUUID()
const tools = buildTools(probedId)
const { agent, conversationId } = await createConversationHistory({
  request,
  response: { headers: cookieHeaders },
  agentId: probedId, // override forces use of the same id we built tools for
  options: { apiKey, model: { id: modelId }, tools },
})
```

This double-touches the id (probe + override) but keeps `buildTools(agentId)` honest: the workspace tools always sandbox to the SAME id the agent runs under.

**EC-5 (edge case review — MUST FIX): MUST assert `conversationId === probedId` immediately after `createConversationHistory` returns. If `createConversationHistory`'s precedence rules (now or future) cause divergence, the workspace tools sandbox to one id while the agent runs under another → silent persistence breakage. The assertion catches the contract violation loudly:**

```typescript
if (conversationId !== probedId) {
  throw new Error(
    `createConversationHistory ignored the agentId override: ` +
    `requested ${probedId}, got ${conversationId}. ` +
    `Workspace tools would sandbox to the wrong directory.`,
  )
}
```

#### Tasks

1. Implement `chat.ts`.
2. Update `app/page.tsx` QuickActionChips to reflect the 8 tools (one chip per major category).
3. Write 6 unit tests asserting the route's shape (imports, defineAgentEndpoint export, agentId probing pattern).

#### TDD + BDD

```
RED: test_chat_route_imports_createConversationHistory()
  Given chat.ts source
  When grep'd
  Then contains 'createConversationHistory'

RED: test_chat_route_imports_streamAgentRun()
  Then contains 'streamAgentRun'

RED: test_chat_route_imports_buildTools()
  Then contains 'buildTools'

RED: test_chat_route_probes_id_before_building_tools()
  Then ordering: probedId resolved BEFORE buildTools(probedId) call

RED: test_chat_route_passes_response_headers_to_createConversationHistory()
  Then contains 'response: { headers: cookieHeaders }'

RED: test_chat_route_no_agent_dispose()
  Then does NOT contain 'agent.dispose(' (continuity by design)

RED: test_chat_route_asserts_conversationId_matches_probedId()  (EC-5)
  Given chat.ts source
  When grep'd
  Then contains an assertion that throws when `conversationId !== probedId`
  (Pins the contract violation guard — silent divergence would break the
   workspace tools' sandbox alignment with the agent's actual id.)

GREEN: Implement chat.ts.

REFACTOR: Extract the `probedId` helper if it ends up reused.

VERIFY:
  npx vitest run tests/unit/example-chat-route.test.ts
```

BDD scenarios obrigatórios:
- **Happy path:** all 4 primitives wired.
- **Validation error:** N/A (handler).
- **Edge case:** no `agent.dispose` per request.
- **Error scenario:** the existing `defineAgentEndpoint` wrapper catches generator throws → final error event.

#### Acceptance Criteria

- [ ] 6/6 grep tests GREEN.
- [ ] `pnpm tsc --noEmit` clean.
- [ ] `pnpm lint` clean.
- [ ] chat.ts ≤ 90 LOC.
- [ ] Manual smoke: with valid OPENROUTER_API_KEY, ask "What time is it?" → ToolCallCard renders + result.

#### DoD

- [ ] All 3 tasks completed.
- [ ] 6 tests GREEN.
- [ ] Manual smoke documented in T6.1 dogfood.

---

## Phase 4: Telegram gateway

**Objective:** Same agent answers in Telegram via `@usetheo/gateway-telegram`. Boot as a sidecar process from the example's `pnpm bot` script.

### T4.1 — `server/telegram-bot.ts` + `pnpm bot` script

#### Objective

A standalone Node entrypoint that starts the `GatewayRunner` with the Telegram adapter, sharing `Agent.getOrCreate` + the same tool catalog with the web route.

#### Evidence

- `theokit-sdk/packages/gateway-telegram/README.md` minimal-example pattern.
- ADR D3 — same Node process, long-polling, agentId = `tg-<chatId>`.

#### Files to edit

```
examples/full-stack-agent/server/telegram-bot.ts          — (NEW) the bot entry
examples/full-stack-agent/package.json                    — append "bot": "tsx server/telegram-bot.ts" to scripts
tests/integration/example-telegram-bot-shape.test.ts      — (NEW) shape + dry-init test (no real BotFather)
```

#### Deep Dives

**Shape:**
```typescript
import { Agent } from '@usetheo/sdk'
import { GatewayRunner } from '@usetheo/gateway'
import { TelegramAdapter } from '@usetheo/gateway-telegram'
import { buildTools } from './tools/index.js'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN required. Get one from @BotFather. Exiting.')
  process.exit(1)
}

const adapter = new TelegramAdapter({ token })
const runner = new GatewayRunner({
  adapters: [adapter],
  handler: async (event, ctx) => {
    const agentId = `tg-${event.chatId}`
    const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.ANTHROPIC_API_KEY
    if (!apiKey) { await ctx.reply('Server missing API key. Tell the operator.'); return }
    const modelId = process.env.OPENROUTER_API_KEY
      ? 'openrouter/anthropic/claude-3.5-sonnet'
      : 'claude-sonnet-4-5-20250929'

    const agent = await Agent.getOrCreate(agentId, {
      apiKey, model: { id: modelId }, tools: buildTools(agentId),
    })
    const run = await agent.send(event.text)
    const result = await run.wait()
    await ctx.reply(result.result ?? '(no reply)')
  },
})
await runner.start()
```

**Telegram-specific:**
- `event.chatId` is the SDK gateway's normalized chat identifier (per `BasePlatformAdapter` contract). Documented in `@usetheo/gateway` README.
- `ctx.reply(text)` handles the >4096 char split via `splitForTelegram` helper (re-exported by adapter).

**Invariants:**
- BEFORE: no Telegram bot.
- AFTER: `pnpm bot` boots a polling loop; sending `/start` to the bot triggers a real `Agent.send` → reply.

**Edge cases:**
- Missing `TELEGRAM_BOT_TOKEN` → exit with clear message.
- Bot already running on another instance (Telegram only allows one polling consumer per token) → grammy's first poll fails with HTTP 409 Conflict. Documented.
- Group chat → `shouldRespondInChat` policy (from adapter) ignores unless `@mentioned` (default group policy).
- Image / voice messages → adapter normalizes to `event.text` empty + `event.telegram.raw` for the raw grammy Context. We ignore them in v0 (reply "I only support text right now").

#### Tasks

1. Implement `telegram-bot.ts`.
2. Append `"bot": "tsx server/telegram-bot.ts"` to package.json scripts.
3. Update README "Telegram" section with BotFather instructions.
4. Write 6 integration tests with the token mocked.

#### TDD + BDD

```
RED: test_bot_exits_when_token_missing()
  Given no TELEGRAM_BOT_TOKEN env
  When the module is imported
  Then process.exit(1) is called with clear message

RED: test_bot_uses_tg_prefix_for_agentId()
  Given a mock handler invocation with event.chatId = '12345'
  Then Agent.getOrCreate is called with 'tg-12345'

RED: test_bot_uses_openrouter_preferred_over_anthropic()
  Given both env vars set
  Then modelId is 'openrouter/anthropic/...'

RED: test_bot_uses_anthropic_fallback()
  Given only ANTHROPIC_API_KEY
  Then modelId is 'claude-sonnet-4-5-20250929'

RED: test_bot_passes_buildTools_with_agentId()
  When handler invoked
  Then buildTools is called with 'tg-12345'

RED: test_bot_replies_with_run_result()
  Given Agent.send returns RunResult { result: 'hello' }
  When handler invoked
  Then ctx.reply called with 'hello'

GREEN: Implement telegram-bot.ts.

REFACTOR: None.

VERIFY:
  npx vitest run tests/integration/example-telegram-bot-shape.test.ts
```

BDD scenarios obrigatórios:
- **Happy path:** valid token + message → reply.
- **Validation error:** missing token → exit.
- **Edge case:** no API key → graceful error reply.
- **Error scenario:** Agent.send throws → bot logs and replies with error.

#### Acceptance Criteria

- [ ] 6/6 integration tests GREEN.
- [ ] `pnpm tsc --noEmit` clean.
- [ ] `pnpm lint` clean.
- [ ] `pnpm bot` script defined.
- [ ] README Telegram section has BotFather + token + `pnpm bot` + first-message walkthrough.

#### DoD

- [ ] All 4 tasks completed.
- [ ] 6 tests GREEN.

---

## Phase 5: Playwright + integration tests

**Objective:** Real-browser test that asserts the demo works end-to-end (tools fire, cookie persists, prod SSR works).

### T5.1 — Playwright spec for the example (web)

#### Objective

Single spec that exercises the chat surface against the real example, including a tool-call assertion (uses fake key for deterministic 401 OR a real key in CI secret — fallback to fake for local).

#### Files to edit

```
playwright.config.ts                                      — new project `full-stack-agent`
tests/e2e/example-full-stack-agent.spec.ts                — (NEW) 5 tests
```

#### Deep Dives

The example boots on a dedicated port (3494). Playwright `webServer` config boots it with `OPENROUTER_API_KEY=PLAYWRIGHT_PLACEHOLDER_full_stack_agent`. The fake key reaches `createConversationHistory` (cookie issued) then OpenRouter returns 401 → error event. Same pattern as item #5's canonical-chat spec.

The 5 tests:
1. Composer renders (proves all imports + UI mount).
2. Send "hi" → cookie issued (UUID, HttpOnly).
3. Reload → cookie unchanged.
4. SSR HTML on `/` (dev mode): non-empty `<div id="root">` (asserting SSR happened, even in dev).
5. Console error budget: zero unhandled errors during a full session.

#### Tasks

1. Add `webServer` entry to playwright.config.ts for port 3494.
2. Add project `full-stack-agent` matching `example-full-stack-agent.spec.ts`.
3. Write the 5 tests.

#### TDD + BDD

```
RED: test_example_e2e_composer_renders()
  Given fresh page load
  Then composer placeholder visible within 10s

RED: test_example_e2e_cookie_issued_on_first_post()
  Given fresh context
  When 'hi' typed + Enter
  Then 'theo_conversation' cookie matches UUID + HttpOnly

RED: test_example_e2e_cookie_unchanged_after_reload()
  Given cookie A set
  When reload + send 'second'
  Then cookie still A

RED: test_example_e2e_ssr_root_div_non_empty()
  Given GET /
  Then HTML contains <div id="root"> followed by non-empty content (not just whitespace)

RED: test_example_e2e_zero_console_errors()
  Given full chat session
  Then collectConsoleErrors.length === 0

GREEN: Add Playwright project + webServer + spec.

REFACTOR: Reuse helpers from template-default-canonical-chat.spec.ts.

VERIFY:
  CI=true npx playwright test --project=full-stack-agent
```

BDD scenarios obrigatórios:
- **Happy path:** composer renders.
- **Validation error:** N/A.
- **Edge case:** reload preserves continuity.
- **Error scenario:** zero console errors during full session.

#### Acceptance Criteria

- [ ] 5/5 Playwright tests GREEN.
- [ ] 2 consecutive CI runs both GREEN (flake gate).
- [ ] Playwright project + webServer config wired.

#### DoD

- [ ] All 3 tasks completed.
- [ ] 5 tests GREEN in 2 runs.

---

### T5.2 — Integration test for prod SSR + headers

#### Objective

Programmatic boot of `theokit start` against the built example. Curl + assert SSR + CSP + Cache-Control. Closes the Phase 0 loop with a regression test that runs in CI.

#### Files to edit

```
tests/integration/example-prod-server.test.ts          — (NEW)
```

#### Tasks

1. Spawn `theokit build` in the example (in `beforeAll`).
2. Spawn `theokit start --port <free>` (in `beforeAll`).
3. 4 tests assert: SSR non-empty, CSP present + nonce-X, Cache-Control: private no-store, script nonce matches CSP nonce.
4. `afterAll` kills the server.

#### TDD + BDD

```
RED: test_prod_server_ssr_emits_non_empty_root_div()
  Given prod server booted
  When GET /
  Then HTML contains <div id="root">...non-empty...</div>

RED: test_prod_server_emits_csp_header()
  Then response.headers['content-security-policy'] defined + has script-src

RED: test_prod_server_emits_cache_control_when_nonce()
  Then 'cache-control' matches /private/ + /no-store/

RED: test_prod_server_script_nonce_matches_csp_nonce()
  Then <script nonce="X"> in HTML AND CSP has 'nonce-X' for same X

GREEN: Phase 0 fixes (T0.1 + T0.2) make these green.

REFACTOR: None.

VERIFY:
  npx vitest run tests/integration/example-prod-server.test.ts
```

BDD scenarios obrigatórios:
- **Happy path:** prod SSR + headers.
- **Validation error:** N/A.
- **Edge case:** API route still has headers but no nonce.
- **Error scenario:** if SSR fails to load, test fails loudly (no silent fallback).

#### Acceptance Criteria

- [ ] 4/4 integration tests GREEN.
- [ ] Test boots + tears down the prod server cleanly (no leaked process).

#### DoD

- [ ] All 4 tasks completed.
- [ ] 4 tests GREEN.

---

## Phase 6: Dogfood QA + roadmap update (mandatory)

### T6.1 — Run dogfood + update roadmap

#### Objective

`/dogfood full` against the post-Phase-5 codebase. Save report. Update `CLAUDE.md` macro roadmap entry #6 to ✅ Done. Append `CHANGELOG.md [Unreleased]`.

#### Files to edit

```
docs/audit/dogfood-{YYYY-MM-DD}-example-full-stack-agent.md      — (NEW)
CLAUDE.md                                                         — collapse item #6 (3 examples) into ✅ Done full-stack-agent
CHANGELOG.md                                                      — add [Unreleased] Added entry
```

#### Tasks

1. Run `/dogfood full`.
2. Save report.
3. Update CLAUDE.md item #6.
4. Update CHANGELOG.md.

#### TDD + BDD

```
RED: test_dogfood_health_at_least_70()
RED: test_changelog_entry_present()
RED: test_roadmap_marked_done()
GREEN: Run + write.
VERIFY: grep / file existence checks.
```

BDD scenarios obrigatórios:
- **Happy path:** dogfood ≥70.
- **Validation error:** any plan-caused CRITICAL → fix and re-run.
- **Edge case:** Node 22 vs Node 20 phase-blocked items documented as pre-existing.
- **Error scenario:** if Playwright fails, fix before declaring done.

#### Acceptance Criteria

- [ ] Dogfood report exists at `docs/audit/dogfood-{date}-example-full-stack-agent.md`.
- [ ] Health ≥ 70.
- [ ] Zero plan-caused CRITICAL.

#### DoD

- [ ] All 4 tasks done.
- [ ] All 3 tests pass.
- [ ] Promise emittable honestly.

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | ONE complete example (not 3) | All phases | Single `examples/full-stack-agent/` ships everything |
| 2 | 8 tools via `defineAgentTool` | T2.1 + T2.2 + T2.3 + T2.4 | Pure (3) + web (2) + workspace (2) + echo (1) |
| 3 | TheoUI chat surface | T1.1 | Copies fixture/template-default app/page.tsx |
| 4 | `Agent.create` + `streamAgentRun` | T3.1 | Wired in chat.ts via `createConversationHistory` (which calls `Agent.getOrCreate`) |
| 5 | `createConversationHistory` exercised | T3.1 | Direct call in chat.ts handler |
| 6 | OpenRouter as default provider | T3.1 + T4.1 | `OPENROUTER_API_KEY` preferred; modelId prefixed with `openrouter/` |
| 7 | Telegram bot with same agent | T4.1 | Sidecar bot uses `Agent.getOrCreate('tg-<chatId>', { tools: buildTools(id) })` |
| 8 | Persistence across reload (web) | T5.1 (test) | `theo_conversation` cookie survives reload |
| 9 | Persistence across bot restart (Telegram) | T4.1 (design) | agentId derived from chatId — stable across restarts |
| 10 | Workspace sandbox (no host fs access) | T2.3 (ADR D6) | `resolveSafePath` validates per request |
| 11 | SSRF protection on web_fetch | T2.2 (ADR D7) | Hostname allowlist |
| 12 | Prod SSR works | T0.1 + T5.2 | `.mjs` extension fix + integration test |
| 13 | Prod CSP/headers work | T0.2 + T5.2 | `buildSecurityHeaders` wired in start.ts |
| 14 | Roadmap item #6 → ✅ Done | T6.1 | CLAUDE.md collapse + Done marker |
| 15 | Type-safe surface | All phases | `pnpm tsc --noEmit` clean; zero `any` |
| 16 | Dogfood gate | T6.1 | Mandatory phase |
| 17 | EC-1 — `calculator` returns `Infinity`/`NaN` confuses LLM | T2.1 (algorithm + test) | `Number.isFinite(result)` guard + test on `1/0` |
| 18 | EC-2 — `calculator` silently refactored to `new Function('return '+expr)` | T2.1 (test) | Source-grep test asserts zero `eval`/`new Function`/`require('vm')` |
| 19 | EC-3 — `web_fetch` allowlist suffix match catches `evilwikipedia.org` | T2.2 (algorithm + test) | Match `hostname === entry OR endsWith('.' + entry)` (dot boundary) |
| 20 | EC-4 — workspace path NUL byte truncation | T2.3 (Zod refine + test) | `.refine(p => !p.includes('\0'))` in path schema |
| 21 | EC-5 — `conversationId` ≠ `probedId` divergence breaks workspace sandbox | T3.1 (assertion + test) | Throw on divergence right after createConversationHistory call |
| 22 | EC-6 — dev/prod CSP nonce divergence | T0.2 (algorithm + test) | Generate nonce unconditionally, include on every response |

**Coverage: 22/22 gaps covered (100%)** — including 6 MUST FIX + 6 SHOULD TEST + 4 DOCUMENT from edge-case-plan review.

**Edge case review:** `docs/reviews/edge-case-plan/example-full-stack-agent-edge-cases-2026-05-22.md` — full audit. SHOULD TEST + DOCUMENT items not inlined here (would balloon plan size); the review doc is authoritative for the implementer to consult during execution.

## Global Definition of Done

- [ ] All 7 phases completed (Phase 0 + 1 + 2 + 3 + 4 + 5 + 6).
- [ ] All RED→GREEN tests passing (~60 new tests across phases).
- [ ] Zero TypeScript errors (`tsc --noEmit`).
- [ ] Zero lint warnings (`eslint --max-warnings=0`).
- [ ] Backward compat: items #3/#4/#5 tests still GREEN.
- [ ] Code-audit checks across `packages/theo/`, `examples/full-stack-agent/`.
- [ ] `CHANGELOG.md [Unreleased]` entry under "Added".
- [ ] `CLAUDE.md` macro roadmap item #6 → ✅ Done with evidence pointer.
- [ ] **Fixture proof** — `examples/full-stack-agent/` is the reproducible artifact; Playwright + integration tests pin it.
- [ ] **Dogfood QA PASS** — health ≥ 70/100, zero plan-caused CRITICAL.
- [ ] LOC of example chat.ts ≤ 90 lines.
- [ ] LOC of example total source ≤ 1500 lines (sanity).

## Final Phase: Dogfood QA (MANDATORY)

> Runs AFTER all 5 implementation phases (0+1+2+3+4+5). The plan is NOT done until dogfood passes.

### Execution

```
/dogfood full
```

Plus manual smoke:

```bash
cd examples/full-stack-agent
cp .env.example .env
echo "OPENROUTER_API_KEY=sk-or-v1-<real-key>" >> .env
pnpm install
pnpm dev   # web
# In another terminal:
echo "TELEGRAM_BOT_TOKEN=<bot-token>" >> .env
pnpm bot   # Telegram

# Web: open http://localhost:<port>, ask "What time is it?" → ToolCallCard
# Telegram: DM the bot "what's 2+3*4" → reply 14
# Reload web page → conversation persists (cookie)
# theokit build && theokit start → prod SSR + CSP work
```

### Acceptance Criteria

- [ ] Health ≥ 70.
- [ ] Zero plan-caused CRITICAL.
- [ ] Manual smoke (web + Telegram + prod) passes.

### If Dogfood Fails

1. Identify plan-caused vs pre-existing.
2. Fix plan-caused CRITICAL/HIGH.
3. Re-run.

---

## Out of scope (intentional)

- **Cross-channel handoff** ("connect my Telegram to my web session"). Web and Telegram conversations are independent. Documented in README as a future-PR extension pattern.
- **Webhook-mode Telegram.** Long-polling only. Webhook needs ngrok/CloudFlared; production-grade webhook deploy is a separate concern.
- **Voice/image inputs in Telegram.** v0 replies "I only support text" to non-text messages.
- **Production-grade tool dispatch tracing.** OTel/Sentry exporter integration is on the 0.5.0+ runway.
- **Multi-language UI.** Demo is English-only.
- **`examples/chat-anthropic/` + `examples/agent-with-tools/` + `examples/agent-with-memory/`** — collapsed into this single example per ADR D1 + user direction (2026-05-22).
- **Vercel/CF Workers deploy validation.** That's item #7 of the macro roadmap. Phase 0 fixes the underlying prod SSR + CSP bugs that #7 will validate against.
