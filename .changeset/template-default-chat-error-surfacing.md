---
'theokit': patch
'create-theokit': patch
---

**Template default chat.ts: surface provider errors as AgentEvent `error`.**

Pre-fix: `streamAgentRun(run)` could silently close SSE when SDK throws on
invalid OPENROUTER_API_KEY / rate-limit / model-not-found / 5xx. Client saw
a closed stream with no actionable message — stranger lost context.

Post-fix: full agent lifecycle wrapped in try/catch + caught exceptions
yield `{ type: 'error', message: ... }` AgentEvent. Dogfood chaos Phase 12
(invalid-key) now PASSES end-to-end.

Validated via `run-headless.sh` Phase 5 dogfood automation
(`dogfood-fixes-and-coverage-expansion-plan.md` v1.1 Phase 5).
