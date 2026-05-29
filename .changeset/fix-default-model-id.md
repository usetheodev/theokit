---
'create-theokit': patch
---

Fix template default chat.ts modelId: substituído `openrouter/anthropic/claude-3.5-sonnet` (model ID inválido — OpenRouter rejeita 400) por `openai/gpt-4o-mini` (cheap, always-available, empíricamente testado 2026-05-28). Resolve falha "openrouter API error: unknown (HTTP 404)" em stranger Phase 7 real LLM test.
