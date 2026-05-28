# Plan: Architecture Medium Deferrals — close P-1, P-2, P-3

> **Version 1.2** — Fecha os 3 MEDIUM findings deferidos pelo `/loop-architecture-review` de 2026-05-27 que não foram cobertos pelo `architecture-cleanup` plan. v1.1 dobrou 2 MUST FIX (EC-1 + EC-2). v1.2 (2026-05-27, segunda passada do edge-case-plan) dobra mais 1 MUST FIX: **EC-v2-1** — T4.2 rename `architecture.db` para `architecture-pre-medium-deferrals.db` ANTES de rodar o pipeline (evita AUTOINCREMENT accumulation em tabelas sem UNIQUE em conteúdo: `architectural_findings`, `principle_violations`, etc). **P-1** substitui o `switch(target)` em `cli/commands/build.ts:127` por um Adapter Registry (closes OCP violation; effort ~1d). **P-2** divide `vite-plugin/index.ts` (648 LOC, 4 mixed concerns) em arquivos por concern (closes SRP heuristic violation; effort ~0.5d). **P-3** codifica a exceção PascalCase para componentes React em `.claude/rules/architecture.md` v3.1 + `.ls-lint.yml` comment (closes false-positive; effort ~1h). Expected outcome: composite score 8.0 → 9.0+, zero remaining MEDIUM findings.

## Context

O `/loop-architecture-review:loop-architecture-review` rodado em 2026-05-27 (iteração 4 do Ralph loop) emitiu `ARCHITECTURE REVIEW COMPLETE` com composite 8.0/10 (substantive 8.8/10). 0 CRITICAL, 0 HIGH, 0 cycles — fundação FAANG-grade. Mas 3 NOVOS MEDIUM findings emergiram do finer-grained accounting e foram documentados como **DEFERRED** no `architecture-cleanup-plan.md` (escape clause option 3, linhas 1782-1822):

**Evidência registrada:**

- **P-1** — `cli/commands/build.ts:127` switch-statement em `target` (9 cases) viola OCP. Cada novo adapter requer edit do CLI. Princípio: "Open for extension, closed for modification" (Robert Martin). DB: `principle_violations` — OCP MEDIUM. Effort estimado ~1d.
- **P-2** — `vite-plugin/index.ts` tem 648 LOC (consenso ≤500 heurístico) misturando 4 concerns: config-resolve, dev-middleware, SSR dev wiring, WebSocket upgrade. Findability ruim — para um novo dev, "onde está a lógica de SSR dev?" requer scan completo do arquivo. DB: `principle_violations` — SRP MEDIUM. Effort ~0.5d.
- **P-3** — `devtools/components/Tabs/` contém 5 arquivos `PascalCase.tsx` (`CsrfReadinessTab.tsx`, `ErrorsTab.tsx`, `RequestsTab.tsx`, `RoutesTab.tsx`, `SettingsTab.tsx`). `.ls-lint.yml` JÁ permite `PascalCase | kebab-case` para `.tsx`, mas a estrutura do diretório `Tabs/` (PascalCase) + os componentes confundem a auditoria heurística que esperava convenção uniforme. DB: `naming_violations` — MEDIUM. Effort ~1h (decisão de docs, não rename).

Por que AGORA: a auditoria identificou esses items como "scope-expansion", mas eles SÃO oportunidades pequenas e de alto ROI. Fechar todos os 3 leva o score de 8.0/10 para 9.0+ (composite). O plan também documenta a convenção React+PascalCase em `.claude/rules/architecture.md` v3.1 que outros plans futuros podem referenciar.

Referências:
- `docs/plans/architecture-cleanup-plan.md` (v1.1) — escape clause option 3
- `architecture-output/final-report.md` — re-run report (36587 bytes)
- ADR-0001 v3 (`docs/adr/0001-update-architecture-rules-to-current-module-layout.md`)
- ADR-0007 (`docs/adr/0007-storage-manager-singleton.md`) — pattern reference for D9 (singleton with __resetForTests)

## Objective

**Done = composite score `/loop-architecture-review` ≥ 9.0/10 com zero MEDIUM remanescente de P-1, P-2, P-3.**

Goals mensuráveis:
1. `runAdapterBuild` em `cli/commands/build.ts` substituído por chamada a `adapterRegistry.lookup(target).build(...)` — switch removido.
2. `vite-plugin/index.ts` reduzido para ≤300 LOC com extraction de SSR dev middleware + WS upgrade handler em arquivos sibling.
3. `.claude/rules/architecture.md` v3.1 documenta explicitamente "React components use PascalCase by convention; `.ls-lint.yml` already encodes this exception" — DB finding `N-Tabs` annotated com `INTENTIONAL`.
4. Suite vitest mantém 3155+ passing; lint clean; dep-cruiser clean.
5. Re-run `/loop-architecture-review` → score ≥ 9.0; 0 MEDIUM findings de P-1/P-2/P-3 reaparecendo.

## ADRs

### D1 — Adapter Registry pattern para `runAdapterBuild`
**Decisão:** Introduzir `adapters/registry.ts` que exporta `adapterRegistry: Record<BuildTarget, () => Promise<DeployAdapter>>`. CLI invoca `await (await adapterRegistry[target]()).build(...)`. Switch é eliminado.
**Rationale:** Closes OCP (P-1). Adicionar adapter = adicionar 1 linha no registry, sem editar CLI. Mantém lazy import (dep só carrega quando target == 'X'). Adapter contrato (`DeployAdapter`) já existe em `adapters/types.ts:18`.
**Consequences:** ✅ adapters viram catálogo declarativo; novos adapters não tocam CLI; ❌ uma indireção adicional (`registry[target]()` em vez de `case 'target':`) — aceitável, ganho > custo.

### D2 — Split `vite-plugin/index.ts` em 4 arquivos por concern
**Decisão:** Manter `vite-plugin/index.ts` como **assembly point + public API** (factory `theoPlugin` + `theoPluginAsync`). Extrair:
- `vite-plugin/config-resolve.ts` — `configResolved` hook (carrega `theo.config.ts`, resolve transformer, batching, security headers, csrf mode, theoui detect, audit logger)
- `vite-plugin/ssr-dev-middleware.ts` — `setupSsrDevMiddleware(server)` (dev SSR HTML transform, virtual entry-server)
- `vite-plugin/ws-upgrade.ts` — `setupWsUpgrade(server, wsRoutes)` (WebSocket upgrade handler para dev mode)
- `vite-plugin/index.ts` — orchestration spine (≤300 LOC, importa os 3 acima)

**Rationale:** Closes SRP heuristic (P-2). Cada concern fica testável isoladamente. `theoPlugin` continua sendo o único public API.
**Consequences:** ✅ findability melhora (dev SSR? abre `ssr-dev-middleware.ts`); ❌ 3 novos arquivos (overhead organizacional compensado por cohesion).

### D3 — Documentar exception PascalCase para React components em `.claude/rules/architecture.md` v3.1
**Decisão:** Adicionar seção "Naming convention exceptions" em `.claude/rules/architecture.md` v3.1 explicando: `.ls-lint.yml` admite `PascalCase | kebab-case` para arquivos `.tsx`. React component files are conventionally PascalCase (`<MyComponent>.tsx`). Direct dir nesting (`devtools/components/Tabs/<TabName>Tab.tsx`) is the React-canonical structure and is INTENTIONAL. Nenhum rename necessário.
**Rationale:** Closes false-positive heuristic finding (P-3). A convenção JÁ existe; o gap é só documentation. Codificar evita re-flagging em auditorias futuras.
**Consequences:** ✅ doc-level fix (sem código mudado); ✅ próximas auditorias não re-flagam; ❌ nenhuma.

## Dependency Graph

```
Phase 0 (Preflight) ──▶ Phase 1 (P-1 Adapter Registry) ──▶ Phase 4 (Validation)
                  │
                  ├──▶ Phase 2 (P-2 vite-plugin split) ──┤
                  │                                      │
                  └──▶ Phase 3 (P-3 docs exception) ─────┤
                                                         ▼
                                              Phase 4 (Re-run + Dogfood)
```

Phase 1, 2, 3 podem rodar em **paralelo** (toque arquivos disjuntos). Phase 4 é o portão final.

---

## Phase 0: Preflight

**Objective:** baseline state confirmation antes de mexer.

### T0.1 — Capture baseline metrics

#### Objective
Registrar contagens atuais (LOC, eslint-disable count, switch arms, dep-cruiser violations) ANTES de qualquer change para comparar pós-implementação.

#### Evidence
Plan goals 1-5 dependem de delta measurable.

#### Files to edit
```
docs/audit/phase-0-medium-deferrals-preflight-2026-XX-XX.md — (NEW) baseline snapshot
```

#### Deep file dependency analysis
- Audit file is documentation only; no downstream impact.

#### Deep Dives
**Métricas to capture:**
- `wc -l packages/theo/src/cli/commands/build.ts` (esperado ~160)
- `wc -l packages/theo/src/vite-plugin/index.ts` (esperado 648)
- `grep -c "case '" packages/theo/src/cli/commands/build.ts` (esperado 9)
- `pnpm --filter theokit exec tsc --noEmit` (esperado clean)
- `pnpm lint` (esperado clean)
- `./node_modules/.bin/depcruise packages/theo/src --config .dependency-cruiser.cjs` (esperado 0 violations)

#### Tasks
1. Rodar comandos acima
2. Salvar output em `docs/audit/phase-0-medium-deferrals-preflight-{YYYY-MM-DD}.md`

#### TDD + BDD

```
RED:     test_preflight_snapshot_exists() — Given docs/audit/, When listed, Then phase-0-medium-deferrals-preflight-*.md exists.
RED:     test_preflight_contains_baseline_metrics() — Given the snapshot, When grep "vite-plugin/index.ts 648", Then match.
RED:     test_preflight_lint_baseline_clean() — Given baseline, When grep "lint.*exit.0", Then match.
RED:     test_preflight_deps_baseline_clean() — Given baseline, When grep "0 violations", Then match.
GREEN:   Run captures + write file.
REFACTOR: None.
VERIFY:  ls docs/audit/phase-0-medium-deferrals-preflight-*.md
```

**BDD scenarios:**
- **Happy path:** snapshot file exists with all 6 baseline metrics
- **Validation error:** missing metric → fail
- **Edge case:** clean baseline (0 violations) recorded literally
- **Error scenario:** baseline not clean → halt and investigate before proceeding

#### Acceptance Criteria
- [ ] Snapshot file exists
- [ ] All 6 baseline metrics captured
- [ ] Baseline confirms `tsc/lint/deps` clean before Phase 1+ start

#### DoD
- [ ] Audit file committed
- [ ] All 6 metrics recorded

---

## Phase 1: P-1 Adapter Registry

**Objective:** Substituir switch em `runAdapterBuild` por registry lookup. Closes OCP.

### T1.1 — Create `adapters/registry.ts`

#### Objective
Centralizar adapter dispatch em arquivo declarativo. `runAdapterBuild` passa de switch para lookup.

#### Evidence
- P-1 (architecture review 2026-05-27 medium finding)
- `cli/commands/build.ts:127-160` tem 9 `case` statements idênticos em forma (`{ const X = await import(...); await X.build(config, cwd, ctx); return }`)
- `DeployAdapter` contract já existe em `adapters/types.ts:18`

#### Files to edit
```
packages/theo/src/adapters/registry.ts — (NEW) declarative map BuildTarget → () => Promise<DeployAdapter>
packages/theo/src/cli/commands/build.ts — runAdapterBuild uses registry.lookup(target).build(...) instead of switch
packages/theo/src/adapters/types.ts — re-export adapterRegistry from registry.ts (single canonical home)
```

#### Deep file dependency analysis
- **`adapters/registry.ts` (NEW)** — declares `Record<BuildTarget, () => Promise<DeployAdapter>>` with lazy-import factories. ~35 LOC. No circular dep risk (only types from `./types.js` + dynamic imports of each adapter).
- **`cli/commands/build.ts`** — currently 162 LOC with switch 9 cases. Becomes ~120 LOC. The switch block (lines 127-160) → 2-line lookup.
- **`adapters/types.ts`** — already exports `BuildTarget`, `VALID_TARGETS`, `DeployAdapter`. Adicionar `adapterRegistry` re-export para conveniência.
- **Tests** — `tests/integration/services-other-adapters-reject.test.ts` invoca cada adapter; deve continuar funcionando (lookup é equivalente).

#### Deep Dives

**Registry shape:**
```ts
// adapters/registry.ts
import type { BuildTarget, DeployAdapter } from './types.js'

export const adapterRegistry: Record<BuildTarget, () => Promise<DeployAdapter>> = {
  node: async () => (await import('./node.js')).nodeAdapter,
  vercel: async () => (await import('./vercel.js')).vercelAdapter,
  cloudflare: async () => (await import('./cloudflare.js')).cloudflareAdapter,
  static: async () => (await import('./static.js')).staticAdapter,
  bun: async () => (await import('./bun.js')).bunAdapter,
  'deno-deploy': async () => (await import('./deno-deploy.js')).denoDeployAdapter,
  netlify: async () => (await import('./netlify.js')).netlifyAdapter,
  'aws-lambda': async () => (await import('./aws-lambda.js')).awsLambdaAdapter,
  'theo-cloud': async () => (await import('./theo-cloud.js')).theoCloudAdapter,
}

export async function resolveAdapter(target: BuildTarget): Promise<DeployAdapter> {
  const factory = adapterRegistry[target]
  if (!factory) {
    throw new Error(`Adapter "${target}" not registered`)
  }
  return factory()
}
```

**Call site simplification:**
```ts
// cli/commands/build.ts (replaces switch)
async function runAdapterBuild(target, config, cwd) {
  const { resolveAdapter } = await import('../../adapters/registry.js')
  const ctx = buildAdapterContext(target, config)  // (existing logic moves to small helper)
  const adapter = await resolveAdapter(target)
  await adapter.build(config, cwd, ctx)
}
```

**Invariantes:**
- Lazy-import preservado (factory functions only load module on first call)
- `BuildTarget` union remains source of truth — TypeScript exhaustiveness check ensures every target is in registry
- Error message format on unknown target stays consistent

**Edge cases:**
- Empty registry → tsc would catch via `BuildTarget` exhaustiveness
- Adapter import fails → propagates with platform name in stack
- Adding new BuildTarget → tsc fails on `adapterRegistry` (missing key) — desired

#### Tasks
1. Criar `packages/theo/src/adapters/registry.ts` com `adapterRegistry` + `resolveAdapter`
2. Substituir `runAdapterBuild` em `cli/commands/build.ts` (remove switch + 9 cases; use lookup)
3. Re-export `adapterRegistry` opcionalmente de `adapters/types.ts` (single canonical home)
4. Update existing adapter rejection test paths if needed

#### TDD + BDD

```
RED:     test_adapter_registry_lookup_returns_node() — Given adapterRegistry, When key='node' called, Then returns DeployAdapter with name='node'.
RED:     test_adapter_registry_lookup_returns_all_9_targets() — Given VALID_TARGETS, When each is looked up via resolveAdapter, Then each returns DeployAdapter.
RED:     test_valid_targets_matches_registry_keys() (EC-v2-2 SHOULD TEST) — Given VALID_TARGETS array + adapterRegistry keys, When `Object.keys(adapterRegistry).sort()` compared to `[...VALID_TARGETS].sort()`, Then identical. Garante que `BuildTarget` union, `VALID_TARGETS` const, e `adapterRegistry` keys nunca driftem.
RED:     test_runAdapterBuild_no_switch_statement() — Given cli/commands/build.ts source, When grep "case '", Then 0 matches.
RED:     test_runAdapterBuild_calls_resolveAdapter() — Given cli/commands/build.ts source, When grep "resolveAdapter", Then ≥1 match.
RED:     test_lazy_import_preserved() — Given build for target='node', When monitoring imports, Then vercel/cloudflare/etc are NOT loaded.
RED:     test_unknown_target_throws_actionable() — Given resolveAdapter('invalid' as BuildTarget), When called, Then throws with 'not registered' message.
GREEN:   Create registry + refactor build.ts.
REFACTOR: Consider exposing `listAdapters()` if test ergonomics demand.
VERIFY:  npx vitest run tests/unit/adapter-registry.test.ts tests/integration/services-other-adapters-reject.test.ts
```

**BDD scenarios:**
- **Happy path:** `pnpm --filter theokit build --target node` works
- **Validation error:** invalid `--target` → existing error message preserved (handled by `VALID_TARGETS` check in build.ts BEFORE adapter dispatch)
- **Edge case:** `target='theo-cloud'` (Wave 3 stub) still resolves
- **Error scenario:** adapter module fails to import → error bubbles with platform name

#### Acceptance Criteria
- [ ] `packages/theo/src/adapters/registry.ts` exists with declarative map
- [ ] `grep "case '" packages/theo/src/cli/commands/build.ts` returns 0
- [ ] All 9 adapters reachable via `resolveAdapter(target)`
- [ ] Existing test `services-other-adapters-reject.test.ts` passes unchanged
- [ ] Pass: `tsc --noEmit` clean
- [ ] Pass: `pnpm lint --max-warnings=0` clean
- [ ] Pass: `pnpm check:deps` clean

#### DoD
- [ ] All tasks done
- [ ] OCP violation closed in `architecture-pre-cleanup.db` (UPDATE `principle_violations` SET status='resolved' WHERE category='ocp')
- [ ] Adapter Registry pattern recorded in DB `design_pattern_findings` as `applied_correctly`

---

## Phase 2: P-2 vite-plugin split

**Objective:** Reduzir `vite-plugin/index.ts` de 648 → ≤300 LOC via extraction. Closes SRP heuristic.

### T2.1 — Extract `configResolved` hook to `config-resolve.ts`

#### Objective
Mover lógica do hook `configResolved` (carrega config, transformer, batching, security headers, csrf, theoui detect) para arquivo dedicado.

#### Evidence
- P-2 (architecture review 2026-05-27 medium finding)
- `vite-plugin/index.ts:187-260` (the `configResolved()` function body) é ~75 LOC apenas para carregamento de config

#### Files to edit
```
packages/theo/src/vite-plugin/config-resolve.ts — (NEW) export resolvePluginConfig(projectRoot): Promise<ResolvedPluginConfig>
packages/theo/src/vite-plugin/index.ts — configResolved hook calls resolvePluginConfig + assigns to closure vars
```

#### Deep file dependency analysis
- **`config-resolve.ts` (NEW)** — single async function + result type. Imports from `config/load-config`, `server/plugins/load-plugins`, `server/transformer`, `server/observability/audit-log`, `vite-plugin/theoui-detect`. ~80 LOC.
- **`vite-plugin/index.ts`** — `configResolved` shrinks from ~75 LOC to ~15 LOC (just call + assign).

#### Deep Dives

**Result type:**
```ts
export interface ResolvedPluginConfig {
  pluginRunner: PluginRunner | undefined
  transformer: TheoTransformer | undefined
  resolvedBatching: { max?: number } | undefined
  theoUi: TheoUiDetectResult | undefined
  csrfMode: 'off' | 'warn' | 'strict'
  securityHeaders: SecurityHeadersConfig | undefined
  disallowed: DisallowedConfig | undefined
  cors: CorsConfig | undefined
  auditLogger: AuditLogger | undefined
  devtoolsEnabled: boolean
}
```

**Invariantes:**
- `pluginRunner` cached single-instance (configResolved runs once; the `configLoadedOnce` flag stays in index.ts)
- All side effects (instantiations) stay deterministic per config
- Error during config-resolve aborts the dev server (existing behavior preserved)

**Edge cases:**
- `theo.config.ts` invalid → error propagates (already handled by loadConfig)
- Optional fields (audit.logger, cors) → undefined when absent
- Theo UI not installed → `theoUi.enabled === false`

#### Tasks
1. Criar `vite-plugin/config-resolve.ts` com `resolvePluginConfig` function + result type
2. Em `vite-plugin/index.ts`, replace `configResolved` body with call to `resolvePluginConfig(projectRoot)` + destructure into closure vars
3. Verify `theoPlugin` factory still returns identical Plugin shape

#### TDD + BDD

```
RED:     test_resolve_plugin_config_returns_all_fields() — Given a valid theo.config.ts, When resolvePluginConfig called, Then result has all 10 expected fields.
RED:     test_vite_plugin_index_shrinks() — Given vite-plugin/index.ts, When wc -l, Then ≤ 580 (interim target; full target ≤300 after all extractions).
RED:     test_config_resolved_calls_resolvePluginConfig() — Given vite-plugin/index.ts, When grep "resolvePluginConfig(", Then ≥1 match.
RED:     test_theoPlugin_factory_unchanged() — Given import { theoPlugin } from 'theokit/vite-plugin', When called, Then returns Plugin (signature preserved).
GREEN:   Extract function + refactor.
REFACTOR: None.
VERIFY:  npx vitest run tests/unit/vite-plugin-config-resolve.test.ts && pnpm --filter theokit exec tsc --noEmit
```

**BDD scenarios:**
- **Happy path:** valid config → all fields populated
- **Validation error:** invalid `theo.config.ts` → throws (same as today)
- **Edge case:** missing optional sections (cors, audit) → undefined
- **Error scenario:** Theo UI detect fails → `theoUi.enabled = false`, plugin continues

#### Acceptance Criteria
- [ ] `vite-plugin/config-resolve.ts` exists
- [ ] `vite-plugin/index.ts` LOC reduced (interim ≤580; final target after T2.2/T2.3 ≤300)
- [ ] Pass: tsc + lint + deps
- [ ] Pass: dev fixture tests (api-middleware, theoui-autoinject)

#### DoD
- [ ] All tasks done
- [ ] No behavior regression in dev mode

---

### T2.2 — Extract SSR dev middleware to `ssr-dev-middleware.ts`

#### Objective
Mover lógica do dev-mode SSR middleware (virtual entry-server, transformIndexHtml com SSR HTML transform) para arquivo dedicado.

#### Evidence
- P-2: SSR dev wiring é ~120 LOC dentro de `vite-plugin/index.ts` misturado com config + WS

#### Files to edit
```
packages/theo/src/vite-plugin/ssr-dev-middleware.ts — (NEW) export setupSsrDevMiddleware(viteServer, config)
packages/theo/src/vite-plugin/index.ts — configureServer hook calls setupSsrDevMiddleware
```

#### Deep file dependency analysis
- **`ssr-dev-middleware.ts` (NEW)** — exports `setupSsrDevMiddleware(server: ViteDevServer, opts: { ssrEnabled, ssrStreaming, theoSrcDir }): void`. Wires virtual entry-server module + transformIndexHtml hook.
- **`vite-plugin/index.ts`** — `configureServer` body shrinks; just calls `setupSsrDevMiddleware(server, opts)`.

#### Deep Dives
**Algorithm:**
1. Resolve virtual entry-server path via `theoSrcDir` lookup
2. Register hook `configureServer(server)` callback that intercepts HTML response
3. transformIndexHtml: inject hydration script for dev mode + inject entry-client

**Edge cases:**
- `ssrEnabled === false` → middleware no-ops (just returns SPA HTML)
- SSR build artifact missing → fallback to CSR with warn
- Hot reload of entry-server module → vite cache invalidation

#### Tasks
1. Criar `vite-plugin/ssr-dev-middleware.ts`
2. Move SSR-specific code from `vite-plugin/index.ts` into the new file
3. Update `configureServer` hook to delegate

#### TDD + BDD

```
RED:     test_setup_ssr_dev_middleware_exists() — Given vite-plugin/ssr-dev-middleware.ts, When parsed, Then export function setupSsrDevMiddleware.
RED:     test_ssr_dev_middleware_invoked_when_ssr_enabled() — Given mock ViteDevServer + ssrEnabled=true, When setupSsrDevMiddleware called, Then transformIndexHtml hook registered.
RED:     test_ssr_dev_middleware_noop_when_ssr_disabled() — Given mock + ssrEnabled=false, When called, Then no hooks registered.
RED:     test_existing_ssr_fixture_passes() — Given fixtures/ssr-basic, When dev test runs, Then HTML contains SSR markers.
GREEN:   Extract + delegate.
REFACTOR: None.
VERIFY:  npx vitest run tests/unit/vite-plugin-ssr-dev-middleware.test.ts tests/integration/ssr
```

**BDD scenarios:**
- **Happy path:** ssr-basic fixture renders SSR HTML in dev
- **Validation error:** missing entry-server → actionable error
- **Edge case:** ssrEnabled=false → SPA HTML
- **Error scenario:** entry-server throws → fallback CSR + warn

#### Acceptance Criteria
- [ ] `ssr-dev-middleware.ts` exists
- [ ] `vite-plugin/index.ts` LOC further reduced
- [ ] `ssr-basic` fixture dev test passes
- [ ] Pass: tsc + lint + deps

#### DoD
- [ ] All tasks done
- [ ] No SSR regression

---

### T2.3 — Extract WS upgrade to `ws-upgrade.ts`

#### Objective
Mover dev-mode WebSocket upgrade handler para arquivo dedicado.

#### Evidence
- P-2: WS upgrade wiring é ~60 LOC dentro de `vite-plugin/index.ts`

#### Files to edit
```
packages/theo/src/vite-plugin/ws-upgrade.ts — (NEW) export setupWsUpgrade(viteServer, wsRoutes)
packages/theo/src/vite-plugin/index.ts — configureServer delegates WS upgrade to setupWsUpgrade
```

#### Deep file dependency analysis
- **`ws-upgrade.ts` (NEW)** — mirrors `cli/commands/start-websocket-handler.ts` (already exists for prod) but for dev `ViteDevServer.httpServer`. Lazy-imports `ws`.
- **`vite-plugin/index.ts`** — WS-related block (~60 LOC) replaced by 3-line call.

#### Deep Dives
**Symmetry with prod:**
- Prod (`start-websocket-handler.ts`) attaches to `node:http.Server`
- Dev (`ws-upgrade.ts`) attaches to `ViteDevServer.httpServer` (also Node http server)
- Same `handler.onOpen/onMessage/onClose/onError` shape

**Edge cases:**
- No WS routes declared → skip (don't lazy-load `ws`)
- WS package missing + WS routes declared → actionable error

#### Tasks
1. Criar `vite-plugin/ws-upgrade.ts` (mirror of start-websocket-handler.ts shape, dev-flavored)
2. **(EC-1 guard)** `setupWsUpgrade` deve começar com `if (!server.httpServer) return` — middleware-mode Vite (sem HTTP próprio) é cenário legítimo; sem este guard, dev embed crashes.
3. Replace WS block in `vite-plugin/index.ts` with delegated call
4. Verify dev fixture (`fixtures/websocket-basic`) still works

#### TDD + BDD

```
RED:     test_ws_upgrade_module_exists() — Given vite-plugin/ws-upgrade.ts, When parsed, Then export function setupWsUpgrade.
RED:     test_ws_upgrade_noop_when_no_ws_routes() — Given empty wsRoutes, When setupWsUpgrade called, Then ws module NOT lazy-loaded.
RED:     test_ws_upgrade_throws_when_ws_missing() — Given wsRoutes=[route] + ws not installed, When called, Then actionable error "Install ws".
RED:     test_ws_upgrade_noop_when_no_http_server() (EC-1) — Given ViteDevServer with httpServer=null (middleware mode), When setupWsUpgrade called with declared wsRoutes, Then returns silently without error AND does NOT call .on('upgrade').
RED:     test_dev_ws_handler_shape_matches_prod() (EC-6 SHOULD TEST) — Given dev ws-upgrade.ts + prod start-websocket-handler.ts handler signatures, When compared, Then identical surface (onOpen, onMessage, onClose, onError).
RED:     test_vite_plugin_index_final_loc() — Given vite-plugin/index.ts post-extraction, When wc -l, Then ≤ 300.
GREEN:   Extract + delegate.
REFACTOR: None.
VERIFY:  npx vitest run tests/unit/vite-plugin-ws-upgrade.test.ts && wc -l packages/theo/src/vite-plugin/index.ts
```

**BDD scenarios:**
- **Happy path:** WS dev fixture connects + receives messages
- **Validation error:** WS routes declared without `ws` package → error message names the package
- **Edge case:** zero WS routes → no overhead, no lazy import
- **Error scenario:** handler throws onOpen → caught, socket destroyed

#### Acceptance Criteria
- [ ] `ws-upgrade.ts` exists
- [ ] `vite-plugin/index.ts` ≤ 300 LOC (final P-2 target)
- [ ] WS dev fixture passes
- [ ] Pass: tsc + lint + deps

#### DoD
- [ ] All tasks done
- [ ] P-2 closed (DB: `folder_observations`/`principle_violations` for vite-plugin marked resolved)

---

## Phase 3: P-3 Document PascalCase exception

**Objective:** Codificar a convenção React PascalCase em docs; sem rename. Closes false-positive.

### T3.1 — Add "Naming convention exceptions" section to architecture.md v3.1

#### Objective
Documentar que `.tsx` files podem ser PascalCase (React canonical) AND `.ls-lint.yml` já encoda essa exceção. Eliminate future false-positive flagging.

#### Evidence
- P-3 (architecture review 2026-05-27)
- `.ls-lint.yml` linha 18: `.tsx: PascalCase | kebab-case | regex:use[A-Z]... | regex:[A-Z]{2,}...`
- `devtools/components/Tabs/{Csrf,Errors,Requests,Routes,Settings}Tab.tsx` — 5 component files

#### Files to edit
```
.claude/rules/architecture.md — bump to v3.1, add "Naming convention exceptions" subsection
.ls-lint.yml — add inline comment referencing v3.1 spec
docs/audit/architecture-rules-v3.1-pascal-case-exception-2026-XX-XX.md — (NEW) decision note for traceability
```

#### Deep file dependency analysis
- **`.claude/rules/architecture.md`** — currently v3 (2026-05-27 update). Bumps to v3.1 with additive subsection. Backward-compatible for all readers.
- **`.ls-lint.yml`** — gets inline comment pointing at v3.1 spec section. No regex change (already permits PascalCase).
- **`docs/audit/...md`** (NEW) — traceability doc explaining "why we documented instead of renamed".

#### Deep Dives

**Subsection content:**
```markdown
## Naming convention exceptions (v3.1)

`.ls-lint.yml` encodes the canonical conventions; this section documents the **why** behind exceptions so future audits don't re-flag them.

### React component files — PascalCase

`.tsx` files that export a React component use PascalCase by community convention. Example: `<MyComponent>.tsx` exports `MyComponent`. This is encoded in `.ls-lint.yml`:

```yaml
ls:
  packages/theo/src:
    .tsx: PascalCase | kebab-case | regex:use[A-Z][A-Za-z0-9]* | regex:[A-Z]{2,}[A-Za-z0-9]*
```

Examples in the codebase:
- `packages/theo/src/devtools/components/Tabs/{Csrf,Errors,Requests,Routes,Settings}Tab.tsx`
- `packages/theo/src/devtools/components/ui/Button.tsx`, `Badge.tsx`, etc.

The directory `Tabs/` is also PascalCase **by intent** — it mirrors the React component family it contains. This is canonical React structure (`MyComponentGroup/MyComponent.tsx`) and not a naming inconsistency.

### React hooks — camelCase `use*`

Functions starting with `use` are React hooks. `.ls-lint.yml` admits `regex:use[A-Z][A-Za-z0-9]*`. Examples: `useAgentStream.ts`, `useDrag.ts`.

### TypeScript `.ts` files — kebab-case (default)

All other `.ts` files default to kebab-case (`adapter-support.ts`, `define-cached-route.ts`). Exceptions:
- Type-test files: `<Name>.test-d.ts` (mirror the type they test)
- Existing legacy files documented in the codebase (none currently)
```

**Invariantes:**
- Backwards compat: `.ls-lint.yml` not changed (regex already permits both conventions)
- Doc-only: no code touched
- Traceability: audit file references this v3.1 update

**Edge cases:**
- Future contributor sees `Tabs/Settings.tsx` and wonders → reads architecture.md v3.1 § Naming exceptions → finds rationale
- Future audit re-runs → `naming_violations` table includes context note pointing at v3.1

#### Tasks
1. Bump `.claude/rules/architecture.md` header to v3.1 + add subsection
2. Add inline YAML comment in `.ls-lint.yml`
3. Create `docs/audit/architecture-rules-v3.1-pascal-case-exception-{YYYY-MM-DD}.md` as decision note

#### TDD + BDD

```
RED:     test_architecture_rules_v3_1_marker() — Given .claude/rules/architecture.md, When grep "Version 3.1", Then ≥1 match.
RED:     test_pascal_case_exception_documented() — Given .claude/rules/architecture.md, When grep "Naming convention exceptions", Then ≥1 match.
RED:     test_ls_lint_yml_references_v3_1() — Given .ls-lint.yml, When grep "v3.1", Then ≥1 match.
RED:     test_audit_decision_note_exists() — Given docs/audit/, When listed, Then architecture-rules-v3.1-pascal-case-exception-*.md exists.
RED:     test_no_tsx_files_renamed() — Given git status, When listed, Then no .tsx files in renamed/moved state (P-3 is doc-only).
GREEN:   Add subsection + comment + audit note.
REFACTOR: None.
VERIFY:  npx vitest run tests/unit/architecture-rules-v2.test.ts && grep -c "Version 3.1" .claude/rules/architecture.md
```

**BDD scenarios:**
- **Happy path:** subsection added; `pnpm check:naming` still clean
- **Validation error:** v3.1 marker missing from header → test fails
- **Edge case:** `.ls-lint.yml` already permits PascalCase; no change needed → test asserts NO rename happened
- **Error scenario:** if a contributor mistakenly proposes rename, this plan documents the decision NOT to rename

#### Acceptance Criteria
- [ ] `.claude/rules/architecture.md` v3.1 marker present
- [ ] "Naming convention exceptions" subsection present
- [ ] `.ls-lint.yml` has inline reference comment
- [ ] Decision audit note exists
- [ ] `pnpm check:naming` still clean (unchanged)
- [ ] Pass: vitest tests still green

#### DoD
- [ ] All tasks done
- [ ] DB `naming_violations` row for `Tabs/` annotated as `INTENTIONAL` via UPDATE statement

---

## Phase 4: Validation

**Objective:** Re-run gates + architecture review + dogfood. Confirm composite ≥9.0.

### T4.1 — Re-run gates (tsc, lint, deps, naming, tests)

#### Objective
Validate composite improvements before re-running architecture review.

#### Evidence
Plan goals 4-5 depend on green gates.

#### Files to edit
```
docs/audit/phase-4-medium-deferrals-postflight-{YYYY-MM-DD}.md — (NEW) post-flight snapshot
```

#### Deep file dependency analysis
- Documentation only.

#### Deep Dives
**Métricas to capture (delta vs preflight):**
- `wc -l packages/theo/src/cli/commands/build.ts` (expect ≤ 130; was 162)
- `wc -l packages/theo/src/vite-plugin/index.ts` (expect ≤ 300; was 648)
- `grep -c "case '" packages/theo/src/cli/commands/build.ts` (expect 0; was 9)
- Vitest passing count (expect ≥ 3155)
- dep-cruiser violations (expect 0)

#### Tasks
1. Run all 5 gate commands
2. Save outputs in postflight audit file
3. Compute delta vs preflight

#### TDD + BDD

```
RED:     test_postflight_snapshot_exists() — Given docs/audit/, When listed, Then phase-4-medium-deferrals-postflight-*.md exists.
RED:     test_build_ts_no_switch() — Given the captured grep output, When parsed, Then case count = 0.
RED:     test_vite_plugin_loc_target_met() — Given captured wc -l, When parsed, Then LOC ≤ 300.
RED:     test_tests_passing_count_preserved() — Given vitest output, When parsed, Then ≥ 3155 passing.
GREEN:   Run + capture.
REFACTOR: None.
VERIFY:  test cat docs/audit/phase-4-medium-deferrals-postflight-*.md
```

**BDD scenarios:**
- **Happy path:** all gates clean + targets met
- **Validation error:** any gate fails → halt + investigate
- **Edge case:** vitest fails 1 NEW test (caused by this plan) → identify + fix
- **Error scenario:** dep-cruiser flag new violation → revert + redesign

#### Acceptance Criteria
- [ ] Postflight snapshot exists
- [ ] All 5 gates clean
- [ ] LOC targets met
- [ ] Test pass count preserved or improved

#### DoD
- [ ] All gate metrics recorded
- [ ] Zero gate regressions

---

### T4.2 — Re-run `/loop-architecture-review` (composite ≥9.0)

#### Objective
Confirm score improvement post-cleanup-of-cleanup.

#### Evidence
Plan goal: composite ≥9.0/10.

#### Files to edit
```
architecture-output/ — regenerated by pipeline (DB + final-report.md + figures)
architecture-output/architecture-pre-medium-deferrals.db — (NEW) backup of pre-T1.1 DB
```

#### Deep file dependency analysis
- DB backup preserves audit trail.

#### Deep Dives
**Expected delta:**
- P-1 OCP → resolved (registry pattern detected by patterns-detective)
- P-2 SRP heuristic → resolved (vite-plugin/index.ts ≤ 300 LOC)
- P-3 → still flagged BUT annotated `INTENTIONAL` in db (no severity bump)

**Acceptance band:**
- Composite ≥9.0/10 (target)
- Substantive ≥9.5/10 (with info-row exclusion)

#### Tasks
1. **(EC-v2-1)** **RENAME, não copy** — `mv architecture-output/architecture.db architecture-output/architecture-pre-medium-deferrals.db`. RENAME garante que o pipeline crie uma DB fresh (sem AUTOINCREMENT accumulation em `architectural_findings`/`principle_violations`/etc, que NÃO têm UNIQUE em conteúdo). Backup preserva audit trail antigo via nome novo.
2. Run `/loop-architecture-review:loop-architecture-review . --mode full` — pipeline cria `architecture.db` fresh
3. Verify final-report.md composite + delta vs pre-medium-deferrals backup
4. Adicionar T6.2-style script para CROSS-REFERENCE findings novas (post-cleanup) com as antigas (pre-medium-deferrals), de modo que reports finais refletem o histórico completo sem duplicação

#### TDD + BDD

```
RED:     test_re_run_composite_at_least_9_0() — Given new final-report.md, When score parsed, Then ≥ 9.0/10.
RED:     test_re_run_zero_critical_high() — Given DB, When SELECT COUNT(*) WHERE severity IN ('critical','high'), Then 0.
RED:     test_cycles_still_zero() — Given DB cycles table, When SELECT COUNT(*), Then 0.
RED:     test_p1_p2_resolved() — Given DB principle_violations, When SELECT * WHERE category='ocp' OR (category='srp' AND file LIKE '%vite-plugin/index.ts'), Then all rows status='resolved' or absent.
GREEN:   Run pipeline.
REFACTOR: If composite < 9.0, identify top finding + decide: address or document.
VERIFY:  cat architecture-output/final-report.md | grep "composite"
```

**BDD scenarios:**
- **Happy path:** composite ≥9.0, P-1/P-2 closed, P-3 annotated INTENTIONAL
- **Validation error:** new finding emerged → document in plan amendment
- **Edge case:** composite = 9.0 exactly → accept (≥)
- **Error scenario:** composite < 9.0 → option-3 path (document why)

#### Acceptance Criteria
- [ ] Pipeline emits `ARCHITECTURE REVIEW COMPLETE`
- [ ] Composite ≥ 9.0/10
- [ ] Zero CRITICAL, zero HIGH findings
- [ ] Cycles = 0
- [ ] P-1 (OCP) closed
- [ ] P-2 (vite-plugin SRP heuristic) closed
- [ ] P-3 annotated INTENTIONAL or no longer flagged

#### DoD
- [ ] Re-run done
- [ ] Backup DB preserved
- [ ] Plan goal #5 achieved (score ≥9.0)

---

### T4.3 — Mark P-1, P-2, P-3 resolved in DB

#### Objective
Audit trail: explicit `status='resolved'` on the 3 medium findings via SQL UPDATE.

#### Evidence
Plan tracks DB rows; rows go from `open` → `resolved` post-fix.

#### Files to edit
```
architecture-output/architecture.db — UPDATE statements
architecture-output/mark-medium-deferrals-resolved.py — (NEW) script
```

#### Deep file dependency analysis
- DB-only operation.

#### Deep Dives
**Update queries:**
```python
UPDATE principle_violations
SET status='resolved', remediation=COALESCE(remediation, 'T1.1: Adapter Registry pattern')
WHERE category='ocp' AND file LIKE '%cli/commands/build.ts'

UPDATE principle_violations
SET status='resolved', remediation=COALESCE(remediation, 'T2.1-T2.3: vite-plugin split into config-resolve + ssr-dev-middleware + ws-upgrade')
WHERE category='srp' AND file LIKE '%vite-plugin/index.ts'

UPDATE naming_violations
SET recommendation = COALESCE(recommendation,'') || ' [INTENTIONAL T3.1: documented in .claude/rules/architecture.md v3.1]'
WHERE examples LIKE '%Tabs%' OR scope LIKE '%PascalCase%'
```

#### Tasks
1. Write `mark-medium-deferrals-resolved.py` with **PK-based UPDATEs (EC-2 fix)** — script first runs `SELECT id, title FROM <table> WHERE <narrow predicate>`, verifies `len(rows) == expected_count` (else `print + sys.exit(1)`), THEN runs `UPDATE <table> SET status='resolved' WHERE id IN (<exact IDs>)`. No broad LIKE clauses against `examples`/`title`/`scope` without first counting.
2. Execute it
3. Verify counts via `--verify` flag

#### TDD + BDD

```
RED:     test_ocp_violation_resolved() — Given DB, When SELECT status WHERE category='ocp' AND file LIKE '%build.ts', Then 'resolved'.
RED:     test_srp_violation_resolved() — Given DB, When SELECT status WHERE category='srp' AND file LIKE '%vite-plugin/index.ts', Then 'resolved'.
RED:     test_pascal_case_annotated() — Given naming_violations, When SELECT recommendation WHERE examples LIKE '%Tabs%', Then contains 'INTENTIONAL'.
RED:     test_script_aborts_on_count_mismatch() (EC-2) — Given a fake DB with 2 Tabs-like rows instead of 1, When mark-medium-deferrals-resolved.py runs, Then exit_code=1 + message names the unexpected count.
RED:     test_script_idempotent_on_already_resolved() (EC-v2-3 SHOULD TEST) — Given a DB where rows are ALREADY status='resolved' (re-run), When mark-medium-deferrals-resolved.py runs again, Then exit_code=0 (no failure) AND count of rows with status='resolved' unchanged. Script SELECT pré-UPDATE deve filtrar `status='open'`; se 0 open rows, silently skip.
GREEN:   Run script.
REFACTOR: None.
VERIFY:  python3 architecture-output/mark-medium-deferrals-resolved.py --verify
```

**BDD scenarios:**
- **Happy path:** 3 rows updated
- **Validation error:** finding not found → script aborts with explicit list
- **Edge case:** already resolved (idempotent re-run) → noop
- **Error scenario:** DB locked → wait + retry

#### Acceptance Criteria
- [ ] P-1 row status='resolved'
- [ ] P-2 row status='resolved'
- [ ] P-3 row recommendation contains 'INTENTIONAL'

#### DoD
- [ ] Script committed
- [ ] DB updated
- [ ] Verify command passes

---

## Coverage Matrix

| # | Gap / Finding | Severity | Task(s) | Resolution |
|---|---|---|---|---|
| 1 | P-1 — cli/commands/build.ts switch (OCP) | MEDIUM | T1.1 | Adapter Registry pattern (D1) |
| 2 | P-2 — vite-plugin/index.ts 648 LOC (SRP) | MEDIUM | T2.1, T2.2, T2.3 | Split into config-resolve + ssr-dev-middleware + ws-upgrade (D2) |
| 3 | P-3 — Tabs/ PascalCase (false-positive) | MEDIUM | T3.1 | Document exception in architecture.md v3.1 (D3) |
| 4 | Audit trail: 3 findings closed | tracking | T4.3 | Mark resolved in DB via Python script |
| 5 | Composite ≥9.0 | goal | T4.2 | Re-run /loop-architecture-review |

**Coverage: 5/5 gaps covered (100%)**

## Global Definition of Done

- [ ] All 5 phases (0, 1, 2, 3, 4) completed
- [ ] All tests passing (vitest + Playwright)
- [ ] Zero TypeScript errors (`tsc --noEmit`)
- [ ] Zero lint warnings (`pnpm lint --max-warnings=0`)
- [ ] Dep-cruiser 0 violations (`pnpm check:deps`)
- [ ] ls-lint clean (`pnpm check:naming`)
- [ ] **`grep "case '" cli/commands/build.ts` returns 0** (P-1 resolved)
- [ ] **`wc -l vite-plugin/index.ts` returns ≤ 300** (P-2 resolved)
- [ ] **`.claude/rules/architecture.md` v3.1 marker present** (P-3 documented)
- [ ] **`/loop-architecture-review` composite ≥9.0/10** (or option-3 documentation path)
- [ ] **Dogfood QA PASS** — `/dogfood full` health ≥ 70, zero CRITICAL
- [ ] Backwards compatibility preserved (theoPlugin public API unchanged; all 9 adapter targets work)

## Final Phase: Dogfood QA (MANDATORY)

> Roda APÓS Phases 0-4 completos.

### Execution

```bash
/dogfood full
```

### Acceptance Criteria

- [ ] Health score ≥ 70/100
- [ ] Zero CRITICAL plan-caused
- [ ] Zero HIGH plan-caused
- [ ] Pre-existing issues (e.g., scaffold-build-start-e2e) documented but non-blocking

### If Dogfood Fails

1. Identify which issues are plan-caused vs pre-existing (diff against pre-T1.1 baseline)
2. Fix plan-caused CRITICAL/HIGH before declaring complete
3. Re-run `/dogfood full`
4. Pre-existing issues are logged but do NOT block plan completion
