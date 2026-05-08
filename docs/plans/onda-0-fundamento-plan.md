# Plan: Onda 0 — Fundamento e Contrato do Framework Theo

> **Version 1.0** — Este plano implementa a Onda 0 do framework Theo: os contratos fundamentais (`defineConfig`, `defineRoute`, `defineAction`, `defineMiddleware`), validação de estrutura de projeto, e fixtures de teste. Nenhum runtime é implementado — apenas tipos, schemas Zod, e identity functions que provam que o design da API funciona. O resultado é um monorepo funcional onde `pnpm test` valida todos os contratos e `pnpm test:types` prova a inferência de tipos end-to-end.

## Context

O repositório `theo-agents` é greenfield — contém apenas documentação (`docs/ONDAS.md`, `docs/technical/ONDA-0-SOTA-RESEARCH.md`) e referências (`referencias/next.js/`, `referencias/rails/`). Não existe nenhum código de implementação.

A pesquisa SOTA (documentada em `docs/technical/ONDA-0-SOTA-RESEARCH.md`) analisou 10 frameworks e definiu as decisões arquiteturais:
- `defineConfig` = identity function (Vite pattern) + Zod validation em `loadConfig` (Next.js pattern)
- `defineRoute` = named HTTP exports + Zod schemas opcionais para query/body/params
- `defineAction` = Zod input obrigatório + handler tipado (tRPC-inspired)
- `defineMiddleware` = `await next()` pattern (Hono/Koa)
- Estrutura de projeto opinativa: `app/` (required), `server/` (optional), `theo.config.ts` (required)

## Objective

**Done =** `pnpm test && pnpm test:types && pnpm typecheck` passam com zero erros, incluindo os 3 testes obrigatórios da Onda 0 e type tests que provam inferência Zod→handler.

Metas específicas:
1. Monorepo pnpm com pacote `theo` e stubs de `create-theo`
2. 4 identity functions com type inference completa (`defineConfig`, `defineRoute`, `defineAction`, `defineMiddleware`)
3. `loadConfig()` que valida `theo.config.ts` com Zod e mensagens DX-friendly
4. `validateProjectStructure()` que valida dirs/files obrigatórios
5. 3 fixtures (`basic-valid-app`, `invalid-config`, `invalid-no-app`)
6. 3 testes obrigatórios + type tests passando
7. Zero `any` em código de produção

## ADRs

### D1 — Identity functions, não validação em define*
**Decision:** Todas as funções `define*` são identity functions (`return config`). Validação runtime acontece em `loadConfig()` e no runtime futuro (Onda 3+).
**Rationale:** Seguindo o pattern Vite `defineConfig`, o propósito é type inference e autocomplete no editor. Validar no `defineConfig` forçaria Zod como dependency transitiva em `theo.config.ts` do usuário e adicionaria overhead sem necessidade — a validação real acontece quando o framework carrega a config.
**Consequences:** `defineConfig({ port: 'abc' as any })` não falha até `loadConfig` processar. Isso é aceitável porque o ciclo é: escrever config → rodar CLI → CLI carrega e valida.

### D2 — Pacote único `theo` com subpath exports
**Decision:** Um único pacote `packages/theo/` com exports `theo` e `theo/server`. Sem split em `@theo/core`, `@theo/server`, etc.
**Rationale:** Na Onda 0 temos ~6 arquivos de implementação. Criar múltiplos pacotes adicionaria overhead de build/publish sem valor. Split pode acontecer quando a complexidade justificar (Onda 3+).
**Consequences:** Imports são `import { defineConfig } from 'theo'` e `import { defineRoute } from 'theo/server'`, que é a API pública final. Reorganizar internals depois não quebra API.

### D3 — Zod como peerDependency
**Decision:** Zod é `peerDependency` do pacote `theo`, não dependency direta.
**Rationale:** O usuário precisa de Zod para definir schemas em routes/actions. Ter Zod como peer evita versão duplicada e deixa o usuário controlar a versão.
**Consequences:** `pnpm install theo` sem Zod dá warning. `create-theo` (Onda 1) inclui Zod no template.

### D4 — loadConfig usa dynamic import (vitest-only na Onda 0)
**Decision:** `loadConfig()` usa `import()` para carregar `theo.config.ts`. Na Onda 0 isso funciona via Vitest/tsx. Transpilação real via esbuild/SWC vem na Onda 1.
**Rationale:** Não queremos implementar transpilação de `.ts` na Onda 0 — isso é escopo do CLI (Onda 1). Os testes rodam sob Vitest que já transpila TypeScript.
**Consequences:** `loadConfig` funciona em testes mas não funciona standalone em Node.js puro. Aceitável porque na Onda 0 não existe CLI.

### D5 — Fixtures fora do workspace pnpm
**Decision:** `fixtures/` fica fora de `packages/` e não é listado em `pnpm-workspace.yaml`.
**Rationale:** Fixtures são dados de teste, não pacotes publicáveis. Testes acessam via `path.resolve()`, não via module resolution.
**Consequences:** Fixtures não precisam de `pnpm install` individual. Imports de `theo` dentro de fixtures são apenas para type checking nos testes.

### D6 — Web Standards (Request/Response)
**Decision:** Middleware usa `Request`/`Response` (Web API), não `IncomingMessage`/`ServerResponse` (Node.js).
**Rationale:** Web Standards são portáveis entre runtimes e são o pattern de Hono, Deno, Bun, e Edge. Next.js middleware já usa `NextRequest extends Request`.
**Consequences:** Não há dependência de `node:http` nos contratos. Runtime adapters (futuro) fazem a conversão Node→Web.

## Dependency Graph

```
Phase 0 (scaffolding) ──▶ Phase 1 (config) ──────────┐
                     ├──▶ Phase 2 (server contracts) ──┼──▶ Phase 4 (fixtures + integration) ──▶ Phase 5 (type tests)
                     └──▶ Phase 3 (structure validation)┘
```

- **Phase 0** bloqueia tudo (monorepo precisa existir)
- **Phases 1, 2, 3** são paralelos entre si
- **Phase 4** depende de 1, 2, 3 (fixtures usam todos os contratos)
- **Phase 5** depende de 1, 2 (type tests testam define*)

---

## Phase 0: Monorepo Scaffolding

**Objective:** Workspace pnpm funcional com TypeScript e Vitest configurados. `pnpm install && pnpm typecheck` passam.

### T0.1 — Root workspace configuration

#### Objective
Criar o workspace pnpm, tsconfig root, e vitest config para o monorepo.

#### Evidence
O repo não tem `package.json`, `tsconfig.json`, nem `pnpm-workspace.yaml`. Sem isso, nenhum código pode ser escrito ou testado.

#### Files to edit
```
package.json (NEW) — Root workspace com scripts e devDependencies
pnpm-workspace.yaml (NEW) — Lista packages/*
tsconfig.json (NEW) — Root tsconfig noEmit para type checking
vitest.config.ts (NEW) — Config Vitest com aliases para theo e theo/server
```

#### Deep file dependency analysis
- `package.json`: Ponto de entrada de todo o monorepo. Scripts `test`, `test:types`, `typecheck` usados por todas as fases.
- `pnpm-workspace.yaml`: Define quais dirs são packages. Toda resolução `workspace:*` depende disso.
- `tsconfig.json`: `paths` aliases (`theo` → `packages/theo/src/index.ts`) necessários para que testes importem sem build step.
- `vitest.config.ts`: `resolve.alias` espelha os paths do tsconfig para runtime dos testes.

#### Deep Dives
- **tsconfig paths vs vitest alias**: Ambos precisam apontar para os mesmos source files. tsconfig paths resolvem tipos; vitest alias resolve imports em runtime de teste.
- **moduleResolution: "bundler"**: Permite imports sem extensão `.js` e exports map em package.json. É o padrão moderno para projetos Vite/Vitest.
- **Invariante**: Após esta task, `pnpm install` deve resolver workspace sem erros e `pnpm typecheck` deve passar (com stubs vazios).

#### Tasks
1. Criar `pnpm-workspace.yaml` com `packages: ['packages/*']`
2. Criar `package.json` root com `private: true`, scripts, devDependencies (typescript, vitest, expect-type, zod)
3. Criar `tsconfig.json` root com strict, noEmit, paths para theo e theo/server
4. Criar `vitest.config.ts` com aliases e include patterns
5. Rodar `pnpm install`
6. Verificar `pnpm typecheck` passa

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     verify_workspace_resolves() — Given root package.json and pnpm-workspace.yaml, When pnpm install runs, Then exit code is 0 and node_modules exists
RED:     verify_typecheck_passes() — Given tsconfig.json with paths, When pnpm typecheck runs with empty stubs, Then exit code is 0
RED:     verify_vitest_runs() — Given vitest.config.ts, When pnpm test runs with no test files, Then exit code is 0 (no tests found, not failure)
RED:     verify_invalid_tsconfig() — Given a tsconfig with invalid path, When pnpm typecheck runs, Then it fails (edge case validation)
GREEN:   Create all 4 config files and package stubs
REFACTOR: None expected
VERIFY:  pnpm install && pnpm typecheck
```

BDD scenarios:
- **Happy path**: `pnpm install && pnpm typecheck` passa com zero erros
- **Validation error**: Se tsconfig.json tem paths inválidos, `tsc` reporta erro
- **Edge case**: Workspace com packages/ vazio não falha (pnpm aceita)
- **Error scenario**: Se pnpm-workspace.yaml não lista packages/, `pnpm install` não resolve workspace deps

#### Acceptance Criteria
- [ ] `pnpm install` completa sem erros
- [ ] `pnpm typecheck` passa com zero erros
- [ ] `node_modules/` existe com dependências resolvidas
- [ ] Aliases `theo` e `theo/server` resolvem para paths corretos

#### DoD
- [ ] Todos os 4 arquivos config criados
- [ ] `pnpm install` exit code 0
- [ ] `pnpm typecheck` exit code 0

---

### T0.2 — Package `theo` scaffolding

#### Objective
Criar o pacote principal `theo` com package.json, tsconfig, e stubs de export.

#### Evidence
Sem o pacote, imports `from 'theo'` e `from 'theo/server'` não resolvem.

#### Files to edit
```
packages/theo/package.json (NEW) — Pacote principal com exports map
packages/theo/tsconfig.json (NEW) — tsconfig do pacote
packages/theo/src/index.ts (NEW) — Export stub vazio
packages/theo/src/server/index.ts (NEW) — Export stub vazio
```

#### Deep file dependency analysis
- `packages/theo/package.json`: Define `exports` map que toda importação de `theo` e `theo/server` usa. É a raiz da resolução de módulos.
- `packages/theo/src/index.ts`: Ponto de entrada de `import {} from 'theo'`. Todas as fases adicionam exports aqui.
- `packages/theo/src/server/index.ts`: Ponto de entrada de `import {} from 'theo/server'`. Phase 2 popula.

#### Deep Dives
- **exports map**: Usando `"."` e `"./server"` com `types` e `import` conditions. Em Onda 0 apontam para source `.ts` direto (sem build step). Build real vem na Onda 6.
- **type: "module"**: ESM-first. Imports usam extensão `.js` em source (TypeScript moduleResolution: bundler os resolve para `.ts`).

#### Tasks
1. Criar `packages/theo/package.json` com name, version, type, exports, peerDependencies
2. Criar `packages/theo/tsconfig.json` com strict, noEmit
3. Criar `packages/theo/src/index.ts` com comentário stub
4. Criar `packages/theo/src/server/index.ts` com comentário stub
5. Rodar `pnpm install` para resolver workspace link

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     verify_theo_import_resolves() — Given package theo exists, When importing from 'theo', Then TypeScript resolves the module
RED:     verify_theo_server_import_resolves() — Given server index exists, When importing from 'theo/server', Then TypeScript resolves
RED:     verify_missing_export_fails() — Given empty index.ts, When importing { defineConfig } from 'theo', Then TypeScript errors (not yet exported)
RED:     verify_package_structure() — Given package.json with exports, When checking structure, Then exports map has "." and "./server"
GREEN:   Create package.json, tsconfig, and stub files
REFACTOR: None expected
VERIFY:  pnpm typecheck
```

BDD scenarios:
- **Happy path**: `import {} from 'theo'` resolve via tsconfig paths
- **Validation error**: Import de export não-existente falha em TypeScript
- **Edge case**: Package com exports apontando para `.ts` files (funciona com moduleResolution: bundler)
- **Error scenario**: Se `src/index.ts` não existe, TypeScript falha com module not found

#### Acceptance Criteria
- [ ] `packages/theo/` existe com package.json e tsconfig.json
- [ ] `from 'theo'` e `from 'theo/server'` resolvem em TypeScript
- [ ] `pnpm typecheck` passa

#### DoD
- [ ] 4 arquivos criados
- [ ] Workspace link funciona (pnpm ls theo)
- [ ] Zero TypeScript errors

---

### T0.3 — Package `create-theo` stub

#### Objective
Criar stub do CLI de scaffolding (implementação na Onda 1).

#### Evidence
O README define `npx create-theo@latest my-app`. O pacote precisa existir no workspace mesmo que vazio.

#### Files to edit
```
packages/create-theo/package.json (NEW) — Stub com name e version
```

#### Deep file dependency analysis
- Nenhuma dependência downstream na Onda 0. Apenas reserva o namespace.

#### Deep Dives
Nenhum — é um stub de uma linha.

#### Tasks
1. Criar `packages/create-theo/package.json` com name, version, description

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     verify_create_theo_in_workspace() — Given create-theo package.json, When pnpm ls, Then create-theo appears in workspace
GREEN:   Create package.json
REFACTOR: None expected
VERIFY:  pnpm ls
```

BDD scenarios:
- **Happy path**: pnpm reconhece o pacote no workspace
- **Validation error**: N/A (stub)
- **Edge case**: Pacote sem src/ não causa erro
- **Error scenario**: Se package.json é JSON inválido, pnpm install falha

#### Acceptance Criteria
- [ ] `packages/create-theo/package.json` existe
- [ ] `pnpm ls` lista create-theo

#### DoD
- [ ] Arquivo criado, workspace resolve

---

## Phase 1: Config System

**Objective:** `defineConfig()` como identity function, `theoConfigSchema` para validação Zod, `loadConfig()` para carregar e validar `theo.config.ts`.

### T1.1 — Config Schema (Zod)

#### Objective
Definir o schema Zod para `TheoConfig` com defaults.

#### Evidence
SOTA research definiu: `{ appDir: string='app', serverDir: string='server', port: number=3000 }`. Next.js usa `z.strictObject()` com 800+ linhas de schema — Theo começa mínimo.

#### Files to edit
```
packages/theo/src/config/schema.ts (NEW) — theoConfigSchema Zod + TheoConfig type
tests/unit/config-schema.test.ts (NEW) — Testes de validação do schema
```

#### Deep file dependency analysis
- `schema.ts`: Exporta `theoConfigSchema` e `TheoConfig`. Usado por `define-config.ts` (type), `load-config.ts` (validation), e `index.ts` (re-export).
- Downstream: todo código que lida com config depende deste schema.

#### Deep Dives
- **Zod defaults**: `z.string().default('app')` faz `schema.parse({})` retornar `{ appDir: 'app' }`. Isso é o merge strategy.
- **Port validation**: `z.number().int().min(1).max(65535)` — rejeita floats, negativos, e portas inválidas.
- **Invariante**: `theoConfigSchema.parse({})` DEVE retornar config completa com todos os defaults.

#### Tasks
1. Escrever testes RED em `tests/unit/config-schema.test.ts`
2. Criar `packages/theo/src/config/schema.ts` com schema Zod
3. Verificar testes GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_valid_config_all_fields() — Given valid config with all fields, When safeParse, Then success is true
RED:     test_defaults_applied() — Given empty object, When parse, Then appDir='app', serverDir='server', port=3000
RED:     test_reject_non_integer_port() — Given port 3.14, When safeParse, Then success is false
RED:     test_reject_port_out_of_range() — Given port 0 or 70000, When safeParse, Then success is false
RED:     test_reject_port_as_string() — Given port 'abc', When safeParse, Then success is false
RED:     test_partial_config_fills_defaults() — Given { port: 8080 }, When parse, Then appDir='app' and port=8080
RED:     test_unknown_keys_stripped() — Given { port: 3000, database: 'postgres' }, When parse, Then result does NOT have database property (EC-4)
GREEN:   Implement theoConfigSchema in schema.ts
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/config-schema.test.ts
```

BDD scenarios:
- **Happy path**: Config completa com todos os campos aceita
- **Validation error**: Port como string rejeitado com mensagem clara
- **Edge case**: Config vazia `{}` retorna todos os defaults
- **Error scenario**: Port out of range (0, 70000) rejeitado

#### Acceptance Criteria
- [ ] `theoConfigSchema.parse({})` retorna `{ appDir: 'app', serverDir: 'server', port: 3000 }`
- [ ] `theoConfigSchema.safeParse({ port: 'abc' }).success === false`
- [ ] Tipo `TheoConfig` exportado e inferido do schema
- [ ] Todos os 6 testes passam

#### DoD
- [ ] Testes GREEN
- [ ] Zero TypeScript errors
- [ ] Schema exportado via index.ts

---

### T1.2 — defineConfig (identity function)

#### Objective
Criar `defineConfig()` que aceita `Partial<TheoConfig>` e retorna o mesmo objeto (identity).

#### Evidence
Pattern Vite: `defineConfig` é identity function para IDE autocomplete. Validação NÃO acontece aqui (ADR D1).

#### Files to edit
```
packages/theo/src/config/define-config.ts (NEW) — defineConfig function
tests/unit/define-config.test.ts (NEW) — Testes de identity behavior
```

#### Deep file dependency analysis
- `define-config.ts`: Importa `TheoConfig` de `schema.ts` (apenas tipo). Exportado via `index.ts`.
- Downstream: `theo.config.ts` do usuário importa `defineConfig`.

#### Deep Dives
- **Identity semântica**: `defineConfig(x) === x` (referential equality). Não copia, não valida, não transforma.
- **Partial config**: Aceita `Partial<TheoConfig>` porque defaults são aplicados por `loadConfig`, não aqui.

#### Tasks
1. Escrever testes RED em `tests/unit/define-config.test.ts`
2. Criar `packages/theo/src/config/define-config.ts`
3. Verificar testes GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_returns_unchanged() — Given { appDir: 'src/app', port: 4000 }, When defineConfig, Then result equals input
RED:     test_identity_reference() — Given config object, When defineConfig, Then result is same reference (===)
RED:     test_accepts_empty() — Given {}, When defineConfig, Then returns {}
RED:     test_accepts_partial() — Given { port: 8080 }, When defineConfig, Then returns { port: 8080 }
RED:     test_no_validation() — Given { port: -1 } as any, When defineConfig, Then returns { port: -1 } (no throw)
GREEN:   Implement defineConfig as identity function
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/define-config.test.ts
```

BDD scenarios:
- **Happy path**: Config válida retornada idêntica
- **Validation error**: N/A (identity não valida)
- **Edge case**: Config vazia `{}` aceita
- **Error scenario**: Config com valor inválido NÃO falha (identity)

#### Acceptance Criteria
- [ ] `defineConfig(x) === x` (referential equality)
- [ ] Aceita `Partial<TheoConfig>`
- [ ] Não faz validação runtime

#### DoD
- [ ] Testes GREEN
- [ ] Exportado em `packages/theo/src/index.ts`

---

### T1.3 — TheoConfigError (erros DX-friendly)

#### Objective
Criar classe de erro para config inválida com path, campo, e mensagem útil.

#### Evidence
Next.js classifica erros em fatal vs warning com doc links. Theo segue o mesmo padrão de DX.

#### Files to edit
```
packages/theo/src/config/errors.ts (NEW) — TheoConfigError class
tests/unit/config-errors.test.ts (NEW) — Testes de formatting
```

#### Deep file dependency analysis
- `errors.ts`: Usado por `load-config.ts` quando Zod validation falha. Exportado via `index.ts`.
- Downstream: CLI (Onda 1) captura `TheoConfigError` e formata para terminal.

#### Deep Dives
- **Format**: Inclui path do arquivo, campo que falhou, e mensagem Zod traduzida.
- **ConfigIssue**: `{ field: string, message: string }` — mapeado de `ZodIssue`.

#### Tasks
1. Escrever testes RED em `tests/unit/config-errors.test.ts`
2. Criar `packages/theo/src/config/errors.ts`
3. Verificar testes GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_includes_config_path() — Given TheoConfigError with path '/my-app/theo.config.ts', When accessing message, Then contains the path
RED:     test_includes_field_name() — Given issue { field: 'port', message: '...' }, When accessing message, Then contains 'port'
RED:     test_is_error_instance() — Given TheoConfigError, When checking instanceof Error, Then true
RED:     test_empty_issues() — Given empty issues array, When creating error, Then message still has file path
GREEN:   Implement TheoConfigError class
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/config-errors.test.ts
```

BDD scenarios:
- **Happy path**: Erro com 1 issue formata corretamente
- **Validation error**: Erro com múltiplos issues lista todos
- **Edge case**: Issues array vazio ainda mostra path
- **Error scenario**: N/A (é uma classe de erro, não pode "falhar")

#### Acceptance Criteria
- [ ] `error.message` contém path do config
- [ ] `error.message` contém nome do campo
- [ ] `error instanceof Error === true`
- [ ] `error.issues` e `error.configPath` acessíveis

#### DoD
- [ ] Testes GREEN
- [ ] Exportado em `packages/theo/src/index.ts`

---

### T1.4 — loadConfig

#### Objective
Criar `loadConfig()` que encontra `theo.config.ts`, importa, valida com Zod, e retorna `TheoConfig` ou lança `TheoConfigError`.

#### Evidence
Next.js `loadConfig()` é 200+ linhas com find→transpile→normalize→validate. Theo simplifica: find→import→validate.

#### Files to edit
```
packages/theo/src/config/load-config.ts (NEW) — loadConfig function
tests/unit/load-config.test.ts (NEW) — Testes com fixtures
```

#### Deep file dependency analysis
- `load-config.ts`: Importa `theoConfigSchema` de `schema.ts`, `TheoConfigError` de `errors.ts`. Usa `node:fs` e `node:path`.
- Downstream: CLI commands (`theo dev`, `theo build`, `theo start`) chamam `loadConfig` como primeiro passo.

#### Deep Dives
- **Dynamic import de .ts**: Em Onda 0, funciona apenas sob Vitest (que transpila .ts). Para uso real em CLI, Onda 1 adiciona transpilação via esbuild/tsx.
- **Config ausente**: Se `theo.config.ts` não existe, retorna defaults (`theoConfigSchema.parse({})`). Não falha — config file é conveniente mas não bloqueante neste momento.
- **safeParse → TheoConfigError**: Mapeia `ZodIssue[]` para `ConfigIssue[]`.

#### Tasks
1. Escrever testes RED em `tests/unit/load-config.test.ts`
2. Criar `packages/theo/src/config/load-config.ts`
3. Verificar testes GREEN (requer fixtures da Phase 4 — pode usar `beforeAll` para criar temp dirs inline)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_load_valid_config() — Given fixtures/basic-valid-app, When loadConfig, Then returns { appDir:'app', serverDir:'server', port:3000 }
RED:     test_load_invalid_config_throws() — Given fixtures/invalid-config, When loadConfig, Then throws with 'port' in message
RED:     test_load_missing_config_returns_defaults() — Given dir without theo.config.ts, When loadConfig, Then returns defaults
RED:     test_error_is_TheoConfigError() — Given invalid config, When loadConfig catches, Then error instanceof TheoConfigError
RED:     test_config_syntax_error_clear_message() — Given config with syntax error, When loadConfig, Then throws with 'Failed to load' in message (EC-2)
RED:     test_config_named_export_clear_message() — Given config with named export instead of default, When loadConfig, Then throws with 'must use export default' (EC-1)
RED:     test_config_exports_null() — Given config exporting null, When loadConfig, Then throws with clear message, not Zod internal (EC-6)
GREEN:   Implement loadConfig with try/catch on import() and export default validation
REFACTOR: Extract config file finding to helper if needed
VERIFY:  npx vitest run tests/unit/load-config.test.ts
```

BDD scenarios:
- **Happy path**: Config válida carregada e validada
- **Validation error**: Config com `port: 'abc'` lança TheoConfigError com 'port' na mensagem
- **Edge case**: Diretório sem config retorna defaults; config exporta null/undefined tratado (EC-6)
- **Error scenario**: TheoConfigError contém path e issues; syntax error no config dá mensagem DX-friendly (EC-2); named export em vez de default dá mensagem clara (EC-1)

#### Acceptance Criteria
- [ ] Config válida retorna `TheoConfig` completo
- [ ] Config inválida lança `TheoConfigError` com campo e path
- [ ] Config ausente retorna defaults
- [ ] Testes passam sob Vitest

#### DoD
- [ ] Testes GREEN
- [ ] Exportado em `packages/theo/src/index.ts`

---

### T1.5 — Wire config exports

#### Objective
Conectar todos os exports de config em `packages/theo/src/index.ts`.

#### Evidence
Testes importam `from 'theo'`. Sem exports wired, imports falham.

#### Files to edit
```
packages/theo/src/index.ts (EDIT) — Adicionar exports de config
```

#### Deep file dependency analysis
- `index.ts`: Re-exporta tudo que é público. Todos os testes e o usuário final dependem deste barrel.

#### Deep Dives
Nenhum — é wiring de re-exports.

#### Tasks
1. Adicionar re-exports de `defineConfig`, `loadConfig`, `theoConfigSchema`, `TheoConfig`, `TheoConfigError`
2. Verificar `pnpm typecheck`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     verify_exports_resolve() — Given imports from 'theo', When TypeScript checks, Then defineConfig, loadConfig, theoConfigSchema, TheoConfigError resolve
GREEN:   Add re-exports to index.ts
REFACTOR: None expected
VERIFY:  pnpm typecheck
```

BDD scenarios:
- **Happy path**: Todos os exports resolvem
- **Validation error**: Import de nome inexistente falha em TS
- **Edge case**: Type-only exports (`TheoConfig`) resolvem
- **Error scenario**: Circular import detectado por TS

#### Acceptance Criteria
- [ ] `import { defineConfig, loadConfig, theoConfigSchema, TheoConfigError } from 'theo'` compila
- [ ] `import type { TheoConfig } from 'theo'` compila

#### DoD
- [ ] `pnpm typecheck` passa

---

## Phase 2: Server Contracts

**Objective:** 3 identity functions (`defineRoute`, `defineAction`, `defineMiddleware`) com type inference completa via generics Zod.

### T2.1 — defineRoute

#### Objective
Criar `defineRoute()` com generics para query, body, params Zod schemas.

#### Evidence
SOTA: Hono usa `zValidator` inline, tRPC usa procedures tipados. Theo combina: named exports (Next.js) + Zod schemas (tRPC-like inference).

#### Files to edit
```
packages/theo/src/server/define-route.ts (NEW) — defineRoute + RouteConfig types
tests/unit/define-route.test.ts (NEW) — Testes de identity behavior
```

#### Deep file dependency analysis
- `define-route.ts`: Exporta `defineRoute` e `RouteConfig`. Tipos importam `z` de Zod (type-only).
- Downstream: `server/index.ts` re-exporta. Fixtures e type tests usam.

#### Deep Dives
- **Generic defaults**: Quando `query` não é fornecido, `TQuery` deve resolver para algo que faz `z.infer<TQuery>` ser `undefined`. Opções: usar overloads, conditional types, ou default genérico. Abordagem recomendada: handler recebe objeto com propriedades opcionais.
- **Referential equality**: `defineRoute(config) === config` — identity.
- **Handler sem schemas**: `defineRoute({ handler: () => ({}) })` deve funcionar (route sem input).

#### Tasks
1. Escrever testes RED em `tests/unit/define-route.test.ts`
2. Criar `packages/theo/src/server/define-route.ts`
3. Verificar testes GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_returns_same_reference() — Given route config, When defineRoute, Then result === config
RED:     test_handler_only_route() — Given { handler }, When defineRoute, Then returns config
RED:     test_with_query_schema() — Given { query: z.object(...), handler }, When defineRoute, Then query schema preserved
RED:     test_with_body_schema() — Given { body: z.object(...), handler }, When defineRoute, Then body schema preserved
RED:     test_with_params_schema() — Given { params: z.object(...), handler }, When defineRoute, Then params schema preserved
RED:     test_with_all_schemas() — Given query+body+params+handler, When defineRoute, Then all preserved
GREEN:   Implement defineRoute as identity function with generics
REFACTOR: Simplify generic constraints if possible
VERIFY:  npx vitest run tests/unit/define-route.test.ts
```

BDD scenarios:
- **Happy path**: Route com query schema aceita e retornada
- **Validation error**: N/A (identity)
- **Edge case**: Route sem nenhum schema (handler-only)
- **Error scenario**: N/A (identity)

#### Acceptance Criteria
- [ ] `defineRoute(config) === config`
- [ ] Aceita handler-only (sem schemas)
- [ ] Aceita query, body, params individualmente ou combinados
- [ ] Testes passam

#### DoD
- [ ] Testes GREEN
- [ ] Exportado em `packages/theo/src/server/index.ts`

---

### T2.2 — defineAction

#### Objective
Criar `defineAction()` com `input` Zod obrigatório.

#### Evidence
SOTA: tRPC mutations exigem input schema. Theo segue: validation não é opt-in.

#### Files to edit
```
packages/theo/src/server/define-action.ts (NEW) — defineAction + ActionConfig types
tests/unit/define-action.test.ts (NEW) — Testes de identity behavior
```

#### Deep file dependency analysis
- `define-action.ts`: Exporta `defineAction` e `ActionConfig`. Input é `TInput extends z.ZodType`.
- Downstream: `server/index.ts` re-exporta. Fixtures e type tests usam.

#### Deep Dives
- **Input obrigatório**: `ActionConfig<TInput>` não tem `input?:` — é `input:`. Se o dev omite, TypeScript falha. Verificado no type test.
- **Sem output schema**: Output é inferido do return do handler (como tRPC). Schema de output pode ser adicionado em Onda futura.

#### Tasks
1. Escrever testes RED em `tests/unit/define-action.test.ts`
2. Criar `packages/theo/src/server/define-action.ts`
3. Verificar testes GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_returns_same_reference() — Given action config, When defineAction, Then result === config
RED:     test_input_schema_preserved() — Given { input: z.object(...), handler }, When defineAction, Then input schema accessible
RED:     test_accepts_complex_input() — Given nested Zod schema, When defineAction, Then preserved
RED:     test_handler_receives_context() — Given action, When checking handler signature, Then handler param has input property
GREEN:   Implement defineAction as identity function
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/define-action.test.ts
```

BDD scenarios:
- **Happy path**: Action com input schema aceita
- **Validation error**: N/A (identity)
- **Edge case**: Zod schema complexo (nested objects, arrays)
- **Error scenario**: Omitir input é compile-time error (type test in Phase 5)

#### Acceptance Criteria
- [ ] `defineAction(config) === config`
- [ ] `input` é propriedade obrigatória no tipo
- [ ] Testes passam

#### DoD
- [ ] Testes GREEN
- [ ] Exportado em `packages/theo/src/server/index.ts`

---

### T2.3 — defineMiddleware

#### Objective
Criar `defineMiddleware()` com signature `(request, next) => Response`.

#### Evidence
SOTA: Hono/Koa `await next()` pattern. Web Standards Request/Response.

#### Files to edit
```
packages/theo/src/server/define-middleware.ts (NEW) — defineMiddleware + MiddlewareHandler type
tests/unit/define-middleware.test.ts (NEW) — Testes de identity behavior
```

#### Deep file dependency analysis
- `define-middleware.ts`: Exporta `defineMiddleware` e `MiddlewareHandler`. Usa apenas Web API types (Request, Response).
- Downstream: `server/index.ts` re-exporta.

#### Deep Dives
- **Web Standards**: `Request` e `Response` são globals em Node.js 18+. Sem import necessário.
- **next() pattern**: `next` recebe `Request` e retorna `Promise<Response>`. Middleware pode interceptar antes ou depois.

#### Tasks
1. Escrever testes RED em `tests/unit/define-middleware.test.ts`
2. Criar `packages/theo/src/server/define-middleware.ts`
3. Verificar testes GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_returns_same_reference() — Given middleware handler, When defineMiddleware, Then result === handler
RED:     test_passthrough_handler() — Given handler that calls next(), When defineMiddleware, Then handler preserved
RED:     test_short_circuit_handler() — Given handler that returns Response directly, When defineMiddleware, Then handler preserved
RED:     test_async_handler() — Given async handler, When defineMiddleware, Then handler preserved
GREEN:   Implement defineMiddleware as identity function
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/define-middleware.test.ts
```

BDD scenarios:
- **Happy path**: Middleware passthrough aceito
- **Validation error**: N/A (identity)
- **Edge case**: Middleware que retorna Response diretamente (short-circuit)
- **Error scenario**: N/A (identity)

#### Acceptance Criteria
- [ ] `defineMiddleware(handler) === handler`
- [ ] Aceita async handler
- [ ] Aceita handler que short-circuits

#### DoD
- [ ] Testes GREEN
- [ ] Exportado em `packages/theo/src/server/index.ts`

---

### T2.4 — Wire server exports

#### Objective
Conectar todos os exports de server em `packages/theo/src/server/index.ts`.

#### Evidence
Testes importam `from 'theo/server'`. Sem wiring, imports falham.

#### Files to edit
```
packages/theo/src/server/index.ts (EDIT) — Adicionar re-exports
```

#### Deep file dependency analysis
- `server/index.ts`: Barrel file para `theo/server`. Type tests e fixtures importam daqui.

#### Deep Dives
Nenhum — wiring.

#### Tasks
1. Adicionar re-exports de defineRoute, defineAction, defineMiddleware e tipos
2. Verificar `pnpm typecheck`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     verify_server_exports() — Given imports from 'theo/server', When TypeScript checks, Then all 3 functions + types resolve
GREEN:   Add re-exports
REFACTOR: None expected
VERIFY:  pnpm typecheck
```

BDD scenarios:
- **Happy path**: Todos exports resolvem
- **Validation error**: Import inexistente falha
- **Edge case**: Type-only exports (RouteConfig, ActionConfig, MiddlewareHandler)
- **Error scenario**: Circular import

#### Acceptance Criteria
- [ ] `import { defineRoute, defineAction, defineMiddleware } from 'theo/server'` compila
- [ ] Types exportados

#### DoD
- [ ] `pnpm typecheck` passa

---

## Phase 3: Project Structure Validation

**Objective:** `validateProjectStructure()` que valida dirs/files obrigatórios com mensagens DX-friendly.

### T3.1 — TheoProjectError

#### Objective
Criar classe de erro para estrutura de projeto inválida.

#### Evidence
Teste obrigatório 3 exige mensagem "Missing required directory: app/". Precisamos de error class DX-friendly.

#### Files to edit
```
packages/theo/src/core/errors.ts (NEW) — TheoProjectError class
tests/unit/project-errors.test.ts (NEW) — Testes de formatting
```

#### Deep file dependency analysis
- `errors.ts`: Usado por `validate-structure.ts`. Exportado via `index.ts`.

#### Deep Dives
- **Format**: Lista de erros com root dir. Cada erro inclui sugestão de fix.

#### Tasks
1. Escrever testes RED
2. Criar `packages/theo/src/core/errors.ts`
3. Verificar testes GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_includes_root_dir() — Given TheoProjectError with '/my-app', When message, Then contains '/my-app'
RED:     test_includes_all_errors() — Given 2 error strings, When message, Then contains both
RED:     test_is_error_instance() — Given TheoProjectError, When instanceof Error, Then true
RED:     test_empty_errors() — Given [], When creating error, Then message still has root dir
GREEN:   Implement TheoProjectError
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/project-errors.test.ts
```

BDD scenarios:
- **Happy path**: Erro com 1 issue formata corretamente
- **Validation error**: Erro com múltiplos issues lista todos
- **Edge case**: Issues array vazio
- **Error scenario**: N/A

#### Acceptance Criteria
- [ ] `error.message` contém root dir
- [ ] `error.message` contém todas as mensagens de erro
- [ ] `error instanceof Error`

#### DoD
- [ ] Testes GREEN
- [ ] Exportado em `packages/theo/src/index.ts`

---

### T3.2 — validateProjectStructure

#### Objective
Criar `validateProjectStructure()` que verifica dirs/files obrigatórios.

#### Evidence
Testes obrigatórios 1 e 3: projeto válido aceito, projeto sem app/ rejeitado com mensagem clara.

#### Files to edit
```
packages/theo/src/core/validate-structure.ts (NEW) — validateProjectStructure function
tests/unit/validate-structure.test.ts (NEW) — Testes com fixtures
```

#### Deep file dependency analysis
- `validate-structure.ts`: Usa `node:fs` (existsSync) e `node:path`. Importa `TheoProjectError` de `errors.ts`.
- Downstream: CLI commands chamam antes de qualquer operação.

#### Deep Dives
- **Required dirs**: Apenas `app/`
- **Required files**: `theo.config.ts`, `package.json`
- **Optional**: `server/`, `components/`, `lib/`, `public/` — não validados
- **Fail fast**: Coleta todos os erros antes de throw (não para no primeiro)

#### Tasks
1. Escrever testes RED
2. Criar `packages/theo/src/core/validate-structure.ts`
3. Verificar testes GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_valid_structure_passes() — Given fixtures/basic-valid-app, When validateProjectStructure, Then does not throw
RED:     test_missing_app_fails() — Given fixtures/invalid-no-app, When validateProjectStructure, Then throws 'Missing required directory: app/'
RED:     test_throws_TheoProjectError() — Given invalid structure, When catch, Then error instanceof TheoProjectError
RED:     test_optional_dirs_not_required() — Given project without components/, When validateProjectStructure, Then does not throw
RED:     test_collects_all_errors() — Given dir without app/ AND without theo.config.ts, When catch, Then error.errors has 2 items
RED:     test_nonexistent_rootdir_fails() — Given path that does not exist, When validateProjectStructure, Then throws 'Project directory does not exist' (EC-3)
GREEN:   Implement validateProjectStructure with rootDir existence check first
REFACTOR: Extract rule definitions to constants
VERIFY:  npx vitest run tests/unit/validate-structure.test.ts
```

BDD scenarios:
- **Happy path**: Projeto completo aceito
- **Validation error**: Missing app/ com mensagem exata
- **Edge case**: Projeto sem dirs opcionais (components/, lib/) aceito; rootDir inexistente dá mensagem clara (EC-3)
- **Error scenario**: Múltiplos erros coletados em um throw

#### Acceptance Criteria
- [ ] Projeto válido não lança erro
- [ ] Projeto sem `app/` lança com mensagem exata "Missing required directory: app/"
- [ ] TheoProjectError com lista de todos os erros
- [ ] Dirs opcionais não validados

#### DoD
- [ ] Testes GREEN
- [ ] Exportado em `packages/theo/src/index.ts`

---

## Phase 4: Fixtures + Integration Tests

**Objective:** 3 fixtures de teste e os 3 testes obrigatórios da Onda 0 passando.

### T4.1 — Fixture basic-valid-app

#### Objective
Criar fixture de projeto Theo mínimo válido.

#### Evidence
Critério de aceite da Onda 0: "A onda só passa se existir uma fixture: `fixtures/basic-valid-app/`"

#### Files to edit
```
fixtures/basic-valid-app/package.json (NEW)
fixtures/basic-valid-app/theo.config.ts (NEW)
fixtures/basic-valid-app/app/page.tsx (NEW)
fixtures/basic-valid-app/server/routes/health.ts (NEW)
```

#### Deep file dependency analysis
- Estes arquivos são dados de teste. Todos os testes de `loadConfig` e `validateProjectStructure` apontam para este dir.

#### Deep Dives
- `theo.config.ts` usa `defineConfig` com valores explícitos (não defaults) para provar que valores custom funcionam.
- `app/page.tsx` é JSX mínimo que prova a estrutura.
- `server/routes/health.ts` usa `defineRoute` para provar o contrato.

#### Tasks
1. Criar diretórios e arquivos da fixture
2. Verificar que testes existentes que referenciam esta fixture passam

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_fixture_exists() — Given fixture path, When checking existsSync, Then all required files exist
RED:     test_fixture_validates() — Given fixture path, When validateProjectStructure, Then does not throw
RED:     test_fixture_config_loads() — Given fixture path, When loadConfig, Then returns valid TheoConfig
RED:     test_fixture_has_health_route() — Given fixture path, When checking server/routes/health.ts, Then file exists
GREEN:   Create all fixture files
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/onda0-mandatory.test.ts
```

BDD scenarios:
- **Happy path**: Fixture contém todos os arquivos necessários
- **Validation error**: N/A (fixture é static)
- **Edge case**: Fixture tem server/ (optional dir) presente
- **Error scenario**: Se fixture corrompida, testes falham imediatamente

#### Acceptance Criteria
- [ ] `fixtures/basic-valid-app/` tem app/page.tsx, server/routes/health.ts, theo.config.ts, package.json
- [ ] `validateProjectStructure(fixturePath)` não lança
- [ ] `loadConfig(fixturePath)` retorna TheoConfig válida

#### DoD
- [ ] Todos os arquivos criados
- [ ] Testes que referenciam esta fixture passam

---

### T4.2 — Fixture invalid-config

#### Objective
Criar fixture com `theo.config.ts` inválido para testar mensagem de erro.

#### Evidence
Teste obrigatório 2: "Se theo.config.ts exportar algo inválido, o CLI deve falhar com erro claro."

#### Files to edit
```
fixtures/invalid-config/package.json (NEW)
fixtures/invalid-config/app/page.tsx (NEW)
fixtures/invalid-config/theo.config.ts (NEW) — Exporta { port: 'abc' }
```

#### Deep file dependency analysis
- Usada pelo teste `test_load_invalid_config_throws`.

#### Deep Dives
- Config exporta `defineConfig({ port: 'abc' as any })` — TypeScript aceita (by design), Zod rejeita em `loadConfig`.

#### Tasks
1. Criar fixture files
2. Verificar teste de invalid config passa

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_invalid_config_detected() — Given fixture with port:'abc', When loadConfig, Then throws TheoConfigError mentioning 'port'
RED:     test_structure_valid_config_invalid() — Given fixture with valid app/ but invalid config, When validateProjectStructure passes but loadConfig fails, Then both operate independently
GREEN:   Create fixture files
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/load-config.test.ts
```

BDD scenarios:
- **Happy path**: N/A (fixture é intencionalmente inválida)
- **Validation error**: Port 'abc' rejeitado com mensagem clara
- **Edge case**: Estrutura de projeto é válida — apenas config é ruim
- **Error scenario**: TheoConfigError com campo 'port' na mensagem

#### Acceptance Criteria
- [ ] `loadConfig(fixturePath)` lança com 'port' na mensagem
- [ ] Estrutura do projeto válida (app/ existe)

#### DoD
- [ ] Fixture criada
- [ ] Teste mandatory 2 passa

---

### T4.3 — Fixture invalid-no-app

#### Objective
Criar fixture sem diretório `app/` para testar mensagem de erro.

#### Evidence
Teste obrigatório 3: "Deve falhar com mensagem útil: Missing required directory: app/"

#### Files to edit
```
fixtures/invalid-no-app/package.json (NEW)
fixtures/invalid-no-app/theo.config.ts (NEW)
```

#### Deep file dependency analysis
- Usada pelo teste `test_missing_app_fails`.

#### Deep Dives
- NÃO tem diretório `app/`. Config é válida — apenas estrutura está errada.

#### Tasks
1. Criar fixture files (sem app/)
2. Verificar teste de missing app passa

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_no_app_dir() — Given fixture without app/, When validateProjectStructure, Then throws 'Missing required directory: app/'
RED:     test_config_still_valid() — Given fixture without app/, When loadConfig, Then returns valid config (config is fine, structure isn't)
GREEN:   Create fixture files
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/validate-structure.test.ts
```

BDD scenarios:
- **Happy path**: N/A (intencionalmente inválida)
- **Validation error**: "Missing required directory: app/" na mensagem
- **Edge case**: Config é válida mesmo sem app/
- **Error scenario**: TheoProjectError com exatamente 1 erro

#### Acceptance Criteria
- [ ] `validateProjectStructure(fixturePath)` lança com "Missing required directory: app/"
- [ ] `loadConfig(fixturePath)` funciona (config está OK)

#### DoD
- [ ] Fixture criada
- [ ] Teste mandatory 3 passa

---

### T4.4 — Testes obrigatórios da Onda 0

#### Objective
Criar test suite dedicado com os 3 testes obrigatórios da Onda 0.

#### Evidence
`docs/ONDAS.md` define explicitamente 3 testes que DEVEM passar.

#### Files to edit
```
tests/unit/onda0-mandatory.test.ts (NEW) — Os 3 testes obrigatórios
```

#### Deep file dependency analysis
- Importa `validateProjectStructure` e `loadConfig` de `theo`. Usa fixtures de T4.1-T4.3.

#### Deep Dives
Estes testes são o critério de aceite final. Se passam, Onda 0 está completa.

#### Tasks
1. Criar `tests/unit/onda0-mandatory.test.ts` com 3 testes
2. Verificar que todos passam

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_valid_structure_recognized() — Given fixtures/basic-valid-app, When validateProjectStructure, Then no throw
RED:     test_invalid_config_clear_error() — Given fixtures/invalid-config, When loadConfig, Then throws with 'port'
RED:     test_missing_app_clear_message() — Given fixtures/invalid-no-app, When validateProjectStructure, Then throws 'Missing required directory: app/'
GREEN:   All tests should already pass if Phases 1-3 and T4.1-T4.3 are complete
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/onda0-mandatory.test.ts
```

BDD scenarios:
- **Happy path**: Projeto válido reconhecido
- **Validation error**: Config inválida com erro claro
- **Edge case**: N/A
- **Error scenario**: Missing app/ com mensagem exata

#### Acceptance Criteria
- [ ] Teste 1 passa (estrutura válida reconhecida)
- [ ] Teste 2 passa (config inválida com erro claro)
- [ ] Teste 3 passa (missing app/ com mensagem exata)

#### DoD
- [ ] 3/3 testes GREEN
- [ ] Este é o acceptance gate da Onda 0

---

## Phase 5: Type Tests

**Objective:** Provar que a inferência de tipos Zod→handler funciona em compile-time.

### T5.1 — Type test: defineRoute

#### Objective
Verificar que `defineRoute` infere query, body, params de Zod schemas.

#### Evidence
SOTA research definiu que type inference end-to-end é o diferencial do Theo (vs Next.js que não valida, vs tRPC que não é file-based).

#### Files to edit
```
tests/type/define-route.test-d.ts (NEW) — Type tests com expectTypeOf
```

#### Deep file dependency analysis
- Importa `defineRoute` de `theo/server` e `z` de `zod`. Usa `expectTypeOf` de `vitest`.

#### Deep Dives
- **vitest typecheck**: Roda `tsc` sobre os arquivos `.test-d.ts` e reporta erros. Não executa runtime.
- **@ts-expect-error**: Usado para provar que imports inválidos falham.

#### Tasks
1. Criar type tests para query, body, params inference
2. Verificar com `pnpm test:types`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     type_query_inferred() — Given z.object({ search: z.string() }), When defineRoute query, Then handler.query is { search: string }
RED:     type_body_inferred() — Given z.object({ name: z.string() }), When defineRoute body, Then handler.body is { name: string }
RED:     type_params_inferred() — Given z.object({ id: z.string() }), When defineRoute params, Then handler.params is { id: string }
RED:     type_handler_only_accepted() — Given no schemas, When defineRoute, Then handler is callable
RED:     type_handler_void_accepted() — Given handler returning void, When defineRoute, Then compiles (EC-5)
GREEN:   Type tests should pass if generics in defineRoute are correct
REFACTOR: Adjust generic constraints if inference fails
VERIFY:  pnpm test:types
```

BDD scenarios:
- **Happy path**: Query type inferred from Zod schema
- **Validation error**: N/A (compile-time)
- **Edge case**: Handler-only route (no schemas)
- **Error scenario**: Wrong type in handler (compile error)

#### Acceptance Criteria
- [ ] `pnpm test:types` passa com zero errors
- [ ] query, body, params types all inferred correctly

#### DoD
- [ ] Type tests GREEN

---

### T5.2 — Type test: defineAction

#### Objective
Verificar que `defineAction` infere input de Zod e que omitir `input` é compile error.

#### Files to edit
```
tests/type/define-action.test-d.ts (NEW) — Type tests
```

#### Deep file dependency analysis
- Importa `defineAction` de `theo/server`.

#### Deep Dives
- **@ts-expect-error para input obrigatório**: Prova que `defineAction({ handler: () => {} })` sem `input` é erro de tipo.

#### Tasks
1. Criar type tests
2. Verificar com `pnpm test:types`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     type_input_inferred() — Given z.object({ name: z.string() }), When defineAction, Then handler.input is { name: string }
RED:     type_input_required() — Given no input property, When defineAction, Then TypeScript error (@ts-expect-error)
RED:     type_complex_input() — Given nested z.object, When defineAction, Then nested types inferred
GREEN:   Type tests should pass if ActionConfig generic is correct
REFACTOR: None expected
VERIFY:  pnpm test:types
```

BDD scenarios:
- **Happy path**: Input type inferred
- **Validation error**: Missing input is TS error
- **Edge case**: Complex nested Zod schema
- **Error scenario**: Wrong input type in handler

#### Acceptance Criteria
- [ ] Input type inferred from Zod
- [ ] Omitting `input` is a compile error
- [ ] `pnpm test:types` passa

#### DoD
- [ ] Type tests GREEN

---

### T5.3 — Type test: defineConfig

#### Objective
Verificar que `defineConfig` aceita `Partial<TheoConfig>` e rejeita tipos errados.

#### Files to edit
```
tests/type/define-config.test-d.ts (NEW) — Type tests
```

#### Deep file dependency analysis
- Importa `defineConfig` de `theo`.

#### Deep Dives
- `@ts-expect-error` para `port: 'abc'` — prova que TypeScript pega o erro.

#### Tasks
1. Criar type tests
2. Verificar com `pnpm test:types`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     type_accepts_partial() — Given { port: 4000 }, When defineConfig, Then compiles
RED:     type_accepts_empty() — Given {}, When defineConfig, Then compiles
RED:     type_rejects_wrong_type() — Given { port: 'abc' }, When defineConfig, Then TypeScript error (@ts-expect-error)
GREEN:   Type tests pass
REFACTOR: None expected
VERIFY:  pnpm test:types
```

BDD scenarios:
- **Happy path**: Partial config aceita
- **Validation error**: Wrong type rejeitado em compile-time
- **Edge case**: Empty config
- **Error scenario**: Unknown property

#### Acceptance Criteria
- [ ] `defineConfig({ port: 4000 })` compila
- [ ] `defineConfig({ port: 'abc' })` é compile error
- [ ] `pnpm test:types` passa

#### DoD
- [ ] Type tests GREEN

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | defineConfig contrato | T1.1, T1.2, T5.3 | Schema Zod + identity function + type test |
| 2 | defineRoute contrato | T2.1, T5.1 | Identity function + generics + type test |
| 3 | defineAction contrato | T2.2, T5.2 | Identity function + input obrigatório + type test |
| 4 | defineMiddleware contrato | T2.3 | Identity function + Web Standards types |
| 5 | loadConfig com validação | T1.3, T1.4, T4.2 | Zod validation + TheoConfigError + fixture |
| 6 | validateProjectStructure | T3.1, T3.2, T4.3 | TheoProjectError + validation rules + fixture |
| 7 | Teste 1 — Estrutura válida | T4.1, T4.4 | Fixture basic-valid-app + teste obrigatório |
| 8 | Teste 2 — Config inválida | T4.2, T4.4 | Fixture invalid-config + teste obrigatório |
| 9 | Teste 3 — Sem app/ | T4.3, T4.4 | Fixture invalid-no-app + teste obrigatório |
| 10 | Fixture basic-valid-app | T4.1 | 4 arquivos criados |
| 11 | Estrutura de projeto opinativa | T3.2, T4.1 | Required/optional dirs definidos |
| 12 | Type inference end-to-end | T5.1, T5.2, T5.3 | Type tests com expectTypeOf |
| 13 | Monorepo setup | T0.1, T0.2, T0.3 | pnpm workspace + theo package |

**Coverage: 13/13 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-5)
- [ ] All unit tests passing (`pnpm test`)
- [ ] All type tests passing (`pnpm test:types`)
- [ ] Zero TypeScript errors (`pnpm typecheck`)
- [ ] Zero `any` in production code (packages/theo/src/)
- [ ] 3 testes obrigatórios da Onda 0 GREEN
- [ ] 3 fixtures existem e são válidas
- [ ] 4 identity functions exportadas e tipadas
- [ ] Web Standards (Request/Response) em todos os contratos
- [ ] Nenhum código de agents/MCP/memory/workflows

## Final Phase: Dogfood QA (MANDATORY)

> Na Onda 0 não existe CLI nem dev server, então `/dogfood full` não se aplica. A validação de dogfood para Onda 0 é:

### Execution

Validação manual equivalente ao dogfood:
1. `pnpm install` — instala sem erros
2. `pnpm test` — todos os testes unit GREEN
3. `pnpm test:types` — todos os type tests GREEN
4. `pnpm typecheck` — zero errors
5. Verificar que imports `from 'theo'` e `from 'theo/server'` resolvem no editor (VSCode)

### Acceptance Criteria

- [ ] `pnpm test` exit code 0
- [ ] `pnpm test:types` exit code 0
- [ ] `pnpm typecheck` exit code 0
- [ ] Zero CRITICAL issues
- [ ] Fixtures validam contratos
