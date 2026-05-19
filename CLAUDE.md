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

## Roadmap

Honest north star, version by version. **What is on this list is committed; what is missing is not on the runway yet.** Move items between sections via PR with a one-line rationale. Do not delete a section without explicit strategic review.

The roadmap reflects the honest maturity assessment from 2026-05-19 after the nextjs-maturity plan closed (12/16 tasks, 47/47 dogfood, 21/21 Playwright). It is shaped by what we know works in real production today, what we have visibility into but have not enforced yet, and what we have not validated.

### 0.2.0 — Release prep (current branch, ready)

What ships in this version is everything the `nextjs-maturity` plan closed. The release engineer takes it from here.

- [x] Default scaffold redesigned with 20 TheoUI components (chat agent surface out of the box)
- [x] Code-splitting with `matchRoutes` preload + 1500ms timeout safeguard (EC-3)
- [x] CSRF default-on in **warn-first** mode (`X-Theo-Action: 1` + Origin match, opt-out via `csrf: false`) (EC-1)
- [x] Default security headers — CSP report-only / X-Frame-Options DENY / X-Content-Type-Options nosniff / Referrer-Policy / HSTS prod-only (EC-2)
- [x] W3C Trace Context propagation — `traceparent` → `x-trace-id` response header + log correlation
- [x] Argon2id password hashing in `examples/agent-saas` via `hash-wasm` (Alpine + Vercel Edge safe), legacy PBKDF2 verify + transparent rehash on login (EC-4)
- [x] Six hydration regression tests pinning the 2026-05-17 bug class
- [x] Playwright spec for the default template (8 scenarios in real Chromium)
- [x] Production build bundle: **193.90 KB gzipped** (45% under the 350 KB budget)
- [ ] **Open: publish `theokit@0.2.0` to npm under `latest` tag** (release engineer)
- [ ] **Open: migration guide** for the two opt-in cutovers (CSRF warn→strict, CSP report-only→enforce)
- [ ] **Open: README banner** announcing 0.2.0 with the bundle / security baseline / agent-surface story

### 0.3.0 — Enforcement cutover (next minor)

After a release of warn-mode telemetry, the framework flips from "loud about gaps" to "blocks the gaps."

- [ ] Flip default `config.security.csrf` from `'warn'` to `'strict'` — POST without `X-Theo-Action: 1` returns 403 `CSRF_INVALID`
- [ ] Flip default `config.security.headers.cspMode` from `'report-only'` to `'enforce'`
- [ ] Tighten default CSP — drop `'unsafe-inline'` for scripts, add per-request nonce for the SSR hydration data script
- [ ] Migration guide expanded with grep-able stderr signal (`csrf.warn` lines) so users can audit before bumping
- [ ] CHANGELOG `[Unreleased]` includes a **BREAKING** banner — every dependency consumer needs to know

### 0.4.0 — Coverage gaps before "production-ready" without ressalvas

The honest gaps after 0.2.0. Closing these moves us from "ready for indie devs and small teams" to "ready for startups scaling to 10k MAU."

- [ ] **Playwright for the other four templates** (`dashboard`, `api-only`, `postgres`, `saas`) — same fixture pattern as `template-default`. T10.2 (agent-saas full flow) needs a Postgres instance in CI.
- [ ] **Validate at least one deploy adapter end-to-end in real production** — Vercel is the lowest-friction path. Goal: deploy `create-theokit my-app` output to vercel.app, hit the live URL, walk through chat flow, verify SSE roundtrip and security headers in real prod.
- [ ] **Minimum devtools overlay** — request log + error panel + matched-route info in dev. Closing the biggest perceived gap vs Next.js.
- [ ] **Load test the SSR streaming path** — 1000 concurrent connections, leaky generators, slow LLM streams. Measure shell-flush TTFB, abort-on-disconnect behavior, memory pressure.
- [ ] **WebSocket Playwright spec** — `defineWebSocket` has unit tests but no real-browser test exercises the full upgrade + bidi + reconnect flow.
- [ ] **Bundle budget asserted in CI** — fail the build if `index-*.js` gzipped exceeds 350 KB for the default template.

### 0.5.0+ — Beyond defaults (no commitment, just on the runway)

These items widen the framework's reach but require strategic decisions before scoping. Listed so the team has a shared view of where 1.0 could go.

- [ ] **`next/image`-equivalent** for image optimization (or explicit decision to stay out of that lane)
- [ ] **`next/font`-equivalent** for self-hosted fonts (TheoUI ships bundled Geist today; this is the generic surface)
- [ ] **Edge runtime adapter parity** — current adapters declare Vercel Edge / Cloudflare Workers / Deno Deploy, but the Web Standards shim has rough edges (no `Buffer` in Deno, native bindings in argon2 — already mitigated, but other surfaces TBD)
- [ ] **Server Components (RSC) compatibility track** — open question whether TheoKit follows React core into RSC or stays on the client-component model. Either is defensible; need a decision before 1.0.
- [ ] **Plugin ecosystem incubation** — `definePlugin` exists; we have 3 plugins. Real ecosystem growth needs a registry, docs site, and at least one community-authored plugin we proudly link.
- [ ] **Production debugging story** — source maps in adapters, traceId correlation with downstream services (OpenTelemetry exporter? Sentry integration?), structured error pages with actionable hints.

### Out of scope — intentionally

Items considered and rejected. **Do not move these into a milestone without a strategic review.**

- **Replacing Next.js for everyone.** TheoKit is a vertical framework for agent-shaped apps. The framing in the monorepo Locked Narrative ("the app the agent lives in") is the wedge. Trying to be a horizontal Next replacement dilutes the wedge.
- **A11y / i18n primitives baked into the framework.** Both are real, both are hard, both are well-served by external libraries. TheoUI handles a11y for its components; i18n is the consumer's choice.
- **CSS-in-JS runtime.** TheoUI uses Tailwind; the consumer can adopt any CSS strategy on top. No runtime CSS in the framework core.
- **Built-in agent orchestration.** TheoKit ships the *home* for an agent, not the agent itself. `examples/agent-saas` and the default template show how to wire an agent — they're patterns, not framework primitives. Agent orchestration belongs upstream in TheoKit-SDK / Mastra / Vercel AI SDK.

### How this roadmap stays honest

- **Every item references a verifiable artifact** — a plan file, a fixture, a CHANGELOG entry, an issue, or a number. Aspirational items without an artifact go in 0.5.0+ "no commitment" tier.
- **Moving an item upward requires evidence.** "Validate Vercel adapter" stays in 0.4.0 until somebody runs `theokit deploy --target vercel` against a real Vercel project and the result is committed (smoke log or e2e spec). Until then it's a promise, not a feature.
- **Marketing copy must trail the roadmap, not lead it.** The Voice and Tone section forbids "production-ready" without a Status section to back it. The Status section in the README points at this roadmap.

---

## When this file is wrong

The TheoKit code and README are authoritative. If this file says one thing and the code/README say another, the code/README win. Update this file via PR with a one-line rationale. The voice and tone rules require an explicit strategic review before being weakened or repealed.
