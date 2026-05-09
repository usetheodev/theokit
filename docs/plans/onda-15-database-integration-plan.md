# Plan: Onda 15 — Database Integration (Template Postgres)

> **Version 1.0** — Cria o template `postgres` para `create-theo --template=postgres` com Drizzle ORM pré-configurado: schema de exemplo (users), connection singleton, CRUD routes tipados, context com `ctx.db`, drizzle.config.ts, e .env.example. Zero mudança no core do framework — apenas template + testes de scaffold. O Theo recomenda Drizzle via template mas não força: user pode trocar por qualquer ORM.

## Context

O Theo tem 14 ondas, 421 testes, context extensível (`ctx.db` via TCtx), env vars protegidas (`THEO_PUBLIC_*`), e auth system. Falta um template que mostre como usar DB com o framework. Os 3 templates existentes (default, dashboard, api-only) não incluem database.

Nenhum framework fullstack JS/TS (Next.js, Remix, Hono, SvelteKit) integra DB no core. Todos delegam para ORMs externos. O Theo segue o mesmo pattern: **opina via template, não via dependency**.

Evidence: `packages/create-theo/templates/` tem 3 templates sem DB. Nenhum deps de ORM no `packages/theo/package.json`.

## Objective

**Done =** `npx create-theo my-app --template=postgres` scaffolds projeto com Drizzle ORM configurado, `db/schema.ts` com tabela users, routes CRUD tipados, `ctx.db` no context, e `.env.example` com DATABASE_URL.

Metas:
1. Template `postgres` com Drizzle ORM + postgres driver
2. Schema de exemplo (users table)
3. Connection singleton em `db/index.ts`
4. CRUD routes em `server/routes/users.ts`
5. Context com `ctx.db` em `server/context.ts`
6. `drizzle.config.ts` e `.env.example`
7. Template listado no error message de invalid template
8. Scaffold test funciona
9. Zero mudança no core

## ADRs

### D1 — Database integration via template, não no core
**Decision:** Drizzle ORM é dependency do template `postgres`, não do package `theo`. Zero mudança no core.
**Rationale:** Next.js, Remix, Hono, SvelteKit — nenhum integra DB no core. O Theo tem todos os building blocks necessários (context extensível, env vars, auth). Adicionar Drizzle como dep do core seria lock-in sem valor — user pode preferir Prisma ou Kysely.
**Consequences:** User que não quer Drizzle ignora o template. User que quer Drizzle tem referência completa.

### D2 — Drizzle ORM como escolha opinativa do template
**Decision:** O template `postgres` usa Drizzle ORM (não Prisma, não Kysely).
**Rationale:** Drizzle é TypeScript-native (schema em TS, tipo inferido, zero codegen), SQL-first ("if you know SQL, you know Drizzle"), ~7KB bundle, Apache 2.0. Alinha com a filosofia do Theo: TypeScript-native, zero magic, close-to-the-metal.
**Consequences:** Template demonstra Drizzle. User pode trocar — nenhuma parte do framework depende de Drizzle.

### D3 — postgres (node) driver, não pg
**Decision:** Usa `postgres` (postgres.js by porsager) como driver, não `pg` (node-postgres).
**Rationale:** `postgres` é mais moderno, tem melhor TypeScript support, é o driver recomendado pelo Drizzle para PostgreSQL, e suporta connection pooling nativo.
**Consequences:** Template funciona com PostgreSQL. SQLite template pode ser adicionado em onda futura.

### D4 — Error message atualizado com novo template
**Decision:** A mensagem de erro para template inválido deve listar `postgres` junto com os outros.
**Rationale:** A mensagem hardcoded em `create-theo/src/index.ts:20` lista "default, dashboard, api-only". Precisa incluir "postgres".
**Consequences:** 1 linha modificada no core (error message string). Mínima mudança.

## Dependency Graph

```
Phase 0 (template files) ──▶ Phase 1 (error message + tests) ──▶ Phase 2 (regression)
```

- **Phase 0** cria todos os arquivos do template
- **Phase 1** atualiza error message e cria testes
- **Phase 2** regressão completa

---

## Phase 0: Template postgres

**Objective:** Criar todos os arquivos do template postgres com Drizzle ORM.

### T0.1 — Template files

#### Objective
Criar o template `postgres` completo com Drizzle ORM, schema, connection, CRUD routes, context, e config.

#### Evidence
3 templates existem sem DB. Apps reais precisam de database. O template é a forma opinativa de recomendar.

#### Files to edit
```
packages/create-theo/templates/postgres/app/page.tsx (NEW)
packages/create-theo/templates/postgres/app/layout.tsx (NEW)
packages/create-theo/templates/postgres/server/routes/health.ts (NEW)
packages/create-theo/templates/postgres/server/routes/users.ts (NEW)
packages/create-theo/templates/postgres/server/context.ts (NEW)
packages/create-theo/templates/postgres/db/schema.ts (NEW)
packages/create-theo/templates/postgres/db/index.ts (NEW)
packages/create-theo/templates/postgres/drizzle.config.ts (NEW)
packages/create-theo/templates/postgres/theo.config.ts (NEW)
packages/create-theo/templates/postgres/tsconfig.json (NEW)
packages/create-theo/templates/postgres/index.html (NEW)
packages/create-theo/templates/postgres/package.json.tmpl (NEW)
packages/create-theo/templates/postgres/_gitignore (NEW)
packages/create-theo/templates/postgres/.env.example (NEW)
packages/create-theo/templates/postgres/public/.gitkeep (NEW)
```

#### Deep file dependency analysis
- All template files are static. They are copied verbatim by `scaffold()` in `create-theo/src/index.ts`. No code changes to the scaffold logic — it already supports any directory in `templates/`.
- `package.json.tmpl` uses `{{name}}` placeholder, processed by scaffold.
- The template is self-contained — no dependency on framework internals beyond `theo`, `theo/server`.

#### Deep Dives

**db/schema.ts** — Defines a `users` table with id (uuid), name, email, createdAt. Uses `drizzle-orm/pg-core`.

**db/index.ts** — Creates a singleton connection using `postgres()` driver and `drizzle()` wrapper. Reads `DATABASE_URL` from `process.env`.

**server/context.ts** — Imports `db` and exposes it as `ctx.db`. Pattern for wiring DB into request context.

**server/routes/users.ts** — GET (list all) and POST (create) routes using `ctx.db` with Drizzle queries. Demonstrates typed CRUD.

**drizzle.config.ts** — Points to `db/schema.ts`, dialect `postgresql`, reads `DATABASE_URL`.

**.env.example** — `DATABASE_URL=postgresql://user:password@localhost:5432/mydb`

**package.json.tmpl** — Includes `drizzle-orm`, `postgres` as dependencies, `drizzle-kit` as devDependency.

#### Tasks
1. Create directory structure
2. Create each template file
3. Verify template files are valid TypeScript (no syntax errors)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_postgres_template_exists() — Given templates dir, When checking postgres/, Then directory exists
RED:     test_postgres_has_db_schema() — Given postgres template, When checking db/schema.ts, Then file exists
RED:     test_postgres_has_db_index() — Given postgres template, When checking db/index.ts, Then file exists
RED:     test_postgres_has_context() — Given postgres template, When checking server/context.ts, Then file exists
RED:     test_postgres_has_users_route() — Given postgres template, When checking server/routes/users.ts, Then file exists
RED:     test_postgres_has_drizzle_config() — Given postgres template, When checking drizzle.config.ts, Then file exists
RED:     test_postgres_has_env_example() — Given postgres template, When checking .env.example, Then file exists with DATABASE_URL
RED:     test_postgres_package_has_drizzle_deps() — Given postgres package.json.tmpl, When reading content, Then has drizzle-orm and postgres
GREEN:   Create all template files
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/template-postgres.test.ts
```

BDD scenarios:
- **Happy path**: Template has all required files with correct content
- **Validation error**: N/A (static files)
- **Edge case**: .env.example has DATABASE_URL placeholder
- **Error scenario**: Missing file → test fails

#### Acceptance Criteria
- [ ] `packages/create-theo/templates/postgres/` exists with all files
- [ ] `db/schema.ts` defines users table
- [ ] `db/index.ts` creates Drizzle connection singleton
- [ ] `server/routes/users.ts` has GET and POST with Drizzle queries
- [ ] `server/context.ts` exports ctx.db
- [ ] `package.json.tmpl` includes drizzle-orm, postgres, drizzle-kit
- [ ] `.env.example` has DATABASE_URL
- [ ] `drizzle.config.ts` configured for PostgreSQL

#### DoD
- [ ] All template files created
- [ ] Tests GREEN

---

## Phase 1: Error Message + Scaffold Tests

**Objective:** Update invalid template error message and test scaffold.

### T1.1 — Update template list in error message

#### Objective
Add `postgres` to the error message that lists available templates.

#### Evidence
`create-theo/src/index.ts:20` — hardcoded string `"default, dashboard, api-only"`. Needs `postgres`.

#### Files to edit
```
packages/create-theo/src/index.ts (EDIT) — Add postgres to error message
```

#### Deep file dependency analysis
- `index.ts`: `scaffold()` function. Line 20: error message template. Only change: string "default, dashboard, api-only" → "default, dashboard, api-only, postgres".
- Downstream: Dogfood skill checks this error message. Tests verify it.

#### Deep Dives
One string change. `getTemplateDir()` already resolves any directory name in `templates/` — no logic change needed.

#### Tasks
1. Update error message string to include "postgres"

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_invalid_template_lists_postgres() — Given invalid template name, When scaffold throws, Then error message contains "postgres"
RED:     test_scaffold_postgres_creates_files() — Given template=postgres, When scaffold runs, Then target dir has db/schema.ts
RED:     test_scaffold_postgres_has_package_json() — Given template=postgres, When scaffold runs, Then target has package.json (processed from tmpl)
RED:     test_scaffold_postgres_renames_gitignore() — Given template=postgres, When scaffold runs, Then target has .gitignore (renamed from _gitignore)
GREEN:   Update error message, scaffold already works for any template
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/create-theo-scaffold.test.ts
```

BDD scenarios:
- **Happy path**: Scaffold creates postgres project with all files
- **Validation error**: Invalid template lists all 4 options
- **Edge case**: package.json.tmpl processed correctly ({{name}} replaced)
- **Error scenario**: Missing template dir → clear error

#### Acceptance Criteria
- [ ] Error message includes "postgres"
- [ ] `scaffold(dir, name, 'postgres')` creates correct structure
- [ ] `package.json` has project name
- [ ] `.gitignore` created from `_gitignore`

#### DoD
- [ ] Error message updated
- [ ] Scaffold tests pass

---

## Phase 2: Regression

**Objective:** Garantir zero regressão.

### T2.1 — Regressão completa

#### Objective
Verificar todos os testes passam com novo template.

#### Evidence
Nova template pode afetar scaffold tests existentes e dogfood template validation.

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

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_typecheck() — Given all changes, When pnpm typecheck, Then exit code 0
RED:     test_all_tests() — Given all changes, When pnpm test, Then all pass (421+)
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
- **Error scenario**: Existing scaffold tests break → fix

#### Acceptance Criteria
- [ ] `pnpm typecheck` zero errors
- [ ] `pnpm test` — 421+ tests green
- [ ] `pnpm test:types` — 34+ type tests green
- [ ] `pnpm build` exit code 0
- [ ] Zero `any`

#### DoD
- [ ] Zero regressão

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Database template for create-theo | T0.1 | Template `postgres` with Drizzle ORM |
| 2 | Schema definition pattern | T0.1 | `db/schema.ts` with pgTable users |
| 3 | Connection singleton | T0.1 | `db/index.ts` with postgres driver |
| 4 | ctx.db in handlers | T0.1 | `server/context.ts` wires db |
| 5 | CRUD routes with Drizzle | T0.1 | `server/routes/users.ts` GET + POST |
| 6 | drizzle.config.ts | T0.1 | Migration config included |
| 7 | DATABASE_URL not leaking | Already done | Onda 12 envPrefix THEO_PUBLIC_* |
| 8 | .env.example | T0.1 | DATABASE_URL placeholder |
| 9 | Template in error message | T1.1 | "postgres" added to list |
| 10 | Scaffold works | T1.1 | Scaffold test for postgres template |
| 11 | Backward compatibility | T2.1 | Full regression |

**Coverage: 11/11 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-2)
- [ ] All tests passing (`pnpm test` — 421+)
- [ ] All type tests passing (`pnpm test:types` — 34+)
- [ ] Zero TypeScript errors (`pnpm typecheck`)
- [ ] Zero `any` in production code
- [ ] `pnpm build` exit code 0
- [ ] Template `postgres` exists with all files
- [ ] `create-theo --template=postgres` scaffolds correctly
- [ ] Invalid template error lists "postgres"
- [ ] Zero core changes (no deps added to theo package)
- [ ] Zero breaking changes
- [ ] **Dogfood QA PASS** — `/dogfood full` health score >= 70

## Final Phase: Dogfood QA (MANDATORY)

> This phase runs AFTER all implementation phases are complete.

**Objective:** Validate including the new postgres template in full dogfood.

### Execution

Run `/dogfood full`. Always full. No shortcuts.

### Acceptance Criteria

- [ ] Health score >= 70/100
- [ ] Zero CRITICAL issues
- [ ] Template `postgres` scaffold tested in dogfood
- [ ] Invalid template error message includes "postgres"

### If Dogfood Fails

1. Fix plan-caused issues
2. Re-run `/dogfood full`
