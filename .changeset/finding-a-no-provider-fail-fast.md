---
'theokit': patch
---

**Finding A fix: fail-fast when no provider env + no explicit apiKey.**

Pre-fix: `createConversationHistory` called `tryResolveProvider()` (non-throwing
graceful), then passed undefined apiKey to SDK's `Agent.getOrCreate`. SDK
exhibited an undocumented silent-fallback behavior — returning a canned LLM-
shape response `"Hello! How can I assist you today?"` regardless of input.
Stranger sem KEY pensava que o agente funcionava.

Post-fix: `createConversationHistory` now throws actionable error when:
- No `options.apiKey` passed (consumer override)
- AND no `OPENROUTER_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` env

Template's try/catch yields `{type:'error',message:'Agent error: No LLM provider API key...'}`
SSE event with link to OpenRouter signup. Stranger now sees actionable instruction.

Workaround for users with manual auth flow: pass `options.apiKey` explicitly —
auto-resolution is bypassed.

Empirically validated end-to-end (sdk-residual-behavior-2026-05-28.md):
- `POST /api/chat` without provider env → `{type:'error',message:'...'}`
- Unit tests: 2 new regression gates (`Finding A: throws...` + `Finding A: explicit apiKey bypasses...`)
- Full suite 21/21 GREEN
