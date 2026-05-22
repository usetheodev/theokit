# Plan: Onda 18 — Deploy Adapters (Docker + Vercel + Cloudflare)

> **Version 1.0** — Adiciona 3 deploy adapters ao Theo: (1) `theo docker` CLI command que gera Dockerfile + .dockerignore, (2) `theo build --target=vercel` que gera `.vercel/output/` com Build Output API, (3) `theo build --target=cloudflare` que gera Worker entry + `wrangler.toml`. Node.js permanece default. Cada adapter gera artefatos de deploy — não muda o core do framework. Zero breaking change.

## Context

O Theo tem 17 ondas, 460 testes, e só roda em Node.js via `theo start`. Para uso em produção, precisa de: Docker (self-hosted/VPS), Vercel (serverless), e Cloudflare Workers (edge). Sem adapters, o user precisa configurar deploy manualmente.

Evidence: `cli/index.ts` tem apenas `dev`, `build`, `start`. Nenhum `docker`, nenhum `--target` flag.

## Objective

**Done =** `theo docker` gera Dockerfile funcional. `theo build --target=vercel` gera `.vercel/output/`. `theo build --target=cloudflare` gera Worker + wrangler.toml. `theo build` sem flag = Node.js (backward compat). Testes provam cada output.

Metas:
1. CLI `theo docker` — Dockerfile + .dockerignore
2. `--target=vercel` — .vercel/output/ com functions + static
3. `--target=cloudflare` — Worker entry + wrangler.toml
4. `--target=node` (default, backward compat)
5. Adapter interface interna
6. Testes para cada adapter output
7. Zero breaking change

## ADRs

### D1 — Adapters geram artefatos, não mudam core
**Decision:** Cada adapter é um gerador de arquivos de deploy. O core do Theo (routes, actions, middleware, etc.) não muda.
**Rationale:** O Theo já funciona em Node.js. Adapters só precisam wrappear o output existente no formato do target.
**Consequences:** Mínimo risco de regressão. Cada adapter é independente.

### D2 — Docker via comando CLI separado
**Decision:** `theo docker` é um comando CLI separado (não flag de build). Gera Dockerfile + .dockerignore no projeto.
**Rationale:** Docker não é um build target — é uma configuração de infraestrutura. O user roda `theo docker` uma vez, ajusta se quiser, e usa para sempre.
**Consequences:** Dockerfile é gerado como arquivo estático. User pode editá-lo.

### D3 — Vercel via Build Output API
**Decision:** `--target=vercel` gera `.vercel/output/` diretamente, usando a Build Output API v3.
**Rationale:** É o mecanismo oficial da Vercel para frameworks custom. Bypass framework detection. Full controle sobre output.
**Consequences:** User faz `vercel deploy` sem configuração extra. Static assets em CDN, API routes em serverless function.

### D4 — Cloudflare via nodejs_compat
**Decision:** `--target=cloudflare` gera Worker que usa `nodejs_compat` flag para rodar código Node.js (IncomingMessage/ServerResponse) no Workers runtime.
**Rationale:** Cloudflare suporta `node:http` desde compatibility date `2025-09-01`. Sem necessidade de refatorar o Theo para Web Standards. O código do production server roda quase inalterado.
**Consequences:** Requer `nodejs_compat` e compatibility date recente. Worker roda API routes + actions + middleware. Static assets via Cloudflare Pages/`__STATIC_CONTENT`.

### D5 — Node.js é default (backward compat)
**Decision:** `theo build` sem flag = output para Node.js (`.theo/client/` + opcionalmente `.theo/server/`). Comportamento inalterado.
**Rationale:** Zero breaking change. Todos os testes existentes continuam passando.
**Consequences:** Quem não precisa de adapter não nota diferença.

## Dependency Graph

```
Phase 0 (adapter interface + --target flag) ──▶ Phase 1 (Docker) ─┐
                                                                    ├──▶ Phase 3 (regression)
                                               Phase 2 (Vercel + CF)┘
```

- **Phase 0** bloqueia tudo (interface + CLI flag)
- **Phase 1** (Docker) e **Phase 2** (Vercel+CF) são paralelos
- **Phase 3** regressão completa

---

## Phase 0: Adapter Interface + CLI --target Flag

**Objective:** Definir adapter interface e adicionar --target flag ao build command.

### T0.1 — --target flag no build e adapter interface

#### Objective
Adicionar `--target=node|vercel|cloudflare` ao build command. Criar interface `DeployAdapter`.

#### Evidence
`cli/index.ts:14-24` — build command sem opções. Precisa de `--target` para selecionar adapter.

#### Files to edit
```
packages/theo/src/cli/index.ts (EDIT) — Adicionar --target option ao build
packages/theo/src/cli/commands/build.ts (EDIT) — Aceitar target param, chamar adapter
packages/theo/src/adapters/types.ts (NEW) — DeployAdapter interface
packages/theo/src/adapters/node.ts (NEW) — Node adapter (refactor do existente, é o default)
tests/unit/adapters.test.ts (NEW) — Tests
```

#### Deep file dependency analysis
- `cli/index.ts`: Adiciona `--target <target>` option ao build command.
- `build.ts`: Recebe target, importa adapter correspondente, chama `adapter.build()`.
- `adapters/types.ts`: Interface `DeployAdapter` com `build(config, cwd)`.
- `adapters/node.ts`: Node adapter — faz exatamente o que `buildCommand` faz hoje (Vite build). É um refactor sem mudança de comportamento.

#### Deep Dives
- **DeployAdapter interface**:
  ```typescript
  interface DeployAdapter {
    name: string
    build(config: TheoConfig, cwd: string): Promise<void>
  }
  ```
- **Target selection**: `--target=node` (default), `--target=vercel`, `--target=cloudflare`.
- **Node adapter**: Move o código de build existente para `adapters/node.ts`. `buildCommand` se torna um dispatcher.

#### Tasks
1. Criar `adapters/types.ts` com interface
2. Criar `adapters/node.ts` extraindo código de build.ts
3. Atualizar build command para aceitar --target e dispatch
4. Atualizar CLI para --target option
5. Criar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_build_default_is_node() — Given no --target, When buildCommand, Then uses node adapter
RED:     test_build_target_node() — Given --target=node, When buildCommand, Then uses node adapter
RED:     test_build_target_vercel() — Given --target=vercel, When buildCommand, Then uses vercel adapter
RED:     test_build_invalid_target() — Given --target=aws, When buildCommand, Then throws clear error
RED:     test_node_adapter_produces_theo_client() — Given node adapter, When build, Then .theo/client/ exists
GREEN:   Implement adapter interface, node adapter, CLI flag
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/adapters.test.ts
```

BDD scenarios:
- **Happy path**: Default target is node, produces same output
- **Validation error**: Invalid target → clear error
- **Edge case**: Explicit --target=node = same as no target
- **Error scenario**: Unknown target rejected

#### Acceptance Criteria
- [ ] `--target` flag on build command
- [ ] Node adapter produces same output as before
- [ ] Invalid target → error message
- [ ] DeployAdapter interface exists

#### DoD
- [ ] Adapter interface + node adapter
- [ ] CLI flag works
- [ ] Tests GREEN

---

## Phase 1: Docker Adapter

**Objective:** `theo docker` generates Dockerfile + .dockerignore.

### T1.1 — Docker command

#### Objective
New CLI command `theo docker` that generates Dockerfile and .dockerignore in the project directory.

#### Evidence
Docker is the most common deploy target for self-hosted/VPS. No Dockerfile exists.

#### Files to edit
```
packages/theo/src/cli/index.ts (EDIT) — Add docker command
packages/theo/src/cli/commands/docker.ts (NEW) — Docker command implementation
tests/unit/docker-adapter.test.ts (NEW) — Tests
```

#### Deep file dependency analysis
- `cli/index.ts`: Add `cli.command('docker', ...)`.
- `docker.ts`: Generates Dockerfile string and .dockerignore string. Writes to CWD.
- Generated Dockerfile: Multi-stage build (node:22-alpine builder + runner).

#### Deep Dives
- **Dockerfile template**: Multi-stage, pnpm/npm/yarn detection via lockfile, `theo build` + `theo start`.
- **Detection**: If `pnpm-lock.yaml` exists → use pnpm. If `package-lock.json` → npm. If `yarn.lock` → yarn.
- **.dockerignore**: node_modules, .git, .theo, dist, .env, etc.
- **Overwrite protection**: If Dockerfile already exists, warn and skip (unless --force).

#### Tasks
1. Create `docker.ts` with Dockerfile generation
2. Add docker command to CLI
3. Detect package manager from lockfile
4. Create tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_generates_dockerfile() — Given project dir, When dockerCommand, Then Dockerfile exists
RED:     test_generates_dockerignore() — Given project dir, When dockerCommand, Then .dockerignore exists
RED:     test_dockerfile_uses_node_22() — Given generated Dockerfile, When reading, Then contains node:22
RED:     test_dockerfile_has_theo_build() — Given generated Dockerfile, When reading, Then contains theo build
RED:     test_dockerfile_has_theo_start() — Given generated Dockerfile, When reading, Then contains theo start
RED:     test_detects_pnpm() — Given pnpm-lock.yaml, When generating, Then Dockerfile uses pnpm
RED:     test_detects_npm() — Given package-lock.json, When generating, Then Dockerfile uses npm
RED:     test_skip_if_exists() — Given existing Dockerfile, When dockerCommand without --force, Then warns and skips
GREEN:   Implement docker command
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/docker-adapter.test.ts
```

BDD scenarios:
- **Happy path**: Generates Dockerfile with correct structure
- **Validation error**: N/A
- **Edge case**: Existing Dockerfile → skip with warning
- **Error scenario**: N/A

#### Acceptance Criteria
- [ ] `theo docker` creates Dockerfile + .dockerignore
- [ ] Multi-stage build with node:22-alpine
- [ ] Detects pnpm/npm/yarn from lockfile
- [ ] Doesn't overwrite existing Dockerfile
- [ ] Tests pass

#### DoD
- [ ] Docker command works
- [ ] Tests GREEN

---

## Phase 2: Vercel + Cloudflare Adapters

**Objective:** Build targets for Vercel and Cloudflare.

### T2.1 — Vercel adapter

#### Objective
`--target=vercel` generates `.vercel/output/` with static assets + serverless function.

#### Evidence
Vercel Build Output API is the standard for custom frameworks. Generates config.json + static/ + functions/.

#### Files to edit
```
packages/theo/src/adapters/vercel.ts (NEW) — Vercel adapter
tests/unit/vercel-adapter.test.ts (NEW) — Tests
```

#### Deep file dependency analysis
- `vercel.ts`: Implements DeployAdapter. Steps: (1) Run Vite client build to temp dir, (2) Copy static assets to `.vercel/output/static/`, (3) Bundle server code into `.vercel/output/functions/api.func/`, (4) Generate config.json with routing rules, (5) Generate .vc-config.json.
- The serverless function wraps the Theo production server request handler.

#### Deep Dives
- **config.json routing**: Static assets first, `/api/*` → api function, SPA fallback.
- **Function entry**: Wraps Theo's HTTP handler as Vercel serverless function (exports default handler).
- **Limitations note**: WebSocket not supported, rate limiting in-memory not supported.
- **Static assets**: Copied from `.theo/client/` to `.vercel/output/static/`.
- **EC-1 MUST FIX — Env vars at runtime**: The serverless function MUST NOT inline `process.env.*` values at build time. Env vars must remain as runtime lookups. The server bundle should NOT use Vite's `define` for server-side env vars.

#### Tasks
1. Create `adapters/vercel.ts`
2. Generate `.vercel/output/` structure
3. Create serverless function entry
4. Generate config.json + .vc-config.json
5. Create tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_vercel_creates_output_dir() — Given --target=vercel, When build, Then .vercel/output/ exists
RED:     test_vercel_has_config_json() — Given vercel build, When checking output, Then config.json exists
RED:     test_vercel_has_static_dir() — Given vercel build, When checking output, Then static/ has assets
RED:     test_vercel_has_function() — Given vercel build, When checking output, Then functions/api.func/ exists
RED:     test_vercel_config_routes() — Given config.json, When reading routes, Then has /api/* and SPA fallback
RED:     test_vercel_vc_config() — Given api.func, When reading .vc-config.json, Then has nodejs runtime
RED:     test_vercel_no_inlined_env() — Given built function entry, When reading source, Then process.env references are NOT replaced with literal values (EC-1 MUST FIX)
GREEN:   Implement Vercel adapter
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/vercel-adapter.test.ts
```

BDD scenarios:
- **Happy path**: Generates complete .vercel/output/ structure
- **Validation error**: N/A
- **Edge case**: SSR mode generates additional function config
- **Error scenario**: Missing client build → clear error

#### Acceptance Criteria
- [ ] `.vercel/output/` has config.json, static/, functions/
- [ ] Static assets from client build
- [ ] Serverless function for API routes
- [ ] Routing rules correct

#### DoD
- [ ] Vercel adapter works
- [ ] Tests GREEN

---

### T2.2 — Cloudflare adapter

#### Objective
`--target=cloudflare` generates Worker entry + wrangler.toml.

#### Evidence
Cloudflare Workers supports `node:http` via `nodejs_compat` flag (compatibility date 2025-09-01+).

#### Files to edit
```
packages/theo/src/adapters/cloudflare.ts (NEW) — Cloudflare adapter
tests/unit/cloudflare-adapter.test.ts (NEW) — Tests
```

#### Deep file dependency analysis
- `cloudflare.ts`: Implements DeployAdapter. Steps: (1) Run Vite client build, (2) Generate Worker entry that imports and runs Theo server handler, (3) Generate `wrangler.toml` with nodejs_compat flag, (4) Copy static assets for Pages or __STATIC_CONTENT.
- Uses `nodejs_compat` so Theo's `node:http`, `node:crypto`, `node:fs` work in Workers.

#### Deep Dives
- **Worker entry**: Creates a minimal Worker that uses Theo's request handler.
- **wrangler.toml**: Sets `compatibility_date`, `nodejs_compat = true`, `name`, and `main` entry.
- **Static assets**: Configured via `[site]` in wrangler.toml pointing to `.theo/client/`.
- **Limitations**: No `fs` for dynamic config loading (theo.config.ts must be bundled). No `ws` lib (Cloudflare has native WS). In-memory rate limiting doesn't persist.

#### Tasks
1. Create `adapters/cloudflare.ts`
2. Generate Worker entry
3. Generate wrangler.toml
4. Handle static assets config
5. Create tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_cloudflare_creates_worker_entry() — Given --target=cloudflare, When build, Then worker entry file exists
RED:     test_cloudflare_creates_wrangler_toml() — Given cloudflare build, When checking output, Then wrangler.toml exists
RED:     test_wrangler_has_nodejs_compat() — Given wrangler.toml, When reading, Then has nodejs_compat = true
RED:     test_wrangler_has_compatibility_date() — Given wrangler.toml, When reading, Then has compatibility_date >= 2025-09-01
RED:     test_cloudflare_has_static_site() — Given wrangler.toml, When reading [site], Then points to .theo/client
RED:     test_worker_imports_handler() — Given worker entry, When reading, Then imports Theo handler
GREEN:   Implement Cloudflare adapter
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/cloudflare-adapter.test.ts
```

BDD scenarios:
- **Happy path**: Generates Worker + wrangler.toml with correct config
- **Validation error**: N/A
- **Edge case**: nodejs_compat required for node:http
- **Error scenario**: Missing compatibility date → include in generated config

#### Acceptance Criteria
- [ ] Worker entry generated
- [ ] wrangler.toml with nodejs_compat
- [ ] Static assets configured
- [ ] Tests pass

#### DoD
- [ ] Cloudflare adapter works
- [ ] Tests GREEN

---

## Phase 3: Regression

**Objective:** Zero regressão.

### T3.1 — Full regression

#### Objective
All tests pass. Default build unchanged.

#### Files to edit
```
Nenhum — apenas execução
```

#### Deep file dependency analysis
N/A.

#### Deep Dives
N/A.

#### Tasks
1. `pnpm typecheck`
2. `pnpm test`
3. `pnpm test:types`
4. `pnpm build`
5. Zero `any` audit
6. E2E tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_typecheck() — Given all changes, When pnpm typecheck, Then exit code 0
RED:     test_all_tests() — Given all changes, When pnpm test, Then all pass (460+)
RED:     test_types() — Given all changes, When pnpm test:types, Then all pass (34+)
RED:     test_build() — Given all changes, When pnpm build, Then exit code 0
GREEN:   Already implemented — verifies
REFACTOR: Fix regressions if found
VERIFY:  pnpm typecheck && pnpm test && pnpm test:types && pnpm build
```

BDD scenarios:
- **Happy path**: All pass
- **Validation error**: Regression → fix
- **Edge case**: New tests increase count
- **Error scenario**: build.ts refactor breaks existing → fix

#### Acceptance Criteria
- [ ] `pnpm typecheck` zero errors
- [ ] `pnpm test` — 460+ green
- [ ] `pnpm test:types` — 34+ green
- [ ] `pnpm build` exit code 0
- [ ] Zero `any`
- [ ] E2E pass

#### DoD
- [ ] Zero regressão

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Adapter interface | T0.1 | DeployAdapter type in adapters/types.ts |
| 2 | --target flag | T0.1 | CLI option on build command |
| 3 | Node adapter (default) | T0.1 | Refactor existing build into adapter |
| 4 | Invalid target error | T0.1 | Clear error message |
| 5 | Docker Dockerfile | T1.1 | theo docker generates multi-stage Dockerfile |
| 6 | Docker .dockerignore | T1.1 | Generated alongside Dockerfile |
| 7 | Docker pkg manager detection | T1.1 | Lockfile-based detection |
| 8 | Vercel output | T2.1 | .vercel/output/ with Build Output API |
| 9 | Vercel static assets | T2.1 | Copied from .theo/client/ |
| 10 | Vercel serverless function | T2.1 | API routes wrapped in function |
| 11 | Cloudflare Worker | T2.2 | Worker entry with nodejs_compat |
| 12 | Cloudflare wrangler.toml | T2.2 | Generated with correct flags |
| 13 | Backward compat | T3.1 | Default target=node unchanged |

**Coverage: 13/13 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-3)
- [ ] All tests passing (`pnpm test` — 460+)
- [ ] All type tests passing (`pnpm test:types` — 34+)
- [ ] Zero TypeScript errors
- [ ] Zero `any`
- [ ] `pnpm build` exit code 0
- [ ] `theo docker` generates Dockerfile
- [ ] `theo build --target=vercel` generates .vercel/output/
- [ ] `theo build --target=cloudflare` generates Worker + wrangler.toml
- [ ] `theo build` (no target) = same as before (backward compat)
- [ ] Zero breaking changes
- [ ] **Dogfood QA PASS** — `/dogfood full` health score >= 70

## Final Phase: Dogfood QA (MANDATORY)

**Objective:** Validate adapters produce correct output.

### Execution
Run `/dogfood full`.

### Acceptance Criteria
- [ ] Health score >= 70/100
- [ ] Zero CRITICAL issues
- [ ] Default build unchanged
- [ ] Docker/Vercel/Cloudflare outputs validated
