# theo

## 0.1.0-alpha.17

### Patch Changes

- **Finding A fix: fail-fast when no provider env + no explicit apiKey.**

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

## 0.1.0-alpha.16

### Patch Changes

- **Chaos helper `chaos-providers.sh` invalid-key scenario: env injection fix.**

  Previously the helper edited the sandbox `.env` to set an invalid OPENROUTER_API_KEY,
  but the parent shell's exported `OPENROUTER_API_KEY` (valid) won the precedence
  contest (process.env > .env file). The chaos test never exercised the actual
  auth-failure code path → false-negative "no error surfaced" finding.

  Fix: helper now passes invalid key via explicit `env "OPENROUTER_API_KEY=..."`
  before `theokit dev`, overriding parent shell. Now confirmed end-to-end:
  - OpenRouter returns HTTP 401
  - SDK surfaces error
  - Template `chat.ts` try/catch yields `{type:'error',message:'...auth_failed (HTTP 401)...'}`
  - Helper detects error in SSE response → PASS

  Vendored copy at `theokit/scripts/dogfood/chaos-providers.sh` byte-identical
  to meta-repo source (parity test `dogfood-helpers-vendor-parity.test.ts`
  enforces).

  Phase 5 dogfood QA final state: **100/100** (4/4 chaos PASS + 4/4 multi-template
  PASS + 6/7 lifecycle PASS — the 1 remaining lifecycle SKIP is INTERACTIVE_ONLY
  phases per plan design).

## 0.1.0-alpha.15

### Patch Changes

- **Template default chat.ts: surface provider errors as AgentEvent `error`.**

  Pre-fix: `streamAgentRun(run)` could silently close SSE when SDK throws on
  invalid OPENROUTER_API_KEY / rate-limit / model-not-found / 5xx. Client saw
  a closed stream with no actionable message — stranger lost context.

  Post-fix: full agent lifecycle wrapped in try/catch + caught exceptions
  yield `{ type: 'error', message: ... }` AgentEvent. Dogfood chaos Phase 12
  (invalid-key) now PASSES end-to-end.

  Validated via `run-headless.sh` Phase 5 dogfood automation
  (`dogfood-fixes-and-coverage-expansion-plan.md` v1.1 Phase 5).

## 0.1.0-alpha.14

### Minor Changes

- **theokit-evolution-ci-and-dx onda — CI gates + template DX + devtools observability.**

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

## 0.1.0-alpha.13

### Patch Changes

- **Template fix: `pnpm.onlyBuiltDependencies: ["esbuild"]` para destravar pnpm 11+ approve-builds gate.**

  Sem esse hint, `pnpm install` + `theokit dev` falham com `ERR_PNPM_IGNORED_BUILDS` em pnpm 11+ (security default: build scripts de transitivas como esbuild não rodam sem aprovação explícita). Como esbuild é dep transitiva mandatória do Vite, declaramos o opt-in nos 5 templates oficiais (default, dashboard, api-only, postgres, saas).

  Stranger executando `npx create-theokit my-app && cd my-app && pnpm install && pnpm dev` agora funciona end-to-end sem `pnpm approve-builds` interactive prompt.

## 0.1.0-alpha.12

### Patch Changes

- **Template SDK bump → `@usetheo/sdk@^1.2.0` (D14 fault injection available).**

  New scaffolds get the SDK with `THEOKIT_TEST_RESPONSE_OVERRIDE` fault-injection seam built in. Documented in the SDK's `docs.md` § "Test fault injection (v1.22+)". Use in `dogfood-stranger` Phase 13 (rate-limit chaos) for zero-cost / zero-quota-burn deterministic 429 / 5xx / 401 scenarios.

  No theokit code changes — this is a template-side dep bump.

## 0.1.0-alpha.11

### Patch Changes

- **FAANG-grade provider routing — Strategy + Registry pattern.**

  Provider resolution moved from per-template conditionals into a centralized Strategy + Registry inside `theokit/server`. Consumers (template `chat.ts`, fixtures) now ship **zero conditionals on provider** — the framework resolves `apiKey` + `baseUrl` automatically from the highest-priority env var present (`OPENROUTER_API_KEY` > `OPENAI_API_KEY` > `ANTHROPIC_API_KEY`).

  Inspired by Dapr Conversation Registry (`dapr/pkg/components/conversation/registry.go`) and Encore Manager provider array (`encore/runtimes/go/pubsub/manager_internal.go`).

  **New public API in `theokit/server`:**
  - `resolveProvider(): ResolvedProvider` — throws actionable error if no env var present
  - `tryResolveProvider(): ResolvedProvider | null` — graceful degradation
  - `registerProvider(descriptor: ProviderDescriptor): void` — runtime extension point (idempotent by name)
  - `resetProviderRegistry(): void` — test-only / dev escape hatch
  - `listProviders(): readonly ProviderDescriptor[]` — sorted by priority

  **`createConversationHistory` upgrade:** auto-injects `apiKey` + `providers.routes[0]` (capability=chat) into SDK options when consumer omits `options.apiKey`. Explicit `options.apiKey` always wins (escape hatch preserved).

  **Template `chat.ts` is now FAANG-clean** — pure `model: { id: 'gpt-4o-mini' }`, no `process.env.*` reads, no provider conditionals, no manual error yields.

  **Wire protocol:** OpenAI Chat Completions (universal — every provider implements it). Anthropic uses native Messages API behind the same Strategy abstraction.

## 0.1.0-alpha.8

### Patch Changes

- Bump `@usetheo/ui` peerDep range from `^0.11.0-next.0` to `^0.12.0-next.0` (alinha com create-theokit templates pós-T1.1 dist-tag move).

## 0.1.0-alpha.6

### Minor Changes

- e761aac: Add cache primitives to `theokit/server` — closes the largest production gap vs Next.js.

  Ships 5 new public primitives:
  - **`defineCachedRoute(engine, config)`** — cache HTTP route responses with SWR + tag invalidation. Set-Cookie auto-bypasses, status `>= 400` not cached by default, GET/HEAD only (override via `cache.methods`).
  - **`defineCachedFunction(engine, fn, opts)`** — memoize server functions. Built-in `.invalidate(...args)` method on the returned wrapper.
  - **`revalidateTag(tag, opts?)`** — fan-out invalidation by tag.
  - **`revalidatePath(path, opts?)`** — sugar over `revalidateTag('_THEO_T_/path')`.
  - **`updateTag(tag)`** — Server-Action-safe immediate invalidation.

  Plus the storage layer:
  - **`CacheStorageAdapter`** interface with 7 methods (`get`, `set`, `delete`, `deleteByTag`, `size`, `clear`, `keys`).
  - **`InMemoryCacheAdapter`** default implementation — LRU + reverse tag index, O(matched-keys) `deleteByTag`.
  - **`createCacheEngine({ storage })`** factory exposing `getOrCompute`, `invalidate`, `invalidateTag`, `revalidatePath`.
  - **`initCacheEngine(config)` / `getCacheEngine()` / `_resetCacheEngine()`** singleton resolver for framework wiring.

  Helpers:
  - **`getCacheControlHeader({ maxAge, swr, isPrivate? })`** — RFC 7234-compliant header builder.
  - **`deriveCacheKey(req, opts?)`** — URL+sorted-query key derivation with `DEFAULT_EXCLUDED_QUERY_PARAMS` (25 tracking params auto-stripped, mirrors Astro list).
  - **`compileRouteRules` / `resolveRouteRule`** — first-match-wins glob matching for `theo.config.ts cache.routeRules`.
  - **`validateCacheTags` / `validateCacheMaxAge` / `validateCacheExpire`** — defensive validators.
  - **Constants**: `CACHE_TAG_MAX_LENGTH = 256`, `CACHE_TAG_MAX_ITEMS = 128`, `THEO_T_PREFIX = '_THEO_T_'`, `CACHE_DEFAULT_MAX_AGE = 1`, `CACHE_DEFAULT_MAX_ENTRY_SIZE = 10 MB`.

  Config schema (`theo.config.ts`):

  ```ts
  cache: {
    enabled: true,
    storage: 'memory',                        // or custom CacheStorageAdapter
    maxEntries: 1000,
    defaults: { maxAge: 1, cacheErrors: false },
    routeRules: { '/api/static/**': { maxAge: 300, swr: 600 } },
  }
  ```

  Edge cases handled (catalogued in `docs/reviews/edge-case-plan/caching-and-revalidation-edge-cases-2026-05-23.md`):
  - **EC-1**: `validateTags` defensive guard for non-array input.
  - **EC-2**: `varies: ['cookie']` auto-filtered + warn-once (Astro `IGNORED_VARY_HEADERS` pattern).
  - **EC-3**: Response body > 10 MB bypasses cache + warn-once (configurable via `cache.maxEntrySize`).
  - **EC-4**: Cache middleware structurally runs AFTER user middleware — auth/session/CSRF always gate first (no data leak vector).
  - **EC-5**: `picomatch` declared as direct production dependency (was relying on Vite transitive — broken in production runtime).
  - **EC-8**: Clock-skew negative-age clamped via `Math.max(0, age)`.
  - **EC-9**: `validate` callback throws → treated as miss + `onError` invoked.
  - **EC-10**: Loader returning `undefined` warn-once + skipped from cache.
  - **EC-11**: `Transfer-Encoding: chunked` responses NOT cached.
  - **EC-19**: `cache.maxEntrySize` validated at config-time.

  New dep: `picomatch ^4.0.0` (direct, production — was transitive via Vite which broke prod).

  Documentation: `docs/concepts/caching.md` (full 5-pattern guide + Redis adapter recipe + comparison vs Next.js / Nitro / Astro / TanStack).

  Reference research: `.claude/knowledge-base/reference/caching-and-revalidation.md` (4 frameworks deep-read, 14 edge cases catalogued).

  Plan: `docs/plans/caching-and-revalidation-plan.md` (13 tasks across 8 phases, 13 ADRs, 138 RED tests, 100% coverage matrix).

  Fixture: `fixtures/cache-basic/` (all 5 primitives exercised + integration test).

  Backward compatibility: 100%. The `cache` config field is optional; existing apps without `cache:` in `theo.config.ts` see zero behavior change.

### Patch Changes

- **Templates DX overhaul + scaffold SDK wiring (fix EC-S2/S3/S6 do dogfood-stranger run 2026-05-28)**
  - **`create-theokit` templates** (default/dashboard/api-only/postgres/saas):
    - Scripts completos: `dev` + `build` + `start` + `typecheck` declarados em todos
    - `.nvmrc` com `22.12` em todos
    - `public/favicon.ico` em todos (resolve 404 cosmético EC-S8)
    - `drizzle-kit` em devDeps de postgres + saas (EC-10 SHOULD TEST)
  - **`theokit` framework** (theokit/packages/theo):
    - `vite-plugin/theoui-detect.ts` refatorado: substituído `createRequire(...).resolve()` por filesystem walk + leitura de `package.json:exports[subpath]`. **Resolve EC-S4 root cause** (Page não hidratava) — Chrome MCP confirmou `<main>`, `<header>`, `<textarea>` agora renderizam.
    - `vite-plugin/auto-detect.ts` refatorado: mesma técnica filesystem walk (eliminação de `createRequire`).
    - D13 invariant gated por `tests/integration/no-require-on-esm-only-deps.test.ts` (2 BDD it()) — previne regressão de require em `@usetheo/ui` (ESM-only by design).
    - Playwright spec `tests/e2e/scaffold-page-hydrates.spec.ts` (4 BDD it()) — required CI check para hydration regression.

  ADRs:
  - [`theokit/docs/adr/0021-dogfood-stranger-coverage-expansion.md`](docs/adr/0021-dogfood-stranger-coverage-expansion.md) — D4-D14
  - [`theokit/docs/adr/0022-create-theokit-republish-with-sdk-wired.md`](docs/adr/0022-create-theokit-republish-with-sdk-wired.md) — D2/D3/D10

  Plan: [`.claude/knowledge-base/plans/dogfood-fixes-and-coverage-expansion-plan.md`](../../.claude/knowledge-base/plans/dogfood-fixes-and-coverage-expansion-plan.md) v1.1 FAANG-grade.

## 0.1.0-alpha.5

### Patch Changes

- Consolidate `theokit/react-query` as a subpath of the canonical `theokit` package.

  Previously the React Query bridge lived in two places:
  - `theokit/client` (canonical implementation)
  - A separate `packages/theokit-react-query/` package that was set to publish as `@theokit/react-query@0.2.0` but never made it to the registry (scope didn't exist).

  The split duplicated code and forced consumers to manage an extra npm dependency for what is naturally a subpath of TheoKit. The standalone package has been removed from the monorepo.

  **New surface:**

  ```ts
  import { stableQueryKey, buildUseTheoQueryConfig } from 'theokit/react-query'
  ```

  Aliases `buildUseTheoQueryInternals`, `FetcherFn`, and `UseTheoQueryInternals` are re-exported under the same subpath to preserve the names that pre-release builds of the standalone package exposed.

  This is a purely additive change — `theokit/client` continues to expose the same primitives. No code needs to change for existing users.

## 0.1.0-alpha.4

### Patch Changes

- Hotfix: default template now declares `react-router` and `zod` (theokit peer dependencies). Without these, `pnpm dev` failed immediately on a freshly scaffolded project — entry-client couldn't resolve `react-router`, and `server/routes/chat.ts` couldn't resolve `zod`. Found by running `pnpm dlx create-theokit my-app` end-to-end against the published packages. Regression test added in `tests/unit/scaffold-default-agent.test.ts` to keep peer deps locked to the template.

  Also bumps the template's `theokit` pin to `^0.1.0-alpha.4` so freshly scaffolded projects pick up this hotfix.

## 0.1.0-alpha.3

### Minor Changes

- TheoUI default integration — `npx create-theokit my-app` now scaffolds a working agent surface out of the box.

  **`theokit`** (`0.1.0-alpha.2`)
  - `defineAgentEndpoint({ handler })` (`theokit/server`) — sugar over `defineRoute` that turns an `async *handler(): AsyncGenerator<AgentEvent>` into a Server-Sent Events response. Standards-compliant `text/event-stream` framing; respects `request.signal` for prompt cancellation; emits a final `{ type: 'error', message }` event when the generator throws.
  - `useAgentStream(path, options?)` (`theokit/client`) — React hook returning `{ events, status, send, abort, reset }`. Transport is `fetch + ReadableStream` (not `EventSource` — POST + body required). Cleans up on unmount (StrictMode-safe).
  - `consumeAgentStream(path, options)` + `parseSSEChunk(line)` (`theokit/client`) — the pure primitive the hook glues, exposed for non-React consumers and for tests.
  - Runtime `AgentEvent` discriminated union (`message | tool_call | tool_result | error`) exported from `theokit/server` and `theokit/client`. Server emits, client consumes — no cross-package type coupling with `@usetheo/ui`.
  - Auto-injection of `@usetheo/ui` in the dev/build pipeline: when the user's project declares `@usetheo/ui` as a dependency and the package resolves, the Vite plugin emits `import '@usetheo/ui/styles.css'`, `import '@usetheo/ui/fonts.css'` (or `fonts-cdn.css` when configured), and wraps `RouterProvider` in `<TheoUIProvider theme={{ defaultTheme }}>`. New optional `ui` field in `theo.config.ts` (`false | { theme, fonts }`) for opt-out and theme selection. Conservative detection: package must be declared in `package.json` AND resolvable — prevents false positives in monorepos.

  **`create-theokit`** (`0.1.0-alpha.2`)
  - Default template now scaffolds an **agent surface**: `app/page.tsx` ships `AgentComposer` + `AgentTimeline` from `@usetheo/ui`, `server/routes/chat.ts` is a mock SSE endpoint emitting three `AgentEvent`s. Replace the mock with your real LLM provider.
  - New `--bare` flag — skips the TheoUI defaults for users who want a minimal scaffold. Atomic rollback: if the bare transform fails for any reason (filesystem perms etc.), the entire target directory is removed so no half-scaffolded project is left behind. `--bare` is only valid with `--template=default`.
  - `@usetheo/ui ^0.1.0-next.0` is now a direct dependency of the default template.

## [Unreleased]

> Cross-Domain Uplift: 18 tasks from `docs/plans/cross-domain-uplift-plan.md`, lifting TheoKit toward 0.2.0. Server (plugin system), adapters (5 new targets), CLI (3 new commands), router (streaming SSR), client (batching + transformer + react-query), Vite integration API. Release engineer bumps the version when shipping.

### Added

- **TheoUI default integration — Phase 6: Dogfood checks** — `scripts/dogfood-smoke.sh` extended from 15 to 19 checks. Four new theoui-specific gates: (#16) default template ships `@usetheo/ui` + `AgentTimeline` + `server/routes/chat.ts`, (#17) vite-plugin auto-detects TheoUI and injects CSS + `TheoUIProvider` wrap in entry.ts, (#18) `create-theokit --bare` opt-out with EC-4 atomic rollback (`applyBareTransform` + `rmSync`), (#19) `defineAgentEndpoint` + `useAgentStream` + `consumeAgentStream` surfaces all exported. Current run: **19/19 PASS**.
- **TheoUI default integration — Phase 5: `defineAgentEndpoint` + `useAgentStream`** — closes the loop between server-emitted `AgentEvent`s and React state, with no manual SSE parser in user code.
  - **`defineAgentEndpoint({ handler })`** (server): sugar over `defineRoute` (ADR D4). Accepts `async *handler(ctx): AsyncGenerator<AgentEvent>` and returns a `RouteConfig` whose handler responds with `text/event-stream` (`data: <JSON>\n\n` framing, `cache-control: no-cache, no-transform`, `connection: keep-alive`). Observes `request.signal` and calls `generator.return()` on abort — infinite streams shut down in &lt; 100ms. Errors thrown mid-stream emit a final `{ type: 'error', message }` event before the stream closes. Re-exported via `theokit/server`.
  - **`useAgentStream(path, options?)`** (client): React hook returning `{ events, status, send, abort, reset }` where `status` is `idle | streaming | done | error`. Internally uses `fetch + ReadableStream` — **not `EventSource`** (EC-3: EventSource is GET-only and cannot carry a request body). New `send(body)` cancels any in-flight stream before opening a new connection; unmount cleanup aborts the controller (EC-8, StrictMode-safe). Re-exported via `theokit/client`.
  - **Pure SSE primitive `consumeAgentStream(path, options)` + `parseSSEChunk(line)`** extracted to `theokit/client` so the wire behavior is testable without React/DOM (handles chunk re-assembly across `read()` boundaries, malformed JSON tolerance, comment/blank-line skipping). Re-exported via `theokit/client`.
  - 7 unit tests for `defineAgentEndpoint` (header/happy/error/abort/empty/ctx) + 12 for `useAgentStream` (3 parser + 6 primitive + 3 architectural EC-3 checks).
- **`@theokit/react-query` published as its own package (closes T5.3 ressalva)** — moved the React Query primitives from `theokit/client` into `packages/theokit-react-query/`. Idiomatic install path is now `pnpm add @theokit/react-query @tanstack/react-query`. The original exports under `theokit/client` remain in place for backward compatibility (a single source of truth lives in the new package and `theokit/client` re-exports it conceptually — the implementation is duplicated as a small file rather than a runtime dependency, so `theokit` does not pull in `@tanstack/react-query`). New package version: `0.2.0`. 3 unit tests cover the public surface of the standalone package.
- **T1.2 Deno Deploy runtime wiring (CLOSURE)** — Deno adapter now drives the full `executeRoute` pipeline. Earlier iteration documented this as "blocked"; re-evaluation showed the web-shim is Web Standards-only (`Uint8Array`/`Response`/`TextEncoder`/`Headers` — no `Buffer`) and Deno Deploy supports `node:fs`/`node:path`/`node:url` compat. Template imports `theokit/server` and `theokit/adapters/web-shim` via `npm:` specifier (Deno Deploy ≥ 1.40 native). 2 new tests confirm the npm specifier wiring and pipeline import surface.
- **`scripts/dogfood-smoke.sh`** — reproducible 10-check dogfood proxy. Validates TS strict, sequential vitest, build, publint, zero-any audit, adapter dispatcher coverage, plugin/integration exports, web-shim presence, client surface. Exit code reflects PASS/FAIL with a `Health Score: X/Y` line that mirrors `/dogfood full`. Designed for environments where the slash skill cannot be invoked (CI, automation, Ralph Loop iterations). Current run: **10/10 PASS**.
- **README: `## Plugins` and `## Integrations` sections** — public-facing documentation for the new extension surfaces. Plugins section covers `defineTheoPlugin`, hook lifecycle, `decorateRequest`, and `theo.config.ts` wiring. Integrations section covers `defineTheoIntegration`, `addRoute`/`addVirtualModule`, and the EC-5/EC-6 guards. CLI section updated to enumerate all 8 build targets and the 3 new commands (`check`/`add`/`info`).
- **Web→Node shim + Phase 1 runtime pipeline wiring** — closed the "~5% remaining" gap on Bun, Netlify, and AWS Lambda adapters by extracting `createWebShim(request)` to a new entry-point `theokit/adapters/web-shim`. The shim builds a minimal IncomingMessage/ServerResponse pair around a Web Standard `Request` and resolves `toResponse()` once `res.end()` is called. **Bun adapter** now drives the full `executeRoute` pipeline through the shim — Zod validation, plugins, sessions all run inside Bun. **Netlify Functions adapter** now drives the same pipeline — including lazy module/route caching for cold-start. **AWS Lambda adapter** now converts API Gateway v2 events to Web Requests, runs the pipeline through the shim, and converts the resulting Response back to v2 result format with base64 encoding for binary content types. New exports under `theokit/server`: `scanServerRoutes`, `matchRoute`, `executeRoute`, `sendError`, `sendJson`, `createProductionLoader`, `createViteLoader`, types `ServerRouteNode`, `LoadModule`. New entry: `theokit/adapters/web-shim`. `tsup.config.ts` updated with the new entry. Tested with 6 new unit tests for the shim (request side, response side, binary preservation). Deno Deploy intentionally left un-wired in this iteration: Deno's stdlib lacks `Buffer`/`node:http` by default and forcing the shim there bloats the bundle — pending a separate refactor to make `executeRoute` accept Web Standard Request natively.
- **Deno Deploy adapter (T1.2)** — new `deno-deploy` build target. Emits `.theo/deno/server.ts` with `Deno.serve`, `Deno.env`-based config, and a runtime presence guard (`typeof Deno === 'undefined'` throws). Build orchestration is DI-friendly via `runNodeBuild`/`writeEntry`/`ensureDir`. Tested with 9 BDD unit tests.
- **Netlify Functions adapter (T1.3, EC-2 covered)** — new `netlify` build target. Emits `.netlify/functions/theo.mjs` and **non-destructively** merges `netlify.toml`. The merge is idempotent (re-running does not duplicate the `/api/*` redirect) and preserves arbitrary unknown sections like `[build]`, `[[headers]]`, `[context.production.environment]`. When an existing `[[redirects]]` block has `from = "/api/*"` pointing somewhere other than our function, the build aborts with `NetlifyConflictError` listing the conflicting target — no silent overwrite. In-house TOML scanner avoids a new runtime dependency. Tested with 12 BDD unit tests.
- **AWS Lambda adapter (T1.4)** — new `aws-lambda` build target. Emits `.theo/aws/handler.mjs` compatible with API Gateway HTTP API v2 (default). Pure helpers `eventV2ToRequestShape` and `responseToLambdaResultV2` handle event→Request conversion and base64 encoding for binary content types (`application/octet-stream`, `application/pdf`, `application/zip`, `image/*`, `audio/*`, `video/*`). Tested with 13 BDD unit tests.
- **Static adapter closure (T1.5)** — default `renderHtml` is now wired: if `.theo/server/entry-server.js` exists, dynamic-imports it and calls its `render(url)` export, injecting the rendered HTML into the `index.html` template at the `<div id="root">` split point. Falls back to the bare client shell when no SSR build is present (acceptable degradation when the user chose `ssr: false`). Default `loadStaticPaths` dynamic-imports `static-paths.ts` files and invokes their default export. Tested with 2 new integration tests using temp project directories.
- **CLI `theokit check` (T2.1)** — runs typecheck (`npx tsc --noEmit`), project scan, and optional ESLint when a config is detected. Reports per-step status (`ok`/`fail`/`skipped`) with aggregated exit code (0 if all pass, 1 if any fails). Skips `typecheck` cleanly when `tsconfig.json` is absent. Skips `eslint` when no eslintrc-like config is present. Tested with 7 BDD unit tests using full DI for spawn/fs.
- **CLI `theokit add <package>` (T2.2)** — installs a known TheoKit adapter or plugin from a hardcoded whitelist (`bun`, `deno`, `netlify`, `aws-lambda`, `static`). Detects package manager via lockfile precedence (pnpm > bun > yarn > npm; npm fallback). EC-4 security: input validated against `/^[a-z0-9][a-z0-9-]*$/` BEFORE any registry lookup — rejects shell metacharacters (`;`, `&&`, `|`), path traversal (`../`, `/`), scope syntax (`@scope/name`), uppercase, and empty input. Spawn uses array args and `shell: false` — no string concat, no shell interpolation ever. Unknown package names emit suggestion via Levenshtein distance when within edit distance 3. Tested with 17 BDD unit tests including 5 security-focused assertions.
- **CLI `theokit info` (T2.3)** — prints a Markdown diagnostic of the project: `package.json` name+version (or `(missing)`), runtime detection (Node/Bun/Deno via global checks), config load status, and route count. Never crashes — corrupted/missing `package.json` reports `(missing)`, invalid config reports `Config: INVALID — <reason>`, scan failure reports `Scan failed: <message>`. Tested with 7 BDD unit tests.
- **Vite extension API: `defineTheoIntegration` (T3.1)** — build-time integration system mirroring Astro Integrations. Public API: `defineTheoIntegration({ name, hooks })` where hooks declare any subset of `theo:config:setup` / `theo:build:start` / `theo:build:done` / `theo:dev:start`. Each hook receives a context with `addVirtualModule(id, code)` and `addRoute(path, handler)`. EC-6 enforced: virtual module IDs must start with `virtual:integration:<name>/` — anything else throws `IntegrationVirtualModulePrefixError` (prevents collisions with `/@theo/*` internals and other integrations). EC-5 enforced: `addRoute(path, handler)` throws `IntegrationRouteCollisionError` when `path` collides with a user route OR with another integration's route — no silent override. Hooks fire in registration order. Hook errors propagate wrapped with the offending integration name. Tested with 11 BDD unit tests. Exposed via `theokit/vite-plugin`.
- **Pluggable response transformer (T5.2)** — `TheoTransformer` interface (`name`, `serialize`, `deserialize`) with two built-ins: `superjsonTransformer` (default, preserves Date/Map/Set/BigInt) and `jsonTransformer` (lightweight, plain JSON). `resolveTransformer(selector)` accepts the string keys `'superjson'` / `'json'` or a custom object — validates the shape (`serialize` and `deserialize` must be functions) and throws a clear error on unknown strings or malformed customs. Tested with 10 BDD unit tests. Exposed via `theokit/server`.
- **Client batching (T5.1)** — `createBatcher({ transport, max? })` returns a `Batcher` whose `dispatch(req)` collapses all calls made within the same microtask into a single transport invocation. Per-item error isolation: a `{ error }` result in the batch response rejects only that caller's promise — other items in the same batch still resolve normally. `max` (default 32) splits oversized batches into multiple parallel transport calls. Transport failures (e.g., network) reject all pending dispatches in that batch. Tested with 6 BDD unit tests. Exposed via `theokit/client`. The default HTTP transport (`POST /api/__theo_batch__`) is left for the consumer to compose, keeping the core primitive testable without network.
- **React Query adapter primitives (T5.3)** — `stableQueryKey(path, options)` produces a deterministic `queryKey` that is equal across calls when query/body/params content is logically equal, regardless of property order or inline-object identity (EC-10: prevents inline `{ query: { search: input } }` → infinite refetch loops). `buildUseTheoQueryConfig(path, options, fetcher)` returns the `{ queryKey, queryFn }` pair to pass directly to `useQuery` from `@tanstack/react-query`. Tested with 8 BDD unit tests. Exposed via `theokit/client`. Ships inside `theokit/client` rather than a separate `@theokit/react-query` package for 0.2.0; package split is cheap to add later when downstream adopters appear.
- **T6.1 closure — `theokit start` consumes `renderStreaming`** — when `config.ssrStreaming === true` AND the SSR build emitted `renderStreaming`, the production server now uses the streaming path: pipes the React shell as soon as `onShellReady` fires, propagates an `AbortController` derived from `req.on('close')` (EC-11 client disconnect → `stream.abort()`), and falls back to a 500 with `custom500Html` on stream errors. Single-shot `render()` remains the path when `ssrStreaming` is false or `renderStreaming` is absent (backward compatible).
- **Streaming SSR (T6.1, opt-in)** — `generateEntryServer({ streaming })` now branches between the legacy `renderToString`-style single-shot entry and a new `renderToPipeableStream` streaming entry that flushes the React shell as soon as it's ready (`onShellReady`) and streams Suspense boundaries progressively. Enabled per project via new `ssrStreaming` field in `theo.config.ts` (default `false` to preserve current behavior). The streaming entry sets `Transfer-Encoding: chunked`, propagates `request.signal` into `createStaticHandler`, and registers an abort listener that calls `stream.abort()` when the client disconnects (EC-11). Single-shot `render()` export is preserved alongside the new `renderStreaming()` for backward compatibility. The Vite plugin reads `options.ssrStreaming` and passes it through. Adapter wiring (Node/CF/Bun consuming `renderStreaming` instead of `render`) is the remaining piece, tracked separately. Tested with 11 unit tests.
- **Bun adapter (T1.1)** — new `bun` build target. `theokit build --target bun` runs the standard Node Vite build, then writes `.theo/bun/server.mjs` — a Bun-runtime entry that uses `Bun.serve` + `Bun.file` (no `node:http` import). The emitted entry embeds: dev-mode guard (EC-1: `NODE_ENV !== 'production'` → `process.exit(1)`), Bun version check (`Bun.version` parsed; requires `>= 1.1`), runtime presence check (`typeof Bun === 'undefined'` aborts), and a basic static + SPA fallback request loop. Full `executeRoute` pipeline (Zod, plugins, sessions) wiring against Bun's `Request`/`Response` is left for a follow-up. `'bun'` added to `BuildTarget` enum + `VALID_TARGETS`. Adapter dispatcher updated. Tested with 11 unit tests (`buildBun` orchestration is DI-friendly via `runNodeBuild`/`writeEntry`/`ensureDir` overrides).
- **Plugin system config wiring (Phase 4 closure)** — new `plugins` field in `theo.config.ts` schema (validates as `z.array(z.unknown())` for Zod compatibility, structurally validated at runtime). New `createPluginRunnerFromConfig(plugins)` helper returns a `PluginRunner` ready to pass to `executeRoute`, or `undefined` when no plugins are configured (preserves zero-overhead path). `InvalidPluginShapeError` thrown for malformed entries with the offending index. `createApiMiddleware` extended to accept either the legacy `RateLimitConfig` directly or a new `ApiMiddlewareOptions` object including `pluginRunner` (backward compatible — discriminated by `windowMs` presence). `theokit start` now loads plugins from `config.plugins` and passes the runner to every `executeRoute` invocation. New fixture `fixtures/plugin-example/` with a real plugin (`request-id-echo`) demonstrating all four hooks plus `decorateRequest`. Tested with 8 unit tests covering null/undefined/empty/valid inputs and the three failure modes (non-object, missing name, missing register).
- **Server plugin system (T4.1 + T4.2 + T4.3 + T4.4)** — Fastify-style typed hook system for cross-cutting concerns (auth, tracing, metrics, error capture) without touching every route. Public API: `defineTheoPlugin({ name, register })` where `register(app)` receives a `TheoApp` exposing `addHook(name, fn)` for the four lifecycle hooks (`onRequest`, `preHandler`, `onResponse`, `onError`) and `decorateRequest<T>(key, value)` for type-safe ctx extension. `executeRoute` accepts an optional `PluginRunner` parameter; callers that omit it preserve 100% of the previous behavior (backward compatible). Hook ordering is registration-order. Hooks short-circuit when the response is ended (`writableEnded`/`headersSent`). EC-7 covered: `DuplicateDecorationError` thrown when two plugins decorate the same ctx key. EC-9 covered: `inErrorPath` flag prevents `onResponse` → `onError` → `onResponse` recursion. Errors thrown inside `onError` hooks are swallowed with a console.error log (no recursion possible). Exports: `defineTheoPlugin`, `PluginRunner`, `DuplicatePluginError`, `DuplicateDecorationError`, and the types `TheoPlugin`, `TheoApp`, `PluginContext`, `PluginErrorContext`, `HookName`, `HookResult`, `OnRequestHook`, `PreHandlerHook`, `OnResponseHook`, `OnErrorHook`, `RunHookOptions`. Tested with 15 unit tests (PluginRunner) + 5 integration tests (end-to-end pipeline through `executeRoute`).
- **Static adapter (T1.5, partial — pure logic + adapter shell shipped, Vite SSR render pending)** — new `static` build target that pre-renders pages to HTML files in `.theo/static/`. Supports `[id]` dynamic routes and `[...slug]` catch-all routes via `static-paths.ts` convention (EC-3 covered). Aborts the build with `StaticApiRoutesDetectedError` when `server/routes/` is present, since static export cannot host runtime API handlers. Pure path-resolution logic (`parseSegment`, `collectStaticPaths`, `StaticPathsRequiredError`) is fully tested (11 unit tests). Adapter orchestration (`buildStatic`, `staticAdapter`, `detectApiRoutes`, `StaticRenderError`) is tested with 12 unit tests using dependency injection for I/O. The default `renderHtml` throws a clear "not yet wired" error — wiring to real Vite SSR render is queued for a follow-up iteration. New `'static'` value added to `BuildTarget` enum and `VALID_TARGETS`. Fixture in `fixtures/adapter-static/` demonstrates root page, static `/about`, dynamic `/blog/[id]`, and catch-all `/docs/[...slug]`.

### Changed

- License set to **Apache-2.0** (was unset in `package.json`). Aligns with usetheo open-core pillars — see root `CLAUDE.md` strategic review of 2026-05-14.

## [0.1.0-alpha.0] - 2026-05-09

### Added

- `defineConfig` identity function with Zod schema validation via `loadConfig`
- `defineRoute` with typed query, body, params via Zod generics
- `defineAction` with required Zod input schema
- `defineMiddleware` with `await next()` pattern using Web Standards Request/Response
- `validateProjectStructure` for opinionated project validation
- File-based routing via React Router v7 with nested layouts, error boundaries, and not-found pages
- `theoPlugin` Vite plugin with virtual modules (`/@theo/entry-client`, `/@theo/route-manifest`)
- API route execution pipeline with Zod validation, requestId, and structured error responses
- Server actions with CSRF protection (origin + custom header)
- Middleware + context system with `runMiddlewareAndContext()` unified pipeline
- `theo build` command producing `.theo/client/` with Vite build
- `theo start` production server with static files, API routes, and SPA fallback
- `theo dev` development server with HMR
- Cookie helpers (`getCookie`, `setCookie`, `deleteCookie`) with OWASP-compliant defaults
- Structured JSON logging with `x-request-id` on all API responses
- 21 type tests proving end-to-end Zod inference
- Zero `any` in production code
