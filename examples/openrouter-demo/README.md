# TheoKit + OpenRouter Demo

**The official demo.** A full-stack chat agent in 200 lines.

A user types a message → the agent calls OpenRouter → tools execute server-side → the response streams back via SSE. Conversation history persists across reloads.

## 5 minutes to first agent

```bash
# 1. Install
pnpm install

# 2. Get a free API key at https://openrouter.ai/keys
cp .env.example .env
# Edit .env and set OPENROUTER_API_KEY=sk-or-v1-...

# 3. Run
pnpm dev
# → http://localhost:3000
```

That's it. Open the URL, type "what time is it?" → the agent calls `current_time` and answers.

## What's running

```
┌─────────────────┐                  ┌──────────────────┐
│  Browser        │                  │  Server          │
│  app/page.tsx   │   POST /api/chat │  server/routes/  │
│  useAgentStream │ ───────────────▶ │    chat.ts       │
│  ChatThread     │   X-Theo-Action  │                  │
│  ToolCallCard   │                  │  defineAgentEnd. │
│                 │ ◀────────────────│  + 3 tools       │
└─────────────────┘   SSE chunks     └──────────────────┘
                                              │
                                              ▼
                                     ┌──────────────────┐
                                     │  @usetheo/sdk    │
                                     │  Agent.send()    │
                                     │  Run.stream()    │
                                     └──────────────────┘
                                              │
                                              ▼
                                     ┌──────────────────┐
                                     │  OpenRouter API  │
                                     │  gpt-4o-mini     │
                                     └──────────────────┘
```

## File map

```
openrouter-demo/
├── app/
│   ├── layout.tsx        — TopNav + theme switcher (TheoUI)
│   ├── page.tsx          — Chat UI: ChatThread, ChatComposer, ToolCallCard
│   └── globals.css       — Tailwind v4 + TheoUI tokens
├── server/
│   ├── routes/
│   │   ├── chat.ts       — THE wire: defineAgentEndpoint + Agent.send + 3 tools
│   │   └── health.ts     — defineRoute smoke
│   └── tools/
│       ├── current-time.ts  — defineAgentTool — returns ISO timestamp
│       ├── calculator.ts    — defineAgentTool — safe arithmetic parser (zero eval)
│       └── web-fetch.ts     — defineAgentTool — fetch with hostname allowlist
├── theo.config.ts        — SSR + CSP (off in dev, enforce in prod)
├── index.html            — Vite entry shell
├── .env.example          — OPENROUTER_API_KEY, MODEL_ID
└── package.json          — theokit + @usetheo/sdk + @usetheo/ui
```

## The wire — line by line

**`server/routes/chat.ts`** is the entire integration:

```ts
import {
  createConversationHistory,   // bridges cookie ↔ Agent.getOrCreate
  defineAgentEndpoint,         // SSE wire
  streamAgentRun,              // SDKMessage → AgentEvent
} from 'theokit/server'
import { tools } from '../tools/index.js'

export const POST = defineAgentEndpoint({
  async *handler({ body, request, cookieHeaders }) {
    const { message } = body as { message: string }
    const apiKey = process.env.OPENROUTER_API_KEY

    // Cookie → conversationId (or generate if first turn)
    const probedId = readCookie(request, 'theo_conversation')
                   ?? crypto.randomUUID()

    // Get-or-create agent. SDK auto-persists turns in
    // .theokit/agents/<id>/messages.jsonl
    const { agent } = await createConversationHistory({
      request,
      response: { headers: cookieHeaders },   // ← Set-Cookie lands in SSE response
      agentId: probedId,
      options: {
        apiKey,
        model: { id: 'openrouter/openai/gpt-4o-mini' },
        tools,                                 // ← the 3 defineAgentTool exports
      },
    })

    const run = await agent.send(message)
    yield* streamAgentRun(run)                 // ← tokens/tool_call/tool_result events
  },
})
```

That's the whole integration. Five primitives. ~30 lines.

## The tools — `defineAgentTool` pattern

Each tool is a Zod schema + handler. The TheoKit sugar wraps it as a SDK `CustomTool`:

```ts
// server/tools/current-time.ts
import { z } from 'zod'
import { defineAgentTool } from 'theokit/server'

export const currentTime = defineAgentTool({
  name: 'current_time',
  description: 'Get the current ISO 8601 timestamp on the server.',
  inputSchema: z.object({}),         // ← Zod = type-safe + runtime-validated
  handler: () => new Date().toISOString(),
})
```

The agent decides when to call a tool, the SDK invokes the handler, the result flows back as a `tool_result` SSE event, the UI renders it as a `ToolCallCard`. Zero plumbing on your side.

## Conversation history — zero config

Reload the browser → the same conversation continues. Why?

1. First POST `/api/chat` → no `theo_conversation` cookie → server generates a UUID → SDK creates a fresh agent → Set-Cookie response
2. Browser keeps the cookie
3. Next POST → cookie sent → server reuses the cookie's `agentId` → SDK calls `Agent.getOrCreate(id)` → conversation continues
4. SDK persists every turn to `.theokit/agents/<id>/messages.jsonl`

No DB. No session table. Just a UUID cookie + jsonl per conversation. Replace with a hosted store in production via SDK adapter.

## Customizing

### Different model

Set `MODEL_ID` in `.env`:

```bash
MODEL_ID=openrouter/anthropic/claude-haiku-4.5      # Anthropic family, ~5x cost
MODEL_ID=openrouter/google/gemini-2.0-flash-001     # cheapest tier
MODEL_ID=openrouter/anthropic/claude-sonnet-4.5     # premium
MODEL_ID=openrouter/meta-llama/llama-3.3-70b-instruct  # open weights
```

OpenRouter handles 100+ models with one API key. See https://openrouter.ai/models.

### Add a tool

1. Create `server/tools/my-tool.ts`:

```ts
import { z } from 'zod'
import { defineAgentTool } from 'theokit/server'

export const myTool = defineAgentTool({
  name: 'my_tool',
  description: 'What this tool does (the LLM reads this!).',
  inputSchema: z.object({ query: z.string() }),
  handler: async ({ query }) => {
    return { answer: `you asked: ${query}` }
  },
})
```

2. Export from `server/tools/index.ts`:

```ts
export const tools = [currentTime, calculator, webFetch, myTool]
```

That's it. The next chat turn picks it up.

### Add an SSRF-safe hostname

`web-fetch.ts` enforces a hostname allowlist by default. To allow another host, add it to `ALLOWED_HOSTS` — the dot-boundary check (`host === allowed || host.endsWith('.' + allowed)`) prevents subdomain bypass.

## Production checklist

- [ ] `OPENROUTER_API_KEY` set as platform secret (never in source)
- [ ] `SESSION_SECRET` set (generate: `openssl rand -hex 32`)
- [ ] CSP enforce confirmed (`theo.config.ts` flips on `NODE_ENV=production`)
- [ ] CSRF strict (set `security.csrf: 'strict'` once telemetry is clean — see TheoKit 0.3.0 cutover)
- [ ] `web_fetch` allowlist matches your domain needs (drop hosts you don't need)
- [ ] Conversation files persisted to durable storage (default: `.theokit/agents/`)
- [ ] Rate limit on `/api/chat` (per-IP and per-session) — see `theokit/server` `createRateLimiter`

## Deploy

```bash
# Build for any target — adapter detects from --target flag
pnpm theokit build --target=vercel       # → .vercel/output/
pnpm theokit build --target=cloudflare   # → wrangler.toml + workers/
pnpm theokit build --target=node         # → .theo/server + start with `theokit start`
```

OpenRouter is reachable from every TheoKit deploy target (no IP allowlist required). SSE works on Vercel Edge, Cloudflare Workers, Node, Bun, Deno Deploy.

## Stack

| Layer | What | Why |
|-------|------|-----|
| Framework | `theokit` | Routing, SSR, SSE, CSRF, CSP, build |
| Agent runtime | `@usetheo/sdk` | `Agent.send`, `Run.stream`, providers, tool runtime, persistence |
| UI | `@usetheo/ui` | Pre-built chat surface (Thread, Composer, ToolCard, ErrorCard) |
| LLM | OpenRouter | 100+ models, one key, $1 monthly budget covers prototyping |
| Validation | Zod | Schema for tool inputs (runtime + types from one source) |

## Learn more

- TheoKit docs: ../../README.md
- SDK reference: ../../../theokit-sdk/packages/sdk/docs.md (if cloned)
- OpenRouter models: https://openrouter.ai/models
- Full-stack showcase (8 tools, Telegram bot, jobs, crons): `../full-stack-agent/`
