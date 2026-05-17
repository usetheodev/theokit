<!--
Pitch copy for TheoKit landing surfaces (usetheo.dev site, README marketing block, launch material referencing TheoKit).
Voice: TheoKit aspirational voice — canonical, operational rules in ./CLAUDE.md.
HERO is LOCKED. See root CLAUDE.md "Locked Narrative" and ./CLAUDE.md "Positioning, public". Do not edit without strategic review.
Hermes, Cursor, and TheoCode appear as category framing (agents that live in terminal, IDE, CLI surfaces) — not as adversarial competitors. TheoKit is the framework for the web-app surface where the agent meets paying customers. Honest framing aligned with root CLAUDE.md Cross-Project Rule 2 ("Do not invent integration that does not exist yet").
Every named feature is verified against README.md, packages/theo/src, and packages/create-theo/src.
-->

# Build the app your agent lives in.

### Real auth, real domain, real WebSockets — the app your agent ships in.

*Open-source. TypeScript end to end. Deploys to Theo PaaS, Vercel, Cloudflare Workers, or any Docker host.*

**4 templates · 4 deploy targets · file-based routing · typed RPC client · AES-256-GCM sessions · Apache-2.0**

---

## Pick where your agent will live

**Chatbots** live in messaging. **Cursor** lives in your IDE. **TheoCode** lives in your terminal.

The agent your customers will pay for needs something different — a real domain, real auth, real WebSockets, a real product. **TheoKit ships it.**

## What you get

- **Routes are just files** — `app/page.tsx` → `/`. Layouts, errors, loading, not-found — no config.
- **APIs that validate themselves** — schemas in, types out, end-to-end on server and client.
- **Server actions without plumbing** — CSRF, validation, serialization handled.
- **Backend calls that compile** — import the route type, get request and response inferred.
- **Encrypted sessions, one helper** — AES-256-GCM cookies, `requireAuth` narrows the type.
- **Per-request context, no globals** — plug your DB and user once, reach them anywhere.
- **WebSocket as a file** — drop a file in `server/ws/`, it's a real-time endpoint.
- **Three native build targets** — Node, Vercel, Cloudflare Workers. Or `theokit docker` + `theo deploy` to ship via Theo PaaS.
- **Four templates that already deploy** — default, dashboard, API-only, Postgres.

## Feel it

```typescript
// server/routes/users.ts
import { defineRoute } from 'theokit/server'
import { requireAuth } from 'theokit/server'
import { z } from 'zod'

export const GET = defineRoute({
  query: z.object({ search: z.string().optional() }),
  handler: ({ query, ctx }) => {
    requireAuth(ctx.user)              // throws 401, narrows the type
    return { users: [{ name: 'Alice' }] }
  },
})

// server/ws/agent.ts → ws://localhost:3000/ws/agent
import { defineWebSocket } from 'theokit/server'

export default defineWebSocket({
  onMessage(ws, data) {
    ws.send(`echo: ${data}`)
  },
})

// app/dashboard/page.tsx
import { theoFetch } from 'theokit/client'
import type { GET } from '../../server/routes/users'

const data = await theoFetch<typeof GET>('/api/users', { query: { search: 'alice' }})
// data: { users: { name: string }[] }
```

A route. A WebSocket. A typed client call. Three files. No glue.

## What you'd ship

- **Customer-facing agent dashboard.** The surface where your users talk to the agent you built. Real auth, real sessions, real domain.
- **Real-time agent control panel.** Stream tool calls and step events into the UI as they happen. WebSocket primitives + typed routes do the wiring; bring any SDK underneath.
- **Multi-tenant agent SaaS.** Per-user sessions, per-request context, isolated state. Drizzle + Postgres template included.
- **Agent admin tool with audit log.** Staff-only routes guarded by `requireAuth`, audit trail persisted to your DB.
- **Webhook + messaging gateway.** Receive webhooks, fan them out to your agent, ack with typed responses.
- **B2B agent product.** Onboarding, billing webhook, dashboard — deployable to Vercel or Cloudflare Workers in one command.

## Why TheoKit

The agent ecosystem has two halves. Frameworks for **orchestrating** agents. Frameworks for **shipping apps**. Most teams build the agent, then realize they need an app — and stitch six libraries together. TheoKit is the app, with the agent wiring already in place.

| Capability | TheoKit | Mastra | Vercel AI SDK + Next.js | Roll your own |
|---|---|---|---|---|
| **Frame** | Build the app your agent lives in | Build stateful AI agents with memory, tools and MCP | Wrap LLM calls in a Next.js app | Pick six libs, glue them |
| File-based routing | ✓ | DIY | Next.js | Next.js |
| Typed RPC client (`theoFetch<typeof GET>`) | ✓ | DIY | DIY | DIY |
| Server actions with CSRF + Zod | ✓ | DIY | Partial (Next.js Actions) | DIY |
| Encrypted sessions, one helper | ✓ (AES-256-GCM, `requireAuth`) | DIY | DIY | DIY |
| WebSocket as a file | ✓ | DIY | DIY (needs separate WS server) | DIY |
| Deploy targets out of the box | Docker · Vercel · Cloudflare Workers · Theo PaaS | DIY | Vercel | DIY |
| Templates with DB wired | ✓ (postgres, dashboard, api-only) | Limited | DIY | DIY |
| CLI scaffolding (`theokit generate`) | ✓ | Limited | Next.js (partial) | DIY |
| License | Apache-2.0 | Open | Open (MIT SDK) | N/A |

Mastra builds the agent. TheoKit ships the product around it — real agents, real apps, not yet another chat widget. You can use both.

## Why now

Agents built in 2026 are starting to charge subscriptions. They need the app surface — domain, auth, real-time, deploy — not just the loop.

---

## How it works

Below this line, full technical vocabulary is in play. The rest of this page is the technical surface — routes, server actions, sessions, WebSockets, CLI, templates. If you came for the pitch, the sections above are enough.

### Install

```bash
npx create-theokit my-app
cd my-app
theokit dev
```

Multi-language project (Go, Python, Rust, Java, Ruby, PHP, Node)? Use **TheoCreate**:

```bash
npm create theo@latest
```

### Project structure

```
my-app/
├── app/                       # Pages — file-based routing
│   ├── page.tsx               # /
│   ├── layout.tsx             # Root layout
│   └── dashboard/
│       └── page.tsx           # /dashboard
├── server/                    # Backend — explicit and typed
│   ├── routes/                # API routes → /api/*
│   ├── actions/               # Server actions
│   ├── ws/                    # WebSocket endpoints → /ws/*
│   ├── middleware.ts          # Request middleware
│   └── context.ts             # Request context factory
├── theo.config.ts             # Framework config
└── package.json
```

### The API surface

```typescript
import { defineConfig } from 'theokit'
import { defineRoute, defineAction, defineMiddleware, defineWebSocket } from 'theokit/server'
import { createSessionManager, requireAuth } from 'theokit/server'
import { theoFetch, TheoFetchError } from 'theokit/client'
```

- **`defineRoute`** — typed API routes with Zod validation, per-method handlers, status codes.
- **`defineAction`** — server actions with CSRF protection + Zod validation + automatic serialization.
- **`defineWebSocket`** — real-time endpoints as files (`server/ws/<name>.ts` → `/ws/<name>`).
- **`defineMiddleware`** — composable request middleware.
- **`createSessionManager`** — encrypted-cookie sessions (AES-256-GCM, configurable secret).
- **`requireAuth`** — type-narrowing auth guard inside handlers; throws 401 if `ctx.user` is null.
- **`theoFetch<typeof GET>`** — typed RPC from the client, inferring request and response from the route export.

### CLI

```bash
theokit dev                              # Dev server with HMR
theokit build                            # Production build
theokit build --target=vercel            # Build for Vercel
theokit build --target=cloudflare        # Build for Cloudflare Workers
theokit start                            # Production server
theokit generate route users             # Scaffold API route
theokit generate page dashboard          # Scaffold page
theokit generate action create-user      # Scaffold action
theokit generate ws notifications        # Scaffold WebSocket
theokit routes                           # List all endpoints
theokit docker                           # Generate Dockerfile
```

### Templates

```bash
npx create-theokit my-app                          # Default
npx create-theokit my-app --template=dashboard     # Nested layouts
npx create-theokit my-app --template=api-only      # API routes only
npx create-theokit my-app --template=postgres      # Drizzle ORM + PostgreSQL
```

### Built with

| Layer | Technology |
|---|---|
| Bundler + Dev Server | Vite 6 |
| UI Framework | React 19 |
| Type Validation | Zod |
| Build | tsup |
| Testing | Vitest + Playwright |

## Where this fits

TheoKit is part of the [usetheo](https://usetheo.dev) workflow.

| Step | Product | What it does |
|---|---|---|
| 1 | **TheoCode** | Autonomous coding agent. Writes the code in Plan / Code / Infra modes. CLI + Desktop. |
| 2 | **TheoCreate** | Scaffolds the project — pick TheoKit for Full-Stack AI Agents, or a multi-language stack (Go, Python, Rust, Java, Ruby, PHP, Node). |
| 3 | **TheoKit** *(this)* | The framework where the app lives. Routing, auth, real-time, deploy. |
| 4 | **Theo PaaS** | Managed deploy target. `theo deploy` → live URL in ~4 minutes. Production. |

TheoKit runs standalone. The other pillars compose with it when you want the full cycle.

## Mission

**Theo's mission.** From prompt to production. We give every developer the opinion, the infrastructure, and the speed to build and ship real AI agents and applications — with no repetitive setup, no vendor lock-in, and no manual ops.

**Theo's vision.** Be to AI agents what Vercel became to the web: the default, obvious, developer-respected path — with an open runtime end to end.

**TheoKit's vision.** The framework where agent products grow up — from prompt to a real app, real domain, real customers.

> The full identity (mission, vision, values) lives in [`/IDENTITY.md`](../IDENTITY.md).

## Status

- **Production.** Framework, CLI, four templates (default, dashboard, api-only, postgres), and four deploy targets (Docker, Vercel, Cloudflare Workers, Theo PaaS) all shipped. Public API surface stable.
- **Agent layer (`agents/` directory).** On the roadmap. The framework already ships the primitives (sessions, WebSockets, server actions, typed RPC) an agent surface needs; the dedicated `agents/` convention formalizes the wiring.
- **Documentation site.** On the roadmap. Today the README is the canonical reference; deep docs land with the dedicated site.
- **OpenAPI generation from Zod schemas.** On the roadmap.

## License

Apache-2.0 — see [LICENSE](./LICENSE).

## Next step

**Primary:** Create your app.

```bash
npx create-theokit my-app
```

**Next in the funnel:** Ship it. `theo login` + `theokit build` puts your app on a live URL via Theo PaaS in ~4 minutes.

**Tertiary:** [Docs](https://docs.usetheo.dev/theokit) · [GitHub — templates and examples](https://github.com/usetheodev/theokit)

## Community

- Discord: https://discord.usetheo.dev/
- X: https://x.com/usetheodev
- LinkedIn: https://linkedin.com/company/usetheodev
