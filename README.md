# TheoKit

**Build the app your agent lives in.** Routing, auth, real-time, deploy — wired.

Part of the [usetheo](https://usetheo.dev) family of products. TheoKit is the **web framework** layer — independent and self-contained, with **TheoCloud** as its principal deploy target. See [the Ecosystem section](#ecosystem) for how it relates to its siblings.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](./LICENSE)
[![Status](https://img.shields.io/badge/status-production-success?style=flat-square)](#status)

## Quick Start

```bash
npx create-theokit my-app
cd my-app
theokit dev
```

Want a polyglot project (Go, Python, Rust, Java, Ruby, PHP, Node)? Use **TheoCreate**:

```bash
npm create theo@latest
```

## Your first agent in 5 minutes

Goal: from `npx` to a chat thread powered by your own LLM API key.

### Step 1 — Scaffold (30 s)

```bash
npx create-theokit my-app
cd my-app
```

The default scaffold already ships an **agent surface**: a `ChatThread` rendered with [`@usetheo/ui`](https://npmjs.com/package/@usetheo/ui), an `/api/chat` endpoint, and `useAgentStream` wired to it. With Node ≥ 22 installed, you can boot it now (`pnpm dev`) — the mock at `server/routes/chat.ts` will echo your messages.

### Step 2 — Install the agent SDK (15 s)

```bash
pnpm add @usetheo/sdk
```

The SDK ships `Agent.prompt` / `Agent.send` / `defineTool` and routes to providers by model id (`claude-*` for Anthropic, `gpt-*` for other providers via the SDK, `ollama/*` for local). It is the canonical way TheoKit talks to LLMs.

### Step 3 — Add your API key (15 s)

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
```

(Get a key at https://console.anthropic.com/settings/keys.)

### Step 4 — Replace the mock (2 min)

Open `server/routes/chat.ts` and swap the body of the handler for this **6-line essence**:

```typescript
import { Agent } from '@usetheo/sdk'
import { defineAgentEndpoint, type AgentEvent } from 'theokit/server'

export const POST = defineAgentEndpoint({
  async *handler({ body }): AsyncGenerator<AgentEvent> {
    const { message = '' } = (body ?? {}) as { message?: string }
    try {
      const result = await Agent.prompt(message, {
        apiKey: process.env.ANTHROPIC_API_KEY!,
        model: { id: 'claude-sonnet-4-5-20250929' },
        throwOnError: true,
      })
      yield { type: 'message', content: result.result ?? '' }
    } catch (err) {
      yield { type: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  },
})
```

Five things to notice:
- `Agent.prompt(message, options)` is the SDK's one-shot helper — create → send → wait → dispose under the hood.
- The model id (`claude-sonnet-4-5-20250929`) picks the provider via the SDK. Use a `gpt-*` id for other providers, `ollama/llama3.2:3b` for local — full matrix in [`@usetheo/sdk` docs](https://www.npmjs.com/package/@usetheo/sdk).
- **`throwOnError: true`** turns provider rejections (401, rate limit, etc.) into thrown `AgentRunError` — caught in one place, surfaced via `yield { type: 'error' }`. No silent error swallowing.
- `yield { type: 'error', ... }` surfaces in the chat thread as a red `AgentErrorCard` (already wired by the default scaffold).
- `useAgentStream` on the client already attaches `X-Theo-Action: 1` so the framework's CSRF gate accepts your POST.

### Step 5 — Run it (30 s)

```bash
pnpm dev
```

Open http://localhost:3000, type a message, hit Send. The chat thread renders the SDK's reply in real time. If you see the error card with "Anthropic API error: auth_failed", your `.env` key is wrong — fix it, restart `pnpm dev`.

### What you just got, mapped

| Capability | Where it lives |
|---|---|
| File-based routing → `app/page.tsx` is `/` | TheoKit (`app/**`) |
| Chat UI (`ChatThread`, `ChatMessage`, `ChatComposer`, `AgentErrorCard`) | `@usetheo/ui` |
| Agent endpoint primitive (`defineAgentEndpoint`, SSE wire) | TheoKit (`theokit/server`) |
| Client hook (`useAgentStream`) with auto CSRF + cleanup | TheoKit (`theokit/client`) |
| LLM call (`Agent.prompt`, provider routing, error model) | `@usetheo/sdk` |
| Secure session, deploy adapters, type-safe routes | TheoKit (all-in-one) |

### Next steps

- **Streaming tokens** — `Agent.prompt` returns the full answer at once. For token-by-token streaming, use `Agent.create` + `agent.send(...)` + iterate `run.stream()`. The TheoKit-side `defineAgentTool` + token-streaming helper are on the roadmap.
- **Tool calling** — pass `tools: [defineTool({...})]` to `Agent.create` and the agent can call your functions. The TheoKit `defineAgentTool` wrapper (roadmap) collapses the `tool_call → execute → tool_result` SSE plumbing into a single declaration.
- **Conversation memory** — switch from `Agent.prompt` (one-shot) to `Agent.getOrCreate(sessionId)` so the conversation persists across requests. The TheoKit `createConversationHistory` primitive (roadmap) bridges this with the framework's session cookie.

## What You Get

- **Routes are just files** — `app/page.tsx` → `/`. Layouts, errors, loading, not-found — no config.
- **APIs that validate themselves** — schemas in, types out, end-to-end on server and client.
- **Server actions without plumbing** — CSRF, validation, serialization handled.
- **Backend calls that compile** — import the route type, get request and response inferred.
- **Sessions that just work** — encrypted cookies, one helper to require a logged-in user. For OAuth and 2FA, see [`docs/concepts/auth-providers.md`](docs/concepts/auth-providers.md).
- **Per-request context, no globals** — plug your DB and user once, reach them anywhere.
- **WebSocket as a file** — drop a file in `server/ws/`, it's a real-time endpoint.
- **Server rendering on demand** — opt in with one flag.
- **Rate limiting built in** — off by default, one config away.
- **Generators that scaffold** — `theokit generate route users`, done.
- **Deploys anywhere, lands on TheoCloud** — 8 adapters shipped today (Node, Vercel, Cloudflare Workers, AWS Lambda, Bun, Deno Deploy, Netlify, Static) plus Docker via `theokit docker`. **TheoCloud** is the principal target — managed runtime with hosted Postgres, Redis, secret rotation, audit log; pluggable interfaces (`JobBackend`, `UsageStorageAdapter`) already designed for it. TheoCloud adapter ships with the next milestone.
- **Real starting templates** — default, dashboard, API-only, Postgres.

## What you'd ship

- **Customer-facing agent dashboard.** The surface where your users talk to the agent you built. Real auth, real sessions, real domain.
- **Real-time agent control panel.** Stream tool calls and step events into the UI as they happen. WebSocket primitives + typed routes do the wiring; bring any SDK underneath.
- **Multi-tenant agent SaaS.** Per-user sessions, per-request context, isolated state. Drizzle + Postgres template included.
- **Agent admin tool with audit log.** Staff-only routes guarded by `requireAuth`, audit trail persisted to your DB.
- **Webhook + messaging gateway.** Receive webhooks, fan them out to your agent, ack with typed responses.
- **B2B agent product.** Onboarding, billing webhook, dashboard — deployable to Vercel or Cloudflare Workers in one command.

## Why TheoKit

**Hermes** picked your Telegram. **Cursor** picked your IDE. **TheoCode** picked your terminal. The agent your customers will pay for needs something different — a real domain, real auth, real WebSockets, a real product. The agent ecosystem has two halves: frameworks for **orchestrating** agents, and frameworks for **shipping apps**. Most teams build the agent, then realize they need an app — and stitch six libraries together. TheoKit is the app, with batteries for the agent built in.

| Capability | TheoKit | Mastra | Vercel AI SDK + Next.js | Roll your own |
|---|---|---|---|---|
| **Frame** | Build the app your agent lives in | Orchestrate the agent | Wrap LLM calls in a Next.js app | Pick six libs, glue them |
| File-based routing | ✓ | DIY | Next.js | Next.js |
| Typed RPC client (`theoFetch<typeof GET>`) | ✓ | DIY | DIY | DIY |
| Server actions with CSRF + Zod | ✓ | DIY | Partial (Next.js Actions) | DIY |
| Encrypted sessions, one helper | ✓ (AES-256-GCM, `requireAuth`) | DIY | DIY | DIY |
| WebSocket as a file | ✓ | DIY | DIY (needs separate WS server) | DIY |
| Deploy targets out of the box | TheoCloud (principal, adapter shipping next) + 8 in-tree adapters (Node · Vercel · Cloudflare Workers · AWS Lambda · Bun · Deno Deploy · Netlify · Static) | DIY | Vercel | DIY |
| Templates with DB wired | ✓ (postgres, dashboard, api-only) | Limited | DIY | DIY |
| CLI scaffolding (`theokit generate`) | ✓ | Limited | Next.js (partial) | DIY |
| License | Apache-2.0 | Open | Open (MIT SDK) | N/A |

Mastra builds the agent. TheoKit ships the product around it. You can use both.

---

## How it works

The rest of this README is the technical surface. Vocabulary shifts here on purpose — `defineRoute`, `defineWebSocket`, `theoFetch`, and friends earn their keep below. If you came for the pitch, the bullets above are enough.

## Project Structure

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
│   ├── middleware.ts           # Request middleware
│   └── context.ts             # Request context factory
├── theo.config.ts              # Framework config
└── package.json
```

## Server Routes

```typescript
// server/routes/users.ts
import { defineRoute } from 'theokit/server'
import { z } from 'zod'

export const GET = defineRoute({
  query: z.object({ search: z.string().optional() }),
  handler: ({ query }) => {
    return { users: [{ name: 'Alice' }] }
  },
})

export const POST = defineRoute({
  body: z.object({ name: z.string(), email: z.string().email() }),
  status: 201,
  handler: ({ body }) => {
    return { id: crypto.randomUUID(), ...body }
  },
})
```

## Typed Client

```typescript
import { theoFetch } from 'theokit/client'
import type { GET } from '../../server/routes/users'

const data = await theoFetch<typeof GET>('/api/users', {
  query: { search: 'alice' }
})
// data is typed as { users: { name: string }[] }
```

## Auth

```typescript
import { createSessionManager, requireAuth } from 'theokit/server'

const auth = createSessionManager<{ userId: string }>({
  secret: process.env.SESSION_SECRET!, // min 32 chars
})

export const GET = defineRoute({
  handler: ({ ctx }) => {
    requireAuth(ctx.user) // throws 401 if null, narrows type
    return { userId: ctx.user.userId }
  },
})
```

## WebSocket

```typescript
// server/ws/chat.ts → ws://localhost:3000/ws/chat
import { defineWebSocket } from 'theokit/server'

export default defineWebSocket({
  onMessage(ws, data) {
    ws.send(`echo: ${data}`)
  },
})
```

## Streaming SSR

Opt-in. Flag in `theo.config.ts`:

```typescript
import { defineConfig } from 'theokit'

export default defineConfig({
  ssr: true,
  ssrStreaming: true,
})
```

When enabled, `theokit start` uses `renderToPipeableStream` and flushes the React shell as soon as it is ready (`onShellReady`). Suspense boundaries stream progressively. The response uses `Transfer-Encoding: chunked`.

**Suspense boundaries are required for streaming to deliver value** — without them the renderer still has to wait for the full tree, and you get no progressive HTML, only the chunked header overhead.

```tsx
// app/page.tsx
import { Suspense } from 'react'

export default function Page() {
  return (
    <main>
      <h1>Stream me</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <SlowSection />
      </Suspense>
    </main>
  )
}
```

Client disconnect handling: TheoKit wires `req.on('close')` to an `AbortController` and propagates the abort to the React stream. Plugins receive `ctx.signal` in their hooks — pass it to your DB/fetch calls so they cancel when the browser tab closes.

Status-code semantics follow React 19: errors that happen **before** the shell flushes produce a synchronous 500. Errors **inside** a Suspense boundary after the shell has flushed stream a `fallback` and the response stays 200 — make sure your CDN does not cache that response as success when the user-visible content is an error fallback.

## CLI

```bash
theokit dev                              # Dev server with HMR
theokit build                            # Production build
theokit build --target=vercel            # Build for Vercel
theokit build --target=cloudflare        # Build for Cloudflare Workers
theokit build --target=bun                # Build for Bun runtime
theokit build --target=deno-deploy        # Build for Deno Deploy
theokit build --target=netlify            # Build for Netlify Functions
theokit build --target=aws-lambda         # Build for AWS Lambda (API Gateway v2)
theokit build --target=static             # Pre-render to static HTML
theokit start                            # Production server (Node)
theokit check                            # Run typecheck + scan + (optional) eslint
theokit check --upgrade-readiness 0.3    # Static scan for 0.3.0 breakage — see docs/migration/0.2-to-0.3.md
theokit add bun                          # Install a known adapter/plugin (whitelist)
theokit info                             # Print runtime + project diagnostic
theokit generate route users             # Scaffold API route
theokit generate page dashboard          # Scaffold page
theokit generate action create-user      # Scaffold action
theokit generate ws notifications        # Scaffold WebSocket
theokit routes                           # List all endpoints
theokit docker                           # Generate Dockerfile
```

## Plugins (server runtime)

`defineTheoPlugin` lets you hook into every request without touching individual routes. Four lifecycle hooks: `onRequest`, `preHandler`, `onResponse`, `onError`. Plugin can also `decorateRequest<T>(key, value)` to inject typed properties onto `ctx`.

```typescript
// plugins/request-id-echo.ts
import { defineTheoPlugin } from 'theokit/server'

export const requestIdEcho = defineTheoPlugin({
  name: 'request-id-echo',
  register(app) {
    app.decorateRequest('startedAt', Date.now())

    app.addHook('onRequest', (ctx) => {
      // Short-circuit by ending the response here (e.g. auth gate).
    })
    app.addHook('onResponse', (ctx) => {
      ctx.response.setHeader('x-request-id-echo', ctx.requestId)
    })
    app.addHook('onError', (ctx) => {
      console.error(`[plugin] request ${ctx.requestId} failed:`, ctx.error)
    })
  },
})
```

Wire it via `theo.config.ts > plugins`:

```typescript
import { defineConfig } from 'theokit'
import { requestIdEcho } from './plugins/request-id-echo.js'

export default defineConfig({
  plugins: [requestIdEcho],
})
```

Hooks fire in registration order. `decorateRequest` collisions throw `DuplicateDecorationError`. `onResponse` thrown in the error path is guarded against `onError → onResponse → onError` recursion.

## Integrations (build-time)

`defineTheoIntegration` is the build/dev counterpart — third parties plug into the Vite lifecycle to register routes, virtual modules, or Vite plugins without forking.

```typescript
// integrations/my-observability.ts
import { defineTheoIntegration } from 'theokit/vite-plugin'

export const observability = defineTheoIntegration({
  name: 'observability',
  hooks: {
    'theo:config:setup': (ctx) => {
      ctx.addRoute('/metrics', async () => new Response('metrics_total 1'))
      ctx.addVirtualModule(
        'virtual:integration:observability/info',
        'export const info = { version: "0.1" }',
      )
    },
  },
})
```

Two guards enforced:

- `addVirtualModule(id, ...)` requires `id` to start with `virtual:integration:<name>/` — prevents collisions with `/@theo/*` internals and other integrations.
- `addRoute(path, ...)` throws `IntegrationRouteCollisionError` when `path` already exists in `server/routes/` or in another integration's routes — no silent override.

## Templates

```bash
npx create-theokit my-app                        # Default
npx create-theokit my-app --template=dashboard    # Nested layouts
npx create-theokit my-app --template=api-only     # API routes only
npx create-theokit my-app --template=postgres     # Drizzle ORM + PostgreSQL
```

## Configuration

```typescript
// theo.config.ts
import { defineConfig } from 'theokit'

export default defineConfig({
  port: 3000,
  ssr: false,
  rateLimit: { windowMs: 60_000, max: 100 },
})
```

## Imports

```typescript
import { defineConfig } from 'theokit'
import { defineRoute, defineAction, defineMiddleware } from 'theokit/server'
import { createSessionManager, requireAuth } from 'theokit/server'
import { defineWebSocket } from 'theokit/server'
import { theoFetch, TheoFetchError } from 'theokit/client'
```

## Built With

| Layer | Technology |
|---|---|
| Bundler + Dev Server | Vite 6 |
| UI Framework | React 19 |
| Type Validation | Zod |
| Build | tsup |
| Testing | Vitest + Playwright |

## Ecosystem

TheoKit sits inside the [`usetheo`](https://usetheo.dev) product family. It is **self-contained** for any deploy (builds, ships, and runs without any sibling on any of the 8 in-tree adapters), and **TheoCloud is its principal strategic target** — the hosted product where TheoKit apps are designed to run in production. The relationships below are stated literally, against the code.

| Sibling | Repo | How TheoKit consumes it | Status |
|---------|------|------------------------|:------:|
| **`@usetheo/sdk`** — agent runtime (`Agent.create`, `Agent.send`, `Run.stream`, provider abstraction, tool runtime, conversation persistence) | `theokit-sdk/packages/sdk` | **Workspace dep** via `pnpm-workspace.yaml` → `../theokit-sdk/packages/sdk`. Six framework files consume it (`server/agent/*`, `server/define/define-agent-tool.ts`). Locked premise in `CLAUDE.md` — not "evaluate vs alternatives". | ✅ Wired |
| **`@usetheo/ui`** — React component library (chat surface, theme system, design tokens) | `theo-ui/` | **npm dep** via published `@usetheo/ui` package (`^0.11.0-next.0`). Framework auto-injects `<TheoUIProvider>` via `theokit/vite-plugin` when the package is detected. Ten+ files consume it. **Not** linked as a workspace package — local edits to `theo-ui/` require a publish to land in TheoKit. | ✅ Wired (npm) |
| **`theo` → TheoCloud** — managed platform / control plane (Go-based: K8s operators, Helm charts, hosted Postgres + Redis, secret rotation, audit log persistence, distributed rate-limiter store) | `theo/` | **The principal deploy target.** The `theo-cloud` deploy adapter does not exist yet (`packages/theo/src/adapters/theo-cloud.ts` is the next milestone after 0.4.0). **However:** TheoKit's pluggable interfaces (`JobBackend`, `UsageStorageAdapter`, `RateLimitStorageAdapter`, structured logging to stdout) were designed specifically so TheoCloud "slots in" without modifying framework code — per `docs/adr/0002-job-backend-interface-neutral-contract.md`. TheoCloud-side issues #58, #59, #60 interlock with TheoKit's security primitives. | 🟡 **Primary target — adapter on roadmap, interfaces ready** |

**What this means in practice:**

- TheoKit is **deploy-portable** today: choose any of the 8 in-tree adapters (Node, Vercel, Cloudflare Workers, AWS Lambda, Bun, Deno Deploy, Netlify, Static) and ship.
- The **TheoCloud adapter ships next** — it's the strategic target, with the framework's pluggable interfaces already designed for it. Other adapters remain first-class (you're not locked into TheoCloud).
- The agent runtime (`@usetheo/sdk`) is required for any agent feature — if you only need routing/auth/SSR/jobs, you don't have to use it.
- The UI library (`@usetheo/ui`) is opt-in but the default scaffold bundles it; if you swap it out, the framework's auto-injection becomes a no-op.
- A user can clone TheoKit and run `pnpm install && pnpm dev` without cloning the `theo` (Go) sibling — non-TheoCloud paths are fully self-contained.

## Status

Honest claims only.

- **Production for indie + small-team usage.** Framework, CLI, five templates (default, dashboard, api-only, postgres, saas), and 8 deploy adapters (Node, Vercel, Cloudflare Workers, AWS Lambda, Bun, Deno Deploy, Netlify, Static) shipped. Public API surface stable. **Real-prod validation pending** on Vercel + Cloudflare adapters (smoke tests structural; first real-deploy observation window is the next 0.4.0 task).
- **TheoCloud (principal target) adapter.** Ships after 0.4.0 — the strategic next milestone. Framework hooks (`JobBackend`, `UsageStorageAdapter`, `RateLimitStorageAdapter` interfaces, structured logging) are already in place to slot it in.
- **Agent layer (`agents/` directory).** On the roadmap. The framework already ships the primitives (sessions, WebSockets, server actions, typed RPC) an agent surface needs; the dedicated `agents/` convention formalizes the wiring.
- **Documentation site.** On the roadmap. Today the README is the canonical reference; deep docs land with the dedicated site.
- **OpenAPI generation from Zod schemas.** On the roadmap.
- **More templates (auth-basic, stripe-saas).** On the roadmap.

## License

Apache-2.0 — see [LICENSE](LICENSE).

## Community

- Discord: https://discord.usetheo.dev/
- X: https://x.com/usetheodev
- LinkedIn: https://linkedin.com/company/usetheodev
