# Full-Stack Agent — TheoKit canonical demo

> One complete reference example exercising every Phase B primitive of TheoKit
> (`Agent.create` + `defineAgentTool` + `streamAgentRun` + `createConversationHistory`)
> on the locked stack: **TheoKit + @usetheo/sdk + @usetheo/ui + @usetheo/gateway-telegram**.
> Same agent answers in a web UI AND a Telegram bot. Provider is **OpenRouter**
> so any model (Claude, GPT-4, Llama, Mistral) works with one key.

## What you get

- **Chat surface in the browser** — TheoUI components: ChatThread, ChatComposer,
  ToolCallCard, AgentErrorCard, EmptyState, QuickActionChips, ContextWindowBar,
  CommandPalette.
- **8 tools** the agent can call:
  - `current_time` — server-side ISO timestamp.
  - `calculator` — safe arithmetic (recursive-descent parser, no `eval`).
  - `random_number` — int in `[min, max]`.
  - `web_fetch` — HTTP GET with hostname allowlist (SSRF-safe).
  - `web_search` — DuckDuckGo HTML scrape (no API key).
  - `workspace_read` — read from sandbox `.theokit/workspace/<conversationId>/`.
  - `workspace_write` — write to the same sandbox.
  - `echo` — return input verbatim.
- **Conversation continuity** — `theo_conversation` cookie persists the
  conversation across page reloads. SDK auto-persists turns in
  `.theokit/agents/<id>/messages.jsonl`.
- **Telegram bot** — same Node process, long-polling. Each Telegram chat id
  maps to its own agent (`tg-<chatId>`), so each user has independent history.
- **Production-ready** — `theokit build && theokit start` ships SSR + nonce-bearing
  CSP + Cache-Control: private, no-store.

## Run (web only)

```bash
git clone <repo>
cd theokit/examples/full-stack-agent
pnpm install

cp .env.example .env
# Edit .env: set OPENROUTER_API_KEY=sk-or-v1-... (get one at https://openrouter.ai)

pnpm dev
# Open http://localhost:<port> — chat surface ready.
```

Ask "What time is it on the server?" → see a `ToolCallCard` with `current_time`
firing and the result rendered.

## Run (Telegram bot too)

```bash
# In addition to OPENROUTER_API_KEY in .env, get a bot token:
#   1. DM @BotFather on Telegram
#   2. /newbot, follow prompts
#   3. Copy the token into .env: TELEGRAM_BOT_TOKEN=...

# In one terminal:
pnpm dev
# In another terminal:
pnpm bot
# DM your bot — same tools, same model, but its own conversation history.
```

## Run (production)

```bash
pnpm build
pnpm start
# Real SSR with full security headers + nonce-matched hydration.
```

Verify: `curl -i http://localhost:<port>/` shows:
- `Content-Security-Policy: ...; script-src 'self' 'nonce-X'; ...`
- `Cache-Control: private, no-store`
- Body contains `<script nonce="X">window.__staticRouterHydrationData = ...</script>`
  where the X matches the CSP nonce.

## Model catalog (override via `MODEL_ID` env)

The example defaults to **`openai/gpt-4o-mini`** — the canonical cheap + tool-calling-capable model that real production agents use. Override via `MODEL_ID` in `.env` to test quality across providers.

| `MODEL_ID` | Provider | Tool calling | Cost per MTok (in/out) | Notes |
|---|---|---|---|---|
| `openrouter/openai/gpt-4o-mini` *(default)* | OpenAI | ✅ Reference impl | $0.15 / $0.60 | Cheapest mainstream model with first-class tool calling. What Vercel AI SDK + Cursor + Continue default to. |
| `openrouter/google/gemini-2.0-flash-001` | Google | ✅ | $0.075 / $0.30 | Cheapest tier overall. Tool calling works but format differs slightly from OpenAI — exercises the SDK's normalization. |
| `openrouter/anthropic/claude-haiku-4.5` | Anthropic | ✅ Excellent | ~$0.80 / $4 | 5× cost of gpt-4o-mini but Anthropic's "thinking" pattern shines on multi-tool reasoning. |
| `openrouter/anthropic/claude-sonnet-4.5` | Anthropic | ✅ Top-tier | ~$3 / $15 | Premium quality — multi-step planning + tool chains. Use when comparing the ceiling vs the cost-floor default. |
| `openrouter/meta-llama/llama-3.3-70b-instruct` | Meta (open weights) | ✅ | ~$0.40 / $0.40 | Open-source comparison. Tool calling is competent but less consistent than commercial models. |
| `openrouter/mistralai/mistral-small-latest` | Mistral | ✅ | ~$0.20 / $0.60 | EU-hosted alternative. |

**Quality analysis cheat sheet** — same prompt across models, compare:

1. *"What time is it on the server? Then write the timestamp to notes.md and read it back."* — exercises 3 tools in sequence (current_time → workspace_write → workspace_read). Counts: how many models chain all 3 without prompting? How many parse the timestamp output correctly when writing?
2. *"Search the web for the latest TheoKit release version, then store the version number in a file called release.txt."* — exercises web_search → workspace_write. How many models extract the version cleanly vs dumping the raw search results?
3. *"Calculate 1 divided by 0."* — exercises calculator's `Number.isFinite` guard (EC-1). How does the model react to a tool error mid-conversation?

## Architecture (DEEP DIVE)

```
┌──────────────────────────────────────────────────────────────┐
│                         OpenRouter                           │
│              (claude-3.5-sonnet / gpt-4o / ...)              │
└────────────────────────────▲─────────────────────────────────┘
                             │  @usetheo/sdk
                             │  Agent.getOrCreate + Run.stream
                             │
            ┌────────────────┴────────────────┐
            │                                 │
       ┌────┴────┐                       ┌────┴────┐
       │   Web   │                       │ Telegram│
       │ Chat UI │                       │   Bot   │
       │ (TheoUI)│                       │ (grammy)│
       └────┬────┘                       └────┬────┘
            │                                 │
       defineAgentEndpoint               GatewayRunner
       + streamAgentRun                  + TelegramAdapter
       + createConversationHistory       + agentId = tg-<chatId>
       + cookie = web-<uuid>
            │                                 │
            └────────────────┬────────────────┘
                             │
                  defineAgentTool × 8
                  (all in server/tools/)
```

Agent state lives in `.theokit/agents/<id>/messages.jsonl` and the workspace
sandbox at `.theokit/workspace/<id>/`. Both are managed by `@usetheo/sdk` +
TheoKit's `createConversationHistory` primitive.

## Tool catalog (per-file)

| File | Tool | What it does |
|---|---|---|
| `server/tools/current-time.ts` | `current_time` | Returns server ISO timestamp. No args. |
| `server/tools/calculator.ts` | `calculator` | Evaluates an arithmetic expression. Args: `{ expression: string }`. Recursive-descent parser; no `eval`/`Function`. Rejects `Infinity`/`NaN`. |
| `server/tools/random-number.ts` | `random_number` | Returns a random int in `[min, max]`. Args: `{ min, max }` with `max > min`. |
| `server/tools/web-fetch.ts` | `web_fetch` | HTTP GET against allowlisted hosts only. 10s timeout, 4 KB cap. Args: `{ url }`. |
| `server/tools/web-search.ts` | `web_search` | DuckDuckGo HTML search (no API key). Top 5 results. Args: `{ query }`. |
| `server/tools/workspace-read.ts` | `workspace_read` | Read a file from the per-conversation sandbox. Args: `{ path }`. |
| `server/tools/workspace-write.ts` | `workspace_write` | Write a file into the sandbox. Args: `{ path, content }`. 100 KB cap. |
| `server/tools/echo.ts` | `echo` | Return input verbatim. Args: `{ text }`. |

All tools live behind `defineAgentTool` — the framework wraps each with the
SDK's `CustomTool` contract.

## Security notes

- **Workspace sandbox** — all file ops route through `.theokit/workspace/<agentId>/`.
  Path traversal (`..`) and NUL bytes are rejected before `fs.writeFile` runs.
- **`web_fetch` allowlist** — default hosts: wikipedia, github, raw.githubusercontent.com,
  news.ycombinator.com, ddg.gg. Override via `WEB_FETCH_ALLOWLIST` env var
  (comma-separated). IPv4/IPv6 literals are NEVER matched — protects against
  SSRF to AWS/GCP metadata services.
- **No API key in agent code paths** — the SDK loads keys from env at request
  time; nothing ships in the bundle.
- **CSP enforce + nonce** — production CSP blocks all inline scripts that
  don't carry the nonce. The framework's hydration data script is nonce'd
  automatically.

## Troubleshooting

- **OpenRouter 429 rate-limit** — free tier is 20 req/min. Upgrade your plan or
  switch to a self-hosted model via `MODEL_ID=ollama/llama3.1` (requires
  `OLLAMA_HOST` env).
- **DuckDuckGo CAPTCHA** — DDG sometimes serves anti-bot HTML to cloud IPs.
  Demo runs locally for primary audience. `web_search` returns
  `{ results: [], note: '...' }` when this happens — agent can branch on it.
- **Telegram bot says nothing** — check token from BotFather. Telegram only
  allows one polling consumer per token at a time; if multiple instances are
  running, only the first wins (HTTP 409).

## License

Apache-2.0 (same as TheoKit).
