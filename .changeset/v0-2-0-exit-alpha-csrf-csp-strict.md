---
'theokit': minor
'create-theokit': minor
---

**0.2.0 — Exit alpha + enforcement cutover (CSRF strict + CSP enforce).**

This release ends the `0.1.0-alpha.*` series and ships TheoKit's first `minor` on the `latest` npm tag. It combines the maturity work consolidated under the macro-roadmap convergence list (items #1-#6 done: scaffold + agent surface + canonical chat via `@usetheo/sdk` + `defineAgentTool` + `streamAgentRun` + `createConversationHistory` + example `full-stack-agent`) with the security defaults flip previously planned as 0.3.0 (commit `3ee9dac`).

**BREAKING (per pre-1.0 semver — `minor` = breaking until 1.0):**

- `config.security.csrf` default flipped from `'warn'` → **`'strict'`**. Every non-GET request without the `X-Theo-Action: 1` header now returns 403 `CSRF_INVALID`. The framework's own `useAgentStream` already attaches this header (`packages/theo/src/client/agent-stream-core.ts:75`); custom fetchers, raw `<form>` posts, third-party clients, and curl-based integrations must attach the header explicitly or set `csrf: 'warn'` / `csrf: 'off'` in `defineConfig` during migration.
- `config.security.headers.cspMode` default flipped from `'report-only'` → **`'enforce'`**. Inline scripts without a per-request nonce are blocked. The SSR hydration data script the framework emits carries the nonce automatically (T7.4 wiring verified by `tests/e2e/ssr-nonce.spec.ts` 3/3 GREEN). Third-party widgets (gtag, intercom, sentry, Plausible) and any user-authored inline `<script>` must either use the nonce mechanism or set `cspMode: 'report-only'` during migration.

**Migration path:**

- See `docs/migration/0.2-to-0.3.md` for the audit-grep recipes (`grep '"event":"csrf.warn"' logs.json | jq '.path'` to enumerate affected endpoints).
- Run `theokit check --upgrade-readiness 0.3` (CLI command shipped) for a static analysis of inline scripts in your `app/**` tree.
- If you cannot fix immediately: opt out in `theo.config.ts` via `defineConfig({ security: { csrf: 'warn', headers: { cspMode: 'report-only' } } })` and migrate at your pace.

**Also in this release:**

- All maturity-hardening primitives (jobs / crons / webhooks / cost tracking / transactional outbox / W3C trace context).
- TheoCloud adapter Wave 2 stub registered (Wave 3 K8s manifest emission ships in 0.6.0).
- Devtools overlay (auto-injected dev-only floating chip + 5-tab panel).
- Argon2id password hashing in `examples/agent-saas` via `hash-wasm`.
- Playwright coverage for all 5 templates (`default`, `dashboard`, `api-only`, `postgres`, `saas`).
- Native bindings preflight (`scripts/preflight-native-bindings.mjs`) detects + auto-rebuilds `better-sqlite3` ABI mismatch on test setup. See CLAUDE.md > "Native bindings discipline".

**Honest residual:**

The 4-6 week warn-mode telemetry window from the original 0.3.0 plan is collapsed into a single 0.2.0 release for shipping pragmatism. Consumers who need a true warn-mode interim should pin `0.1.0-alpha.17` (last alpha) and use the migration guide to transition deliberately.
