# Plan: Onda 20 — Polish & Publish

> **Version 1.0** — Prepara o Theo para publicação no npm. Reescreve o README.md para refletir apenas features implementadas (remove agents, Theo Cloud, e tudo aspiracional), cria Getting Started mínimo, verifica LICENSE, atualiza CHANGELOG, e executa o primeiro `npm publish` de `theo@0.1.0-alpha.0` e `create-theo@0.1.0-alpha.0`. O framework só existe quando alguém pode instalá-lo.

## Context

O Theo tem 19 ondas, 542+ testes, dogfood 100/100. O código está pronto. Porém:

1. **README.md é mentiroso** — documenta `defineAgent`, `theo/agent`, `theo/react`, `useAgent`, `<Chat>`, agent memory, MCP, Theo Cloud. Nada disso existe. Um user que lê o README e tenta usar vai se frustrar.
2. **Sem Getting Started** — nenhum guia de "como começar" real.
3. **Nunca publicado no npm** — `pnpm changeset publish` nunca foi executado.
4. **CLI version hardcoded** — `cli/index.ts:56` tem `cli.version('0.0.1')`, deveria ser `0.1.0-alpha.0`.

Evidence: `README.md:219-249` documenta `defineAgent` que não existe. `README.md:294-298` documenta `theo deploy` que não existe. `cli/index.ts:56` version `0.0.1`.

## Objective

**Done =** README reflete realidade, Getting Started existe, `npx create-theo my-app` funciona após npm publish, `npx theo dev` funciona no projeto criado.

Metas:
1. README.md reescrito — apenas features reais
2. CLI version corrigida para 0.1.0-alpha.0
3. Getting Started doc (docs/getting-started.md)
4. LICENSE verificado
5. npm publish dry-run passa
6. Testes de smoke pós-publish (simulado)

## ADRs

### D1 — README documenta APENAS o que existe
**Decision:** O README é reescrito do zero. Toda menção a agents, MCP, memory, Theo Cloud, defineAgent, theo/react é REMOVIDA.
**Rationale:** Um README que mente destrói confiança. Melhor um README honesto de 100 linhas do que um aspiracional de 350 que frustra. Features futuras vão no roadmap, não no README.
**Consequences:** README menor, mais honesto. Agents serão adicionados quando implementados.

### D2 — Alpha publish sem agents
**Decision:** Publicar `0.1.0-alpha.0` como web framework puro (sem agent layer).
**Rationale:** O framework web está completo e testado. Agents são uma feature futura. Publicar agora permite feedback real de users. `-alpha` deixa claro que breaking changes são esperados.
**Consequences:** Users sabem que é alpha. O nome "TheoAgents" promete agents que virão depois.

### D3 — Getting Started como markdown, não site
**Decision:** Documentação mínima em `docs/getting-started.md`, não um site de docs.
**Rationale:** KISS. Um site de docs (VitePress, Nextra) é overhead para alpha. Markdown no repo é suficiente. Site de docs vem quando houver users.
**Consequences:** Docs acessíveis via GitHub. Sem site dedicado.

## Dependency Graph

```
Phase 0 (README + docs) ──▶ Phase 1 (CLI fix + validação) ──▶ Phase 2 (publish dry-run) ──▶ Phase 3 (regression)
```

- Sequencial — README deve estar correto antes de validar, validar antes de publish

---

## Phase 0: README + Docs

**Objective:** README honesto + Getting Started mínimo.

### T0.1 — Reescrever README.md

#### Objective
Reescrever o README para documentar APENAS features implementadas nas 19 ondas.

#### Evidence
`README.md:219-298` documenta agents, defineAgent, theo/agent, useAgent, Chat, MCP, Theo Cloud. Nenhum existe. User que tenta usar vai ter erros.

#### Files to edit
```
README.md (REWRITE) — Apenas features reais
```

#### Deep file dependency analysis
- `README.md`: Documento público principal. Lido por todo dev que visita o repo. Deve ser 100% verdadeiro.
- O novo README cobre: Quick Start, Project Structure, defineRoute, defineAction, defineMiddleware, theoFetch, createSessionManager, requireAuth, defineWebSocket, theo generate, theo routes, theo docker, deploy targets, templates.

#### Deep Dives
**Seções do novo README:**
1. Header + tagline
2. Quick Start (3 comandos)
3. What You Get (lista de features reais)
4. Project Structure
5. Server Routes (defineRoute + Zod)
6. Server Actions (defineAction)
7. Typed Client (theoFetch)
8. Auth (createSessionManager + requireAuth)
9. Middleware + Context
10. WebSocket (defineWebSocket)
11. SSR (opt-in)
12. CLI (dev, build, start, generate, routes, docker)
13. Templates (4)
14. Deploy (Node, Docker, Vercel, Cloudflare)
15. Configuration (theo.config.ts)
16. Roadmap (agents, OpenAPI — futuro)

**Removido:** defineAgent, theo/agent, theo/react, useAgent, Chat, ToolOutput, ApprovalFlow, AgentStatus, MCP, Theo Cloud, theo deploy, agent memory, guardrails, @theo/eslint-plugin.

#### Tasks
1. Reescrever README.md do zero
2. Verificar que todo código de exemplo compila (imports reais)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_readme_no_defineAgent() — Given README.md, When reading content, Then does NOT contain 'defineAgent'
RED:     test_readme_no_theo_agent() — Given README.md, When reading content, Then does NOT contain 'theo/agent'
RED:     test_readme_no_theo_react() — Given README.md, When reading content, Then does NOT contain 'theo/react'
RED:     test_readme_no_theo_cloud() — Given README.md, When reading content, Then does NOT contain 'Theo Cloud'
RED:     test_readme_has_defineRoute() — Given README.md, When reading content, Then contains 'defineRoute'
RED:     test_readme_has_theoFetch() — Given README.md, When reading content, Then contains 'theoFetch'
RED:     test_readme_has_requireAuth() — Given README.md, When reading content, Then contains 'requireAuth'
RED:     test_readme_has_defineWebSocket() — Given README.md, When reading content, Then contains 'defineWebSocket'
GREEN:   Rewrite README.md
REFACTOR: None expected
VERIFY:  npx vitest run tests/smoke/readme-integrity.test.ts
```

BDD scenarios:
- **Happy path**: README documents only real features
- **Validation error**: Aspirational feature found → test fails
- **Edge case**: Code examples use real imports
- **Error scenario**: Missing feature → test catches

#### Acceptance Criteria
- [ ] Zero mention of defineAgent, theo/agent, theo/react, useAgent, Theo Cloud
- [ ] All code examples use real imports (theo, theo/server, theo/client)
- [ ] Quick Start works (3 commands)
- [ ] All 19 ondas represented

#### DoD
- [ ] README truthful
- [ ] Tests GREEN

---

### T0.2 — Getting Started doc

#### Objective
Create minimal Getting Started guide.

#### Evidence
No documentation exists beyond the README.

#### Files to edit
```
docs/getting-started.md (NEW) — Step-by-step guide
```

#### Deep file dependency analysis
- New file. No dependencies. Read by users after install.

#### Deep Dives
**Content:**
1. Install: `npx create-theo my-app`
2. Dev: `cd my-app && theo dev`
3. Create a route: `theo generate route users`
4. Create a page: `theo generate page dashboard`
5. Add auth: createSessionManager example
6. Add database: `--template=postgres`
7. Build: `theo build`
8. Deploy: `theo docker` or `--target=vercel`

#### Tasks
1. Write Getting Started guide
2. Verify all commands work

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_getting_started_exists() — Given docs/, When checking getting-started.md, Then file exists
RED:     test_getting_started_has_install() — Given getting-started.md, When reading, Then contains 'create-theo'
RED:     test_getting_started_has_dev() — Given getting-started.md, When reading, Then contains 'theo dev'
RED:     test_getting_started_has_generate() — Given getting-started.md, When reading, Then contains 'theo generate'
GREEN:   Write getting-started.md
REFACTOR: None expected
VERIFY:  npx vitest run tests/smoke/docs-integrity.test.ts
```

BDD scenarios:
- **Happy path**: Guide covers install → dev → generate → build → deploy
- **Validation error**: N/A
- **Edge case**: Commands match actual CLI
- **Error scenario**: N/A

#### Acceptance Criteria
- [ ] `docs/getting-started.md` exists
- [ ] Covers install, dev, generate, auth, build, deploy
- [ ] All commands are real (no aspirational)

#### DoD
- [ ] Doc written
- [ ] Tests GREEN

---

## Phase 1: CLI Fix + Validation

**Objective:** Fix CLI version and validate package readiness.

### T1.1 — Fix CLI version + pre-publish checks

#### Objective
Update hardcoded CLI version and verify all package metadata.

#### Evidence
`cli/index.ts:56` has `cli.version('0.0.1')` but package is `0.1.0-alpha.0`.

#### Files to edit
```
packages/theo/src/cli/index.ts (EDIT) — Fix version
tests/smoke/publish-readiness.test.ts (NEW) — Pre-publish validation
```

#### Deep file dependency analysis
- `cli/index.ts`: Line 56 `cli.version('0.0.1')`. Should match package.json version or read dynamically.
- Test file validates all publish prerequisites.

#### Deep Dives
- **Version**: Read from package.json at runtime or hardcode `0.1.0-alpha.0`. Simpler: hardcode for now, update on release.
- **Pre-publish checks**: package.json has `files`, `exports`, `bin`, `version`, `name`. LICENSE exists. No `private: true` on publishable packages.

#### Tasks
1. Update CLI version
2. Create pre-publish validation test

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_cli_version_matches_package() — Given cli/index.ts, When reading version, Then matches package.json version
RED:     test_theo_not_private() — Given theo package.json, When reading private, Then is undefined (not true)
RED:     test_create_theo_not_private() — Given create-theo package.json, When reading private, Then is undefined
RED:     test_license_exists() — Given repo root, When checking LICENSE, Then file exists
RED:     test_theo_has_files_field() — Given theo package.json, When reading files, Then contains 'dist'
RED:     test_create_theo_has_files_field() — Given create-theo package.json, When reading files, Then contains 'dist' and 'templates'
GREEN:   Fix version, verify metadata
REFACTOR: None expected
VERIFY:  npx vitest run tests/smoke/publish-readiness.test.ts
```

BDD scenarios:
- **Happy path**: All publish prerequisites met
- **Validation error**: Missing files field → test fails
- **Edge case**: LICENSE exists with correct content
- **Error scenario**: Private flag on publishable package

#### Acceptance Criteria
- [ ] CLI version matches package.json
- [ ] Neither package has `private: true`
- [ ] LICENSE file exists
- [ ] `files` field correct on both packages

#### DoD
- [ ] Version fixed
- [ ] Pre-publish tests GREEN

---

## Phase 2: Publish Dry-Run

**Objective:** Validate that npm publish would succeed.

### T2.1 — npm pack + dry-run validation

#### Objective
Run `npm pack` on both packages and verify the tarball contents.

#### Evidence
Never published before. Need to verify tarball before real publish.

#### Files to edit
```
tests/smoke/pack-validation.test.ts (NEW) — Pack validation
```

#### Deep file dependency analysis
- New test file. Runs `npm pack --dry-run` and validates output.

#### Deep Dives
- **npm pack**: Creates tarball without publishing. Shows what would be included.
- **Validation**: Check that `dist/` is included, `src/` is NOT included, `node_modules/` is NOT included.
- **Size check**: Package should be < 500KB.

#### Tasks
1. Run `pnpm build` (ensure dist/ exists)
2. Run `npm pack --dry-run` on both packages
3. Create validation test

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_theo_pack_includes_dist() — Given npm pack --dry-run, When listing files, Then dist/ files present
RED:     test_theo_pack_excludes_src() — Given npm pack output, When listing files, Then src/ NOT present
RED:     test_create_theo_pack_includes_templates() — Given create-theo pack, When listing files, Then templates/ present
RED:     test_pack_size_reasonable() — Given packed tarball, When checking size, Then < 500KB
GREEN:   Build + verify pack output
REFACTOR: None expected
VERIFY:  npx vitest run tests/smoke/pack-validation.test.ts
```

BDD scenarios:
- **Happy path**: Pack includes correct files, excludes src/
- **Validation error**: Missing dist/ → build first
- **Edge case**: Templates included in create-theo
- **Error scenario**: Oversized package

#### Acceptance Criteria
- [ ] `npm pack --dry-run` succeeds for both packages
- [ ] dist/ included, src/ excluded
- [ ] templates/ included in create-theo
- [ ] Reasonable package size

#### DoD
- [ ] Pack validation passes
- [ ] Ready for `npm publish`

---

## Phase 3: Regression

**Objective:** Zero regressão before publish.

### T3.1 — Full regression

#### Objective
All tests pass. Dogfood full.

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
5. `pnpm validate:publint`
6. `pnpm validate:attw`
7. E2E tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_typecheck() — Given all changes, When pnpm typecheck, Then exit code 0
RED:     test_all_tests() — Given all changes, When pnpm test, Then all pass (495+)
RED:     test_types() — Given all changes, When pnpm test:types, Then all pass (34+)
RED:     test_build() — Given all changes, When pnpm build, Then exit code 0
GREEN:   Already implemented — verifies
REFACTOR: Fix regressions if found
VERIFY:  pnpm typecheck && pnpm test && pnpm test:types && pnpm build
```

BDD scenarios:
- **Happy path**: All pass
- **Validation error**: Regression → fix
- **Edge case**: README tests added
- **Error scenario**: Version change breaks something

#### Acceptance Criteria
- [ ] `pnpm typecheck` zero errors
- [ ] `pnpm test` all green
- [ ] `pnpm build` exit code 0
- [ ] publint + attw clean

#### DoD
- [ ] Zero regressão
- [ ] Ready for publish

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | README documents non-existent features | T0.1 | Rewrite with only real features |
| 2 | No Getting Started guide | T0.2 | docs/getting-started.md |
| 3 | CLI version mismatch | T1.1 | Fix to 0.1.0-alpha.0 |
| 4 | LICENSE verification | T1.1 | Test that file exists |
| 5 | Package metadata validation | T1.1 | files, exports, bin, private verified |
| 6 | npm pack dry-run | T2.1 | Pack both packages, verify contents |
| 7 | Backward compatibility | T3.1 | Full regression |

**Coverage: 7/7 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-3)
- [ ] All tests passing
- [ ] README documents ONLY real features
- [ ] Getting Started guide exists
- [ ] CLI version matches package.json
- [ ] LICENSE exists
- [ ] npm pack succeeds for both packages
- [ ] publint + attw clean
- [ ] Zero `any`
- [ ] **Dogfood QA PASS**
- [ ] **Ready for `npm publish`**

## Final Phase: Dogfood QA (MANDATORY)

**Objective:** Final validation before publish.

### Execution
Run `/dogfood full`.

### Acceptance Criteria
- [ ] Health score >= 70/100
- [ ] Zero CRITICAL issues
- [ ] README is truthful
- [ ] All features work as documented

### Post-Dogfood: Manual Publish
After dogfood passes, the user manually runs:
```bash
npm login
pnpm changeset publish
```
This publishes `theo@0.1.0-alpha.0` and `create-theo@0.1.0-alpha.0` to npm.
