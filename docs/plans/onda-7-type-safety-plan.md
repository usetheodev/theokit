# Plan: Onda 7 — Type Safety End-to-End

> **Version 1.0** — Este plano garante que a tipagem do Theo é diferencial real, não marketing. Adiciona `ctx` à interface dos handlers, cria type tests para os 5 testes obrigatórios, e audita zero `any` em APIs públicas. Impacto mínimo: 2 linhas de type fix + ~15 type tests novos. Zero código de runtime novo.

## Context

Onda 0-5 completas. `defineRoute` e `defineAction` já têm generics Zod que inferem query/body/params/input. 11 type tests existem mas não cobrem os 5 testes obrigatórios da Onda 7. O handler recebe `ctx` em runtime (Onda 5) mas a interface TypeScript não declara `ctx`. Zero `any` em production code confirmado.

## Objective

**Done =** 5 testes obrigatórios de tipo GREEN, `ctx` na interface dos handlers, zero `any` em APIs públicas, CI roda type tests.

## ADRs

### D1 — `ctx: unknown` na interface (não typed)
**Decision:** `ctx` é `unknown` na interface. User faz type assertion.
**Rationale:** Typed context requer generics complexos que adicionam overhead sem valor imediato. `unknown` é type-safe — user DEVE fazer assertion ou guard.
**Consequences:** Menos autocomplete em `ctx`, mas zero chance de type error em runtime.

### D2 — Zero código de runtime — apenas types e tests
**Decision:** Esta onda não muda comportamento. Apenas interfaces e type tests.
**Rationale:** Type safety é validação em compile-time. Runtime já funciona (Onda 5).
**Consequences:** Zero risco de regressão.

## Dependency Graph

```
Phase 0 (Type fixes: ctx in interfaces) ──▶ Phase 1 (Type tests) ──▶ Phase 2 (Any audit)
```

Tudo sequencial. Phase 0 desbloqueia Phase 1 (tests usam `ctx`).

---

## Phase 0: Type Fixes

**Objective:** Adicionar `ctx: unknown` às interfaces RouteConfig e ActionConfig.

### T0.1 — Add ctx to handler interfaces

#### Objective
Fazer o TypeScript saber que handlers recebem `ctx`.

#### Evidence
Onda 5 passa `ctx` em runtime mas a interface não declara — handlers que destructuram `ctx` não têm tipo.

#### Files to edit
```
packages/theo/src/server/define-route.ts (EDIT) — Add ctx to handler param type
packages/theo/src/server/define-action.ts (EDIT) — Add ctx to handler param type
```

#### Deep file dependency analysis
- `define-route.ts` line 12: handler type `(ctx: { query, body, params, request })` — add `ctx: unknown`
- `define-action.ts` line 5: handler type `(ctx: { input })` — add `ctx: unknown`
- Downstream: all existing type tests still compile (adding optional-like `unknown` field is non-breaking)

#### Deep Dives
Adding `ctx: unknown` is non-breaking because:
- Existing handlers that don't use `ctx` continue working — JS/TS ignores extra properties in destructuring
- `unknown` is the safest type — no operations allowed without narrowing
- Runtime already passes `ctx` (Onda 5) — this just aligns types with reality

#### Tasks
1. Add `ctx: unknown` to `RouteConfig.handler` param type
2. Add `ctx: unknown` to `ActionConfig.handler` param type
3. Verify `pnpm typecheck` passes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     type_route_handler_has_ctx() — Given defineRoute handler, When destructuring ctx, Then ctx is unknown
RED:     type_action_handler_has_ctx() — Given defineAction handler, When destructuring ctx, Then ctx is unknown
RED:     type_existing_handlers_still_compile() — Given handler without ctx, When compiled, Then no error
RED:     type_ctx_requires_narrowing() — Given ctx: unknown, When assigning to typed var, Then @ts-expect-error
GREEN:   Add ctx: unknown to interfaces
REFACTOR: None expected
VERIFY:  pnpm typecheck && pnpm test:types
```

BDD scenarios:
- **Happy path**: Handler can destructure `ctx` with type `unknown`
- **Validation error**: Assigning `ctx` to typed variable without narrowing → compile error
- **Edge case**: Handler without `ctx` destructuring still compiles
- **Error scenario**: N/A (type-only change)

#### Acceptance Criteria
- [ ] `ctx` available in handler type for defineRoute
- [ ] `ctx` available in handler type for defineAction
- [ ] Existing handlers compile without changes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` all green (no runtime change)

#### DoD
- [ ] Types updated
- [ ] `pnpm typecheck` passes
- [ ] Zero regression

---

## Phase 1: Type Tests (5 Mandatory)

**Objective:** 5 type tests obrigatórios da Onda 7.

### T1.1 — Mandatory type tests

#### Objective
Criar type tests que provam type safety end-to-end.

#### Evidence
ONDAS.md define 5 testes obrigatórios. Apenas 2 são parcialmente cobertos.

#### Files to edit
```
tests/type/onda7-type-safety.test-d.ts (NEW) — 5 mandatory type tests
tests/type/define-route.test-d.ts (EDIT) — Add ctx type test
tests/type/define-action.test-d.ts (EDIT) — Add ctx type test
```

#### Deep file dependency analysis
- `onda7-type-safety.test-d.ts`: Imports defineRoute, defineAction from `theo/server`, z from `zod`. Uses `expectTypeOf` from `vitest`.
- Existing test files: Add ctx-related tests.

#### Deep Dives

**Teste 1 — Input inválido falha em compile-time:**
```typescript
defineRoute({
  body: z.object({ name: z.string() }),
  handler: ({ body }) => {
    // @ts-expect-error — name is string, not number
    const x: number = body.name
  },
})

defineAction({
  input: z.object({ email: z.string() }),
  handler: ({ input }) => {
    // @ts-expect-error — email is string, not number
    const x: number = input.email
  },
})
```

**Teste 2 — Output inferido (limited):**
Handler return type is `unknown` — can't infer output without typed client. Test that handler CAN return typed objects:
```typescript
const route = defineRoute({
  handler: () => ({ id: '1', name: 'test' }),
})
// handler return type is unknown | Promise<unknown> — by design
```

**Teste 3 — Params inferidos:**
Already tested. Add one more for confirmation.

**Teste 4 — Query inferida via Zod:**
Already tested. Add `@ts-expect-error` for wrong type.

**Teste 5 — Nenhum `any` público:**
Script-based test that greps for `any` in production code.

#### Tasks
1. Create `tests/type/onda7-type-safety.test-d.ts`
2. Add ctx tests to existing type test files
3. Verify `pnpm test:types`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     type_wrong_body_type_fails() — Given body schema { name: string }, When assigning name to number, Then @ts-expect-error
RED:     type_wrong_action_input_fails() — Given input { email: string }, When assigning email to number, Then @ts-expect-error
RED:     type_wrong_query_type_fails() — Given query { page: number }, When assigning page to string, Then @ts-expect-error
RED:     type_params_inferred_from_zod() — Given params { id: string }, When accessing params.id, Then it's string
RED:     type_handler_return_is_unknown() — Given handler, When checking return type, Then it's unknown | Promise<unknown>
RED:     type_ctx_is_unknown_in_route() — Given defineRoute handler, When destructuring ctx, Then ctx is unknown
RED:     type_ctx_is_unknown_in_action() — Given defineAction handler, When destructuring ctx, Then ctx is unknown
RED:     type_ctx_needs_narrowing() — Given ctx: unknown, When using as string, Then @ts-expect-error
GREEN:   Type tests pass if interfaces are correct
REFACTOR: None expected
VERIFY:  pnpm test:types
```

BDD scenarios:
- **Happy path**: Zod schema → handler param type inferred correctly
- **Validation error**: Wrong type assignment → compile error via @ts-expect-error
- **Edge case**: ctx is `unknown` requiring explicit narrowing
- **Error scenario**: Handler return type is intentionally `unknown`

#### Acceptance Criteria
- [ ] 8+ type tests GREEN in new file
- [ ] `@ts-expect-error` proves wrong types fail
- [ ] `ctx` type is `unknown`
- [ ] `pnpm test:types` passes

#### DoD
- [ ] Type tests GREEN
- [ ] `pnpm typecheck` passes

---

## Phase 2: Any Audit

**Objective:** Automated check that zero `any` exists in public API.

### T2.1 — Any audit test

#### Objective
Unit test that greps production code for `any` and fails if found.

#### Evidence
Teste obrigatório 5: "APIs públicas não podem expor `any`."

#### Files to edit
```
tests/unit/any-audit.test.ts (NEW) — Grep-based audit
```

#### Deep file dependency analysis
- Simple test that reads source files and checks for `any` patterns.

#### Deep Dives
The test reads all `.ts` files in `packages/theo/src/` and checks:
- No `: any` in type positions
- No `as any` type assertions
- No `@ts-ignore` or `@ts-expect-error` in production code
- Exclusions: test files, fixture files

#### Tasks
1. Create audit test
2. Verify GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_no_any_in_production() — Given packages/theo/src/, When grepping for 'any', Then zero matches
RED:     test_no_ts_ignore() — Given packages/theo/src/, When grepping for '@ts-ignore', Then zero matches
RED:     test_no_ts_expect_error() — Given packages/theo/src/, When grepping for '@ts-expect-error', Then zero matches
RED:     test_no_as_any() — Given packages/theo/src/, When grepping for 'as any', Then zero matches
GREEN:   All checks pass (should already pass since zero any exists)
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/any-audit.test.ts
```

BDD scenarios:
- **Happy path**: Zero `any` found
- **Validation error**: If `any` introduced, test fails
- **Edge case**: `any` in comments (should not match type patterns)
- **Error scenario**: `@ts-ignore` in production code → fail

#### Acceptance Criteria
- [ ] Zero `any` in `packages/theo/src/`
- [ ] Zero `@ts-ignore` in production code
- [ ] Test catches future violations

#### DoD
- [ ] Audit test GREEN
- [ ] CI will catch future `any` introductions

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Teste 1: Input inválido → compile error | T1.1 | @ts-expect-error type test |
| 2 | Teste 2: Output inferido | T1.1 | handler return type test |
| 3 | Teste 3: Params inferidos | T1.1 | Already exists + confirmation test |
| 4 | Teste 4: Query inferida via Zod | T1.1 | Already exists + @ts-expect-error test |
| 5 | Teste 5: Nenhum any público | T2.1 | Automated grep audit |
| 6 | ctx in handler types | T0.1 | Add ctx: unknown to interfaces |
| 7 | ctx type safety | T1.1 | ctx is unknown, needs narrowing |

**Coverage: 7/7 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-2)
- [ ] All unit tests passing (`pnpm test`)
- [ ] All type tests passing (`pnpm test:types`)
- [ ] Zero TypeScript errors (`pnpm typecheck`)
- [ ] Zero `any` in production code (automated audit)
- [ ] 5 testes obrigatórios Onda 7 GREEN
- [ ] ctx available in handler types
- [ ] Onda 0-5 tests still green

## Final Phase: Dogfood QA (MANDATORY)

### Execution

Onda 7 é type-only. Dogfood = `pnpm test && pnpm test:types && pnpm typecheck`.

### Acceptance Criteria

- [ ] `pnpm test` all green
- [ ] `pnpm test:types` all green
- [ ] `pnpm typecheck` zero errors
- [ ] Any audit passes
