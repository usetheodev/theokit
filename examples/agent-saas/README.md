# Agent SaaS — TheoKit + TheoUI full-stack example

A real, complete TheoKit application that exercises essentially the entire framework surface in one project: auth, sessions, postgres, agent endpoints, typed client, multipart upload, server actions, WebSocket channels, middleware, custom transformer, streaming SSR, and full TheoUI integration.

This is **the** reference for "what does a real TheoKit app look like?".

## Feature inventory

Every TheoKit primitive used by this example, with the file where it lives.

| Primitive | Where |
|---|---|
| `defineConfig` | `theo.config.ts` |
| `defineRoute` (Zod query/body/params) | `server/routes/*.ts` |
| `defineAgentEndpoint` (async generator → SSE) | `server/routes/conversations/[id]/chat.ts` |
| `defineAction` (CSRF-protected server action) | `server/actions/rename-conversation.ts` |
| `defineMiddleware` (request log) | `server/middleware.ts` |
| `defineChannel` (WebSocket pub/sub) | `server/channels/notifications.ts` |
| `createSessionManager` (AES-256-GCM encrypted cookies) | `server/context.ts` |
| `assertProductionSecret` (EC-2 boot guard) | `server/context.ts` |
| `requireAuth` (per-route auth gate) | `server/routes/me.ts`, every protected route |
| `parseRequestBody` (multipart upload) | `server/routes/upload.ts` |
| `theoFetch<typeof GET>` (typed client) | `app/page.tsx` |
| `useAgentStream` (React hook over SSE) | `app/conversations/[id]/page.tsx` |
| Dynamic routes `[id]` | `app/conversations/[id]/` |
| `loading.tsx`, `error.tsx`, `not-found.tsx` | `app/loading.tsx`, `app/error.tsx`, `app/not-found.tsx` |
| Streaming SSR (`ssrStreaming: true`) | `theo.config.ts` |
| TheoUI auto-injection (`ui: { theme }`) | `theo.config.ts`, picked up by Vite plugin |
| TheoUI `<AgentTimeline>` + `<AgentComposer>` | `app/conversations/[id]/page.tsx` |
| Drizzle ORM + Postgres | `db/schema.ts`, `db/index.ts` |
| Rate limiting (`rateLimit: { windowMs, max }`) | `theo.config.ts` |
| Custom serialization (`superjson`) | `theo.config.ts` |
| Web Crypto password hashing (PBKDF2) | `server/password.ts` |

## What the app does

Sign up / sign in → land on a dashboard listing your conversations → create a conversation pinned to one of three agent personas (`researcher`, `writer`, `coder`) → click into it and chat. The agent endpoint **streams** its reply via SSE while persisting both your message and the assistant's final reply to Postgres. Side trip to `/settings` to upload an attachment (multipart) and watch a live WebSocket notification feed.

## Setup

```bash
# 1. Install
pnpm install

# 2. Provide env vars
cp .env.example .env
# Replace SECRET with a real 32+ char value:
#   echo "SECRET=$(openssl rand -hex 32)" >> .env
# Point DATABASE_URL at a running Postgres.

# 3. Push the schema
pnpm db:push

# 4. Run dev
pnpm dev
```

## Auth flow

1. **Sign up** at `/` (`POST /api/signup`) — Zod-validated body, password hashed with PBKDF2 + 100k iterations + random salt, session cookie set immediately.
2. **Sign in** (`POST /api/login`) — constant-time password verify, session cookie set.
3. **`GET /api/me`** — protected by `requireAuth(ctx.session)`. Returns 401 (not 500) for tampered cookies.
4. **Sign out** (`POST /api/logout`) — `ctx.sessions.destroySession`.

The SECRET is gated by **`assertProductionSecret`**: dev warns on the placeholder; production refuses to boot with it.

## Agent streaming flow

`POST /api/conversations/:id/chat` is built with `defineAgentEndpoint`. Steps the handler performs:

1. `requireAuth(ctx.session)` — 401 BEFORE any SSE bytes leak.
2. Look up the conversation, verify ownership.
3. Persist the user's message (`messages` table, `role: user`).
4. `yield { type: 'tool_call', name: 'persist_user_message', ... }` — visible in `<AgentTimeline>`.
5. Word-by-word stream the assistant reply (`yield { type: 'message', content }`).
6. Persist the assistant's final reply (`role: assistant`).
7. `yield { type: 'tool_result', ... }`.

The client uses `useAgentStream<{ message: string }>('/api/conversations/<id>/chat')` — handles fetch + ReadableStream + SSE chunk parsing + AbortController cleanup. When the stream completes, the page refetches the conversation so the persisted assistant reply shows up in the timeline.

Replace the `mockReply` generator in `server/routes/conversations/[id]/chat.ts` with an OpenAI/Anthropic streaming call. The rest of the flow stays the same.

## Typed client

`app/page.tsx` consumes the API via `theoFetch<typeof GET>`:

```ts
import type { GET as ListConversations } from '../server/routes/conversations/index.js'
const convs = await theoFetch<typeof ListConversations>('/api/conversations', {})
// convs is `Conversation[]`, inferred from the route handler's return type.
// The `query.kind` parameter is typed as `'researcher' | 'writer' | 'coder' | undefined`.
```

No `as` casts. No manual `interface User { ... }` duplicated on the client.

## File upload

`POST /api/upload` uses `parseRequestBody` to consume `multipart/form-data`. The settings page submits a real HTML `<form encType="multipart/form-data">`. Configured limit: 5 MB per file (`upload: { maxFileSize, maxFiles }` in `theo.config.ts`).

## Real-time notifications

`/channels/notifications/<userId>` is a WebSocket channel built with `defineChannel`. The settings page subscribes; any server-side code can call `broadcast(room, event)` (exported from the channel module) to push events to all connected clients in that room. Use case: notify the user when a long-running agent task completes.

## Server action: rename

`server/actions/rename-conversation.ts` demonstrates `defineAction` — Zod-validated input, runs server-side with CSRF protection handled by the framework, and returns the updated row to the caller.

## Rate limiting

`rateLimit: { windowMs: 60_000, max: 60 }` in `theo.config.ts`. The framework applies this uniformly to `/api/*` routes. Exceeding it returns 429 with `Retry-After`.

## Structured logging

`server/middleware.ts` emits `req.start` and `req.end` JSON log lines for every request. The framework itself emits its own request log; this middleware shows the pattern for adding domain-specific log lines.

## Boundary

`app/` never imports server runtime values — only type-only imports for typed client inference (`import type { GET } from '../server/routes/users.js'`). Verified by the project's boundary-check hook.

## Layout

```
agent-saas/
├── theo.config.ts                         # All framework knobs in one file
├── drizzle.config.ts                      # Drizzle Kit config
├── db/
│   ├── schema.ts                          # users + conversations + messages + attachments
│   └── index.ts                           # drizzle() postgres connection
├── server/
│   ├── context.ts                         # Sessions + DB + EC-2 secret guard
│   ├── middleware.ts                      # Request log
│   ├── password.ts                        # PBKDF2 + Web Crypto
│   ├── actions/
│   │   └── rename-conversation.ts
│   ├── channels/
│   │   └── notifications.ts
│   └── routes/
│       ├── health.ts
│       ├── signup.ts
│       ├── login.ts
│       ├── logout.ts
│       ├── me.ts
│       ├── upload.ts
│       └── conversations/
│           ├── index.ts                   # GET (list) + POST (create)
│           └── [id]/
│               ├── index.ts               # GET (detail) + DELETE
│               └── chat.ts                # defineAgentEndpoint
└── app/
    ├── layout.tsx                         # Root layout
    ├── loading.tsx                        # Top-level Suspense fallback
    ├── error.tsx                          # Error boundary
    ├── not-found.tsx                      # 404
    ├── page.tsx                           # Dashboard (signin/up + conversation list)
    ├── settings/
    │   └── page.tsx                       # Upload + WebSocket notifications
    └── conversations/
        └── [id]/
            └── page.tsx                   # Chat surface with TheoUI + useAgentStream
```

## Run the end-to-end test

```bash
npx vitest run tests/integration/example-agent-saas.test.ts
```

The integration test spawns the dev server, signs up a user, creates a conversation, exercises the agent endpoint (real SSE stream), and validates that messages were persisted. No mocks of the framework itself — only the database connection is mocked through a test schema.
