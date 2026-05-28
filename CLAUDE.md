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
- Mention sibling products (TheoCode, TheoCreate, the `theo` Go platform) only as context for the *family*, never as the lede. The TheoKit reader landed here because they want to build something. Give them that first. **Honesty rule:** do not list a sibling as a *capability* of TheoKit unless the code wiring exists in this repo. The Ecosystem section below states the literal wiring; copy that contradicts it is invalid.

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
| "Multi-language framework with Python, Node, Go, .NET support" | "Your backend, your language. Ship the Python or Node service next to the app." | DEEP DIVE: `services: {}` in `theo.config.ts` orchestrates external processes via OpenAPI + proxy, Wave 1 supports Python (FastAPI) and Node (Hono/Fastify) |
| "Polyglot framework" / "Run any backend stack" | (Banned in HERO. Allowed in BODY only as "polyglot services" feature name.) | DEEP DIVE: explain the Like-Vercel runtime contract — fetch handler universal, file-system routing build-time, env runtime, structured logs, healthcheck convention |
| "Replaces TheoCreate" / "TheoKit + TheoCreate" | (TheoCreate is absorbed — say "scaffolding is in `create-theokit`".) | DEEP DIVE: `create-theokit my-app --backend python` generates TheoKit app + FastAPI service in one command |

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
3. **Banned in HERO and BODY:** `defineRoute`, `defineAction`, `defineWebSocket`, `theoFetch`, `requireAuth`, `createSessionManager`, `defineMiddleware`, `defineConfig`, `hydrateRoot`, `renderToPipeableStream`, AES-256-GCM, Drizzle ORM, Vite, Vitest, tsup, opinionated, monorepo. Each has a benefit-shaped equivalent — find it. (Vite, Drizzle, Vitest etc. are allowed in DEEP DIVE.) **Exception 2026-05-27:** `polyglot` is allowed in BODY/DEEP DIVE *only* in the phrase "polyglot services" (the formal feature name from Wave 2 mission). It remains banned in HERO and in any other framing.
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

## Ecosystem — the five siblings, literally (one being absorbed)

TheoKit lives next to five sibling projects under `/home/paulo/Projetos/usetheo/`. This table is the **source of truth** for what TheoKit actually integrates with. Any README claim, comparison table, or pitch deck that contradicts this is wrong and must be corrected to match the code.

Three siblings flow **into** TheoKit (it consumes them). One sibling flows **out** of TheoKit (it consumes TheoKit's plugin SDK). One sibling is **being absorbed into** TheoKit (its scaffolding capabilities become part of `create-theokit`). The direction matters — see the "Direction" column.

| Sibling | Sibling repo | Kind | Direction | TheoKit consumes via / is consumed via | Code wiring | Status |
|---------|--------------|------|-----------|----------------------------------------|-------------|:------:|
| **`@usetheo/sdk`** + `@usetheo/gateway` + `@usetheo/gateway-telegram` | `../theokit-sdk/` (TypeScript) | Agent runtime: `Agent.create/send/getOrCreate`, `Run.stream`, providers (OpenAI/Anthropic/Ollama/OpenRouter), conversation persistence (`.theokit/agents/<id>/messages.jsonl`), custom-tool runtime | **TheoKit ← sibling** (TheoKit consumes it) | **Workspace protocol** — `pnpm-workspace.yaml` includes `../theokit-sdk/packages/{sdk,gateway,gateway-telegram}`. Local edits in the sibling reflect immediately. | 6 framework files: `server/agent/{create-conversation-history,stream-agent-run,agent-types}.ts`, `server/define/define-agent-tool.ts`, examples + templates `from '@usetheo/sdk'`. | ✅ Wired |
| **`@usetheo/ui`** | `../theo-ui/` (TypeScript) | React component library: chat surface (`ChatMessage`, `ChatThread`, `ChatComposer`, `ToolCallCard`), theme system (`ThemeProvider`, `ThemeScript`, `TheoUIProvider`), design tokens, 50+ generic components | **TheoKit ← sibling** (TheoKit consumes it) | **npm dep** — published `@usetheo/ui` (`^0.11.0-next.0`) consumed via the npm registry. `pnpm-workspace.yaml` does **NOT** include `../theo-ui/`. Local edits in the sibling do NOT reflect — they require a npm publish first. | Framework auto-injects `<TheoUIProvider>` in SSR + client entries when the package is detected. 10+ files reference it: `vite-plugin/{inject-stylesheets,integrate-ui,theoui-detect}.ts`, `router/entry{,-server}.ts`, `config/schema.ts`, `cli/commands/{dev,upgrade-readiness}.ts`, `server/cost/track-agent-run.ts`. | ✅ Wired (npm) |
| **`theo` → TheoCloud** (formerly "Theo PaaS") | `../theo/` (Go) | **The principal deploy target** — hosted product where TheoKit apps run in production. K8s operators (Crossplane-style), Helm charts, multi-tenant control plane, managed Postgres + Redis, secret rotation, audit log persistence, distributed rate-limiter store. Separate Go CLI named `theo`. | **TheoKit → sibling** (TheoKit deploys to it) | **Adapter not yet shipped** — `packages/theo/src/adapters/theo-cloud.ts` does not exist. However, the **architectural hooks are already in place**: `JobBackend` interface (ADR-0002), `UsageStorageAdapter` interface (R0.5.11 design), `RateLimitStorageAdapter` (security-hardening plan), structured logging to stdout. TheoCloud-side issues #58, #59, #60 interlock with TheoKit's security primitives. | The deploy adapter is the next major milestone after 0.4.0; pluggable interfaces are designed *for it*. | 🟡 **Primary target — adapter on roadmap, interfaces ready** |
| **`theokit-plugins`** — first-party plugin registry | `../theokit-plugins/` (TypeScript) | Container repo for official Fastify-style plugins that consume TheoKit's `TheoPlugin` SDK (ADR-0008). Today: **1 package shipping** — `@theokit/plugin-cors` v0.1.0 (CORS middleware, peerDep `theokit >= 0.1.0-alpha.5`); **2 proposed** — `@theokit/plugin-sentry` (ADR-0012 there, ≤ 2 weeks after cors release) and `@theokit/plugin-i18n` (ADR-0013 there, ≤ 6 weeks after cors release). "Moderate roadmap" strategy per ADR-0011 D4 (in this repo). | **TheoKit → sibling** (sibling consumes TheoKit — direction INVERTED) | **Zero code wiring in framework core.** TheoKit does not import, dynamic-resolve, or auto-load anything from `theokit-plugins`. The sibling consumes TheoKit via npm `peerDependencies` + the `TheoPlugin { name, register(app) }` interface re-exported from `theokit/server`. Apps install plugins explicitly (`pnpm add @theokit/plugin-cors`) and pass them to `defineConfig({ plugins: [...] })`. | **Anchors live here, not there:** [ADR-0011](docs/adr/0011-moderate-plugin-roadmap-strategy.md) (strategy + temporal gates); [`docs/concepts/plugins.md`](docs/concepts/plugins.md) §7 (authoring guide); [`docs/adr/0008-theoplugin-is-the-canonical-sdk.md`](docs/adr/0008-theoplugin-is-the-canonical-sdk.md) (the SDK they consume). | 🌱 **Sibling — first plugin (`plugin-cors` v0.1.0) shipping 2026-Q3** |
| **`theo-stacks` → `create-theo`** (being absorbed into `create-theokit`) | `../theo-stacks/` (TypeScript) | Standalone polyglot scaffolder published as `create-theo` on npm. Today ships **19 templates in 7 languages** (Node · Go · Python · Rust · Java · Ruby · PHP — `node-express`, `node-fastify`, `node-nestjs`, `go-api`, `python-fastapi`, `rust-axum`, `java-spring`, `ruby-sinatra`, `php-slim`, `node-nextjs`, `fullstack-nextjs`, 7 monorepo-* variants, `node-worker`) with health probes, graceful shutdown, Dockerfile, CI per template. | **TheoKit ← (absorbing) sibling** | **Decision 2026-05-27 (ADR-0013 in this repo, to be drafted):** TheoCreate's scaffolding role is folded into `create-theokit`. Wave 1: TS templates already in `packages/create-theo/templates/`. Wave 2: import `python-fastapi` + `node-fastify` (or `node-hono`) templates, adapt to live next to TheoKit as `services/*/`. Other 5 languages deferred to future ADRs with demand evidence. Standalone `theo-stacks` repo + `create-theo` npm package go into deprecation. | Templates to absorb: `python-fastapi` (priority), `node-hono` (to be added — new, replaces `node-fastify`/`node-express` for fetch-handler shape). Existing TheoKit templates (default/dashboard/api-only/postgres/saas) gain a `--backend` flag that wires `services: {}` in `theo.config.ts`. | 🟡 **Being absorbed — Wave 2 milestone; standalone repo enters deprecation when absorption completes** |

### Rules that derive from this table

1. **TheoCloud (formerly Theo PaaS) IS the principal strategic target** — comparison tables, pitch decks, and roadmap items should reflect that. What they **must not** claim is that the `theo-cloud` *deploy adapter* exists today. Honest framing: "TheoCloud is the principal deploy target; the adapter ships with the next milestone."
2. **TheoCloud-shaped surfaces in framework code use neutral interfaces, not direct TheoCloud calls.** `JobBackend`, `UsageStorageAdapter`, `RateLimitStorageAdapter`, structured-logging-to-stdout — all designed so TheoCloud "slots in as a third backend" (per ADR-0002) without coupling the framework to a single platform. Same interface lets Postgres/Redis/SQS/Cloudflare Queues plug in.
3. **`@usetheo/sdk` is the agent runtime — always.** The locked premise (`[[project-stack-deps]]` memory) stands: defaults, docs, examples wire `@usetheo/sdk`. New agent primitives are *sugar over the SDK*, not parallel implementations.
4. **`@usetheo/ui` is a published npm dep** — if you need to evolve it alongside TheoKit, the cross-repo PR flow is: (a) ship the change in `../theo-ui/`, (b) publish `^0.X.Y-next.Z`, (c) bump TheoKit consumers. **Do not** add `theo-ui/` to `pnpm-workspace.yaml` casually — that's a strategic-review-worthy decision (would unify the monorepo at the cost of slower published-package iteration cycles).
5. **TheoCloud is the only deploy target the team validates end-to-end.** A user cloning this repo and running `pnpm install && pnpm dev` does not need to clone the `theo` Go sibling — local dev works standalone. The 6 non-TheoCloud adapters (Vercel, Cloudflare Workers, AWS Lambda, Bun, Deno Deploy, Netlify, Static) and the Node adapter are kept **in-tree as opt-in compatibility surfaces** (per Wave 2 design: they reject `services: {}` non-empty and accept empty config for SPA-only deploys). Apps may use them at their own risk; the team does NOT validate them against real production environments. Marketing copy must not claim "8 adapters production-ready" — the honest framing is "TheoCloud is the principal deploy target; non-TheoCloud adapters are opt-in compatibility surfaces without team validation." Re-introducing team validation for any non-TheoCloud target requires a fresh ADR with demand evidence (3+ production apps explicitly blocked). See TheoCloud-first re-lock 2026-05-27 in the Roadmap section.
6. **Renaming "Theo PaaS" → "TheoCloud" in user-facing copy** — README, marketing surfaces, comparison tables, status banners. Internal ADRs and historical plans retain "Theo PaaS" with `(formerly)` annotation when re-edited — do not rewrite history that says "Theo PaaS" inside completed plans.
7. **`theokit-plugins` is a DOWNSTREAM sibling, not an upstream dependency.** The framework core ships zero coupling to it — no auto-load, no preset, no convention. Apps install individual plugins (`@theokit/plugin-cors` etc.) and wire them via `defineConfig({ plugins: [...] })`. The strategy that governs which plugins ship lives in TheoKit's ADR-0011, not in the sibling — because the gate (community demand) is observed from TheoKit core, where the `TheoPlugin` SDK lives. **Do not** add `theokit-plugins` to `pnpm-workspace.yaml` — the per-plugin `devDependency: "theokit": "link:../../../theokit/packages/theo"` is the local-dev link, by design.
8. **Plugin-shaped features ship in this repo (core) only if they pass ADR-0011 gates.** Otherwise they belong in `theokit-plugins` (first-party) or as community packages (`@<scope>/theokit-plugin-<name>`). A plugin proposal lands as a TheoKit-core ADR first (defining whether the surface deserves core OR plugin status), then the plugin author creates the package in `theokit-plugins/packages/`.
9. **`theo-stacks` / `create-theo` is being absorbed, not deleted in fragments.** All polyglot scaffolding becomes a flag on `create-theokit` (e.g., `create-theokit my-app --backend python`). The standalone `create-theo` npm package enters formal deprecation only after Wave 2 ships and the equivalent flags work end-to-end. **Do not** publish patches to `create-theo` in parallel — that creates two scaffold sources of truth. Bug fixes go straight into the absorbed templates inside `theokit/packages/create-theo/templates/`.
10. **Wave 2 backends are Python + Node ONLY.** The `theo-stacks` repo shipped 7 languages; absorbtion intentionally narrows to 2. Go/Rust/Java/Ruby/PHP scaffolding is **archived**, not migrated. Reopening any of those requires a fresh ADR with demand evidence (matches ADR-0011 gates: 1+ app in production using a community/draft template, 3+ requests, doesn't duplicate a core primitive, maintainable, tests + fixture).

### Future evolution of these relationships

Changes to the table above (e.g., upgrading `theo-ui` to a workspace link, shipping the `theo-cloud` adapter, deprecating `gateway-telegram`, adding a new sibling, promoting a `theokit-plugins` package into core) are **architectural decisions** — they require:
1. An ADR in `docs/adr/`
2. A migration plan in `docs/plans/`
3. An explicit update to this Ecosystem table

Inserting a new sibling in copy without doing the wiring is not allowed. **For TheoCloud specifically:** copy *may* state "TheoCloud is the principal deploy target" (truthful — it is the strategic target with pluggable-interface preparation already in place), but copy *must not* state "deploys to TheoCloud" until the adapter file exists and a structural smoke test passes. **For `theokit-plugins` specifically:** copy *may* state "first-party plugin registry, 1 package shipping (`plugin-cors`)" and link the repo; copy *must not* claim TheoKit "auto-loads" plugins or "ships with built-in CORS/Sentry/i18n" — apps install and wire each plugin explicitly.

---

## Macro Roadmap — agent products on Like-Vercel runtime

**Mission (re-locked 2026-05-27):** TheoKit is the framework for **agent products**. It ships three things, in this order of strategic weight:

1. **The app the agent lives in** — file-based routing, auth, sessions, realtime, deploy. TypeScript-first. Built around `@usetheo/sdk` (agent runtime) + `@usetheo/ui` (UI).
2. **The scaffolding for the full project** — `create-theokit` absorbs the role of the standalone `create-theo` (in `../theo-stacks/`). One CLI generates the TheoKit app PLUS optional polyglot services (Python, Node). The standalone `create-theo` is **superseded** by `create-theokit`.
3. **The polyglot services orchestration contract** — `theo.config.ts > services: {}` declares external processes (FastAPI / Hono / Express / etc.) that ship next to the TheoKit app, validated against a **Like-Vercel runtime contract**. The same `services` config drives dev (Vite proxy + docker-compose), build (`.theo/services.json` manifest), and deploy (adapter consumes the manifest). **TheoCloud is the principal target adapter** but is NOT a precondition — local dev uses a "TheoCloud-shaped" docker-compose harness so the contract is validated before TheoCloud is provisioned.

**The Like-Vercel runtime contract** (governs both TheoKit core and polyglot services):

- **Fetch handler is the universal entry.** Each service (TS or Python or Node-sidecar) exposes a `(Request) => Promise<Response>`-shaped handler. Adapter wraps the platform-native shape (Vercel function / CF Workers / TheoCloud K8s pod / Node local) around the same handler. "Just swap the server" works.
- **File-system routing is build-time.** Routes scanned once, baked into manifest, zero filesystem scans on hot path.
- **Env vars are runtime, not build-time.** `process.env` / `os.environ` read on cold start, not bundled.
- **Healthchecks are conventional.** `GET /health` → 200/503. Every service template ships it.
- **Logs are structured stdout.** JSON lines. Trace propagation via W3C `traceparent` (already shipped in TheoKit).
- **Graceful shutdown is the adapter's problem in serverless, the service's problem on long-running runtimes.** TheoKit doesn't try to unify these — it documents the contract.

**Four invariants that survive the expansion (do not violate without an ADR):**

1. **Multi-runtime is NEVER embedded in TheoKit core** (absolute). Polyglot services run as **external processes**, wired via proxy / manifest / typed client. `services: {}` configures orchestration of OS-level processes; it does NOT host Python in Node's event loop.
2. **`@usetheo/sdk` is the priority agent runtime for Wave 2** (priority, not permanent). Python/Node services in Wave 2 are tool-providers / data-providers / job-workers — not parallel `Agent` runtimes. Future `@usetheo/sdk-<lang>` SDKs are DEFERRED, not banned — require fresh ADR with demand evidence (3+ production apps needing native agent runtime in `<lang>`) per [ADR-0012](docs/adr/0012-mission-expansion-agent-products-on-like-vercel-runtime.md) invariant #2.
3. **Wave 2 polyglot backends are Python + Node ONLY** (priority, not permanent). Go, .NET, Rust, Java, Ruby, PHP (which `theo-stacks` shipped) are deferred to future ADRs with demand evidence. We are NOT recreating JHipster's matrix.
4. **The cross-product Like-Vercel contract is global** (absolute). The contract runs unchanged across `create-theokit` + TheoKit + TheoCloud. Any per-surface relaxation destroys the moat — see [ADR-0012](docs/adr/0012-mission-expansion-agent-products-on-like-vercel-runtime.md) invariant #4.

See [[project-theokit-purpose]], [[project-mission-relock-2026-05-27]], [[project-polyglot-is-the-theo-moat]] in memory.

### TheoKit `server/` covers end-to-end; polyglot sidecars are OPTIONAL

**Critical positioning to keep clear in docs, READMEs, and conversation:**

A TheoKit user can ship an agent product **end-to-end** (auth, users, sessions, billing, admin, agent chat, jobs, crons, webhooks, Telegram bot) using **only TheoKit's `server/` directory in TypeScript**. The polyglot services capability (`services: {}` in `theo.config.ts`) is **OPT-IN** — empty by default, used only for specific cases.

**Default mental model:**

```
my-agent-app/
├── app/                          # Frontend (React + Vite)
└── server/                       # TS backend — covers everything
    ├── routes/auth/{login,register,logout}.ts   # encrypted sessions
    ├── routes/users/{me,[id]}.ts                # CRUD users + admin
    ├── routes/chat.ts                           # @usetheo/sdk agent endpoint
    ├── routes/billing/webhook.ts                # defineWebhook (Stripe)
    ├── actions/*.ts                             # defineAction (CSRF)
    ├── middleware.ts                            # requireAuth()
    ├── jobs/*.ts                                # defineJob (workers)
    └── crons/*.ts                               # defineCron
```

```ts
// theo.config.ts — default config
export default defineConfig({
  storage: { postgres: { url: process.env.DATABASE_URL! } },
  services: {}  // empty — 90% of agent products live here
})
```

**When sidecars enter (Wave 2 `services: {}`) — concrete cases ONLY:**

| Scenario | `server/` covers? | Sidecar entry |
|---|:---:|---|
| Login + encrypted sessions | ✅ | — |
| CRUD users + admin panel | ✅ | — |
| Agent chat via `@usetheo/sdk` | ✅ | — |
| Stripe billing + webhooks | ✅ | — |
| `defineJob` + `defineCron` | ✅ | Node sidecar ONLY if operational isolation matters |
| Bot Telegram (`@usetheo/gateway-telegram`) | ✅ | — |
| ML inference (sentence-transformers, scikit-learn) | ⚠️ painful TS | ✅ Python sidecar via `--backend python` |
| OCR / PDF heavy parsing | ⚠️ painful TS | ✅ Python sidecar |
| Legacy company API (existing Node monolith integration) | ❌ | ✅ Node sidecar as reverse proxy `/api/legacy/*` |
| Microservice isolation (billing detached from app) | depends | ✅ Node sidecar if isolation matters |

**The rule:** if the use case is comfortable in TS, use `server/`. If it needs another language's library ecosystem OR operational isolation, add a sidecar. **Sidecars complement; they do not substitute.**

**Documentation gates that must hold:**

- Public copy (README, docs, marketing) MUST NOT imply polyglot is required to build an agent product on TheoKit.
- Public copy MUST NOT imply `server/` is for "simple cases" and sidecars are for "real cases". The opposite is true — `server/` is the default for ALL cases that comfortably fit TS, including billing, admin, multi-tenant, agent chat. Sidecars are for SPECIFIC cases.
- The Voice and Tone vocabulary table (above) MUST be re-read before writing any new polyglot-related copy.

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

**Done definition for the "agent products" mission (Wave 1 — TheoKit-only):**

- `npm create theokit my-app` → chat thread (rendered with `@usetheo/ui` components) live in <30 seconds
- Replace `server/routes/chat.ts` mock with 5 lines of `@usetheo/sdk` `createAgentFactory` + `Agent.send` → working LLM chat (SDK handles the provider — Anthropic, OpenAI, Ollama, etc.)
- Add a tool via `defineAgentTool` → wraps SDK `defineTool`; agent uses it without manual `tool_call` plumbing
- Add conversation history via `createConversationHistory` → wraps SDK `Agent.getOrCreate(sessionId)` + Memory; persistence across reloads is zero-config
- README has a guided "5 minutes to first agent" path that a new developer can follow without reading the rest of the docs
- `examples/chat-anthropic` runs on **Node (local)** and is deployment-ready for **TheoCloud** (validated end-to-end once R0.6.1/R0.6.2 ship). The 6 non-TheoCloud adapters (Vercel, CF Workers, AWS Lambda, Bun, Deno Deploy, Netlify, Static) are listed as **opt-in compatibility surfaces** without team validation — see TheoCloud-first re-lock 2026-05-27.

**Done definition for Wave 2 — polyglot services on Like-Vercel runtime:**

- `npm create theokit my-app --backend python` → TheoKit TS frontend + FastAPI service under `services/agent-python/`, with `theo.config.ts > services: { agent: { runtime: 'python', port: 8001, openapi: '...', proxy: '/api/agent' } }` already wired.
- `npm create theokit my-app --backend node` → TheoKit TS frontend + Hono (or Fastify) sidecar service under `services/agent-node/`, same `services: {}` shape.
- `pnpm dev` boots TheoKit + service(s) + Postgres + Redis via a generated `docker-compose.yml` that mimics a TheoCloud-shaped environment (Like-Vercel ingress contract: structured logs, env vars, healthcheck at `/health`, traceparent propagation).
- OpenAPI auto-discovered from the service exposes a typed client at `clients/agent.ts` — `services.agent.chat({ message })` is fully typed on the frontend.
- The Wave 1 TheoKit Done definition continues to pass with `services: {}` left empty (zero impact on TS-only apps).

**Done definition for Wave 3 — TheoCloud adapter consumes the same manifest:**

- `packages/theo/src/adapters/theo-cloud.ts` reads `.theo/services.json` (same manifest Wave 2 generates for local dev) and produces TheoCloud-compatible deployment artifacts.
- A real (or staging) TheoCloud env runs an `examples/full-stack-agent` deploy end-to-end; the smoke test asserts the TS app + Python service interoperate via the proxy contract.

**Locked stack assumptions:**

1. Every TheoKit deliverable wires `@usetheo/ui` (UI surface) + `@usetheo/sdk` (agent runtime). Premise. Sugar over the SDK, not parallel implementations.
2. Polyglot services in Wave 2+ are **external processes** consuming/exposing HTTP+OpenAPI. The agent runtime stays in TS via `@usetheo/sdk`. Python/Node sidecars provide tools/data/workers, not parallel `Agent` runtimes.
3. Wave 1 backends are TS (in-tree). Wave 2 backends are **Python + Node ONLY**. Anything else requires a fresh ADR with demand evidence.

Anything beyond this list is **out of scope**: built-in agent orchestration, embedded coding agents (the Studio detour), agent marketplaces, hosted memory, embedded multi-runtime (Pyodide / WASI), Go/Rust/Java/Ruby/PHP backends — all explicitly out of scope per `## Architectural decisions on record` below.

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

> **🎯 TheoCloud-first re-lock (2026-05-27).** All non-TheoCloud deploy-target validation (Vercel/Cloudflare/Deno/AWS-Lambda/Bun/Netlify/Static in real prod environments) is **DROPPED** from this milestone and the runway. The 6 non-TheoCloud adapters are kept in-tree as **opt-in compatibility surfaces** (they reject `services: {}` non-empty per Wave 2 design and accept empty config for SPA-only deploys). They are NOT promoted, NOT marketing, NOT priority. **TheoCloud is the principal target — and the ONLY deploy target the team validates end-to-end.** Validating other clouds dilutes the moat (the cross-product Like-Vercel contract running uniformly from `create-theokit` → TheoKit → TheoCloud, per [ADR-0012](docs/adr/0012-mission-expansion-agent-products-on-like-vercel-runtime.md) invariant #4). Re-listing non-TheoCloud validation requires a fresh ADR with demand evidence (3+ production apps explicitly blocked by missing validation).

- [ ] **Playwright for the other four templates** (`dashboard`, `api-only`, `postgres`, `saas`) — same fixture pattern as `template-default`. T10.2 (agent-saas full flow) needs a Postgres instance in CI.
- [x] **Minimum devtools overlay** — request log + error panel + matched-route info + settings in dev. **DONE 2026-05-19** (commit `e369f4a`). Auto-injected floating chip + expandable 4-tab panel (Requests / Routes / Errors / Settings), data flows server→client via Vite HMR WebSocket, privacy redaction at dispatcher level, light/dark/system theme, drag-to-corner with spring-snap, localStorage persistence with schema versioning, `theo.config.ts.devtools = false` opt-out. Tree-shaken in prod (verified by `tests/unit/devtools-treeshake.test.ts` — fresh build + grep `theo-devtools|goober` in `dist/assets/index-*.js`, zero matches). Artifacts: [`docs/plans/devtools-plan.md`](docs/plans/devtools-plan.md), [`.claude/knowledge-base/reference/devtools.md`](.claude/knowledge-base/reference/devtools.md), live demo at [`examples/devtools-demo/`](examples/devtools-demo/). 13 Playwright scenarios + 12 unit-test files + 1 integration test. 29 edge cases catalogued and mitigated (EC-1 through EC-29).
- [ ] **Load test the SSR streaming path** — 1000 concurrent connections, leaky generators, slow LLM streams. Measure shell-flush TTFB, abort-on-disconnect behavior, memory pressure.
- [ ] **WebSocket Playwright spec** — `defineWebSocket` has unit tests but no real-browser test exercises the full upgrade + bidi + reconnect flow.
- [ ] **Bundle budget asserted in CI** — fail the build if `index-*.js` gzipped exceeds 350 KB for the default template.
- ~~Validate at least one deploy adapter end-to-end in real production (Vercel)~~ — **DROPPED 2026-05-27 (TheoCloud-first re-lock).** Validation budget goes entirely to TheoCloud (see new 0.6.0 below).

### 0.5.0 — Background work + external integration

> **Locked theme:** "Make TheoKit complete for 4 agent use cases simultaneously — chat, background-processing, webhook-triggered, report-generating."
>
> **Scope analysis:** see ultrathink turn 2026-05-24 (`docs/analysis/2026-05-24-five-gaps-to-100-percent.md` — to write) for the gap audit. After framework-scope-guardian review + ultrathink critique, the verdict is **5 primitives + 1 manifest schema in one coherent onda**. `defineWorker` (stream consumer) was explicitly REJECTED and stays out of scope per the 3 conditions documented below.
>
> **Prerequisites (BLOCKING — updated 2026-05-27 TheoCloud-first re-lock):** Playwright templates (R0.5.2) + bundle CI gate (R0.5.3) from 0.4.0 MUST land before 0.5.0 starts. **Vercel/CF deploy validation (R0.5.1) is REMOVED from the prerequisite list** — TheoCloud-shaped harness local (`docker compose up` with Caddyfile + tracing, per Wave 2) validates the Like-Vercel contract without depending on non-TheoCloud cloud sign-off. R0.5.1 is dropped and tracked under "Dropped from roadmap" below.

#### Roadmap items — 0.5.0

| # | Item | Description | Acceptance criteria | References |
|---|---|---|---|---|
| ~~R0.5.1~~ | ~~**Vercel/CF SSE deploy validation**~~ | **DROPPED 2026-05-27** (TheoCloud-first re-lock). The TheoCloud-shaped harness local already validates the Like-Vercel contract bytewise. Validating Vercel/CF in real prod consumes ≥4 dev-days that go entirely to TheoCloud adapter ship (0.6.0). | — | — |
| **R0.5.2** | **Playwright for 3 remaining templates** (0.4.0 prereq) | Cover `dashboard`, `api-only`, `postgres`+`saas` with the same fixture pattern as `template-default`. Saas needs Postgres in CI. | 100% template coverage in CI matrix; 4 spec files green | `fixtures/template-default/` + `tests/e2e/template-default.spec.ts` |
| **R0.5.3** | **Bundle budget asserted in CI** (0.4.0 prereq) | Fail build if `index-*.js` gzipped > 350 KB for default template. Today: 193.90 KB; want a regression gate, not a recurring measure. | `pnpm check:bundle` exit 1 on overshoot; GH Actions step | `scripts/check-bundle-budget.sh` |
| **R0.5.4** | **`defineCron(name, { schedule, handler })`** | Time-triggered handlers. Schedule = 5-field cron string, UTC. Each adapter translates to platform-native (vercel.json crons, wrangler.toml triggers, EventBridge). | (a) Zod-validated config (b) build emits `.theo/crons.json` (c) 8 adapters translate or document N/A (d) fixture | plan TBD: `docs/plans/jobs-crons-plan.md` + reference TBD: `.claude/knowledge-base/reference/cron-primitives.md` |
| **R0.5.5** | **`defineJob(name, { input, handler })`** | Async work triggered via `ctx.queue.enqueue`. Handler returns void (NOT Promise<Result>). Default `maxAttempts: 1`. `NonRetryableError` class for opt-out of retries. | (a) Zod-validated input (b) `JobBackend` interface (in-memory + Postgres adapters shipped) (c) fixture + test harness `expect(queue).toHaveEnqueued(...)` | plan + reference TBD |
| **R0.5.6** | **`ctx.queue.enqueue<JobName>(name, input, { idempotencyKey? })`** | Typed client over defineJob. Same inference pattern as `theoFetch<typeof GET>`. Returns `void` (or `{ jobId }` for log correlation). | (a) compile error on misnamed job or wrong input (b) idempotency key dedupes within TTL | (acoplado a R0.5.5) |
| **R0.5.7** | **Job/Cron manifest** (`.theo/{jobs,crons}.json`) | Build artifact, neutral schema (versioned), consumable by ANY platform (not theo-specific). theo will be the first consumer; spec MUST work for others. | (a) `schemaVersion` field (b) snapshot test of manifest from fixture (c) docs/concepts/jobs-manifest.md | (acoplado a R0.5.4/R0.5.5) |
| **R0.5.8** | **Transactional outbox semantics** | `enqueue` defers actual dispatch until current request commits (`res.on('finish')`). Rollback = nothing enqueued. Prevents orphan jobs after DB txn failure. Documented invariant. | (a) integration test: enqueue inside throwing handler → 0 jobs dispatched (b) doc in caching.md analog | (acoplado a R0.5.5) |
| **R0.5.9** | **W3C Trace Context propagation** through enqueue → job → child enqueues | Existing trace plumbing in HTTP must flow through queue. `ctx.traceId` in job handler matches originating request. | snapshot test asserting trace chain across 3-deep enqueue | reuses existing `server/http/trace-context.ts` |
| **R0.5.10** | **`defineWebhook({ verify, handler })`** with provider plugins | First-class HMAC signature verification for Stripe, GitHub, Slack, Twilio, Resend. Failed verify → 401, no handler. Provider helpers via `@theokit/webhook-*` packages OR pluggable `verify` function. | (a) `defineWebhook` exported (b) 3 provider helpers shipped (stripe, github, slack) (c) fixture per provider | plan TBD: `docs/plans/define-webhook-plan.md` |
| **R0.5.11** | **`trackAgentRun({ userId, model, tokens, costUsd })`** server-side | Companion to client-side `<CostMeter>` from `@usetheo/ui`. Accumulates per-user usage in a `UsageStorageAdapter` (in-memory default; user plugs Postgres/Redis). Surface `getUsage({ userId, period })` for tier enforcement. | (a) primitive exported (b) integration with `defineAgentEndpoint` (auto-track on Agent.prompt completion) (c) fixture with rate-limit-by-tier | plan TBD: `docs/plans/agent-cost-tracking-plan.md` |

#### Architectural decisions to land in 0.5.0

These ADRs MUST be written before the corresponding roadmap items ship. Each becomes `docs/adr/NNNN-*.md` once accepted.

| ADR # (proposed) | Title | Why it matters | Affects |
|---|---|---|---|
| ADR-0002 | `JobBackend` interface — neutral contract | Decouples TheoKit from `theo` platform. In-memory + Postgres + (theo-future) all implement the same `enqueue` / `dequeue` / `ack` / `idempotency`. | R0.5.5, R0.5.6 |
| ADR-0003 | `enqueue` MUST return `void` (transactional outbox) | Locks the constraint that prevents drift into workflow engine. Foot-gun shield against PRs that "just add Promise<Result>". | R0.5.5, R0.5.8 |
| ADR-0004 | Cron schedule format — UTC always, 5-field strict | Cross-adapter portability. Vercel/CF/AWS all support this subset. Timezone field rejected for ambiguity. | R0.5.4 |
| ADR-0005 | Webhook verification — plugin OR inline function (not class hierarchy) | Avoid abstraction inflation. `verify: stripe(secret)` is a 1-line helper, not an Adapter pattern. | R0.5.10 |
| ADR-0006 | `defineWorker` (stream consumer) — REJECTED with 3 reopen conditions | Codify the rejection from the framework-scope-guardian review so future PRs don't relitigate. | (negative scope) |

#### Out of scope for 0.5.0 (intentional non-goals)

These ARE tempting and would naturally come up during implementation. They are NOT shipping in this onda. Adding them requires fresh scope review.

| Tempted addition | Why rejected | Where it belongs |
|---|---|---|
| `defineWorker(name, { stream, handler })` | Stream semantics = deep layer (ordering, partitioning, exactly-once); no universal backend (Kafka ≠ NATS ≠ Redis Streams); crosses into agent-orchestration territory | Possibly never; revisit only if (a) theo offers managed streams, (b) 3+ apps demand, (c) agent layer formalizes |
| `enqueue().then(result => ...)` (workflow API) | Reaches into Inngest/Trigger.dev territory. TheoKit's wedge is web framework, not workflow engine | External: Inngest, Trigger.dev, Mastra |
| `defineDLQ()` / `onJobFailed()` framework hooks | Dead-letter queue is platform decision, not framework primitive | theo platform OR user's queue backend config |
| `ctx.queue.status(jobId)` / `cancel(jobId)` | Vira API de orquestração; expand scope. Apenas log correlation. | User code reading queue backend directly |
| Result Store / Job Status API | Vira workflow tracker. theo dashboard problem, not TheoKit. | theo platform |
| Email delivery primitive (`defineEmail`) | Provider lock-in (Resend ≠ Postmark ≠ SES API). | User adapter via SDK |
| BlobStorageAdapter (S3/R2/disk) | Scope expansion in same onda. Defer to 0.6.0. | 0.6.0 (see below) |
| Database/ORM | Drizzle/Prisma solve this. Not framework's job to pick. | User code |
| Vector store integration | SDK concern, not framework. | `@usetheo/sdk` |
| Multi-agent orchestration | Categoria diferente. Near agent-layer (out of scope per locked mission). | External: Mastra, LangGraph |

### 0.6.0 — TheoCloud adapter ship (the only deploy-target target we validate end-to-end)

> **🎯 Re-locked theme 2026-05-27 — TheoCloud-first.** 0.6.0 is **NOT** "various polish items"; it is **the milestone where TheoKit + TheoCloud finally close the loop**. The 6 non-TheoCloud adapters stay where they are (opt-in compatibility, empty `services: {}`, no team validation). All deploy-target engineering budget goes to TheoCloud.

**What ships in 0.6.0:**

| # | Item | Description | Acceptance criteria |
|---|---|---|---|
| **R0.6.1** | **TheoCloud deploy adapter ship** — `packages/theo/src/adapters/theo-cloud.ts` becomes real (currently a Wave 2 stub) | Reads `.theo/services.json` (Wave 2 manifest) and emits TheoCloud-shaped deployment artifacts: K8s manifests (Deployment/Service/Ingress per service), Caddy/ingress config, environment surfaces, secret mounts. Consumes the same Like-Vercel runtime contract validated locally by `docker compose up`. | (a) stub becomes real adapter; (b) `theokit build --target theo-cloud` emits artifact set; (c) Wave 3 K8s manifest emission complete; (d) [ADR-0012](docs/adr/0012-mission-expansion-agent-products-on-like-vercel-runtime.md) invariant #4 (cross-product Like-Vercel) preserved bytewise |
| **R0.6.2** | **End-to-end staging validation** — deploy `examples/full-stack-agent` to a real (staging) TheoCloud environment | Smoke test: TS app + Python service interoperate via the proxy contract. Verify SSE roundtrip, healthchecks, structured logs flow, `traceparent` propagation, graceful shutdown on pod terminate. | (a) live staging URL committed; (b) Playwright spec hits staging URL passes; (c) latency telemetry committed; (d) ADR-0015 invariants verified live |
| **R0.6.3** | **`UsageStorageAdapter` TheoCloud recipe** | `trackAgentRun` (R0.5.11) primitive consumed by TheoCloud hosted storage. Per-user usage flows through managed Postgres/Redis. | (a) recipe documented; (b) fixture proves tier enforcement works against TheoCloud-shaped backend |
| **R0.6.4** | **Production debugging — OTel/Sentry exporter** triggered by first real customer | Foundation exists (devtools `dispatcher` + `broadcastToDevtools`). Adds prod exporter sink: structured logs + traces flow to OTel collector that TheoCloud runs. **Triggered by user demand, not built speculatively.** | (a) at least 1 production app reports prod error and the team can trace it via TheoCloud observability surface |
| **R0.6.5** | **Migration guide 0.3 → 1.0** | Audit every breaking change in the 0.3 → 1.0 chain, document codemod or manual migration steps. | `docs/migration/0.3-to-1.0.md` lands; verified by upgrading `examples/full-stack-agent` from a frozen 0.3 snapshot |

**Total estimated effort:** ~15 dev-days (1 focused sprint).

#### Dropped from the roadmap 2026-05-27 (TheoCloud-first re-lock)

These items are NOT shipping in 0.6.0+ and are NOT scheduled. Reopening requires a fresh ADR with demand evidence (3+ production apps explicitly blocked).

| Item | Why dropped |
|---|---|
| **Edge runtime adapter parity** (Vercel Edge, CF Workers, Deno Deploy real-prod validation) | Drains 4+ dev-days from TheoCloud ship. The 6 non-TheoCloud adapters remain in-tree as opt-in compatibility; team does not validate them. **TheoCloud is the only deploy target the team validates.** |
| **Vercel deploy validation** (formerly item #7 of macro roadmap + R0.5.1) | Same reason. |
| **`BlobStorageAdapter`** (S3/R2/disk) | `fs.writeFile` + AWS SDK / R2 client (5 LOC each) cover the use case today. Adding 3 implementations + recipes + maintenance is over-engineering. Reopen when 3+ apps need migration between providers. |
| **`next/image`-equivalent** | Vendor lock-in (sharp ≠ vips ≠ wasm). Solved-problem-in-CSS (`<img loading="lazy">` + Cloudinary/imgix for the 20% that needs more). |
| **`next/font`-equivalent** | TheoUI ships Geist; other fonts = 3 lines of `@font-face`. Generic surface is post-1.0 if at all. |
| **Plugin ecosystem incubation** (registry + docs site + community plugin) | Bottom-up. 0 community plugins shipped today; investing without demand signal produces orphan artefacts. Reopen when 5+ apps in prod + 3+ "how do I write a plugin?" pedidos. |
| **Metadata API + OG image generation** | Agent dashboards aren't content sites (no social-share value). Metadata API is trivial (~1d) and may land later as a tiny PR; OG generation has vendor lock-in (`@vercel/og` vs satori vs wasm canvas) — dropped. |

**Why drop these now:**

1. **Moat clarity.** The Theo product-mark moat is the **cross-product Like-Vercel contract** running uniformly from `create-theokit` → TheoKit → TheoCloud (per [ADR-0012](docs/adr/0012-mission-expansion-agent-products-on-like-vercel-runtime.md) invariant #4). Validating Vercel/CF dilutes that — every dev-day spent on non-TheoCloud validation is a dev-day NOT spent on the moat.
2. **Honest framing.** Marketing "8 adapters production-ready" without team validation is vapor. Marketing "TheoCloud is the principal deploy target — validated end-to-end" is true.
3. **YAGNI applied to scope.** BlobStorage / image / font / plugin ecosystem are speculative wide-ness. TheoKit's value is being **vertical for agent products**, not horizontal-and-thin.
4. **0.5.0 already shipped what matters.** Jobs/crons/webhooks/cost — the primitives that agent apps actually need in production — are in. Adding more primitives before TheoCloud ships is premature.

### 1.0 — Stability lock (target: post-0.6.0)

The window where breaking changes stop. Requires:

- All HIGH and CRITICAL items from architecture audit resolved (status as of 2026-05-23: ✅ all 7 HIGH resolved; ✅ 1 CRITICAL resolved via ADR-0001).
- Migration guides for every breaking change in 0.2 → 1.0 chain.
- At least 5 community apps in production (demand-side validation, not internal use only).
- Public API frozen — additions allowed via semver minor, removals require major.

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
