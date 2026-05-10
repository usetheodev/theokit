# TheoKit

The opinionated full-stack TypeScript framework. Convention over configuration.

## Quick Start

```bash
npx create-theokit my-app
cd my-app
theokit dev
```

## What You Get

- **File-based routing** — `app/page.tsx` → route. Layouts, loading, error, not-found.
- **Typed API routes** — `defineRoute` with Zod validation, automatic type inference.
- **Server actions** — `defineAction` with CSRF protection.
- **Typed client** — `theoFetch<typeof GET>()` infers response/query/body types.
- **Auth** — Encrypted sessions (AES-256-GCM), `requireAuth()` with type narrowing.
- **Middleware + Context** — `defineMiddleware`, `createContext()`, `ctx.db`/`ctx.user`.
- **WebSocket** — `defineWebSocket` with file-based routing (`server/ws/`).
- **SSR** — Opt-in with `ssr: true`. `renderToPipeableStream` + `hydrateRoot`.
- **Rate limiting** — Built-in, opt-in via config.
- **Generators** — `theokit generate route/action/page/ws`.
- **Deploy** — Docker, Vercel, Cloudflare Workers.
- **4 templates** — default, dashboard, api-only, postgres (Drizzle ORM).

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

## CLI

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

## Roadmap

- [ ] OpenAPI generation from Zod schemas
- [ ] Agent layer (`agents/` directory)
- [ ] More templates (auth-basic, stripe-saas)
- [ ] Documentation site

## License

MIT
