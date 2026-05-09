# Plan: Onda 13 — Typed Client

> **Version 1.0** — Cria o `theoFetch<typeof RouteExport>()` — uma função que infere tipos de input (query, body) e output (response) diretamente dos `defineRoute` Zod schemas, sem codegen, sem deps extras, usando apenas `typeof` import e fetch nativo. O resultado é type safety end-to-end: server define → client consome → TypeScript valida tudo em compile-time. Novo subpath `theo/client` exporta `theoFetch`, `TheoFetchError`, e tipos utilitários `InferResponse`/`InferInput`.

## Context

O Theo tem 12 ondas, 358 testes, e `defineRoute` com generics Zod (`TQuery`, `TBody`, `TParams`) que carregam toda a informação de tipos. Porém, o client-side consome APIs com `fetch` genérico — sem type safety:

```typescript
// Hoje: fetch sem tipos — response é any/unknown
const res = await fetch('/api/users')
const data = await res.json() // unknown
```

O que queremos:
```typescript
// Depois: theoFetch com inferência completa
import type { GET } from '../../server/routes/users'
const data = await theoFetch<typeof GET>('/api/users', { query: { search: 'alice' } })
// data é { users: { name: string }[] } — tipado!
```

Evidence: `define-route.ts` já tem generics `TQuery`, `TBody`, `TParams`. A informação de tipos está lá — só falta uma função client que a consuma.

## Objective

**Done =** `theoFetch<typeof GET>('/api/users', { query: { search: 'a' } })` compila com tipos corretos, rejeita inputs inválidos em compile-time, e faz fetch real para API routes. Type tests provam inferência. Subpath `theo/client` exporta tudo.

Metas:
1. `theoFetch` infere response type do handler return
2. `theoFetch` infere query/body types dos Zod schemas
3. TypeScript rejeita inputs inválidos em compile-time
4. `TheoFetchError` com status, code, issues
5. Subpath `theo/client` no package.json exports
6. Type tests com `expectTypeOf`
7. Zero deps novas (fetch nativo)
8. Zero breaking changes

## ADRs

### D1 — theoFetch com `typeof` import (Approach D)
**Decision:** O client usa `theoFetch<typeof GET>('/api/users')` onde o user faz `import type { GET } from '../../server/routes/users'`.
**Rationale:** Única abordagem compatível com file-based routing sem codegen. tRPC e Hono RPC exigem router object construído em código — incompatível com Theo's filesystem convention. ts-rest exige contrato manual. `typeof` import é zero magic, explícito, e TypeScript-native.
**Consequences:** User faz `import type` manual por route. Em troca: zero codegen, zero deps, zero magic. Trade-off aceito.

### D2 — Fetch nativo, sem wrapper lib
**Decision:** `theoFetch` usa `globalThis.fetch` diretamente. Sem axios, ky, ofetch.
**Rationale:** Fetch é Web Standard, disponível em todos os runtimes (browser, Node 18+, Deno, Bun). Adicionar wrapper lib seria dependency sem valor — o Theo não precisa de interceptors ou retry logic no client. KISS.
**Consequences:** Sem retry automático, interceptors, etc. User que precisa disso pode wrapper `theoFetch` com ky/axios.

### D3 — TheoFetchError como classe de erro tipada
**Decision:** Erros de fetch são `TheoFetchError` com `status`, `code`, e `issues` (Zod validation errors).
**Rationale:** O server já retorna `{ error: { code, message, issues? } }` em erros. O client precisa tipar isso para que `try/catch` seja útil.
**Consequences:** Error handling tipado. `catch (err) { if (err instanceof TheoFetchError && err.code === 'VALIDATION_ERROR') { ... } }`.

### D4 — Response type inferido do handler return
**Decision:** `InferResponse<T>` usa `Awaited<ReturnType<T['handler']>>` para inferir o tipo do response.
**Rationale:** O handler retorna o dado diretamente (não um wrapper). `ReturnType` captura exatamente o que o client recebe. `Awaited` resolve `Promise<T>` para `T`.
**Consequences:** Se o handler retorna `unknown` ou `any`, o client recebe `unknown`. O user deve tipar return values (já é boa prática).

## Dependency Graph

```
Phase 0 (core types + theoFetch) ──▶ Phase 1 (exports + build) ──▶ Phase 2 (type tests + regression)
```

- **Phase 0** é o bloqueador (implementação core)
- **Phase 1** depende de Phase 0 (wiring de exports)
- **Phase 2** depende de Phase 1 (validação completa)

---

## Phase 0: Core — theoFetch + TheoFetchError

**Objective:** Implementar `theoFetch`, `TheoFetchError`, e tipos utilitários.

### T0.1 — theoFetch e TheoFetchError

#### Objective
Criar a função `theoFetch<T>()` que infere tipos de input e output de um `RouteConfig`, e `TheoFetchError` para erros tipados.

#### Evidence
`define-route.ts` tem generics `TQuery`, `TBody`, `TParams` que carregam tipo de cada schema Zod. `handler` retorna o tipo do response. Toda informação está disponível via TypeScript inference.

#### Files to edit
```
packages/theo/src/client/theo-fetch.ts (NEW) — theoFetch function + TheoFetchError + utility types
packages/theo/src/client/index.ts (NEW) — Barrel exports
tests/unit/theo-fetch.test.ts (NEW) — Unit tests
tests/type/theo-fetch.test-d.ts (NEW) — Type inference tests
```

#### Deep file dependency analysis
- `theo-fetch.ts`: Novo módulo. Importa apenas tipos de `../server/define-route.js` (type-only, não runtime). Usa `fetch` global. Zero deps.
- `client/index.ts`: Barrel que re-exporta `theoFetch`, `TheoFetchError`, e tipos. Downstream: consumers importam de `theo/client`.
- Type tests: Usam `expectTypeOf` para provar que inference funciona. Importam `defineRoute` de `theo/server` e `theoFetch` de `theo/client`.

#### Deep Dives

**InferResponse<T>** — Extrai return type do handler:
```typescript
type InferResponse<T> = T extends { handler: (...args: any[]) => infer R }
  ? Awaited<R>
  : unknown
```

**InferQuery<T>** / **InferBody<T>** — Extrai tipos dos Zod schemas:
```typescript
type InferQuery<T> = T extends { query: infer Q extends z.ZodType }
  ? z.infer<Q>
  : undefined

type InferBody<T> = T extends { body: infer B extends z.ZodType }
  ? z.infer<B>
  : undefined
```

**TheoFetchOptions<T>** — Options tipadas baseadas nos schemas:
- Se route tem `query` schema → `options.query` é obrigatório e tipado
- Se route tem `body` schema → `options.body` é obrigatório e tipado
- Se route não tem schemas → nenhum campo extra

**Query serialization**: Query params são convertidos para string via `String(v)` e adicionados à URL via `URLSearchParams`. Suporta apenas valores primitivos (string, number, boolean). Arrays/objetos em query NÃO são suportados (KISS).

**Body serialization**: Body é serializado via `JSON.stringify()` com `Content-Type: application/json`.

**TheoFetchError**: Quando `response.ok === false`, parse o body como JSON e cria `TheoFetchError` com `status`, `code`, `message`, `issues`.

**EC-1 MUST FIX — 204/non-JSON responses**: Se `response.status === 204` ou body vazio, retornar `null` sem chamar `.json()`. O `.json()` em body vazio joga SyntaxError.

#### Tasks
1. Criar `packages/theo/src/client/theo-fetch.ts` com tipos e função
2. Criar `packages/theo/src/client/index.ts` com exports
3. Criar unit tests
4. Criar type tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_theo_fetch_calls_fetch() — Given theoFetch, When called with URL, Then globalThis.fetch is called
RED:     test_theo_fetch_appends_query_params() — Given query { search: 'alice' }, When theoFetch called, Then URL has ?search=alice
RED:     test_theo_fetch_sends_json_body() — Given body { name: 'bob' }, When theoFetch called, Then fetch body is JSON string
RED:     test_theo_fetch_sets_content_type() — Given body, When theoFetch called, Then Content-Type is application/json
RED:     test_theo_fetch_returns_json() — Given successful response, When theoFetch resolves, Then returns parsed JSON
RED:     test_theo_fetch_throws_on_error() — Given 404 response, When theoFetch called, Then throws TheoFetchError
RED:     test_theo_fetch_error_has_status() — Given 400 response, When TheoFetchError thrown, Then error.status === 400
RED:     test_theo_fetch_error_has_code() — Given validation error response, When TheoFetchError thrown, Then error.code === 'VALIDATION_ERROR'
RED:     test_theo_fetch_error_has_issues() — Given validation error with issues, When TheoFetchError thrown, Then error.issues is array
RED:     test_theo_fetch_passes_custom_headers() — Given custom headers in options, When theoFetch called, Then headers are merged
RED:     test_theo_fetch_no_body_for_get() — Given no body option, When theoFetch called, Then fetch has no body
RED:     test_theo_fetch_handles_204_no_content() — Given 204 response, When theoFetch resolves, Then returns null (no JSON parse) (EC-1 MUST FIX)
RED:     test_theo_fetch_skips_undefined_query_values() — Given query { search: undefined }, When theoFetch called, Then URL does NOT have search=undefined
RED:     type_infer_response_from_handler() — Given defineRoute with handler returning { users: User[] }, When theoFetch<typeof GET>, Then result is { users: User[] }
RED:     type_infer_query_from_schema() — Given defineRoute with query z.object({ search: z.string() }), When theoFetch<typeof GET>, Then options.query is { search: string }
RED:     type_infer_body_from_schema() — Given defineRoute with body z.object({ name: z.string() }), When theoFetch<typeof POST>, Then options.body is { name: string }
RED:     type_no_query_when_no_schema() — Given defineRoute without query, When theoFetch<typeof GET>, Then options.query is not required
RED:     type_no_body_when_no_schema() — Given defineRoute without body, When theoFetch<typeof GET>, Then options.body is not required
RED:     type_error_on_wrong_query_type() — Given query: z.object({ search: z.string() }), When passing query: { search: 123 }, Then TypeScript error
GREEN:   Implement theoFetch, TheoFetchError, and utility types
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/theo-fetch.test.ts && pnpm test:types
```

BDD scenarios:
- **Happy path**: theoFetch returns parsed JSON with correct types
- **Validation error**: 400 response → TheoFetchError with code + issues
- **Edge case**: No query/body schemas → options are minimal; empty query object
- **Error scenario**: 404/500 → TheoFetchError with status code

#### Acceptance Criteria
- [ ] `theoFetch<typeof GET>('/api/users')` returns typed response
- [ ] `options.query` is typed from Zod query schema
- [ ] `options.body` is typed from Zod body schema
- [ ] TypeScript rejects wrong query/body types
- [ ] `TheoFetchError` has `status`, `code`, `message`, `issues`
- [ ] Fetch uses `globalThis.fetch` (no deps)
- [ ] Unit tests pass (11+)
- [ ] Type tests pass (6+)

#### DoD
- [ ] theoFetch functional
- [ ] TheoFetchError functional
- [ ] All type inferences proven
- [ ] Tests GREEN

---

## Phase 1: Exports + Build

**Objective:** Wire `theo/client` subpath, update build config, update vitest aliases.

### T1.1 — Package exports e build

#### Objective
Adicionar `theo/client` subpath ao package.json exports, entry point ao tsup, e alias ao vitest.

#### Evidence
Novo subpath precisa estar no exports map, no build config, e nos aliases de teste.

#### Files to edit
```
packages/theo/package.json (EDIT) — Adicionar ./client export
packages/theo/tsup.config.ts (EDIT) — Adicionar client/index entry
vitest.config.ts (EDIT) — Adicionar alias theo/client
tsconfig.json (EDIT) — Adicionar path theo/client
```

#### Deep file dependency analysis
- `package.json`: Exports map define como consumidores importam. Precisa de `"./client"` entry.
- `tsup.config.ts`: Precisa de `'client/index': 'src/client/index.ts'` no primeiro build config.
- `vitest.config.ts`: Aliases precisam de `'theo/client'` para que testes importem corretamente.
- `tsconfig.json`: Paths precisam de `"theo/client"` para type checking.

#### Deep Dives
- O client module é **browser-compatible** — não usa `node:*` modules. Target pode ser `esnext` (browser).
- Mas para simplificar, fica no mesmo build config com target `node20` (fetch é global em Node 18+).

#### Tasks
1. Adicionar `"./client"` ao exports map em package.json
2. Adicionar `'client/index': 'src/client/index.ts'` ao tsup entry
3. Adicionar alias `'theo/client'` ao vitest.config.ts
4. Adicionar path `"theo/client"` ao tsconfig.json
5. Rodar `pnpm build` e verificar que `dist/client/index.js` e `dist/client/index.d.ts` existem

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_client_export_exists() — Given package.json, When reading exports["./client"], Then has types and import
RED:     test_client_dist_built() — Given pnpm build, When checking dist/client/index.js, Then file exists
RED:     test_client_dts_built() — Given pnpm build, When checking dist/client/index.d.ts, Then file exists
RED:     test_import_from_theo_client() — Given theo/client path, When importing theoFetch, Then is a function
GREEN:   Update package.json, tsup.config, vitest.config, tsconfig
REFACTOR: None expected
VERIFY:  pnpm build && npx vitest run tests/smoke/import-validation.test.ts
```

BDD scenarios:
- **Happy path**: `import { theoFetch } from 'theo/client'` resolves
- **Validation error**: N/A
- **Edge case**: dist/client/index.d.ts exists for TypeScript consumers
- **Error scenario**: Missing export → import fails

#### Acceptance Criteria
- [ ] `exports["./client"]` in package.json
- [ ] `dist/client/index.js` exists after build
- [ ] `dist/client/index.d.ts` exists after build
- [ ] `import { theoFetch } from 'theo/client'` works in tests
- [ ] publint passes

#### DoD
- [ ] Exports wired
- [ ] Build produces client outputs
- [ ] Aliases configured

---

### T1.2 — Smoke tests para client import

#### Objective
Adicionar smoke tests que validam imports de `theo/client` de dist/.

#### Evidence
Onda 10 smoke tests validam imports de `theo`, `theo/server`, `theo/vite-plugin`. Precisa cobrir `theo/client`.

#### Files to edit
```
tests/smoke/import-validation.test.ts (EDIT) — Adicionar testes para theo/client
```

#### Deep file dependency analysis
- Arquivo existente com 29 testes. Adicionar ~4 testes para client imports.

#### Deep Dives
Nenhum — pattern já existe nos smoke tests.

#### Tasks
1. Adicionar testes de import para `theoFetch` e `TheoFetchError` de dist/

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_import_theoFetch_from_dist() — Given built dist, When importing from dist/client/index.js, Then theoFetch is a function
RED:     test_import_TheoFetchError_from_dist() — Given built dist, When importing from dist/client/index.js, Then TheoFetchError is a function
RED:     test_client_export_in_package_json() — Given package.json, When reading exports["./client"], Then points to dist/client/
RED:     test_publint_still_passes() — Given updated exports, When running publint, Then passes
GREEN:   Smoke tests pass after Phase 0 + T1.1
REFACTOR: None expected
VERIFY:  npx vitest run tests/smoke/import-validation.test.ts
```

BDD scenarios:
- **Happy path**: Client exports resolve from dist/
- **Validation error**: N/A
- **Edge case**: publint validates new export
- **Error scenario**: Missing dist/ → import fails

#### Acceptance Criteria
- [ ] `theoFetch` importable from dist/client/
- [ ] `TheoFetchError` importable from dist/client/
- [ ] publint passes with new export

#### DoD
- [ ] Smoke tests GREEN
- [ ] publint clean

---

## Phase 2: Regression + Dogfood

**Objective:** Garantir zero regressão e dogfood pass.

### T2.1 — Regressão completa

#### Objective
Verificar que todas as 358+ testes passam após adicionar typed client.

#### Evidence
Nova feature adiciona código e exports — pode causar regressão.

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
5. `npx vitest run tests/smoke/`
6. Zero `any` audit

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_typecheck() — Given all changes, When pnpm typecheck, Then exit code 0
RED:     test_all_tests() — Given all changes, When pnpm test, Then all pass (358+)
RED:     test_types() — Given all changes, When pnpm test:types, Then all pass (25+)
RED:     test_build() — Given all changes, When pnpm build, Then exit code 0
GREEN:   Already implemented — verifies
REFACTOR: Fix regressions if found
VERIFY:  pnpm typecheck && pnpm test && pnpm test:types && pnpm build
```

BDD scenarios:
- **Happy path**: All pass
- **Validation error**: Regression → fix
- **Edge case**: New tests increase count
- **Error scenario**: Type inference change breaks existing tests → fix

#### Acceptance Criteria
- [ ] `pnpm typecheck` zero errors
- [ ] `pnpm test` — 358+ tests green
- [ ] `pnpm test:types` — 25+ type tests green
- [ ] `pnpm build` exit code 0
- [ ] Zero `any`

#### DoD
- [ ] Zero regressão

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Client infere response type | T0.1 | `InferResponse<T>` via `Awaited<ReturnType<handler>>` |
| 2 | Client infere query params | T0.1 | `InferQuery<T>` via `z.infer<TQuery>` |
| 3 | Client infere body type | T0.1 | `InferBody<T>` via `z.infer<TBody>` |
| 4 | Client rejeita body inválido | T0.1 | Type test com `@ts-expect-error` |
| 5 | Client faz fetch real | T0.1 | `globalThis.fetch` com URL + options |
| 6 | Client trata erros tipados | T0.1 | `TheoFetchError` com status/code/issues |
| 7 | Subpath `theo/client` | T1.1 | Package.json exports + tsup entry |
| 8 | Import de dist/ funciona | T1.2 | Smoke tests |
| 9 | publint passa | T1.2 | Validates new export |
| 10 | Zero breaking change | T2.1 | Regressão completa |

**Coverage: 10/10 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-2)
- [ ] All tests passing (`pnpm test` — 358+)
- [ ] All type tests passing (`pnpm test:types` — 25+)
- [ ] Zero TypeScript errors (`pnpm typecheck`)
- [ ] Zero `any` in production code
- [ ] `pnpm build` exit code 0
- [ ] `theoFetch` infere response, query, body types
- [ ] `TheoFetchError` com status, code, issues
- [ ] `theo/client` subpath exporta tudo
- [ ] publint passes
- [ ] Smoke tests incluem client imports
- [ ] Type tests provam inferência
- [ ] Zero breaking changes
- [ ] **Dogfood QA PASS** — `/dogfood full` health score >= 70, zero CRITICAL issues

## Final Phase: Dogfood QA (MANDATORY)

> This phase runs AFTER all implementation phases are complete. The plan is NOT done until dogfood passes.

**Objective:** Validate that the implemented changes work as a real user would experience them, not just as unit tests assert.

### Execution

Run `/dogfood full`. Always full. No shortcuts.

### Acceptance Criteria

- [ ] Health score >= 70/100
- [ ] Zero CRITICAL issues introduced by this plan's changes
- [ ] Zero HIGH issues in commands/features modified by this plan
- [ ] Any pre-existing issues documented (not caused by this plan)

### If Dogfood Fails

1. Identify which issues are caused by this plan's changes vs pre-existing
2. Fix all plan-caused CRITICAL and HIGH issues before declaring the plan complete
3. Re-run `/dogfood full` to confirm fixes
4. Pre-existing issues are logged but do NOT block plan completion
