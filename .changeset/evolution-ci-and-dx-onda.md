---
'theokit': minor
'create-theokit': patch
---

**theokit-evolution-ci-and-dx onda — CI gates + template DX + devtools observability.**

This release ships 6 deliverables from the `theokit-evolution-ci-and-dx-plan.md` v1.1:

**Templates dogfood primitives 0.5.0 (Phase 2B):**
- `default` + `dashboard` ship `server/crons/cleanup-conversations.ts` (daily GC of stale `.theokit/agents/*` >30d)
- `api-only` ships `server/routes/webhooks/echo.ts` (HMAC-SHA256 self-signed pattern)
- `postgres` ships `server/jobs/log-message.ts` (defineJob enqueue pattern, ADR-0003 transactional outbox compliant)
- `saas` ships `server/routes/billing/stripe-webhook.ts` (Stripe HMAC verify) + wires `trackAgentRun` in `server/routes/agent.ts`

**README docs link (Phase 2A):**
- All 5 templates ship `📚 Full docs: https://docs.theokit.dev` in header

**Devtools `Agents` tab (Phase 3):**
- New tab in devtools panel showing per-run telemetry: time, user, model, tokens in/out, cost USD, status
- `dispatcher.onAgentRun(record)` wired from `trackAgentRun` in dev mode
- Tree-shaken in prod via universal `__IS_DEV` IIFE guard (Vite OR tsup) — devtools-treeshake test stays GREEN
- Ring buffer cap RING_BUFFER_CAP (50) for high-throughput resilience
- Reducer: `AGENT_RUN_ADD` + `RESET_AGENT_RUNS` actions

**Internals:**
- `AgentRunRecord` type + `CHANNEL_AGENT_RUN` channel in `devtools/shared.ts`
- `trackAgentRun` extended with optional `status` field (default 'finished')

No breaking changes; all wiring is additive + opt-in via dev mode.
