# Plan: Onda 19 — Generators + Route Listing (Cross-Validation Gaps)

> **Version 1.0** — Implementa os 2 gaps de maior valor identificados na cross-validation contra referências (Next.js + Rails): (1) `theo generate route/action/page/ws` que cria arquivos scaffolded seguindo as convenções do framework, e (2) `theo routes` que lista todas as API routes, actions, e WebSocket endpoints do projeto. Fecha o gap principal com Rails generators e melhora DX significativamente. Zero breaking change.

## Context

A cross-validation em `docs/reviews/cross-validation-referencias-2026-05-10.md` identificou 7 gaps. Os 2 mais acionáveis:

1. **`theo generate` CLI** (prioridade ALTA, esforço médio) — Rails tem 40+ generators. Theo tem zero. O README documenta `theo generate page/route/action` mas não está implementado.
2. **`theo routes`** (prioridade MÉDIA, esforço pequeno) — Rails tem `rails routes`. Theo não tem como listar rotas existentes.

Outros gaps (RSC, ISR, Web Standards) são grandes demais ou decisões filosóficas já tomadas.

Evidence: `cli/index.ts` não tem commands `generate` nem `routes`. README.md linhas 43-48 documentam `theo generate` como feature aspiracional.

## Objective

**Done =** `theo generate route users` cria `server/routes/users.ts` com template. `theo generate page dashboard` cria `app/dashboard/page.tsx`. `theo routes` lista todas as rotas com método, path, e arquivo. Testes provam geração e listagem.

Metas:
1. `theo generate route <name>` → server/routes/<name>.ts
2. `theo generate action <name>` → server/actions/<name>.ts
3. `theo generate page <name>` → app/<name>/page.tsx
4. `theo generate ws <name>` → server/ws/<name>.ts
5. `theo routes` → tabela com todas as rotas
6. Overwrite protection (skip se arquivo existe)
7. Zero breaking change

## ADRs

### D1 — Generators criam arquivos mínimos com template correto
**Decision:** Cada generator cria um arquivo com o boilerplate mínimo: imports corretos, export correto, handler vazio. Não gera CRUD completo (diferente de Rails scaffold).
**Rationale:** KISS. O Theo é TypeScript-first — o boilerplate é mínimo (defineRoute + handler). Rails scaffold gera 7 endpoints porque Ruby precisa de mais ceremônia. Um `defineRoute({ handler: () => ({}) })` é suficiente para começar.
**Consequences:** Generator é simples (~20 linhas por tipo). User edita o template gerado.

### D2 — theo routes usa scanners existentes
**Decision:** `theo routes` usa `scanServerRoutes()`, `scanServerActions()`, e `scanWebSocketRoutes()` já existentes para listar rotas.
**Rationale:** Zero código novo para scanning. Os scanners já fazem o trabalho. `theo routes` é apenas formatação de output.
**Consequences:** Se o scanner muda, `theo routes` muda automaticamente.

### D3 — Generators validam nome e detectam conflitos
**Decision:** Generator valida que o nome é kebab-case e que o arquivo não existe. Se existe, mostra warning e skip (sem --force por enquanto).
**Rationale:** Previne overwrite acidental. Convenção de naming é kebab-case consistente com file-based routing.
**Consequences:** User precisa de nome válido. Sem --force simplifica a implementação.

## Dependency Graph

```
Phase 0 (generators) ──┐
                        ├──▶ Phase 2 (regression)
Phase 1 (theo routes) ──┘
```

- **Phase 0** e **Phase 1** são paralelos (independentes)
- **Phase 2** regressão completa

---

## Phase 0: Generators

**Objective:** `theo generate route/action/page/ws <name>` cria arquivos scaffolded.

### T0.1 — Generator engine + CLI command

#### Objective
Implementar o sistema de generators e o comando CLI `theo generate <type> <name>`.

#### Evidence
README documenta `theo generate` mas não existe implementação. Rails cross-validation gap #1.

#### Files to edit
```
packages/theo/src/cli/commands/generate.ts (NEW) — Generator implementation
packages/theo/src/cli/index.ts (EDIT) — Add generate command
tests/unit/generate.test.ts (NEW) — Tests
```

#### Deep file dependency analysis
- `generate.ts`: Novo módulo. Aceita tipo (route/action/page/ws) e nome. Gera arquivo com template. Valida nome (kebab-case). Verifica se arquivo já existe.
- `cli/index.ts`: Adiciona `cli.command('generate <type> <name>')`.
- Downstream: Nenhum módulo existente é afetado.

#### Deep Dives

**Templates gerados:**

Route (`server/routes/{name}.ts`):
```typescript
import { defineRoute } from 'theo/server'
import { z } from 'zod'

export const GET = defineRoute({
  handler: ({ ctx }) => {
    return { message: 'TODO: implement {name} GET' }
  },
})
```

Action (`server/actions/{name}.ts`):
```typescript
import { defineAction } from 'theo/server'
import { z } from 'zod'

export const {camelName} = defineAction({
  input: z.object({}),
  handler: ({ input, ctx }) => {
    return { message: 'TODO: implement {name}' }
  },
})
```

Page (`app/{name}/page.tsx`):
```typescript
export default function {PascalName}Page() {
  return <h1>{PascalName}</h1>
}
```

WebSocket (`server/ws/{name}.ts`):
```typescript
import { defineWebSocket } from 'theo/server'

export default defineWebSocket({
  onMessage(ws, data) {
    ws.send(`echo: ${data}`)
  },
})
```

**Name validation:** `/^[a-z][a-z0-9-]*$/` — kebab-case, starts with letter.

**Path conversion:** `users` → `server/routes/users.ts`. `create-user` → `server/actions/create-user.ts`. `dashboard` → `app/dashboard/page.tsx`. Nested: `admin/users` → `server/routes/admin/users.ts`.

#### Tasks
1. Create `generate.ts` with template functions per type
2. Add name validation (kebab-case)
3. Add file existence check (skip if exists)
4. Add CLI command with type and name args
5. Create tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_generate_route_creates_file() — Given 'route users', When generate, Then server/routes/users.ts exists
RED:     test_generate_action_creates_file() — Given 'action create-user', When generate, Then server/actions/create-user.ts exists
RED:     test_generate_page_creates_file() — Given 'page dashboard', When generate, Then app/dashboard/page.tsx exists
RED:     test_generate_ws_creates_file() — Given 'ws chat', When generate, Then server/ws/chat.ts exists
RED:     test_route_has_defineRoute() — Given generated route, When reading content, Then contains defineRoute
RED:     test_action_has_defineAction() — Given generated action, When reading content, Then contains defineAction
RED:     test_page_has_default_export() — Given generated page, When reading content, Then contains export default function
RED:     test_ws_has_defineWebSocket() — Given generated ws, When reading content, Then contains defineWebSocket
RED:     test_invalid_type_rejected() — Given 'model users', When generate, Then throws error with valid types list
RED:     test_invalid_name_rejected() — Given 'route UPPER', When generate, Then throws error about kebab-case
RED:     test_skip_if_exists() — Given existing file, When generate same, Then warns and skips
RED:     test_nested_path_creates_dirs() — Given 'route admin/users', When generate, Then server/routes/admin/users.ts with dirs created
GREEN:   Implement generate command
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/generate.test.ts
```

BDD scenarios:
- **Happy path**: Generate creates file with correct template
- **Validation error**: Invalid type → error; invalid name → error
- **Edge case**: Nested paths (admin/users); file already exists → skip
- **Error scenario**: Unknown type → clear error with available types

#### Acceptance Criteria
- [ ] `theo generate route users` creates `server/routes/users.ts`
- [ ] `theo generate action create-user` creates `server/actions/create-user.ts`
- [ ] `theo generate page dashboard` creates `app/dashboard/page.tsx`
- [ ] `theo generate ws chat` creates `server/ws/chat.ts`
- [ ] Generated files have correct imports and exports
- [ ] Invalid type → clear error
- [ ] Invalid name → clear error
- [ ] Existing file → skip with warning
- [ ] Nested paths supported

#### DoD
- [ ] All 4 generators work
- [ ] 12 tests GREEN

---

## Phase 1: Route Listing

**Objective:** `theo routes` lists all API routes, actions, and WebSocket endpoints.

### T1.1 — theo routes command

#### Objective
List all registered routes with method, path, and source file.

#### Evidence
Rails has `rails routes`. Cross-validation gap #2. Scanners already exist.

#### Files to edit
```
packages/theo/src/cli/commands/routes.ts (NEW) — Routes listing
packages/theo/src/cli/index.ts (EDIT) — Add routes command
tests/unit/routes-list.test.ts (NEW) — Tests
```

#### Deep file dependency analysis
- `routes.ts`: Uses `scanServerRoutes()`, `scanServerActions()`, `scanWebSocketRoutes()` to collect all endpoints. Formats as table.
- `cli/index.ts`: Adds `cli.command('routes')`.
- Uses `loadConfig()` to find serverDir. Uses `validateProjectStructure()`.

#### Deep Dives

**Output format:**
```
  API Routes
  ──────────────────────────────────────────────────
  GET/POST  /api/health          server/routes/health.ts
  GET/POST  /api/users           server/routes/users.ts
  GET       /api/users/:id       server/routes/users/[id].ts

  Actions
  ──────────────────────────────────────────────────
  POST      /api/__actions/create-user/createUser  server/actions/create-user.ts

  WebSocket
  ──────────────────────────────────────────────────
  WS        /ws/chat             server/ws/chat.ts
  WS        /ws/notifications    server/ws/notifications.ts
```

**Data sources:**
- `scanServerRoutes(serverDir)` → `ServerRouteNode[]` with `routePath`, `filePath`
- `scanServerActions(serverDir)` → `ServerActionNode[]` with `actionPath`, `filePath`, `exports`
- `scanWebSocketRoutes(serverDir)` → `WebSocketRouteNode[]` with `wsPath`, `filePath`

#### Tasks
1. Create `routes.ts` that scans all endpoints
2. Format output as aligned table
3. Add CLI command
4. Create tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_routes_lists_api_routes() — Given fixture with routes, When theo routes, Then output contains /api/health
RED:     test_routes_lists_actions() — Given fixture with actions, When theo routes, Then output contains __actions
RED:     test_routes_lists_websocket() — Given fixture with ws, When theo routes, Then output contains /ws/
RED:     test_routes_shows_file_path() — Given routes output, When reading, Then contains relative file path
RED:     test_routes_empty_project() — Given project with no routes, When theo routes, Then shows 'No routes found'
RED:     test_routes_shows_sections() — Given mixed routes, When theo routes, Then has API Routes, Actions, WebSocket sections
GREEN:   Implement routes command
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/routes-list.test.ts
```

BDD scenarios:
- **Happy path**: Lists all route types with path and file
- **Validation error**: N/A
- **Edge case**: No routes → "No routes found"
- **Error scenario**: Invalid project structure → validateProjectStructure error

#### Acceptance Criteria
- [ ] `theo routes` lists API routes with path and file
- [ ] Lists actions with path and file
- [ ] Lists WebSocket endpoints
- [ ] Empty project → "No routes found"
- [ ] Output is formatted and readable

#### DoD
- [ ] Routes listing works
- [ ] 6 tests GREEN

---

## Phase 2: Regression

**Objective:** Zero regressão.

### T2.1 — Full regression

#### Objective
All existing tests pass.

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
RED:     test_all_tests() — Given all changes, When pnpm test, Then all pass (476+)
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
- **Error scenario**: CLI changes break existing → fix

#### Acceptance Criteria
- [ ] `pnpm typecheck` zero errors
- [ ] `pnpm test` — 476+ green
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
| 1 | theo generate route | T0.1 | Creates server/routes/{name}.ts with defineRoute |
| 2 | theo generate action | T0.1 | Creates server/actions/{name}.ts with defineAction |
| 3 | theo generate page | T0.1 | Creates app/{name}/page.tsx with component |
| 4 | theo generate ws | T0.1 | Creates server/ws/{name}.ts with defineWebSocket |
| 5 | Name validation (kebab-case) | T0.1 | Regex validation + clear error |
| 6 | Overwrite protection | T0.1 | Skip with warning if file exists |
| 7 | Nested paths (admin/users) | T0.1 | Creates intermediate directories |
| 8 | theo routes (API) | T1.1 | Lists all API routes with path/file |
| 9 | theo routes (actions) | T1.1 | Lists all actions |
| 10 | theo routes (WebSocket) | T1.1 | Lists all WS endpoints |
| 11 | Empty project handling | T1.1 | "No routes found" message |
| 12 | Backward compatibility | T2.1 | Full regression |

**Coverage: 12/12 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-2)
- [ ] All tests passing (`pnpm test` — 476+)
- [ ] All type tests passing (`pnpm test:types` — 34+)
- [ ] Zero TypeScript errors
- [ ] Zero `any`
- [ ] `pnpm build` exit code 0
- [ ] `theo generate route/action/page/ws` all work
- [ ] `theo routes` lists all endpoints
- [ ] Invalid type/name → clear errors
- [ ] Overwrite protection works
- [ ] Zero breaking changes
- [ ] **Dogfood QA PASS** — `/dogfood full` health score >= 70

## Final Phase: Dogfood QA (MANDATORY)

**Objective:** Validate generators and route listing work end-to-end.

### Execution
Run `/dogfood full`.

### Acceptance Criteria
- [ ] Health score >= 70/100
- [ ] Zero CRITICAL issues
- [ ] Generators create correct files
- [ ] Route listing shows all endpoints
