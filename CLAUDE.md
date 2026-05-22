# CLAUDE.md — TheoKit

Contract between Claude and the **TheoKit** sub-project. Read before touching anything under `theokit/`.

This file complements the [usetheo monorepo CLAUDE.md](../CLAUDE.md). Cross-project rules still apply — this file adds TheoKit-specific layers and **does not** propagate to other sub-projects in the monorepo.

---

## What TheoKit is — and how we talk about it

TheoKit is the **app the agent lives in**. Technically, it is a Next.js-based framework for building full-stack AI agents in TypeScript. But that technical description is the answer to "what is it?" — not to "what do I get?". This `CLAUDE.md` enforces the gap between the two.

**Positioning, internal:**

- TheoKit treats the agent as a first-class citizen of the app, not as a plugin or add-on. Routes, auth, sessions, WebSockets, server actions, deploy targets — every primitive is shaped to make an agent shippable on a real domain, talking to real users.
- The narrative reference is the kind of personal-agent storytelling that drives projects like OpenCode (one developer, multiple agents, each with its own purpose, all running in production). TheoKit is the *framework* that turns that vision into a shippable app.
- The "Build the app your agent lives in" line is the HERO and the load-bearing piece of TheoKit copy. Everything in the README, future TheoKit docs, and TheoKit-specific launch material radiates outward from that promise.

**Positioning, public:**

- Use the Voice and Tone section below. Aspirational HERO, benefit-first BODY, technical DEEP DIVE.
- Mention sibling products (TheoCode, TheoCreate, Theo PaaS) only as context for the workflow — never as the lede. The TheoKit reader landed here because they want to build something. Give them that first.

---

## Voice and Tone

How we communicate publicly **about TheoKit**. The stack stays technical — the copy doesn't.

**Locked 2026-05-15.** Reference posture: aspirational, first-person, outcome-oriented public copy — the same posture that lets OpenCode-style projects reach a developer who is *imagining what they will build*, not yet evaluating a feature list. We adopt this posture for **TheoKit's public surfaces**. Internal docs, ADRs, this `CLAUDE.md`, and the "How it works" / "Architecture" sections of the README stay precise and technical. The stack, narrative, and product hierarchy do not change — only the words we use to introduce TheoKit.

### Communication layers

TheoKit public copy lives in three layers. Each layer has different permission for technical depth.

| Layer | Where it lives | Permission | Voice |
|---|---|---|---|
| **HERO** | TheoKit README h1+sub-h1, site sections about TheoKit, social posts naming TheoKit, demo intros, launch threads | **No jargon.** Promise an outcome the reader can picture. Speak to the reader's want, not to the feature. | Aspirational, first-person allowed ("I built…", "You ship…"), present tense. |
| **BODY** | README "What you get" / "Why TheoKit", short blog intros, comparison tables involving TheoKit | **Benefit-first, with one technical anchor per item.** Lead with what the developer accomplishes; close with the underlying capability. | Direct, second-person, short sentences. |
| **DEEP DIVE** | README "How it works" / "Architecture" / "Server Routes" / "Typed Client" / "Auth" / "WebSocket" / "CLI" sections, this `CLAUDE.md`, ADRs, internal docs, blog deep dives | **Full technical precision.** This is where `defineRoute`, `AES-256-GCM`, `defineWebSocket`, `theoFetch`, Vite, Zod, tsup and similar terms belong. | Editorial-technical, precise, no marketing varnish. |

If a piece of TheoKit copy is at the wrong layer, it is broken — even if every word is true.

### Vocabulary — public copy translation

Lead with the outcome. Anchor the technical term once in DEEP DIVE, then drop it everywhere else.

| Don't say (in HERO or BODY) | Say instead | Where the technical term goes |
|---|---|---|
| "Next.js framework for Full-Stack AI Agents" | "Build the app your agent lives in" | DEEP DIVE: "Built on Next.js with file-based routing and typed server actions" |
| "The opinionated TypeScript surface for building the app around your agent" | (Drop the framing. The HERO already says it.) | DEEP DIVE: TypeScript-first, batteries included, no plugin maze |
| "File-based routing, typed routes, encrypted sessions, WebSockets, server actions" | "Routing, auth, real-time, deploy — wired" | DEEP DIVE: full feature list belongs here, with API names |
| "`defineRoute` with Zod validation, automatic type inference" | "APIs that validate themselves" | DEEP DIVE: keep the `defineRoute` + Zod call-site example |
| "`defineAction` with CSRF protection" | "Server actions without plumbing" | DEEP DIVE: explain CSRF + the call-site example |
| "Encrypted sessions (AES-256-GCM), `requireAuth()` with type narrowing" | "Sessions that just work" | DEEP DIVE: AES-256-GCM and `requireAuth()` belong here |
| "`renderToPipeableStream` + `hydrateRoot`" | (Forbidden in HERO/BODY.) | DEEP DIVE only |
| "Built with Vite 6 / React 19 / Zod / tsup / Vitest" | (Drop from HERO/BODY. List in DEEP DIVE only.) | DEEP DIVE: keep the "Built With" table |

### Storytelling rules (HERO and top of BODY)

HERO and the opening of BODY may use first-person storytelling about what the developer is building with TheoKit.

- **Show real usage of an agent app, not features of a framework.** "I have an agent that drafts my newsletter and a dashboard where I edit its drafts before it sends them" beats "supports multi-agent workflows." The TheoKit reader is imagining a product, not evaluating an SDK.
- **Use "I" and "you" freely.** "I shipped my agent's dashboard on Friday" or "You ship your agent's dashboard on Friday" — both land. Pick whichever reads better in context. Mixing across a page is fine; switching mid-sentence is not.
- **Present tense, active voice.** "TheoKit gives your agent a home." Not "TheoKit will give" or "TheoKit can give."
- **Outcomes are concrete.** "Live URL", "production traffic", "a real form that submits to a real handler", "a WebSocket that lasts past the demo" — not "blazing fast", "seamless", "robust", "opinionated".
- **Lead with the want, not the product.** Open with what the reader wants to do. "Ship an agent your friends can actually use" → TheoKit name comes second.

### Public-copy rules (apply on every TheoKit public surface)

1. **The HERO answers one question: "what do I get?"** Not "what is it?". Not "what features?". Just the outcome the reader is buying into.
2. **One technical anchor per benefit, max.** A BODY bullet says what the dev *does*, then optionally how. "WebSocket as a file (`server/ws/chat.ts`)" — outcome + anchor. Not "WebSocket endpoints via `defineWebSocket` with file-based routing under `server/ws/`".
3. **Banned in HERO and BODY:** `defineRoute`, `defineAction`, `defineWebSocket`, `theoFetch`, `requireAuth`, `createSessionManager`, `defineMiddleware`, `defineConfig`, `hydrateRoot`, `renderToPipeableStream`, AES-256-GCM, Drizzle ORM, Vite, Vitest, tsup, opinionated, polyglot, monorepo. Each has a benefit-shaped equivalent — find it. (Vite, Drizzle, Vitest etc. are allowed in DEEP DIVE.)
4. **Banned everywhere (HERO, BODY, DEEP DIVE):** "blazing fast", "robust", "powerful", "seamless", "enterprise-grade", "next-generation", "industry-leading", "battle-tested" (unless followed by an actual battle), and "production-ready" without a Status section to back it.
5. **Numbers beat adjectives.** "4 templates" beats "multiple templates". "1 file = 1 WebSocket endpoint" beats "easy real-time setup". If you can't put a number on it, question whether the claim is real.
6. **Verify before publishing.** Every named feature must exist in the TheoKit README or CHANGELOG. The voice gets aspirational; the facts stay honest.
7. **HERO never names internals.** A reader on TheoKit's landing surface must not learn the word `defineRoute` before they learn what they will accomplish.

### Before / After — TheoKit examples

The conversions Phase 1 will apply across the TheoKit README and TheoKit's site section.

**README hero (h1 + sub-h1) — already applied**
- Before: *"Next.js framework for Full-Stack AI Agents. The opinionated TypeScript surface for building the app around your agent."*
- After: *"Build the app your agent lives in. Routing, auth, real-time, deploy — wired."*

**README "What You Get"**
- Before (sample): *"File-based routing — `app/page.tsx` → route. Layouts, loading, error, not-found."*
- After: *"Routes are just files — `app/page.tsx` → `/`. Layouts, errors, loading, not-found — no config file."*
- The pattern: outcome first, one concrete technical anchor, then a short qualifier. Each bullet should make the reader picture themselves *using* the thing.

**README "Project Structure" through "Imports"**
- Before: these sections sit immediately after "What You Get" without a layer break, so they read as features.
- After: insert a clear `## How it works` delimiter before "Project Structure". Everything from there down is DEEP DIVE and may use the full technical vocabulary, including `defineRoute`, `defineWebSocket`, `theoFetch`, etc.

**README "Built With" table**
- Stays as-is in DEEP DIVE. Vite, React 19, Zod, tsup, Vitest, Playwright are allowed here.

### How this section evolves

The **vocabulary table** and **before/after examples** are living — add new entries as new TheoKit copy lands or new patterns are discovered. The **communication layers**, **banned terms list**, and **storytelling rules** require an explicit strategic review (same gate as the monorepo Locked Narrative table). Do not weaken these to make a piece of marketing copy fit.

---

## How this file relates to the monorepo

- Monorepo cross-project rules (Cross-Project Rules 1–10 in [`../CLAUDE.md`](../CLAUDE.md)) still apply inside `theokit/`. This file does not override them.
- The voice and tone defined here is **scoped to the TheoKit project tree**. Do not export these rules to other sub-projects without an explicit strategic review at the monorepo level.
- The Locked Narrative table in the monorepo `CLAUDE.md` is authoritative for cross-product positioning (headline, sub-headline, comparison stack). TheoKit copy must not contradict it; TheoKit copy may be more aspirational *within* the TheoKit-shaped slice of that narrative.

---

## Macro Roadmap — "Next.js for agents" delivery

**Mission (locked 2026-05-21):** TheoKit is the Next.js for agents. The framework where someone builds *their own* agent app. Not a coding agent itself. See [[project-theokit-purpose]] in memory.

Where we stand today: the primitives ship (`defineAgentEndpoint`, `useAgentStream`, `AgentEvent`, default agent-shaped scaffold). What separates the current state from "anyone builds their agent in 5 minutes" are the convergence layers below — ordered by ROI, ~3 weeks of focused work.

| # | Phase | Deliverable | Effort | Status | Why it matters |
|---|---|---|---|---|---|
| 1 | A · Unblock | Fix `useAgentStream` to send `X-Theo-Action: 1` on every non-GET (default chat demo emits `csrf.warn` today) | 30 min | ✅ Done (T1.1, nextjs-maturity) — `agent-stream-core.ts:75` + 3 tests in `use-agent-stream.test.ts` | Unconditional blocker of 0.3.0 release |
| 2 | A · Unblock | Tutorial **"Your first agent in 5 minutes"** in README (scaffold → API key → 5 lines → working chat) | 4 h | ✅ Done 2026-05-22 — `README.md` "Your first agent in 5 minutes" section; validated empirically via fixture experiment (10-line essence, not 5 — see frictions below) | Exposes real gaps; unlocks "how do I start?" |
| 3 | B · Convergence | Canonical `chat.ts` wires `@usetheo/sdk` `Agent.prompt` + `throwOnError`; scaffold ships SDK as default dep; Node ≥ 22.12 preflight; anti-stack lint gate; 6-line README snippet | 1 d | ✅ Done 2026-05-22 — Phase 1 SDK (`AgentRunError` + `throwOnError`, 16 tests), T2.1 fixture (8 tests), **T2.2 Playwright 3/3 GREEN** (composer renders + typed-and-Enter + single SSE error event — found and FIXED 6 template UI bugs in same session: AgentErrorCard kind/detail/actions, Badge.size, QuickAction.label narrow, SDK DTS workaround), T2.3 lint gate (7 tests), T3.1 scaffold template (5 tests), T4.1 preflight (14 tests + live-fired on Node 20 in dogfood). **T5.0 SDK publish DEFERRED to operator (npm auth).** Full suite 1815/1815 + manual SSE smoke verified. **Dogfood `full` health 78/100** ≥ 70 (ship-it), zero plan-caused regressions, report at `docs/audit/dogfood-2026-05-22.md`. Plan at `docs/plans/item-3-canonical-chat-sdk-wiring-plan.md` | Reduces mock-replace from ~30 LOC to ~10 lines (10-line wired in scaffold, 6-line documented in README using throwOnError) |
| 4 | B · Convergence | `defineAgentTool({ name, description, inputSchema, handler })` + `streamAgentRun(run)` — TheoKit-native sugar producing a `CustomTool` consumable by `Agent.create({ tools })`, plus SSE wire bridge that maps SDK `Run.stream()` SDKMessage → `AgentEvent` (`tool_call` → execute → `tool_result`) | 2 d | ✅ Done 2026-05-22 — T1.1 `defineAgentTool` (9 unit + 4 type tests; uses `zod-to-json-schema` to bridge Zod 3 → CustomTool, avoiding Zod 3 vs 4 dual-package hazard per ADR D1); T2.1 `streamAgentRun` (18 unit + 2 type tests with EC-1/EC-3/EC-4/EC-5/EC-8 inline); T3.1 fixture+template canonical chat updated with `current_time` tool example, EC-2 dispose try/catch (11+7 unit tests, byte-equal fixture/template); T4.1 **Playwright 5/5 GREEN** in 2 consecutive runs (3 item-3 + 2 item-4 new specs). Full suite 1859/1859 unit + 127/127 agent-focused. **Dogfood `full` health 80/100** ≥ 70, zero plan-caused regressions, report at `docs/audit/dogfood-2026-05-22-item-4.md`. Plan at `docs/plans/item-4-define-agent-tool-plan.md`. | Tool calling stops being manual wiring (~40 LOC of `for await (msg of run.stream())` boilerplate → 1 line `yield* streamAgentRun(run)`); reuses SDK's tool runtime |
| 5 | B · Convergence | `createConversationHistory({ agentId? | session? | cookie })` primitive — **wraps SDK `Agent.getOrCreate(agentId)`** (conversation turns auto-persist in `<cwd>/.theokit/agents/<id>/messages.jsonl` per SDK), plus `defineAgentEndpoint` `cookieHeaders` arg that bridges Set-Cookie into the SSE response. **`MemorySettings` (facts recall) is opt-in passthrough** — not default (corrected from initial roadmap entry; SDK has 3 separate layers: conversation history vs registry vs facts memory). | 1.5 d | ✅ Done 2026-05-22 — T1.1 `createConversationHistory` (19 unit + 3 type tests; EC-1 path-traversal+CRLF guard via `isValidAgentId` regex, EC-2 actionable SDK-not-installed error, EC-3/4/5 race + maxAge + duplicate-cookie scenarios pinned); T2.1 `defineAgentEndpoint` extended with `cookieHeaders: Headers` arg + generator-priming so cookies land in Response BEFORE stream commit (9 unit tests, 2 new); fixture+template chat.ts now uses `createConversationHistory` (no per-request dispose; 65 LOC, ≤75 budget); T3.1 **Playwright 7/7 GREEN** in 2 consecutive runs (3 item-3 + 2 item-4 + 2 item-5 — cookie issued on first POST + cookie unchanged after reload). Full suite 1888/1888 unit + 84/84 agent-focused. **Dogfood `full` health 82/100** ≥ 70, zero plan-caused regressions, report at `docs/audit/dogfood-2026-05-22-item-5.md`. Plan at `docs/plans/item-5-conversation-history-plan.md`. Edge-case review at `docs/reviews/edge-case-plan/item-5-conversation-history-edge-cases-2026-05-22.md`. | Conversation continuity becomes zero-config: ~5 LOC in the route vs ~50 LOC of manual session-cookie + Agent.resume/create plumbing. SDK owns persistence (ADR D1); TheoKit is pure orchestrator. |
| 6 | C · Proof | `examples/full-stack-agent/` — **ONE complete demo** (collapsed from 3 separate examples per user direction 2026-05-22) exercising every Phase B primitive + 8 tools (current_time, calculator, random_number, web_fetch with hostname allowlist, web_search via DDG HTML, workspace_read/write with per-conversation sandbox, echo) + Telegram bot via `@usetheo/gateway-telegram` + OpenRouter provider | 3 d | ✅ Done 2026-05-22 — T0.1 SSR `.mjs/.js` resolution (4 unit tests); T0.2 prod `buildSecurityHeaders` + unconditional `generateNonce` (4 integration tests); T1.1 skeleton (4 tests); T2.1 pure tools with EC-1 `Number.isFinite` guard + EC-2 no-eval source-grep (12 tests); T2.2 web tools with EC-3 dot-boundary allowlist (20 tests); T2.3 workspace tools with EC-4 NUL byte refine (18 tests); T2.4 echo + index (6 tests); T3.1 chat route with EC-5 conversationId assert (8 tests); T4.1 Telegram bot via `GatewayRunner + TelegramAdapter` (10 shape tests); T5.1 **Playwright 5/5 GREEN** in 2 consecutive runs; T5.2 prod integration 4/4. Full suite 1974/1974 unit + 86 new for this item. **Dogfood `full` health 85/100** (improvement over item-5's 82/100 because 2 HIGH-severity prod SSR/CSP blockers shipped fixes). 8 framework bugs caught + fixed in same loop. Report at `docs/audit/dogfood-2026-05-22-example-full-stack-agent.md`. Plan at `docs/plans/example-full-stack-agent-plan.md`. Edge-case review at `docs/reviews/edge-case-plan/example-full-stack-agent-edge-cases-2026-05-22.md`. | One complete artifact a visitor can clone, set OPENROUTER_API_KEY, and have a real LLM chat with 8 working tools + persistence + optional Telegram bot — all on the locked stack |
| 7 | C · Proof | Validate Vercel + Cloudflare Workers SSE end-to-end against a real deploy (not just adapter declarations) | 1 d | ⏳ Pending | Honesty in deploy adapter claims |
| 8 | C · Proof | Playwright suite for the other 4 templates (`dashboard`, `api-only`, `postgres`, `saas`) | 2 d | ⏳ Pending | Regression coverage parity with `template-default` |

**Total budget:** ~3 weeks of focused work. **Dependencies:** Phase A unblocks the 0.3.0 cutover; Phase B can run in parallel with the 0.3.0 warn-mode telemetry window; Phase C ships alongside or after 0.3.0.

**Done definition for "Next.js for agents":**

- `npm create theokit my-app` → chat thread (rendered with `@usetheo/ui` components) live in <30 seconds
- Replace `server/routes/chat.ts` mock with 5 lines of `@usetheo/sdk` `createAgentFactory` + `Agent.send` → working LLM chat (SDK handles the provider — Anthropic, OpenAI, Ollama, etc.)
- Add a tool via `defineAgentTool` → wraps SDK `defineTool`; agent uses it without manual `tool_call` plumbing
- Add conversation history via `createConversationHistory` → wraps SDK `Agent.getOrCreate(sessionId)` + Memory; persistence across reloads is zero-config
- README has a guided "5 minutes to first agent" path that a new developer can follow without reading the rest of the docs
- 8 deploy adapters proven by `examples/chat-anthropic` deployed to at least 2 platforms (Node + one of Vercel/CF Workers)

**Locked stack assumption:** every deliverable above wires `@usetheo/ui` (UI surface) + `@usetheo/sdk` (agent runtime). Not "evaluate vs alternatives" — premise. New TheoKit primitives are sugar/wrappers over what the SDK / UI already ship, never parallel implementations.

Anything beyond this list is **out of scope** for the "Next.js for agents" milestone. Built-in agent orchestration, embedded coding agents (the Studio detour), agent marketplaces, hosted memory — all explicitly out of scope per `## Architectural decisions on record` below.

### Frictions surfaced by item #2 (RESOLVED by item #3 — 2026-05-22 dogfood)

Empirical experiment on 2026-05-22 (boot `fixtures/template-default`, replace mock with `Agent.prompt`, hit `/api/chat` with fake key). All friction below was real and reproducible; items #3 closed them.

**TheoKit-side (item #3 shipped):**

1. ✅ **Default mock comment referenced `import { OpenAI } from 'openai'`** — anti-stack. Item #3 T2.1 + T3.1 rewrote both copies of `chat.ts` to import `Agent` from `@usetheo/sdk`. T2.3 lint gate (`tests/unit/scaffold-no-openai-anti-stack.test.ts`) ensures no regression.
2. ✅ **`@usetheo/sdk` was not a default dep.** Item #3 T3.1 added `"@usetheo/sdk": "^1.0.0"` to `packages/create-theo/templates/default/package.json.tmpl`. Fixture uses `workspace:*`.
3. ✅ **Pre-existing TS errors + runtime crashes in template default** (`Badge size`, `AgentErrorCardProps.description`, `AgentErrorCard kind="model"` React-explode, `QuickAction.label` ReactNode→string narrow). Discovered via Playwright debugging during item #3 dogfood; ALL FIXED in same session (see `docs/audit/dogfood-2026-05-22.md` bug table). Closed EC-12.

**SDK-side (item #3 shipped via cross-repo PRs):**

4. ✅ **`Agent.prompt` silent-error trap.** SDK PR added `AgentOptions.throwOnError?: boolean` + `AgentRunError` class. Default `false` (non-breaking). Tutorial uses `throwOnError: true` for 6-line idiomatic try/catch. 16 tests pin the contract. CHANGELOG + `docs.md` updated. **T5.0 npm publish DEFERRED to operator (npm auth).**
5. ✅ **Node ≥ 22.12 preflight.** Item #3 T4.1 added `packages/create-theo/src/preflight-node.ts` (zero-dep `compareSemver` + `assertNodeVersion`). 14 unit tests + LIVE-fired during dogfood Phase 2 (Node 20.19.2 refused with actionable nvm message).
6. ⏳ **Dev server `Failed to resolve import "theokit/devtools/entry"` Vite pre-transform error** — cosmetic, devtools still mount. NOT addressed in item #3. Tracked for `dev-server-reliability-engineer` follow-up.

**Cumulative dogfood verdict for items #2 + #3:** Health 78/100 (`docs/audit/dogfood-2026-05-22.md`), zero plan-caused regressions, 1815/1815 unit tests, Playwright canonical-chat 3/3 GREEN.

### SDK plan (cross-repo) — required for items 3-5

| SDK change | File | Test | Blocks item |
|---|---|---|---|
| Add `throwOnError?: boolean` to `AgentOptions`; on `true`, `Agent.prompt` throws `AgentRunError` carrying `error.message` + `error.code` + `error.provider` | `theokit-sdk/packages/sdk/src/agent.ts` (`prompt` impl) + `types/agent.ts` (option) | `theokit-sdk/packages/sdk/tests/agent-prompt-throw-on-error.test.ts` — fake provider 401, expect throw | Item #3 (tutorial simplification) |
| (To be evaluated during item #4) — does the SDK already adapter `SDKMessage` → AgentEvent? If not, expose helper in `@usetheo/sdk` | TBD by item #4 spike | TBD | Item #4 (`defineAgentTool`) |
| (To be evaluated during item #5) — does `Agent.getOrCreate(sessionId)` work zero-config with a string id? Does it persist conversation history out-of-the-box? | TBD by item #5 spike | TBD | Item #5 (`createConversationHistory`) |

These SDK tasks are tracked in the active TheoKit plan and will be implemented in `theokit-sdk/` (RED → GREEN → `docs.md` + `CHANGELOG.md`) before the TheoKit-side wrapper consumes them.

---

## Roadmap

Honest north star, version by version. **What is on this list is committed; what is missing is not on the runway yet.** Move items between sections via PR with a one-line rationale. Do not delete a section without explicit strategic review.

The roadmap reflects the honest maturity assessment from 2026-05-19 after the nextjs-maturity plan closed (12/16 tasks, 47/47 dogfood, 21/21 Playwright). It is shaped by what we know works in real production today, what we have visibility into but have not enforced yet, and what we have not validated.

### 0.2.0 — Release prep (current branch, ready)

What ships in this version is everything the `nextjs-maturity` plan closed. The release engineer takes it from here.

- [x] Default scaffold redesigned with 20 TheoUI components (chat agent surface out of the box)
- [x] Code-splitting with `matchRoutes` preload + 1500ms timeout safeguard (EC-3)
- [x] CSRF default-on in **warn-first** mode (`X-Theo-Action: 1` + Origin match, opt-out via `csrf: false`) (EC-1) **— SHIPPED as warn-first; the strict-default flip moved into 0.3.0 (see below).**
- [x] Default security headers — CSP report-only / X-Frame-Options DENY / X-Content-Type-Options nosniff / Referrer-Policy / HSTS prod-only (EC-2) **— SHIPPED as report-only; enforce-default flip moved into 0.3.0.**
- [x] W3C Trace Context propagation — `traceparent` → `x-trace-id` response header + log correlation
- [x] Argon2id password hashing in `examples/agent-saas` via `hash-wasm` (Alpine + Vercel Edge safe), legacy PBKDF2 verify + transparent rehash on login (EC-4)
- [x] Six hydration regression tests pinning the 2026-05-17 bug class
- [x] Playwright spec for the default template (8 scenarios in real Chromium)
- [x] Production build bundle: **193.90 KB gzipped** (45% under the 350 KB budget)
- [ ] **Open: publish `theokit@0.2.0` to npm under `latest` tag** (release engineer)
- [x] **Migration guide** for the two opt-in cutovers (CSRF warn→strict, CSP report-only→enforce) — shipped at [`docs/migration/0.2-to-0.3.md`](docs/migration/0.2-to-0.3.md), recipes auto-tested in `tests/integration/migration-guide-recipes.test.ts`
- [ ] **Open: README banner** announcing 0.2.0 with the bundle / security baseline / agent-surface story

### 0.3.0 — Enforcement cutover (HIGH RISK — most dangerous release on the roadmap)

**Status (2026-05-22):** **Implementation LANDED via commit `3ee9dac` on the `develop` branch.** The framework defaults in `packages/theo/src/config/schema.ts` already declare `csrf: 'strict'` and `cspMode: 'enforce'`; the SSR nonce machinery (`per-request nonce`) is wired through `entry-server` + `security-headers`. The pre-requisites and risk analysis below remain authoritative for **the release decision**, not the code state. Do not ship to `latest` until items 1, 3, 5, and 6 below are GREEN (item 2 is already done in `useAgentStream`; item 4 is implemented + **end-to-end-validated 2026-05-22 via Playwright spec `tests/e2e/ssr-nonce.spec.ts` — 3/3 GREEN — after fixing a wiring bug where `StaticRouterProvider` was not receiving the `nonce` prop, so its inline hydration script `<script>window.__staticRouterHydrationData = ...</script>` shipped without the nonce attr in dev mode; without the fix, strict CSP mode without `'unsafe-inline'` would block hydration → silent client-only fallback**).

**Criticality: ALTA.** This is not a flag flip. It is the most dangerous release on the roadmap because it (a) fails silently — no compile error, no test fail, only runtime breakage in production, (b) hits sensitive flows (login, auth, forms) users may not re-test on every bump, (c) breaks every app with inline scripts (gtag, intercom, sentry, Plausible), and (d) **breaks our own default scaffold's chat demo** if shipped as-is (`useAgentStream` uses native fetch and does not yet send `X-Theo-Action: 1`).

**Do not ship this minor without all the pre-requisites below cleared.** Estimated wall-clock: **2–3 sprints of prep work + 4–6 weeks of warn-mode telemetry in production from 0.2.0** before the flip ships.

#### Sub-criticality by component

| Change | Criticality | Why it hurts |
|---|---|---|
| Flip `config.security.csrf` from `'warn'` to `'strict'` | **High** | Every POST/PUT/PATCH/DELETE without `X-Theo-Action: 1` returns 403 `CSRF_INVALID`. `theoFetch` auto-attaches, but custom fetchers, raw `<form>` posts, third-party clients, and curl-based integrations all break. |
| Flip `config.security.headers.cspMode` from `'report-only'` to `'enforce'` | **Critical** | Every inline script without a nonce is blocked. Apps with analytics (gtag, Plausible), widgets (intercom, sentry), or any `<script>` block in user-authored HTML stops working. CSP violation reports are silent in many browsers — users discover the breakage hours/days later. |
| Drop `'unsafe-inline'` from default CSP | **Critical** | This is the change that actually breaks third-party inline scripts. Without it, "enforce" is cosmetic. With it, **the SSR hydration data script the framework itself emits is blocked** unless the per-request nonce mechanism is wired correctly. |
| Add per-request nonce for the SSR hydration data script | **High implementation risk** | Framework-internal change touching every SSR `<script>` emission site. If the wiring has any bug, **every SSR app breaks**, not just apps with custom inline scripts. This is the change that re-introduces Phase 1's hydration-bug surface area. |

#### Pre-requisites — ALL must clear before flipping

1. **One full release of warn-mode telemetry in production** (4–6 weeks minimum after `0.2.0` publishes). Users need time to grep `csrf.warn` lines in their logs and refactor before the flip removes the safety net.
2. **`useAgentStream` updated to send `X-Theo-Action: 1`** on every non-GET request. **This blocks 0.3.0 unconditionally** — the default scaffold's chat demo emits a `csrf.warn` on every send today (visible in the Playwright spec output). If we flip without fixing this, `npm create theokit my-app && pnpm dev && send a message` returns 403. Embarrassing on day one.
3. **Migration guide written** with grep-able audit commands (`grep '"event":"csrf.warn"' logs.json | jq '.path' | sort -u` to enumerate every endpoint that will start failing). Currently the roadmap lists this as "open: migration guide for 0.2.0" — must ship as part of 0.2.x patches, not bundled into 0.3.0.
4. **Per-request nonce machinery implemented and validated** — without it, dropping `'unsafe-inline'` breaks the framework's own SSR. Two options: (a) implement nonce wiring end-to-end (SSR HTML emission threads a nonce through every `<script>` site, request-scoped), or (b) keep `'unsafe-inline'` for scripts and call the flip "cosmetic enforce" with the gap documented. Option (a) is the right call; option (b) is the punt.
5. **`theokit check --upgrade-readiness 0.3` command** that scans the user's app and reports anticipated breakage before they bump. Static analysis of route handlers, inline-script detection in `app/**`, lint-style report. ~ 2–3 days to implement.
6. **Beta gate.** Ship `0.3.0-beta.0` to `next` tag first; gather feedback for at least one week; only then promote to `latest`.

#### Tasks in execution order

- [ ] Fix `useAgentStream` to attach `X-Theo-Action: 1` on every non-GET — **blocks everything else** (30 min of work)
- [ ] Write the 0.2.x migration guide (audit commands + checklist) — ship as part of the next 0.2.x patch
- [ ] Implement per-request nonce mechanism — SSR HTML emitter threads `ctx.nonce` through every `<script>` site, the `__staticRouterHydrationData` script carries it, Phase 6 CSP builder accepts the nonce per request — 1–2 days, high risk
- [ ] Add Playwright regression that asserts `<script>` nonce equals the CSP `nonce-...` value on every SSR page — pins the wiring
- [ ] Add `theokit check --upgrade-readiness 0.3` static analysis command — 2–3 days
- [ ] Wait 4–6 weeks of warn-mode telemetry in production after 0.2.0 publishes
- [ ] Flip default `config.security.csrf` from `'warn'` to `'strict'`
- [ ] Flip default `config.security.headers.cspMode` from `'report-only'` to `'enforce'`
- [ ] Drop `'unsafe-inline'` from default CSP for scripts (only safe after nonce machinery is solid)
- [ ] Ship `theokit@0.3.0-beta.0` under `next` npm tag for one-week feedback window
- [ ] Promote to `latest` only if zero CRITICAL bug reports from beta
- [ ] CHANGELOG `[Unreleased]` carries a **BREAKING** banner — header style, not buried in a bullet

#### Risks if shipped prematurely

| Scenario | Likelihood | Impact |
|---|---|---|
| User with custom auth flow (no `theoFetch`) — login starts returning 403 | High | Total signup/login blockage until config rollback |
| App with gtag / intercom / Plausible breaks silently | Critical | Analytics die; user discovers days later when checking dashboards |
| SSR hydration nonce wiring has an edge case bug | Medium | Hydration mismatch returns — the exact bug class Phase 1 fixed |
| User doesn't read `csrf.warn` logs, upgrades, prod breaks | High | Trust in the framework is shaken — first-impression failure |
| Our own scaffold default's chat demo returns 403 on first send | Critical | Day-one embarrassment, propagates as "TheoKit doesn't work" social proof |

### 0.4.0 — Coverage gaps before "production-ready" without ressalvas

The honest gaps after 0.2.0. Closing these moves us from "ready for indie devs and small teams" to "ready for startups scaling to 10k MAU."

- [ ] **Playwright for the other four templates** (`dashboard`, `api-only`, `postgres`, `saas`) — same fixture pattern as `template-default`. T10.2 (agent-saas full flow) needs a Postgres instance in CI.
- [ ] **Validate at least one deploy adapter end-to-end in real production** — Vercel is the lowest-friction path. Goal: deploy `create-theokit my-app` output to vercel.app, hit the live URL, walk through chat flow, verify SSE roundtrip and security headers in real prod.
- [x] **Minimum devtools overlay** — request log + error panel + matched-route info + settings in dev. **DONE 2026-05-19** (commit `e369f4a`). Auto-injected floating chip + expandable 4-tab panel (Requests / Routes / Errors / Settings), data flows server→client via Vite HMR WebSocket, privacy redaction at dispatcher level, light/dark/system theme, drag-to-corner with spring-snap, localStorage persistence with schema versioning, `theo.config.ts.devtools = false` opt-out. Tree-shaken in prod (verified by `tests/unit/devtools-treeshake.test.ts` — fresh build + grep `theo-devtools|goober` in `dist/assets/index-*.js`, zero matches). Artifacts: [`docs/plans/devtools-plan.md`](docs/plans/devtools-plan.md), [`.claude/knowledge-base/reference/devtools.md`](.claude/knowledge-base/reference/devtools.md), live demo at [`examples/devtools-demo/`](examples/devtools-demo/). 13 Playwright scenarios + 12 unit-test files + 1 integration test. 29 edge cases catalogued and mitigated (EC-1 through EC-29).
- [ ] **Load test the SSR streaming path** — 1000 concurrent connections, leaky generators, slow LLM streams. Measure shell-flush TTFB, abort-on-disconnect behavior, memory pressure.
- [ ] **WebSocket Playwright spec** — `defineWebSocket` has unit tests but no real-browser test exercises the full upgrade + bidi + reconnect flow.
- [ ] **Bundle budget asserted in CI** — fail the build if `index-*.js` gzipped exceeds 350 KB for the default template.

### 0.5.0+ — Beyond defaults (no commitment, just on the runway)

These items widen the framework's reach but require strategic decisions before scoping. Listed so the team has a shared view of where 1.0 could go.

- [ ] **`next/image`-equivalent** for image optimization (or explicit decision to stay out of that lane)
- [ ] **`next/font`-equivalent** for self-hosted fonts (TheoUI ships bundled Geist today; this is the generic surface)
- [ ] **Edge runtime adapter parity** — current adapters declare Vercel Edge / Cloudflare Workers / Deno Deploy, but the Web Standards shim has rough edges (no `Buffer` in Deno, native bindings in argon2 — already mitigated, but other surfaces TBD)
- [ ] **Plugin ecosystem incubation** — `definePlugin` exists; we have 3 plugins. Real ecosystem growth needs a registry, docs site, and at least one community-authored plugin we proudly link.
- [ ] **Production debugging story** — source maps in adapters, traceId correlation with downstream services (OpenTelemetry exporter? Sentry integration?), structured error pages with actionable hints. **Foundation already in place:** the 0.4.0 devtools ships a server-side `dispatcher` + `broadcastToDevtools` abstraction (see `packages/theo/src/devtools/server-side/broadcast.ts`). A prod exporter is an additive sink — swap the WS target for OTel/Sentry; the existing data shape (`RequestRecord` + `ErrorRecord` + redaction) is the same contract. No re-plumbing of `logger.ts` / `csrf.ts` needed.

### Architectural decisions on record

Decisions that are not "out of scope" (we might still adopt) but are **explicitly DEFERRED with named re-evaluation triggers**, or are **IMPLEMENTED with a named approach that future PRs should not re-litigate without reading the prior research**. Every entry links to the artifact that supports the decision.

- **Devtools surface — IMPLEMENTED 2026-05-19 (commit `e369f4a`).** After full prior-art audit of TanStack Router devtools, Next.js `next-devtools/dev-overlay`, and Astro `dev-toolbar` (other frameworks — Remix, SvelteKit, Nitro, Hono, tRPC — verified to ship no devtools surface of their own).
  - **Decisions locked in:** (a) **React portal into Shadow DOM** — NOT pure custom elements (Astro pattern) and NOT non-shadow (TanStack default). (b) **Auto-inject via Vite plugin in dev** — NOT user-imported component (TanStack pattern leaks `NODE_ENV` assumption into user code). (c) **Vite HMR `import.meta.hot.send/.on`** as bridge — NOT custom WebSocket (free from Vite, dies cleanly in prod). (d) **localStorage persistence with schema-version key** — server-endpoint persistence (Next.js pattern) is overkill for v0. (e) **goober** (~1KB) for shadow-DOM-scoped CSS — Tailwind doesn't pierce shadow roots. (f) **Tree-shake via TanStack-style dual export** — `Devtools` (noop in prod) + `DevtoolsInProd` (always real); bundler-agnostic, no Vite magic required. (g) **CSS custom properties scoped to `:host`** for theme switching — NOT scoped to a descendant selector, because `createPortal(children, shadowRoot)` mounts components as siblings of the React root div, not descendants (subtle Shadow DOM detail — see `Overlay.tsx` `ThemeVars` comment).
  - **Do NOT re-implement as web components, even if extensibility pressure arrives.** Astro's plugin-app architecture is mature only because Astro has community apps consuming it. TheoKit has zero community asks. v1 plugin extension via `definePlugin`-style hooks is on the runway; rewriting to web components is a regression for our React-first surface.
  - **Artifact:** [`.claude/knowledge-base/reference/devtools.md`](.claude/knowledge-base/reference/devtools.md) — 1163-line deep dive (TanStack/Next.js/Astro file:line citations, 29 edge cases, 7 convergent patterns, 7 divergent patterns with TheoKit choices). [`docs/plans/devtools-plan.md`](docs/plans/devtools-plan.md) — 1860-line execution plan, 10 ADRs, 13 tasks, edge-case-plan reviewed. Anyone wanting to re-open these decisions reads both docs first.

- **Server Components (RSC) — DEFERRED past 1.0.** Decision recorded 2026-05-19 after a full prior-art audit of Next.js (canonical), Astro (server islands), TanStack Start (RSC opt-in via `@vitejs/plugin-rsc`), and SvelteKit (no equivalent).
  - **Decision:** TheoKit stays **client-by-default**, aligned with TanStack Start's posture. Not Next.js's server-by-default posture.
  - **Why now:** TheoKit's current bundle (193.90 KB gzipped, 45% under the 350 KB target) does not benefit from RSC's primary value proposition. Streaming SSR (Phase 3, `renderToPipeableStream` + `onShellReady`) already covers the Suspense-streaming use case. `defineRoute` + `theoFetch` already cover server-only data fetching with type safety. The RSC cost (1263 LOC just for the boundary plugin in Next.js, tight coupling to a moving `react-server-dom-webpack` target, TS can't structurally check directives so falls back to name heuristics) does not pay back for an agent-shaped app.
  - **Re-evaluation triggers (all three required to revisit):**
    1. `@vitejs/plugin-rsc` reaches v1 with public maintenance plan
    2. Remix / React Router 7's RSC integration ships and is observable in production
    3. Concrete user demand from shipped TheoKit apps with measured pain — bundle size or server-only data fetching as a binding constraint
  - **If we do adopt later:** via `@vitejs/plugin-rsc` as an opt-in flag (TanStack pattern), NOT by re-implementing webpack-style flight plugins.
  - **Artifact:** [`.claude/knowledge-base/reference/server-components-rsc.md`](.claude/knowledge-base/reference/server-components-rsc.md) — 704-line deep dive, 12 sections, file:line citations for every assertion. Anyone wanting to re-open this decision reads that doc first.

- **AUTH-DELEGATION — LOCKED 2026-05-19 (security-hardening release).** After a prior-art audit of 8 frameworks (Next.js, SvelteKit, Remix, Astro, TanStack Start, Nuxt, Nitro, Hono).
  - **Decision:** TheoKit ships **5 RFC-stable protocol primitives** (`generatePkceChallenge` / `generateOAuthState` + `verifyOAuthState` / `discoverOidcProvider` / `generateTotp` + `verifyTotp` / `generateBackupCodes` + `verifyBackupCode`) PLUS session primitives (`createSessionManager`, `requireAuth`, `rotateSession`) PLUS a recommendation page (`docs/concepts/auth-providers.md`). TheoKit does **NOT** ship concrete provider implementations (Google, GitHub, Facebook, etc.) — those are delegated to specialist libraries (Auth.js, Better Auth, Lucia, Iron Session, hosted IdPs like Clerk/Auth0/WorkOS).
  - **Why:** OAuth providers have constant deltas (scope changes, endpoint moves, breaking flow updates). Specialist libs maintain them; TheoKit's single-maintainer constraint cannot keep up. Standards-level primitives (RFC 6749 / 7636 / 6238 / OIDC Discovery 1.0) don't churn. 6 of 8 surveyed frameworks delegate; only Remix 3 outliers by bundling 9 providers — explicitly contraindicated for single-maintainer scope (§4.1 / §4.4 / §5.1 of the reference doc).
  - **Re-evaluation triggers (all three required to reopen):**
    1. TheoKit reaches a team of 3+ engineers committed to long-term framework maintenance
    2. Concrete user demand from shipped TheoKit apps with measured pain — "I tried Auth.js and couldn't make it work" reports >5 per month
    3. A specialist auth lib (Auth.js / Better Auth) breaks compatibility with TheoKit's session primitives without an actively maintained fix
  - **If we do adopt later:** ship providers as separate optional packages under `@theokit/auth-*`, NEVER in the framework core. Each package owns its provider's deltas and ships independently.
  - **Artifact:** [`.claude/knowledge-base/reference/oauth-oidc-delegation.md`](.claude/knowledge-base/reference/oauth-oidc-delegation.md) — 793-line deep dive, 8-framework audit, 5 protocol primitives with sample code, delegation strategy. Anyone wanting to re-open this decision reads that doc first. Recommended libs (in priority order): **Auth.js** (NextAuth, multi-provider workhorse), **Better Auth** (modern TypeScript-first DX), Lucia, Iron Session.

### Out of scope — intentionally

Items considered and rejected. **Do not move these into a milestone without a strategic review.**

- **Replacing Next.js for everyone.** TheoKit is a vertical framework for agent-shaped apps. The framing in the monorepo Locked Narrative ("the app the agent lives in") is the wedge. Trying to be a horizontal Next replacement dilutes the wedge.
- **A11y / i18n primitives baked into the framework.** Both are real, both are hard, both are well-served by external libraries. TheoUI handles a11y for its components; i18n is the consumer's choice.
- **CSS-in-JS runtime.** TheoUI uses Tailwind; the consumer can adopt any CSS strategy on top. No runtime CSS in the framework core.
- **Built-in agent orchestration.** TheoKit ships the *home* for an agent, not the agent itself. `examples/agent-saas` and the default template show how to wire an agent — they're patterns, not framework primitives. Agent orchestration belongs upstream in TheoKit-SDK / Mastra / Vercel AI SDK.
- **Re-implementing RSC in-house.** Even if we adopt RSC eventually (see "Architectural decisions on record" above), we will integrate `@vitejs/plugin-rsc` rather than maintain a webpack-style flight plugin. The Next.js implementation is 1263 LOC for boundary detection alone — that's framework lock-in to Vercel's bundler choices, not an asset.

### How this roadmap stays honest

- **Every item references a verifiable artifact** — a plan file, a fixture, a CHANGELOG entry, an issue, or a number. Aspirational items without an artifact go in 0.5.0+ "no commitment" tier.
- **Moving an item upward requires evidence.** "Validate Vercel adapter" stays in 0.4.0 until somebody runs `theokit deploy --target vercel` against a real Vercel project and the result is committed (smoke log or e2e spec). Until then it's a promise, not a feature.
- **Marketing copy must trail the roadmap, not lead it.** The Voice and Tone section forbids "production-ready" without a Status section to back it. The Status section in the README points at this roadmap.

---

## When this file is wrong

The TheoKit code and README are authoritative. If this file says one thing and the code/README say another, the code/README win. Update this file via PR with a one-line rationale. The voice and tone rules require an explicit strategic review before being weakened or repealed.
