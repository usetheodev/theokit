# Changelog

Workspace-level changes for the `theokit` monorepo. Per-package changes live in each package's `CHANGELOG.md` (`packages/theo/CHANGELOG.md`, `packages/create-theo/CHANGELOG.md`).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (framework-zero-config-polish, 2026-05-22)

Close 5 framework polish bugs surfaced by item #6 dogfood — a new TheoKit consumer running `npm create theokit my-app && pnpm add @usetheo/ui && pnpm dev` now renders styled TheoUI components with **zero consumer-side Tailwind/PostCSS config**, `.env` values populate `process.env` for server code without a shim, and long-lived dev sessions self-clean orphan agent registries.

- **`loadEnv()` auto-loads `.env` files into `process.env`** (`packages/theo/src/config/load-env.ts`). Implements Next.js's `loadEnvConfig` algorithm: priority order (`.env.{mode}.local` > `.env.local` > `.env.{mode}` > `.env`), `dotenv-expand` for `${VAR}` cross-refs, real-`process.env`-wins, NODE_ENV stash in `__THEOKIT_USER_NODE_ENV`. **EC-1**: 1MB file-size cap (anti-OOM, anti-supply-chain). **EC-2**: `_resetEnvCache()` test-side-door for vitest isolation. **EC-8**: circular reference protection. **EC-13**: symlink transparency log. CLI commands (`dev`, `build`, `start`) call it before `loadConfig`. Re-exported from `theokit/server` for standalone scripts. (T1.1–T1.4)
- **`cleanOutDir` + `gcAgentRegistry` state cleanup utilities** (`packages/theo/src/cli/lib/cleanup.ts`). `theokit build` empties `.theo/` at start (Astro pattern, skip `.git*`). `theokit dev` runs LRU cleanup of `.theokit/agents/<id>/` at startup (Nuxt pattern, default cap 100, configurable via `agents.maxRegistries`). **EC-3 (CRITICAL)**: cleanOutDir refuses paths outside cwd — prevents catastrophic `distDir: '/'` data loss. **EC-4**: Zod refine on `distDir` rejects absolute + parent-relative at config-load time. **EC-9, EC-11, EC-12**: handles mtime=0, trailing-slash skip basenames, EROFS read-only filesystems. (T2.1–T2.3)
- **Auto-config of `@tailwindcss/vite` + `@usetheo/ui/vite-plugin`** when `@usetheo/ui` is declared in `package.json` (`packages/theo/src/vite-plugin/integrate-ui.ts`). TheoKit's vite-plugin `config()` hook detects both packages, dynamic-imports them, and chains into Vite's plugin array. **D3 deferral**: consumer-side `tailwind.config.*` or `postcss.config.*` (walked 3 levels) wins — framework logs an info hint and skips auto-chain. **EC-5**: default-export type-check before invocation. **EC-6**: return-shape validation (`isValidPlugin` rejects null/array/non-`name` shapes). `detectPackage` generalizes the `theoui-detect.ts` resolution pattern to any npm name. (T3.1–T3.4)
- **`theokit check` hints for migration** (`packages/theo/src/cli/commands/upgrade-readiness.ts`). Two new rules: `zero-config-tailwind-suggest` (consumer has `@usetheo/ui` + manual `tailwind.config` without `@usetheo/ui/preset` import → suggest extending via preset); `handrolled-dotenv-suggest` (server/ file imports `dotenv` directly → point to framework `loadEnv`). (T4.1)
- **Phase 0 spike doc** (`docs/spikes/usetheo-ui-vite-plugin-shape.md`) defines the cross-repo `@usetheo/ui/vite-plugin` + `@usetheo/ui/preset` API contract that Phase 3 auto-config consumes. Awaits cross-repo sign-off before the UI repo ships those subpath exports + the example's `tailwind.config.ts` + `postcss.config.js` can be deleted (T3.5 target state pinned via skipped contract tests).

**Telegram bot uses framework `loadEnv` with explicit cwd (EC-7)** — `examples/full-stack-agent/server/telegram-bot.ts` was reading `process.cwd()` for `.env` which broke when launched from monorepo root. Bot now resolves `cwd` via `dirname(fileURLToPath(import.meta.url))` so `pnpm bot` from any directory reads the example's own `.env`.

**Example shim deleted**: `examples/full-stack-agent/server/_env.ts` (35-LOC hand-rolled dotenv reader) removed; chat route + telegram bot use the framework path.

**Dogfood polish (2026-05-22) on top of the framework-zero-config-polish landing:**

- **`create-theokit` `--skip-install` flag** — scaffold files only, no `npm install`. Useful for smoke testing, monorepo dogfood, and air-gapped environments. The original CLI ran `npm install` unconditionally; documented in help text.
- **`--bare` extended to remove `@usetheo/sdk` + `lucide-react` + Tailwind toolchain**. The `--bare` recipe is now the "always works without registry" path. The default template depends on `@usetheo/sdk@^1.0.0` (operator-deferred npm publish per macro roadmap item #3) which currently 404s for any consumer outside the workspace. `--bare` drops it along with `@usetheo/ui`, `lucide-react`, `tailwindcss`, `postcss`, `autoprefixer`, and the `tailwind.config.ts` + `postcss.config.js` files — producing a clean Hello Theo scaffold that boots with `npm install && npx theokit dev` end-to-end. Validated 2026-05-22 with 82 packages installed in 15s + GET / → 200 + GET /api/health → `{"ok":true}`.
- **Generalized `.tmpl` substitution** — any `foo.tmpl` file in a template's root becomes `foo` with `{{name}}` interpolated. Previously only `package.json.tmpl` got templated; now extends to `README.md.tmpl` and future per-template docs.
- **Default template ships a README.md** (templated from `README.md.tmpl`) — Quick start with OpenRouter, what the framework auto-loads, the `--bare` escape hatch for the SDK publish gap, and the project structure. Replaces "scaffold drops user into a structure with no docs" with "scaffold drops user into a structure that explains itself."
- **Default template ALIGNMENT NOTE**: Tailwind in the template stays v3 (PostCSS-based) with explicit `tailwind.config.ts` for now. The zero-config Tailwind v4 path (via TheoKit's `integrateUseTheoUI` auto-config) requires `@usetheo/ui` to ship `./vite-plugin` + `./preset` subpath exports, which is gated on the cross-repo work tracked in `docs/spikes/usetheo-ui-vite-plugin-shape.md`. The framework's D3 deferral correctly skips auto-chain when the template's `tailwind.config.ts` is present — the explicit-config path works today, the zero-config path lands when cross-repo ships.

Plans: `docs/plans/framework-zero-config-polish-plan.md` + edge-case review at `docs/reviews/edge-case-plan/framework-zero-config-polish-edge-cases-2026-05-22.md`. Reference doc: `.claude/knowledge-base/reference/zero-config-integration.md` (940 LOC, 6-framework prior-art audit).

### Added (Macro Roadmap item #6 — `examples/full-stack-agent`, 2026-05-22)

**ONE complete reference demo** replacing the originally-planned three separate examples (`chat-anthropic` + `agent-with-tools` + `agent-with-memory`) per user direction. A new visitor clones the repo, sets `OPENROUTER_API_KEY` in `.env`, runs `pnpm dev`, and has a real LLM chat with 8 working tools + conversation continuity + optional Telegram bot — all on the locked TheoKit + @usetheo/sdk + @usetheo/ui + @usetheo/gateway-telegram stack.

- **`examples/full-stack-agent/`** ships as a real workspace package (~600 LOC). Exercises every Phase B primitive end-to-end: `defineAgentEndpoint` + `createConversationHistory` (cookie bridge) + `streamAgentRun` (SDK Run.stream → AgentEvent SSE) + `defineAgentTool` × 8.
- **8 tools** registered via `defineAgentTool` — each in its own file under `server/tools/`:
  - `current_time` — server ISO timestamp.
  - `calculator` — arithmetic via a recursive-descent parser. **EC-1**: rejects `Infinity`/`NaN` (`1/0`, `0/0`) before returning. **EC-2**: source-grep test asserts zero `eval(` / `new Function(` / `require('vm')`.
  - `random_number` — int in `[min, max]` with `max > min` refine.
  - `web_fetch` — HTTP GET with hostname allowlist. **EC-3** dot-boundary subdomain match (`host === entry || host.endsWith('.' + entry)`) blocks the `evilwikipedia.org` lookalike attack. IPv4/IPv6 literals never matched (anti-SSRF for AWS metadata).
  - `web_search` — DuckDuckGo HTML scrape, no API key. Defensive parser returns `{ results: [], note: '...' }` when DDG structure changes.
  - `workspace_read` / `workspace_write` — sandbox at `<cwd>/.theokit/workspace/<conversationId>/`. **EC-4**: NUL bytes in path rejected via Zod refine (`fs.writeFile` truncation defense). Per-conversation isolation; can't read another agent's files. 4 KB read cap, 100 KB write cap.
  - `echo` — return input verbatim.
- **Telegram bot** via `@usetheo/gateway` + `@usetheo/gateway-telegram` running in the same Node process (long-polling, no webhook). agentId = `tg-<chatId>` (channel-prefixed namespace, disjoint from web's `web-<uuid>`). `pnpm bot` script.
- **Production-grade defaults**: `theo.config.ts` opts into SSR + `cspMode: 'enforce'` in prod (`off` in dev so Vite React Refresh doesn't trip CSP).
- **`packages/create-theo/templates/default/server/routes/chat.ts`** unchanged — the example is a separate artifact; the template stays minimal.

**Two HIGH-severity prod blockers found + fixed in same loop:**

1. **`theokit start` looked for SSR entry at `.js` while tsup emits `.mjs`** → SSR silently disabled in every production build. Discovered when `theokit start` against `fixtures/ssr-basic` served `<div id="root"></div>` with no SSR output. Fix in `packages/theo/src/cli/commands/start.ts`: new `resolveSsrEntry(distDir)` helper tries `.mjs` first then `.js`. 4 unit tests pin resolution order.

2. **`theokit start` never applied security headers in production** → no `Content-Security-Policy`, no `Cache-Control`, no `X-Frame-Options` on any prod response. Dev server (`packages/theo/src/vite-plugin/api-middleware.ts`) had this wired, but the prod orchestrator was missing the call entirely. Fix: generate per-request nonce **unconditionally** in `start.ts` request handler (EC-6 from edge-case review — matches dev's `api-middleware` parity), call `buildSecurityHeaders(config.security?.headers, { production: true }, { nonce })`, thread `nonce` into `ssrRender(url, { nonce })` so React + react-router emit nonce'd `<script>` tags. 4 integration tests in `tests/integration/example-prod-server.test.ts` boot the prod server + curl + assert.

**One item-5 latent bug found + fixed:**

3. **`execute.ts` `Object.fromEntries(handlerResult.headers)` collapsed multi-value `Set-Cookie` to a single string** → `createConversationHistory` cookies issued via Web `Response` never reached the browser because Node's `res.writeHead` only saw the last value (or none, after the `Object.fromEntries` overwrite). Fix: build `headersBag` excluding `set-cookie`, set `Set-Cookie` via the `res.setHeader` array overload BEFORE `writeHead` flushes headers. Verified via curl: `Set-Cookie: theo_conversation=<uuid>; Path=/; Max-Age=2592000; SameSite=Lax; HttpOnly` now lands consistently.

**Additional framework polish in this loop:**

- `defineAgentTool` `isZodObject` check walks `_def.schema`/`_def.innerType` chain so `z.object().refine(...)` (ZodEffects wrap) is accepted as a valid root.
- `createConversationHistory` issues `Set-Cookie` when `isNew OR cookieOnRequest !== conversationId` (not just on `isNew`) — fixes the explicit-agentId-override path where probed + override id is "new from browser's POV but not from server's".
- `createConversationHistory` switched dynamic `import(spec)` → `createRequire(import.meta.url)` to bypass Vite's `vite:import-analysis` plugin which was intercepting the SSR-side import.

**Edge-case review** at `docs/reviews/edge-case-plan/example-full-stack-agent-edge-cases-2026-05-22.md`. All 6 MUST FIX items enforced by tests before merge. 6 SHOULD TEST + 4 DOCUMENT items disposed.

**Tests:** 1974/1974 unit GREEN (+86 vs item-5 baseline 1888), 101/101 example-focused, Playwright `full-stack-agent` 5/5 + `ssr-nonce` 3/3 + `template-default-canonical-chat` 5/5 — all 2 consecutive CI runs. `tsc --noEmit` zero errors, `eslint --max-warnings=0` clean, zero `any` in production code. **Dogfood `full` health 85/100** (improvement over item-5's 82/100), report at `docs/audit/dogfood-2026-05-22-example-full-stack-agent.md`.

### Fixed (0.3.0 cutover T4.1 — SSR nonce wiring + end-to-end validation, 2026-05-22)

**Closed a pre-0.3.0 cutover blocker that would have caused silent client-only fallback in strict CSP mode.** `packages/theo/src/router/entry-server.ts` was passing `nonce: options.nonce` to `renderToPipeableStream` (covers React-emitted scripts like Suspense boundaries) but NOT to `StaticRouterProvider`. React-Router's `StaticRouterProvider` is what emits the inline hydration data script `<script>window.__staticRouterHydrationData = JSON.parse(...)</script>`; it accepts a `nonce` prop per its `StaticRouterProviderProps` interface but TheoKit was not forwarding it. Effect: in strict CSP mode without `'unsafe-inline'` (the 0.3.0 default), the browser would block the hydration script → React falls back to client-only render → button onClick handlers never attach → page looks dead in production. The exact "silent failure mode" that pre-requisite #4 of the 0.3.0 cutover was meant to mitigate. Fix: add `nonce: options.nonce` to every `StaticRouterProvider` call site in the codegen template (`buildAppTreeJs`). Verified via `curl -i http://localhost:3492/` against `fixtures/ssr-basic` — `<script nonce="X">` now matches CSP `'nonce-X'`. Pinned by new Playwright spec `tests/e2e/ssr-nonce.spec.ts` with 3 assertions: (1) CSP nonce-X matches script nonce attr; (2) `Cache-Control: private, no-store` present (EC-3); (3) every framework-emitted inline script carries nonce attr (EC-12). 3/3 GREEN in 2 consecutive CI runs. New Playwright project `ssr-nonce` boots `fixtures/ssr-basic` on dedicated port 3492.

### Added (Macro Roadmap item #5 — `createConversationHistory`, 2026-05-22)

**Conversation continuity is now zero-config.** Each browser tab gets a stable conversation id cookie on first visit; subsequent requests resume the same agent. Conversation turns auto-persist in `<cwd>/.theokit/agents/<id>/messages.jsonl` (SDK owns storage — ADR D1). Replaces ~50 LOC of manual `Agent.resume`/`Agent.create` + session-cookie plumbing with one function call.

- **`createConversationHistory(args)`** in `packages/theo/src/server/create-conversation-history.ts`. Orchestrator that resolves a stable `agentId` from a 4-step fallback chain (explicit → session → cookie → fresh UUID) and calls `Agent.getOrCreate(agentId, options)` via dynamic SDK import. Returns `{ agent, conversationId, isNew }`. EC-1 hardened: `isValidAgentId` regex `^[a-zA-Z0-9_-]{1,128}$` validates all entry points before use — invalid values (path-traversal `../`, CRLF injection, over-length) fall through silently to UUID generation, protecting both the filesystem path the SDK writes to AND the Set-Cookie header the wrapper issues. EC-2 hardened: `loadSdk()` wraps `import('@usetheo/sdk')` in try/catch, re-throwing with an actionable "Install: pnpm add @usetheo/sdk" message + cause chain instead of cryptic `ERR_MODULE_NOT_FOUND`.
- **`defineAgentEndpoint` extended with `cookieHeaders: Headers`** handler arg in `packages/theo/src/server/define-agent-endpoint.ts`. The wrapper PRIMES the generator (`await generator.next()`) before constructing the SSE Response, then merges `cookieHeaders.getSetCookie()` into response headers. First-byte latency cost (~100-500ms for chat) is bounded and acceptable. Cookies appended to `cookieHeaders` AFTER the first yield are NOT applied (HTTP semantics — headers commit before stream body).
- **Default scaffold ships persistence.** Both `fixtures/template-default/server/routes/chat.ts` and `packages/create-theo/templates/default/server/routes/chat.ts` updated to use `createConversationHistory` (no per-request `Agent.create + dispose` dance). 65 LOC each, under the 75-line budget.
- **`MemorySettings` (SDK facts recall) is OPT-IN passthrough** via `options.memory`. Not default. ADR D2 corrects the initial roadmap framing — SDK has THREE separate layers: conversation history (always-on via SDK), agent registry metadata (always-on via SDK), facts memory (opt-in, requires embedding provider). `createConversationHistory` defaults to Layer 1 only; consumers wanting Layer 3 enable explicitly.
- **`session.conversationId` integration** with TheoKit's existing `createSessionManager`. Authenticated multi-device flows pass `session.userId` (or any derived id) as `args.session.conversationId` → same conversation across devices. Anonymous flows use the `theo_conversation` cookie.
- **Cookie is raw (NOT encrypted) per ADR D4.** Conversation id is not security-bearing; encryption overhead (~3-15ms per request from `createSessionManager`) is unjustified. `HttpOnly: true` prevents JS reads. Consumers wanting encryption derive id from `sessionManager.getSession(req)?.conversationId` and pass it via `args.agentId`.
- **Playwright continuity proof.** `tests/e2e/template-default-canonical-chat.spec.ts` extended with 2 new specs: (1) conversation cookie issued on first POST with valid UUID + HttpOnly; (2) cookie value unchanged across page reload. EC-6 wait pattern: both specs `await expect(...).toBeVisible()` BEFORE `context().cookies()` to avoid SSE-commit/cookie-read race. **7/7 PASSED in 2 consecutive CI runs.**
- **Edge-case review** at `docs/reviews/edge-case-plan/item-5-conversation-history-edge-cases-2026-05-22.md` — 2 MUST FIX + 4 SHOULD TEST + 3 DOCUMENT findings, all incorporated.

**Tests:** 1888/1888 unit GREEN (+29 vs item-4's 1859), 84/84 agent-focused, Playwright 7/7, `tsc --noEmit` zero errors, eslint `--max-warnings=0` clean, zero `any` in production code. **Dogfood `full` health 82/100** ≥ 70 (ship-it), zero plan-caused regressions, report at `docs/audit/dogfood-2026-05-22-item-5.md`.

### Added (Macro Roadmap item #4 — `defineAgentTool` + `streamAgentRun`, 2026-05-22)

**Tool calling stops being manual wiring.** Adding a tool to a TheoKit agent route went from ~40 LOC of `for await (msg of run.stream())` plumbing to **one line: `yield* streamAgentRun(run)`**. Default scaffold now ships a `current_time` tool example proving the wire end-to-end.

- **`defineAgentTool({ name, description, inputSchema, handler })`** in `packages/theo/src/server/define-agent-tool.ts`. Builds a `@usetheo/sdk` `CustomTool` from a Zod 3 schema. Uses `zod-to-json-schema` to convert the schema (bypassing SDK's `defineTool` which requires Zod 4 — see ADR D1 in plan). Inline runtime parse via the Zod schema; bad LLM-supplied input throws `ZodError` which the SDK converts to `tool_result(isError)`. Validates tool name regex `^[a-zA-Z][a-zA-Z0-9_-]{0,63}$`, rejects non-`ZodObject` root schemas, warns (not throws) on empty descriptions. Strips top-level `$schema` so Anthropic accepts the JSON Schema.
- **`streamAgentRun(run)`** in `packages/theo/src/server/stream-agent-run.ts`. Async generator that consumes the SDK `Run.stream()` (`SDKMessage` discriminated union) and yields `AgentEvent`s for the SSE wire. Maps `assistant.text` → `message`; `tool_call(running)` → `tool_call`; `tool_call(completed)` → `tool_result`; `tool_call(error)` → `error`; terminal `run.wait()` `status=error` → final `error` event. Cancel runs do NOT yield error (cancel ≠ error). EC-1 hardened: `safeJsonStringify` coerces non-JSON-serializable tool results (bigint, circular refs) to `'[Unserializable]'` instead of crashing `encodeSSE`. EC-3 hardened: `safeArgs` type-guard before narrowing `unknown` to `Record<string, unknown>` (no bare `as` cast).
- **Default scaffold ships a tool example.** Both `fixtures/template-default/server/routes/chat.ts` and `packages/create-theo/templates/default/server/routes/chat.ts` updated to use `Agent.create({ tools: [currentTime] })` + `yield* streamAgentRun(run)`. Tool is `current_time`, no API needed — deterministic for Playwright. EC-2 hardened: `try { await agent.dispose() } catch (e) { console.warn(...) }` in `finally` block so dispose failures don't mask the original SDK error (auth_failed, tool_dispatch_failed, etc.). LOC delta vs item-3 baseline: chat.ts is 53 lines (under the 60-line budget).
- **Playwright spec** extended in `tests/e2e/template-default-canonical-chat.spec.ts` with 2 new tests: (1) tool-defined route boots without crash (proves defineAgentTool + streamAgentRun load cleanly server-side, zero console errors); (2) auth error surfaces via SSE even with tool defined (regression for EC-2 — proves dispose try/catch did not mask the actionable error). **5/5 PASSED in 2 consecutive CI runs.**
- **`zod-to-json-schema@^3.24.0`** added as a direct dependency of `packages/theo`. ~5 KB minified, zero transitive deps, MIT, Zod 3 native, 3M weekly DLs. Per ADR D4. Server bundle delta ≈ +11 KB total. Client bundle unchanged (`+0 KB`) — server-only primitives, tree-shaken from client.
- **Edge-case review** at `docs/reviews/edge-case-plan/item-4-define-agent-tool-edge-cases-2026-05-22.md` — 3 MUST FIX + 5 SHOULD TEST + 4 DOCUMENT findings, all incorporated in implementation (not deferred as follow-ups).

**Tests:** 1859/1859 unit GREEN (+44 vs item-3's 1815), 127/127 agent-focused, Playwright 5/5, `tsc --noEmit` zero errors, zero `any` in production code. **Dogfood `full` health 80/100** ≥ 70 (ship-it), zero plan-caused regressions, report at `docs/audit/dogfood-2026-05-22-item-4.md`.

### Added (Macro Roadmap item #3 — canonical chat.ts via @usetheo/sdk, 2026-05-22)

**Default scaffold now ships the canonical `Agent.prompt` wiring out-of-the-box. `npx create-theokit my-app && pnpm install && echo ANTHROPIC_API_KEY=… >> .env && pnpm dev` produces a working chat in ~5 minutes with no `import { OpenAI }` artefact.**

- **Canonical `chat.ts`** in both `fixtures/template-default/server/routes/chat.ts` and `packages/create-theo/templates/default/server/routes/chat.ts`: 10-line snippet using `Agent.prompt(message, { apiKey, model, throwOnError: true })` in a try/catch. EC-4 defensive body guard (`typeof body === 'object' && !Array.isArray(body)`). EC-5 empty-reply fallback (`result.result ?? ''`).
- **`@usetheo/sdk` is a default dependency** of the scaffold (was opt-in `pnpm add`). `package.json.tmpl` ships `"@usetheo/sdk": "^1.0.0"`.
- **Node ≥ 22.12.0 preflight** in `create-theokit` (`packages/create-theo/src/preflight-node.ts`). Zero-dep semver comparator. Refuses scaffold (exit 1, no files written) when Node is below the SDK floor. Actionable error message hints `nvm install 22` and lists alternative version managers (fnm, volta, asdf, nvs).
- **Anti-stack lint gate** (`tests/unit/scaffold-no-openai-anti-stack.test.ts`): greps both scaffold chat.ts files for `openai` (case-insensitive). Fails CI if a future PR re-introduces the raw OpenAI/Anthropic SDK as the canonical path.
- **README tutorial "Your first agent in 5 minutes"** updated to the 6-line `throwOnError: true` essence (canonical, idiomatic try/catch). 7 RED tests pin the snippet shape, scope grep to the tutorial section (EC-8 — no false positives if `result.status` appears in later docs).
- **Playwright spec** (`tests/e2e/template-default-canonical-chat.spec.ts`) boots the fixture on port 3470 with `ANTHROPIC_API_KEY=sk-ant-fake-for-playwright-canonical-chat`, exercises the composer → Send flow, asserts the `AgentErrorCard` renders with `auth_failed` / 401 text. Explicit timeouts (EC-6) prevent CI-slow flake. **3/3 tests green** — full UI roundtrip validated.
- **Template UI bugs fixed in the same session** (`fixtures/template-default/app/page.tsx` + `app/layout.tsx`): `<AgentErrorCard kind="model">` (crashed React with "Element type is invalid") → `kind="generic"`; `description` prop (doesn't exist on TheoUI's AgentErrorCard) → `detail`; `action` → `actions`; `Badge size="sm"` (TheoUI Badge has no `size` prop) → removed; `QuickAction.label` is `ReactNode` not `string` → typeof narrow before passing to handler. Closes EC-12 from the plan's edge-case review.
- **Cross-repo SDK contributions** (in `theokit-sdk`, not this repo): new public `AgentRunError` class (extends `TheokitAgentError`, exported from barrel); new `AgentOptions.throwOnError?: boolean` (default false, non-breaking). 16 tests cover the new surface end-to-end (`tests/errors-agent-run-error.test.ts` + `tests/agent-prompt-throw-on-error.test.ts`). SDK CHANGELOG + `docs.md` updated.

**Manual smoke verified 2026-05-22**: `pnpm dev` in fixture-template-default with fake key → `curl -X POST /api/chat -H "X-Theo-Action: 1" -d '{"message":"hi"}'` returns `data: {"type":"error","message":"Anthropic API error: auth_failed (HTTP 401)"}` — exactly the contract the tutorial promises.

**Deferred (operator gate, not loop-completable):** T5.0 — `pnpm publish @usetheo/sdk@1.x.0` to npm registry. SDK code change is shipped; npm propagation requires real publish credentials. The README snippet works against the local workspace symlink today; works against npm once T5.0 ships.

**Tests:** 1815/1815 GREEN, `tsc --noEmit` zero errors, full TheoKit suite + SDK 113 tests path-guard+tools+errors+throwOnError isolation green.

### Removed (Studio scaffold reverted — out of TheoKit scope, 2026-05-21)

The "Studio" experiment (embedded coding agent inside the dev server) was reverted in full. It violated TheoKit's explicit "Out of scope — built-in agent orchestration" rule documented in `theokit/CLAUDE.md` and duplicated the role of TheoCode (the ecosystem's coding-agent product). TheoKit's mission is **"the Next.js for agents"** — the framework where someone builds *their own* agent app — not a coding agent itself. The Studio source, tests, fixture, plan, and CHANGELOG entry are all removed. SDK contributions made along the way (see `@usetheo/sdk` CHANGELOG: public `path-safety` sub-export + new `tools` sub-export + defence-in-depth fix in `assertNoSymlinkEscape`) are retained because they are universally useful to any coding agent built on top of `@usetheo/sdk`.

### Added (Framework Maturity Hardening — close operational safety-net gaps, 2026-05-21)

Implements `docs/plans/framework-maturity-hardening-plan.md` against the
2026-05-21 honest maturity audit. Adds operational safety nets for the
0.3.0 strict cutover (structured telemetry + static analyzer + migration
guide), Playwright E2E across all 4 templates (2 unconditional + 2
env-gated), real-Chromium WebSocket E2E, load-test harness with baseline,
and CI workflows for deploy + atomic multi-package publish.

- **T1.1 EC-3 guard for `theokit check --upgrade-readiness 0.3`** —
  refuses to scan non-TheoKit projects (reads `package.json`, requires
  `theokit` in deps or devDeps). 4 new BDD scenarios. New status
  `'not-a-theokit-project'`.
- **T2.2 `/__theo/csrf-readiness` endpoint + bounded store** —
  `csrf-readiness-store.ts` (1000-entry LRU) + `csrf-readiness-endpoint.ts`
  (GET summary; POST `/reset` enforces CSRF + Origin per EC-15) +
  Vite middleware mount. 13 unit tests.
- **T3.1 Migration guide 0.2 → 0.3** — `docs/migration/0.2-to-0.3.md`
  with jq + Node-only recipes (EC-6 portable to Windows/Alpine) +
  auto-tested against JSONL fixture so the guide can't rot. 7 tests.
- **T4.1 Vercel adapter end-to-end validation** —
  `examples/deploy-vercel/` SSR-enabled minimal app +
  `scripts/deploy-smoke-vercel.sh` (5-min timeout per EC-7) +
  `.github/workflows/deploy-vercel-smoke.yml` (path-gated CI).
  Local smoke PASS recorded in `deploy-evidence.jsonl`. 9 tests.
- **T5.1 Playwright E2E for 4 templates** — `dashboard` (5 scenarios),
  `api-only` (6 scenarios incl. CRUD + validation), `postgres`
  (4 env-gated scenarios), `saas` (4 env-gated scenarios). Postgres +
  saas use `test.skip()` when `DATABASE_URL` is absent.
- **T6.1 WebSocket E2E** — `tests/e2e/websocket-echo.spec.ts` validates
  real Chromium WS upgrade + echo + reconnect against
  `fixtures/websocket-basic/`. 4/4 scenarios PASS in 13s.
- **T7.1 Load-test harness** — `scripts/load-test-streaming.mjs`
  (autocannon) + RELATIVE thresholds (EC-11). First baseline:
  50 conn × 5s → p99=39ms, RPS=2839, 0 errors. 8 tests.
- **T8.1 api-middleware integration tests** —
  `tests/integration/api-middleware-coverage.test.ts` covers
  uncovered branches (rate-limit 429, batch endpoint, suggestion,
  pass-through). Minimal `ViteLike` mock (only `ssrLoadModule`).
- **T9.1 Atomic multi-package publish** —
  `scripts/publish-coordinated.sh` (dry-run all → publish all →
  rollback on partial failure per EC-12). 7 tests +
  `.github/workflows/release-coordinated.yml` (manual dispatch).
- **Dogfood report** — `docs/audit/dogfood-2026-05-21.md` documents
  health 78/100 across critical phases (above 70 ship threshold).

### Changed (Framework Maturity Hardening, 2026-05-21)

- **CSRF telemetry plan T2.1 documented as DONE via existing infra** —
  the `AuditLogger` interface + `safeAudit` fire-and-forget wrapper
  (from 2026-05-19 security release) already satisfy EC-4 + EC-5.
- **`fixtures/websocket-basic/`** — added `index.html` + `tsconfig.json`
  so the dev server can serve the SSR page (was previously a
  compile-only fixture).
- **Pre-commit secret scanner allowlist** — extended to include
  `tests/e2e/template-*.spec.ts` (env-gated specs document demo creds
  + connection strings as part of the migration recipe).

### Documentation

- `docs/plans/framework-maturity-hardening-plan.md` — 14-task plan
- `docs/plans/framework-maturity-hardening-progress.md` — live tracker
- `docs/reviews/edge-case/framework-maturity-hardening-2026-05-21.md` — 24 edge cases (12 MUST FIX incorporated)
- `docs/audit/dogfood-2026-05-21.md` — dogfood report

### Out of scope / blocked

- **T1.2 (`--fix` mode for `theokit check`)** — deferred per existing
  ADR D1 in `upgrade-readiness.ts:12` ("NEVER writes user files —
  lint-only").
- **T4.1 live Vercel deploy** — workflow committed; unlocks when
  `VERCEL_TOKEN` CI secret is configured.
- **T9.1 live npm publish** — workflow committed; unlocks when
  `NPM_TOKEN` CI secret is configured.
- **T5.1 postgres + saas execution** — fixtures + specs are env-gated;
  unlock when CI adds a Postgres service container + `DATABASE_URL` +
  `THEO_SESSION_SECRET`.

### Validation (2026-05-21 snapshot)

- typecheck (`tsc --noEmit`) ........... PASS
- lint (`eslint --max-warnings=0`) ..... PASS — 0 errors, 0 warnings
- format (`prettier --check`) .......... PASS
- tests ................................ 1774 / 1774
- Playwright ........................... 49 PASS + 8 skipped (env-gated)
- publint .............................. All good (both packages)
- audit (`--prod --audit-level=high`) .. 0 vulnerabilities
- licenses ............................. 214 packages, all permissive
- knip ................................. 0 unused
- Dogfood .............................. 78/100 (above 70 ship threshold)

### Added (Security hardening — close 9 enterprise gaps, 2026-05-19)

This release closes the nine identified gaps that separated TheoKit from "production-OK for indie/startup" to "enterprise-ready / SOC2-pending". All ten of the original-audit gaps (9 explicit + 1 adjacent OWASP A07 session fixation) are now covered. Zero new npm dependencies — everything composes from Web Crypto + native fetch + the existing hash-wasm path.

- **T1.1 — `Permissions-Policy` header default-deny**: `geolocation=(), camera=(), microphone=(), payment=(), usb=(), accelerometer=(), gyroscope=()`. EC-3 mitigation — Zod schema rejects CR/LF in every header-bound string (CWE-113 HTTP Response Splitting). 6 unit tests including the injection regression.
- **T1.2 — CORS middleware** (`packages/theo/src/server/cors.ts`). `corsSchema` accepts `origins` as `'*' | string | RegExp | array | callback`; `credentials`, `maxAge`, `allowedHeaders`, `exposedHeaders` all configurable. Runs FIRST in the request pipeline (D10): preflight → rate limit → CSRF → security headers → handler. EC-8: callback variants that throw fail-closed (deny). 18 unit tests covering exact, regex, callback, wildcard, and `'*'+credentials` rejection at parse.
- **T2.1 — `RateLimitStore` interface + `InMemoryStore` adapter** (`packages/theo/src/server/rate-limit-store.ts`). Pluggable backend per ADR D1 — single-instance apps see zero behavior change; multi-instance deployments install a Redis adapter without bloating the core. 8 contract tests; 9 existing rate-limit integration tests still green.
- **T2.2 — Per-route + per-user rate limit** (`packages/theo/src/server/rate-limit-per-route.ts`). `createRouteRateLimiter({ default, routes, keyBy })`: path map with longest-prefix matching, `keyBy: 'ip' | 'session' | 'user' | callback`. EC-5 trailing-slash normalization. EC-6 session-cookie name reads from config (not hardcoded). Session cookies are SHA-256 hashed before keying — raw token never leaks. 15 unit tests + legacy flat config backwards-compat preserved.
- **T3.1 — Session secret rotation** — `createSessionManager({ secret: string | string[] })`. Index 0 = newest. Decrypt walks the array. EC-1: array length capped at 5 — **enforced via throw at construction** (no silent truncation). 7 unit tests including the cap. `assertProductionSecret` accepts arrays too.
- **T3.2 — Transparent re-encrypt + `rotateIfNeeded` helper** — when decrypt succeeds at index > 0, the session is re-issued with `secrets[0]`. EC-4 timing safety: re-encrypt must fire BEFORE `renderToPipeableStream`/`res.writeHead` (Set-Cookie locks once headers commit) — the `rotateIfNeeded` helper lives in `createContext`, satisfying that constraint for the framework's streaming SSR default. 5 unit tests + 5 integration tests including the EC-4 streaming-headers regression.
- **T3.3 — `SessionManager.rotateSession(req, res)`** — OWASP A07:2021 session-fixation mitigation. Call after successful login / OAuth callback / 2FA upgrade. Preserves session data, fresh IV + refreshed expiry. 4 unit tests.
- **T4.1 — `AuditLogger` interface + `JsonStdoutSink` default** (`packages/theo/src/server/audit-log.ts`). Per ADR D4: zero new framework deps. Default writes JSON-line audit events to stdout (captured by every deploy target). User adapters plug in via `config.audit.logger`. EC: circular-ref + BigInt safe via fallback line. `safeAudit(logger, event)` wrapper isolates logger throws from the request lifecycle. 7 unit tests.
- **T4.2 — Wire framework events to audit logger**. `csrf.warn`, `rate-limit.exceeded`, `session.rotated`, `csp.violation` all flow through `safeAudit`. Logger throws NEVER propagate. 5 integration tests including sync + async throw isolation.
- **T5.1 — `/__theo/csp-report` endpoint built-in** (`packages/theo/src/server/csp-report.ts`). Auto-registered before user routes. Accepts both `application/csp-report` (legacy) and `application/reports+json` (Reporting API). Default CSP now includes `report-uri /__theo/csp-report`. EC-2 null guards: browser POSTs of `{"csp-report": null}`, `{}`, or reports+json entries lacking `body` short-circuit to 204 (no null deref). Forwards to audit + devtools dispatcher + optional user hook. 13 unit + 3 integration tests.
- **T6.1 — `throttleLoginAttempts`** (`packages/theo/src/server/auth-throttle.ts`). `checkThrottle` / `recordAttempt` over any `RateLimitStore`. Successful login resets the counter; max failures locks for `lockoutMs`. 8 unit tests including concurrent-overshoot safety.
- **T6.2 — TOTP RFC 6238 primitive** (`packages/theo/src/server/auth-totp.ts`). `generateTotp` / `verifyTotp` / `generateTotpSecret` / `totpUri`. RFC 6238 Appendix B vectors pass: T=59 → 94287082, T=1111111109 → 07081804, T=1111111111 → 14050471, T=1234567890 → 89005924. Constant-time comparison. 12 unit tests.
- **T6.3 — Backup codes primitive** (`packages/theo/src/server/auth-backup-codes.ts`). `generateBackupCodes({ count, length, separator, alphabet })` returns plaintext (display once) + SHA-256 hashes (store). Default alphabet excludes ambiguous chars (I/L/O/0/1). Constant-time `verifyBackupCode` returns `matchedHash` so caller deletes the used code (replay protection). 9 unit tests.
- **T7.1 — ADR-AUTH-DELEGATION** locked in `CLAUDE.md`. Cites the 793-line prior-art audit at `.claude/knowledge-base/reference/oauth-oidc-delegation.md`. Three re-evaluation triggers required to reopen.
- **T7.2 — `docs/concepts/auth-providers.md`** — recommendation page with Auth.js / Better Auth / DIY GitHub worked examples + a list of every TheoKit primitive shipped for auth. README links to it. 4 unit tests.
- **T7.3 — `oauth-pkce.ts` (RFC 7636)**. `generatePkceChallenge()` returns `{codeVerifier, codeChallenge, codeChallengeMethod: 'S256'}`. RFC 7636 Appendix B vector passes. 6 unit tests.
- **T7.4 — `oauth-state.ts` + `oidc-discovery.ts`**. `generateOAuthState` / `verifyOAuthState` (constant-time, empty inputs always false). `discoverOidcProvider` caches in module scope; failures NOT cached (subsequent calls retry). EC-7: HTTPS enforced for non-loopback issuers (RFC 8414 §3). 11 unit tests including the HTTPS guard.
- **T7.5 — Auth-provider fixtures**: `fixtures/auth-providers-diy-github/` (PKCE + state + rotateSession round-trip in ~50 LOC of route handlers); `fixtures/auth-providers-with-authjs/` (Auth.js bridge pattern + `syncAuthjsUser` action). 5 integration tests asserting fixture shape + PKCE/state round-trip without GitHub secrets.

#### Public exports added to `theokit/server`

`createCorsHandler`, `matchesOrigin`, `InMemoryStore`, `createRouteRateLimiter`, `matchRoutePattern`, `deriveKey`, `JsonStdoutSink`, `createNoOpLogger`, `safeAudit`, `handleCspReport`, `normalizeLegacy`, `normalizeNew`, `CSP_REPORT_PATH`, `checkThrottle`, `recordAttempt`, `generateTotp`, `verifyTotp`, `generateTotpSecret`, `totpUri`, `generateBackupCodes`, `verifyBackupCode`, `generatePkceChallenge`, `pkceChallengeFromVerifier`, `generateOAuthState`, `verifyOAuthState`, `discoverOidcProvider`, `clearOidcCache`, `rotateIfNeeded`. Plus types: `CorsConfig`, `CorsOrigin`, `CorsHandler`, `RateLimitStore`, `RateLimitState`, `RouteRateLimitConfig`, `KeyByMode`, `AuditLogger`, `AuditEvent`, `CspViolation`, `CspReportHandlerOptions`, `ThrottleOptions`, `ThrottleState`, `TotpOptions`, `VerifyTotpOptions`, `TotpAlgorithm`, `TotpUriOptions`, `BackupCode`, `BackupCodeOptions`, `PkceChallenge`, `OidcMetadata`, `SessionMeta`.

#### Schema additions

`config.security.cors` (CORS), `config.security.headers.permissionsPolicy` (Permissions-Policy), `config.audit.logger` (audit sink). New `corsSchema` exported.

#### Default CSP

Now includes `report-uri /__theo/csp-report` so `cspMode: 'report-only'` is useful out of the box.

#### Test surface

+106 new tests across unit + integration. Full sweep: **197 test files / 1601 tests pass / zero TypeScript errors / zero unhandled errors.**

### ⚠️ BREAKING — 0.3.0 cutover (T6.1, 2026-05-19)
Two framework defaults flip in 0.3.0. Both were emitting warnings since 0.2.0; if your app has been ignoring those warnings, it will start failing in production after this release.

- **CSRF default flips from `'warn'` to `'strict'`.** Every state-mutating HTTP method (POST, PUT, PATCH, DELETE) without `X-Theo-Action: '1'` now returns 403 with code `CSRF_INVALID`. `theoFetch` attaches the header automatically; apps using raw `fetch` must add the header explicitly OR opt the route out with `defineRoute({ csrf: false })` OR pin the global back to `'warn'` via `theo.config.ts`. Use `npx theokit check --upgrade-readiness 0.3` to enumerate every violation in your code.
- **CSP default flips from `'report-only'` to `'enforce'`, AND `'unsafe-inline'` is removed from `script-src`.** Inline `<script>` blocks without a per-request nonce are now blocked by the browser. The framework's own SSR hydration script is auto-nonce'd; user-authored inline scripts (gtag, intercom, sentry) must be migrated to external `<script src="...">` files OR threaded through `ctx.nonce`. `'unsafe-inline'` is retained for `style-src` (Tailwind animations) — only scripts are affected.
- **Migration guide** at [docs/migrating/0.2-to-0.3.md](docs/migrating/0.2-to-0.3.md) walks through audit, refactor, escape hatches, per-route gating (`disallowedRoutes`), and rollback.
- **Escape hatches** ship intact for staged rollouts: `config.security.csrf: 'warn'`, `config.security.headers.cspMode: 'report-only'`, `config.security.disallowed: { routes: [...], behavior: 'raise' }`.

### Added (0.3.0 cutover — Phases 1–5, 2026-05-19)
- **T1.1 — `useAgentStream` attaches `X-Theo-Action: '1'`** on every non-GET so the default chat demo passes strict CSRF without a per-route opt-out. Locked via Playwright assertion in `tests/e2e/template-default.spec.ts`.
- **T2.1 — `warnOnce(key, payload)` helper** in `packages/theo/src/server/logger.ts`. Per-key dedup (key = `${event}:${method}:${path}`) so a request loop with 1000 POSTs to the same endpoint emits ONE structured warn line instead of 1000. EC-2: fallback when payload contains circular references.
- **T2.2 — Stable `code` + `docsUrl` fields in every `csrf.warn` payload** (`CSRF_STRICT_CUTOVER` + `https://theokit.dev/upgrade/csrf-strict-cutover`). Apps grep their logs for one stable identifier and click through to the migration guide.
- **T2.3 — `theokit check --upgrade-readiness 0.3` command.** LINT-only scanner that walks `app/`, `server/`, `public/` and reports anticipated 0.3.0 violations with `file:line` + suggested fix per occurrence. Three rule classes: `csrf-missing-header`, `inline-script`, `dangerously-set-inline-script`. Exit code 1 fails CI; `--allow-warnings` softens; `--json` emits machine output. EC-7 skips occurrences in comments + string literals. EC-8 empty project no-crash.
- **T3.1 — `docs/migrating/0.2-to-0.3.md` (432 lines)** + `docs/migrating/README.md` index. TL;DR / Prerequisites / Step-by-step / Escape hatches / Per-route gating / Gotchas / FAQ / Rollback / Known limitations sections, asserted by a markdown linter test.
- **T4.1 — Per-request CSP nonce machinery for SSR.** `generateNonce()` returns 16 bytes of base64-encoded cryptographic entropy via Web Crypto with `node:crypto` fallback. `buildSecurityHeaders(config, env, { nonce, prerender })` substitutes `'unsafe-inline'` in `script-src` with `'nonce-<token>'` and forces `Cache-Control: private, no-store` (EC-3 — CDN cannot cache HTML with a baked-in nonce). EC-4: `prerender: true` bypasses the nonce path. EC-12: `renderToPipeableStream({ nonce })` + `renderToReadableStream({ nonce })` so React's own emitted `<script>` tags carry the attribute.
- **T5.1 — `disallowedRoutes` + `disallowedBehavior` (Rails-pattern)** in `config.security.disallowed`. `routes: Array<string | RegExp>` matches via exact-string OR regex; `behavior: 'raise'` escalates matched warn-mode failures to 403 even when global `csrf` mode is `'warn'`. EC-5: `matchDisallowed` resets `lastIndex` before `RegExp.test`.

### Validated (nextjs-maturity plan — Phase 11 final dogfood QA, 2026-05-19)
- **`docs/reviews/nextjs-maturity-phase11-final-dogfood-2026-05-19.md`** — full Phase 11 closure report. Verdict: **APPROVED.** Plan ready for the release engineer to bump theokit to `0.2.0`.
- Validation chain executed: tsc 0 errors · vitest sequential **1333/1333 PASS** · Playwright **21/21 PASS** · dogfood-smoke **47/47 PASS (Health 100%)** · prod build bundle **193.90 KB gzipped** (45% under the 350 KB target) · 10 consecutive prod SSR requests with **0 React pipe-twice errors** · combined Phase 5+6+7 live curl honoring `traceparent` → `x-trace-id: 32-hex` plus security headers plus CSRF warn line, all in one request.
- 12/16 plan tasks closed (75%). Two follow-ups remain non-blocking: T10.2 agent-saas full-flow Playwright needs a Postgres instance; specs for the four non-default templates share the fixture pattern and can be added at any time.
- All four edge cases from the review resolved (EC-1 CSRF warn-first, EC-2 CSP report-only, EC-3 matchRoutes safeguard + timeout, EC-4 hash-wasm).
- All 10 original-audit gaps closed (entry-client auto-inject, pipe-once, code-split, CSRF, security headers, traceId, Argon2id, 6 hydration regressions, real-browser tests on default, bundle budget).

### Changed (Argon2id password hashing — Phase 8 T8.1 / EC-4, 2026-05-18)
- **`examples/agent-saas` upgrades password hashing from PBKDF2 to Argon2id** via [hash-wasm](https://github.com/Daninet/hash-wasm). Pure WebAssembly — no native build step, works on Alpine and Vercel Edge (EC-4 amendment: chose hash-wasm over `@node-rs/argon2` precisely to avoid runtime portability issues). OWASP 2023 interactive parameters baked in: memory 19 MiB, iterations 2, parallelism 1.
- **Transparent migration** — `verifyPassword` routes by hash prefix. Legacy `pbkdf2$...` hashes still verify, and on success the function returns `{ ok: true, rehashAs: '<fresh argon2id$ hash>' }`. The login handler in `routes/login.ts` writes the new hash back to the user row, so each existing user upgrades on their next login without a downtime migration.
- **API shape change:** `verifyPassword(plain, stored)` now returns `{ ok: boolean, rehashAs?: string }` (was `boolean`). Callers update accordingly. The internal `_legacyHashForTests` is exposed for the regression test that proves the migration round-trip.
- 12 unit tests in `tests/unit/example-agent-saas-password.test.ts` covering argon2id round-trip, PBKDF2 legacy round-trip + rehash flag, malformed input safety, and uniqueness across hashes. Functional tests in `example-agent-saas-functional.test.ts` updated to the new return shape.
- Dogfood check #47 wired.

### Added (TraceId propagation — Phase 7 T7.1, 2026-05-18)
- **Every `/api/*` response now carries an `x-trace-id` header** in addition to the existing `x-request-id`. The traceId follows W3C-aware precedence: incoming `traceparent` (Trace Context spec) is parsed to extract the 32-hex trace-id; on miss, fall back to `x-request-id`; on miss, generate a fresh UUID. The same value flows into `sendError` and `logRequest`, so a single identifier correlates the client request, every server log line, and the response envelope.
- **`packages/theo/src/server/trace-context.ts`** — new module exports `extractTraceId(req)` + `parseTraceparent(value)` + constants (`TRACE_HEADER`, `TRACE_PARENT_HEADER`, `REQUEST_ID_HEADER`). Pure helpers — no side effects.
- W3C edge cases handled: wrong version byte (`99-…`) → null. All-zeros trace-id (spec reserved invalid) → null. Malformed strings → null. Multi-value `x-request-id` (proxy doubled the header) → takes first non-empty value. Empty strings → treated as absent.
- Backward compat: `requestId` field name preserved in log lines and error envelopes — same value, just available under two names while consumers migrate to `traceId`.
- 12 unit tests cover the parser + extractor + header precedence + uniqueness. Live curl confirms all three paths (generated, traceparent, x-request-id). Playwright spec adds a scenario asserting the response surfaces `x-trace-id` for both the generated and the traceparent-honored case.
- Dogfood check #46 wired.

### Added (Default security headers — Phase 6 T6.1 / EC-2, 2026-05-18)
- **Every `/api/*` response now carries OWASP-recommended security headers by default** — `Content-Security-Policy-Report-Only`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Strict-Transport-Security: max-age=31536000; includeSubDomains` in production (skipped in dev — no TLS on localhost).
- **CSP ships in `report-only` mode for 0.2.0** (EC-2 backward compat): existing apps with inline scripts or third-party CDN scripts keep working, but every violation lands in DevTools / CSP report collector so consumers can audit before the 0.3.0 cutover to `enforce`.
- **New config field `config.security.headers`** with full control: `csp` (string override or `false`), `cspMode` (`'enforce' | 'report-only' | 'off'`), `hsts` (string override or `false`), `frameOptions` (`'DENY' | 'SAMEORIGIN'`), `contentTypeOptions`, `referrerPolicy`. Handler-level `res.setHeader()` always wins (framework applies headers BEFORE the handler runs).
- **`packages/theo/src/server/security-headers.ts`** — new pure helpers `buildSecurityHeaders(config, env)` + `applySecurityHeaders(res, config, env)` + the exported `DEFAULT_CSP` policy string so docs and tests can reference it.
- 15 unit tests in `tests/unit/security-headers.test.ts` covering defaults, `cspMode` variants, env-gated HSTS, opt-out via `csp: false`, override precedence, and the `applySecurityHeaders` setHeader integration.
- Live verified: `curl -I /api/chat` against the dev server emits CSP report-only + Frame DENY + nosniff + Referrer-Policy. Dogfood check #45 wired.

### Added (Code-splitting back — Phase 4 T4.1, 2026-05-18)
- **Per-route lazy loading** with EC-3 safeguards. `generate.ts` emits `React.lazy(() => import(…))` for pages and a parallel `__theoPreloadMap` keyed by absolute route path. Layouts, errors, loading, and not-found components stay as static imports because they're always needed at boot — only pages get the split.
- **SSR-aware preload** in the entry-client: when `ssr: true`, the generated bootstrap imports `matchRoutes` from react-router, computes the matched routes against `window.location.pathname` (not a server-emitted hint — EC-3 safeguard against URL-drift races), and awaits the matched-route preload promises BEFORE calling `hydrateRoot`. By that point the `React.lazy` modules are cache-resolved, so no Suspense fallback fires during hydration → DOM matches SSR → onClick handlers survive.
- **Timeout fallback** — preload awaits with a 1500ms ceiling. On slow networks the framework proceeds to hydrate anyway; Suspense will then handle the lazy fallback as normal. Better to lose hydration on one slow request than hang every connection on a logic bug.
- **Bundle measurement** (default template, production build): initial JS **193.90 KB gzipped** (well below the 350 KB target) + a lazy page chunk **6.77 KB gzipped** separated. Code-splitting actually splits.
- 14 unit tests in `tests/unit/code-split-aware-hydrate.test.ts` covering manifest shape (lazy pages, static layouts, preload map keys), entry-client wiring (matchRoutes import, Promise.all order, 1500ms timeout, CSR mode emits no preload), and backward compatibility (Suspense still imported, Outlet wrap intact).
- Pre-existing Phase 1 regression tests (T1.5 `regression-5-hydration-data-wired.test.ts` and T1.6 `regression-6-route-manifest-static-imports.test.ts`) rewritten to lock the new invariant ("layouts static, pages lazy") instead of the old one ("nothing is lazy"). Any future PR that lazies the layout — which would re-introduce the hydration bug — now fails loudly.
- Playwright `template-default.spec.ts` updated: page-mounted waits replace synchronous DOM counts where page.tsx is now lazy. All 7 scenarios pass against the new code-split build.
- Dogfood check #44: validates `React.lazy` + `__theoPreloadMap` + `matchRoutes` + 1500ms timeout are all present.

### Added (Playwright browser tests for default template — Phase 10 T10.1, 2026-05-18)
- **`fixtures/template-default/`** — full mirror of the default scaffold template, added to `pnpm-workspace.yaml` so it installs against `theokit` via workspace link. Lives under fixtures because it's not a customer-facing example, it's a test surface.
- **`tests/e2e/template-default.spec.ts`** — 7 Playwright scenarios in real Chromium covering the canonical first-run surface: app shell renders (TopNav + Sidebar + main), regression check that the layout receives `<Outlet />` (the black-page bug from this week), chat composer accepts input and round-trips through SSE, streaming response arrives as 3 events in DOM order, CommandPalette opens via leading-button + Escape closes, keyboard shortcut (Ctrl+K) toggles the palette, zero unhandled console errors during a full chat session.
- **Playwright config** — fifth project `template-default` on port 3460 with its own webServer. Full e2e suite now: **20/20 PASS**.
- The spec also serves as a visibility test for the Phase 5 CSRF warn — every chat POST emits `csrf.warn` to the Playwright web server stdout, confirming the warn-first default is active end-to-end.
- Dogfood check #43: validates the spec + fixture + playwright wiring are all committed. Health now **43/43**.

### Added (CSRF warn-first — Phase 5, 2026-05-18)
- **Default CSRF enforcement on `defineRoute` POST/PUT/PATCH/DELETE** with three-mode policy: `off` / `warn` / `strict`. Default for 0.2.0 is `warn` — existing apps keep working and emit a structured `{"event":"csrf.warn",…}` log line for every state-mutating request without an `X-Theo-Action: 1` header. 0.3.0 will flip the default to `strict`. The check piggybacks on the same custom-header + Origin defense already used by `defineAction`, so no token state machine is added.
- **`config.security.csrf`** (`off | warn | strict`) — new optional config field, default `warn`. Set explicitly to `strict` to opt into the future default early, or `off` to disable for apps using a non-cookie auth scheme.
- **`defineRoute({ csrf: false })`** — per-route opt-out for legitimate cross-origin POSTs (Stripe webhooks, GitHub webhooks, OAuth callbacks). Does not affect other routes' enforcement.
- **`theoFetch` auto-attaches `X-Theo-Action: 1`** on every non-GET/HEAD/OPTIONS request, so consumer code keeps working when servers flip to `strict`.
- 10 unit tests in `tests/unit/csrf-warn-first.test.ts` covering all three modes + the warn payload shape; 8 integration tests in `tests/integration/csrf-protection.test.ts` covering the end-to-end path through `executeRoute` including the `csrf: false` opt-out and cross-origin rejection.
- Dogfood check #42: validates the full wiring (`enforceCsrf` + schema + `theoFetch` header + opt-out type). Health now **42/42**.

### Added (Pitch + landing copy, 2026-05-15)
- **`PITCH.md`** at project root — landing-page copy for TheoKit, intended for `usetheo.dev` and other marketing surfaces. HERO preserved from the locked narrative in the root `CLAUDE.md` (*"Build the app your agent lives in. Routing, auth, real-time, deploy — wired."*). Opening uses Hermes / Cursor / TheoCode as **honest category framing** — they are agents that live in terminal, IDE, and CLI surfaces respectively; TheoKit is positioned as the framework for the web-app surface where the agent meets paying customers. Includes `## What you'd ship` (6 concrete surfaces), `## Why TheoKit` (comparison table against Mastra, Vercel AI SDK + Next.js, and roll-your-own), `## Feel it` snippet (combines `defineRoute`, `defineWebSocket`, `theoFetch`), and an explicit `## How it works` DEEP DIVE delimiter with full technical reference below.
- **`README.md` — `## What you'd ship` section** inserted between `## What You Get` and the `## How it works` DEEP DIVE delimiter. Six concrete surfaces a TheoKit developer would ship; complements the feature-shaped `What You Get` bullets.
- **`README.md` — `## Why TheoKit` section** inserted after `## What you'd ship`. Opens with the Hermes / Cursor / TheoCode framing, then the comparison table against Mastra, Vercel AI SDK + Next.js, and roll-your-own. Closes with the punch line *"Mastra builds the agent. TheoKit ships the product around it. You can use both."*
- **`README.md` — `## Status` section** added before `## License`, replacing the prior `## Roadmap` checklist. Honest claims: Production for everything shipped (framework, CLI, four templates, four deploy targets, stable public API), explicit "on the roadmap" labels for the agent layer (`agents/` directory), documentation site, OpenAPI generation, and additional templates (auth-basic, stripe-saas).

### Changed (README structure, 2026-05-15)
- `## Roadmap` section removed from `README.md` — its content was consolidated into the new `## Status` section with honest production-vs-roadmap framing per the root `CLAUDE.md` Cross-Project Rule 8 ("Honest claims only").
