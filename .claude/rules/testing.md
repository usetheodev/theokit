---
paths:
  - "packages/**/*.ts"
  - "packages/**/*.tsx"
  - "tests/**/*.ts"
  - "app/**/*.ts"
  - "app/**/*.tsx"
  - "server/**/*.ts"
---

# Testing Rules

## Core Rule — TDD + BDD são OBRIGATÓRIOS

- **TDD (Test-Driven Development)** e **BDD (Behavior-Driven Development)** não são opcionais. São o método de trabalho padrão.
- Every non-trivial logic change needs a test or explicit reason why not.
- Bug fixes add regression test before/alongside the fix.
- Framework features need fixture projects.

## TDD — Red-Green-Refactor

O ciclo é inviolável:

1. **RED** — Escreva o teste PRIMEIRO. Ele DEVE falhar.
2. **GREEN** — Escreva o código MÍNIMO para o teste passar.
3. **REFACTOR** — Limpe o código mantendo os testes verdes.

```
Nunca escreva código de produção sem um teste falhando que justifique sua existência.
```

- Commit do teste falhando ANTES do commit da implementação (quando prático).
- Se o teste não falhou primeiro, o ciclo foi quebrado.
- Code review deve verificar: "o teste existia antes da implementação?"

## BDD — Comportamento como Especificação

Testes descrevem COMPORTAMENTO do ponto de vista do usuário/consumidor, não implementação interna.

### Formato obrigatório: Given-When-Then (ou Arrange-Act-Assert)

```typescript
describe('defineRoute POST /api/users', () => {
  it('should create a user when valid body is provided', () => {
    // Given: a valid user payload
    const body = { name: 'John', email: 'john@example.com' }

    // When: POST /api/users is called
    const response = await api.users.POST({ body })

    // Then: user is created with correct data
    expect(response.status).toBe(201)
    expect(response.data.name).toBe('John')
  })

  it('should return 422 when email is invalid', () => {
    // Given: payload with invalid email
    const body = { name: 'John', email: 'not-an-email' }

    // When: POST /api/users is called
    const response = await api.users.POST({ body })

    // Then: validation error is returned
    expect(response.status).toBe(422)
    expect(response.error.code).toBe('VALIDATION_ERROR')
  })
})
```

### Regras BDD

- `describe` = feature ou componente sendo testado
- `it`/`test` = comportamento esperado em linguagem de negócio
- Nomes legíveis: `'should reject transfer when balance is insufficient'`, não `'test_transfer_2'`
- Cada `it` testa UM cenário (happy path OU edge case OU erro)
- Cenários de erro são tão importantes quanto happy paths
- Testes são documentação viva — alguém deve entender o sistema lendo apenas os testes

### Cenários obrigatórios por feature

| Tipo | Exemplo |
|---|---|
| Happy path | `should create user with valid data` |
| Validation error | `should reject when email is missing` |
| Auth error | `should return 401 when not authenticated` |
| Not found | `should return 404 when user does not exist` |
| Edge case | `should handle empty string name` |
| Concurrency | `should not create duplicate users` (quando relevante) |

## What Kind of Test

- Business logic / pure functions → unit test (Vitest) — TDD obrigatório
- Router / build pipeline → integration test — TDD obrigatório
- Server routes / actions → integration test — TDD + BDD obrigatório
- Full user flows → E2E test (Playwright) — BDD obrigatório
- Type inference → type test (`expectTypeOf`) — TDD obrigatório

## Test Quality

- One behavior per test. If the name has "and", split it.
- Descriptive names: `test_dynamic_route_resolves_slug`, not `test_1`.
- Arrange-Act-Assert pattern. No exceptions.
- Tests must be deterministic. Flaky test = P0 bug.
- Tests must be independent. No shared mutable state.

## Fixtures

Every framework feature needs a mini-project fixture:

```
tests/fixtures/
├── basic-app/          # Minimal page + layout
├── nested-layouts/     # Multi-level layouts
├── server-routes/      # API routes with Zod
├── server-actions/     # Server actions + forms
├── middleware/         # Middleware stack
├── dynamic-routes/    # [param] and [...catchAll]
├── error-boundaries/  # Error handling per segment
└── loading-states/    # Suspense + streaming
```

## What NOT to Test

- Trivial getters/setters
- Framework/library internals
- CSS layout (unless business requirement)
- Third-party library behavior

## Running Tests

```bash
npm test                                    # All tests
npx vitest run tests/unit/router.test.ts    # Specific test
npx tsc --noEmit                            # Type check
npx playwright test                         # E2E
npm run lint                                # Lint
```
