# TheoAgents

The opinionated full-stack framework for AI-native applications. Convention over configuration.

Build a web app. When you need agents, add `agents/`. One framework, one way to do things.

## Why TheoAgents?

Building AI-powered applications today means gluing together a web framework, an agent runtime, a separate React app, manual WebSocket wiring, and making hundreds of decisions that don't matter. You spend more time on plumbing and architecture debates than on your product.

**TheoAgents is Rails for the AI era.** The framework makes the decisions so you don't have to. There's one right place for every file, one right way to define a route, one right way to connect your UI to an agent. Follow the conventions, ship fast.

You don't start with agents. You start with a web app. When you're ready for AI, the agent layer is already there — same conventions, same patterns.

## The TheoAgents Way

TheoAgents is opinionated. Like Rails, we believe convention over configuration leads to better software, faster.

**We decide:**
- Where your files go
- How routes, actions, and middleware work
- How the frontend talks to the backend
- How agents are defined, connected, and streamed
- How errors are handled and validated
- The project structure, the patterns, the conventions

**You decide:**
- Which auth solution to use (or none)
- Which database to use
- Which AI model provider to use
- Your business logic

## Quick Start

```bash
npx create-theo@latest my-app
cd my-app
theo dev
```

### Generate Code

```bash
theo generate page dashboard          # app/dashboard/page.tsx
theo generate route users             # server/routes/users.ts
theo generate action create-user      # server/actions/create-user.ts
theo generate agent customer-support  # agents/customer-support/agent.ts + page.tsx + tools.ts
```

## Project Structure

Every TheoAgents project follows the same structure. No debates, no decisions.

```
my-app/
├── app/                       # Pages — file-based routing
│   ├── layout.tsx             # Root layout
│   ├── page.tsx               # Landing page at /
│   ├── dashboard/
│   │   └── page.tsx           # /dashboard
│   └── settings/
│       └── page.tsx           # /settings
│
├── server/                    # Backend — explicit and typed
│   ├── routes/                # HTTP API routes
│   │   ├── health.ts
│   │   └── users.ts
│   ├── actions/               # Server functions called from frontend
│   │   └── create-user.ts
│   ├── middleware.ts           # Request middleware chain
│   └── context.ts             # Request context definition
│
├── agents/                    # Agent layer — add when ready
│   ├── customer-support/
│   │   ├── agent.ts           # Agent definition → auto-creates endpoint
│   │   ├── page.tsx           # Agent UI → auto-routed
│   │   ├── tools.ts           # Agent tools
│   │   └── guardrails.ts      # Safety rules
│   └── layout.tsx             # Shared agent layout
│
├── components/                # Shared React components
├── lib/                       # Shared utilities
├── public/                    # Static assets
├── theo.config.ts             # Framework configuration
└── package.json
```

## Pages

File-based routing. Create a file, get a route.

```tsx
// app/page.tsx
export default function HomePage() {
  return <h1>Welcome</h1>
}
```

```tsx
// app/dashboard/page.tsx
export default function DashboardPage() {
  return <h1>Dashboard</h1>
}
```

### Special Files

| File | Purpose |
|---|---|
| `page.tsx` | Page component. Creates a route. |
| `layout.tsx` | Wraps child pages. Persists across navigation. |
| `loading.tsx` | Loading UI shown while page loads. |
| `error.tsx` | Error boundary for the route segment. |
| `not-found.tsx` | 404 UI for the route segment. |

## Server Routes

Every route has a schema. No untyped endpoints. No optional validation. Zod validates input, TypeScript types the output.

```typescript
// server/routes/users.ts
import { defineRoute } from 'theo/server'
import { z } from 'zod'

export const GET = defineRoute({
  query: z.object({
    search: z.string().optional(),
  }),
  handler: async ({ query, ctx }) => {
    return ctx.db.user.findMany({
      where: { name: { contains: query.search } },
    })
  },
})

export const POST = defineRoute({
  body: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  handler: async ({ body, ctx }) => {
    return ctx.db.user.create({ data: body })
  },
})
```

## Server Actions

Functions called directly from the frontend. Same pattern — schema in, typed out.

```typescript
// server/actions/create-user.ts
import { defineAction } from 'theo/server'
import { z } from 'zod'

export const createUser = defineAction({
  input: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  handler: async ({ input, ctx }) => {
    return ctx.db.user.create({ data: input })
  },
})
```

```tsx
// app/page.tsx
import { createUser } from '@/server/actions/create-user'

export default function Page() {
  return (
    <form action={async (formData) => {
      'use server'
      await createUser({
        name: String(formData.get('name')),
        email: String(formData.get('email')),
      })
    }}>
      <input name="name" />
      <input name="email" />
      <button type="submit">Create</button>
    </form>
  )
}
```

## Middleware

Standard middleware chain. Runs on every request before it hits a route or action.

```typescript
// server/middleware.ts
import { defineMiddleware } from 'theo/server'

export default defineMiddleware((request, next) => {
  // Log, authenticate, rate limit — whatever your app needs
  return next(request)
})
```

## Configuration

```typescript
// theo.config.ts
import { defineConfig } from 'theo'

export default defineConfig({
  // Default model for agents (when you add them)
  defaultModel: 'claude-sonnet-4-6',
})
```

## Agents (When You're Ready)

When your app needs AI, add the `agents/` directory. Same conventions — one file, one agent, one endpoint.

```typescript
// agents/customer-support/agent.ts
import { defineAgent } from 'theo/agent'
import { tools } from './tools'

export default defineAgent({
  model: 'claude-sonnet-4-6',
  system: 'You are a customer support agent for Acme Corp...',
  tools,
  memory: true,
  stream: true,
})
```

```tsx
// agents/customer-support/page.tsx
'use client'
import { useAgent, Chat, ToolOutput } from 'theo/react'

export default function CustomerSupportPage() {
  const { messages, send, isStreaming } = useAgent()

  return (
    <Chat
      messages={messages}
      onSend={send}
      streaming={isStreaming}
      renderTool={(tool) => <ToolOutput tool={tool} />}
    />
  )
}
```

### Agent Special Files

| File | Purpose |
|---|---|
| `agent.ts` | **Required.** Defines the agent. Creates the endpoint. |
| `page.tsx` | Optional. React UI for the agent. Auto-routed. |
| `tools.ts` | Optional. Tools available to the agent. |
| `guardrails.ts` | Optional. Safety rules, input validation, output filtering. |
| `loading.tsx` | Optional. UI shown while streaming. |
| `error.tsx` | Optional. Error boundary for the agent UI. |
| `layout.tsx` | Optional. Shared layout for agents. |

### Agent UI Components

| Component | Purpose |
|---|---|
| `<Chat>` | Full chat interface with message history |
| `<ToolOutput>` | Renders tool execution results |
| `<ApprovalFlow>` | Human-in-the-loop approval UI |
| `<AgentStatus>` | Connection and streaming status indicator |
| `<MessageList>` | Standalone message renderer |
| `<ComposeBar>` | Input bar with attachments support |

## What You Get

### Web Framework
- **File-based routing** — create the file, get the route
- **Layouts and loading states** — nested, composable
- **Server routes and actions** — typed end-to-end with Zod, always validated
- **Streaming UI** — progressive rendering built in
- **Hot reload** — instant feedback during development
- **Scaffolding** — `theo generate` creates files following conventions

### Agent Layer (opt-in)
- **File-based agent routing** — create `agents/name/agent.ts`, get the endpoint
- **Streaming by default** — all agent-to-UI communication streams in real time
- **Type-safe agent-to-UI** — tool schemas generate types available in the UI
- **Agent memory** — built-in memory management, because memory is what makes an agent
- **MCP compatible** — agents can expose and consume MCP servers
- **React components** — pre-built, customizable UI for agent interactions

## CLI

```bash
theo dev                          # Start dev server with hot reload
theo build                        # Production build
theo start                        # Start production server
theo deploy                       # Deploy to Theo Cloud
theo generate <type> <name>       # Scaffold files following conventions
```

## Built With

| Layer | Technology |
|---|---|
| Bundler + Dev Server | **Vite 6** |
| Server Runtime | **Nitro** |
| UI Framework | **React** |
| Type Validation | **Zod** |
| AI Core | **Embedded in `theo`** |

## Package Structure

```
theo                     # Main framework — everything you need
create-theo              # Project scaffolding CLI
@theo/eslint-plugin      # ESLint rules for Theo conventions
```

One install. Sub-path imports:

```typescript
import { defineConfig } from 'theo'
import { defineRoute, defineAction } from 'theo/server'
import { defineAgent } from 'theo/agent'
import { useAgent, Chat } from 'theo/react'
import { defineTool } from 'theo/tools'
import { defineMiddleware } from 'theo/middleware'
```

## How It Compares

|  | Next.js | Rails | Mastra | **TheoAgents** |
|---|---|---|---|---|
| Opinionated conventions | Partial | **Yes** | No | **Yes** |
| File-based routing | Yes | Yes | No | **Yes** |
| Scaffolding CLI | No | **Yes** | No | **Yes** |
| Server routes/actions | Yes | Yes | No | **Yes** |
| Agent runtime | No | No | Yes | **Yes** |
| React UI for agents | No | No | No | **Yes** |
| Web + Agents unified | No | No | No | **Yes** |

**Rails is the opinionated web framework. Mastra is the agent framework. TheoAgents is the opinionated framework for web + agents.**

## Deploy Anywhere

TheoAgents is open source. Deploy to any Node.js runtime, or use **Theo Cloud** for managed deployments with observability, scaling, and agent analytics.

## License

MIT
