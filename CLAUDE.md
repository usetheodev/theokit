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

## When this file is wrong

The TheoKit code and README are authoritative. If this file says one thing and the code/README say another, the code/README win. Update this file via PR with a one-line rationale. The voice and tone rules require an explicit strategic review before being weakened or repealed.
