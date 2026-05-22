# Plan: Onda 9 — Cookie Helpers + Templates Oficiais

> **Version 1.0** — Este plano adiciona cookie helpers (`getCookie`, `setCookie`, `deleteCookie`) ao `theo/server` com defaults seguros (httpOnly, secure, sameSite), passa `response` para o handler context, e cria 3 templates oficiais (basic, dashboard, api-only). Cookie helpers desbloqueiam auth patterns. Templates transformam o framework em produto.

## Context

MVP completo (Ondas 0-8). O `create-theo` tem apenas 1 template (`default`). Não existem cookie helpers — dev precisa parsear cookies manualmente. Handlers de route/action não têm acesso ao `response` object para setar cookies/headers. 240 unit/integration + 13 E2E + 21 type tests passando.

## Objective

**Done =** `getCookie`/`setCookie`/`deleteCookie` exportados de `theo/server`, `response` acessível via ctx, 3 templates funcionais, `create-theo --template dashboard` funciona.

## ADRs

### D1 — Cookie helpers, não session management
**Decision:** Framework fornece primitivas de cookie (get/set/delete). Session logic é user-land.
**Rationale:** Next.js e Hono fazem o mesmo. Session é opinião do user (JWT vs DB vs cookie-only).
**Consequences:** Templates auth-basic implementam session logic no template, não no framework.

### D2 — Defaults seguros (OWASP compliant)
**Decision:** `setCookie` default: `httpOnly:true`, `secure:true` em prod, `sameSite:'lax'`, `path:'/'`.
**Rationale:** MDN e OWASP recomendam. Dev não precisa lembrar de setar httpOnly.
**Consequences:** Cookies visíveis em JS precisam de `httpOnly: false` explícito.

### D3 — Response acessível no handler context
**Decision:** `createContext({ request, response })` — framework passa `response` para o context factory. Handlers acessam via `ctx.response` (ou helpers no ctx).
**Rationale:** Actions precisam setar cookies. Sem `response`, não há como. Hono resolve com `c.header()`.
**Consequences:** Minor change nos executors para passar `res` ao `createContext`.

### D4 — Templates via flag `--template`
**Decision:** `create-theo my-app --template dashboard` copia de `templates/{name}/` em vez de `templates/default/`.
**Rationale:** Convention over configuration. Um flag, zero prompts.
**Consequences:** `create-theo` src precisa de minor update para aceitar flag.

## Dependency Graph

```
Phase 0 (Cookie helpers)
    |
Phase 1 (Response in context)
    |
Phase 2 (Template flag in CLI)     Phase 3 (Templates: dashboard + api-only)
    |                                   |
    +-----------------------------------+
                    |
                Phase 4 (Tests)
```

- Phase 0 independente
- Phase 1 depende de Phase 0 (tests usam cookies)
- Phase 2 e 3 paralelos após Phase 1
- Phase 4 depende de tudo

---

## Phase 0: Cookie Helpers

**Objective:** `getCookie`, `setCookie`, `deleteCookie` com defaults seguros.

### T0.1 — Cookie helpers

#### Objective
Criar funções para parse, set, e delete cookies em Node.js IncomingMessage/ServerResponse.

#### Evidence
Pesquisa SOTA: Hono tem `getCookie`/`setCookie` como helpers. Theo precisa do mesmo para habilitar auth patterns.

#### Files to edit
```
packages/theo/src/server/cookies.ts (NEW) — getCookie, setCookie, deleteCookie, CookieOptions
packages/theo/src/server/index.ts (EDIT) — Export cookie helpers
tests/unit/cookies.test.ts (NEW) — 8+ tests
```

#### Deep file dependency analysis
- `cookies.ts`: Pure functions. Usa `node:http` types. Zero deps no framework.
- `server/index.ts`: Re-exporta. Downstream: user code importa `from 'theo/server'`.

#### Deep Dives
```typescript
interface CookieOptions {
  httpOnly?: boolean    // default: true
  secure?: boolean      // default: NODE_ENV === 'production'
  sameSite?: 'strict' | 'lax' | 'none'  // default: 'lax'
  maxAge?: number       // seconds
  path?: string         // default: '/'
  domain?: string
}
```

- **getCookie**: Parse `req.headers.cookie` string, split by `;`, find by name.
- **setCookie**: Build `Set-Cookie` header string, append to existing headers (não overwrite).
- **deleteCookie**: `setCookie(res, name, '', { maxAge: 0 })`.

#### Tasks
1. Create `cookies.ts` with getCookie, setCookie, deleteCookie
2. Export from `server/index.ts`
3. Write tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_getCookie_exists() — Given req with 'session=abc123', When getCookie(req, 'session'), Then 'abc123'
RED:     test_getCookie_missing() — Given req without cookie, When getCookie(req, 'session'), Then undefined
RED:     test_getCookie_multiple() — Given req with 'a=1; b=2', When getCookie(req, 'b'), Then '2'
RED:     test_setCookie_basic() — Given res, When setCookie(res, 'token', 'xyz'), Then Set-Cookie header set with HttpOnly + SameSite=Lax
RED:     test_setCookie_options() — Given res, When setCookie with maxAge+domain, Then all attributes in header
RED:     test_setCookie_multiple() — Given res with existing cookie, When setCookie again, Then both cookies in header
RED:     test_deleteCookie() — Given res, When deleteCookie(res, 'token'), Then Set-Cookie with Max-Age=0
RED:     test_setCookie_secure_prod() — Given NODE_ENV=production, When setCookie, Then Secure attribute present
RED:     test_getCookie_with_equals() — Given cookie 'token=abc==', When getCookie('token'), Then 'abc==' (EC-2: base64 values)
RED:     test_setCookie_append_not_overwrite() — Given 2 setCookie calls, When check headers, Then both cookies present (EC-1)
GREEN:   Implement cookie helpers with append logic and first-equals split
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/cookies.test.ts
```

BDD scenarios:
- **Happy path**: Get and set cookies work
- **Validation error**: Missing cookie returns undefined
- **Edge case**: Multiple cookies, encoded values
- **Error scenario**: N/A (pure functions, no throw)

#### Acceptance Criteria
- [ ] `getCookie` parses cookie header correctly
- [ ] `setCookie` sets with secure defaults
- [ ] `deleteCookie` expires cookie
- [ ] Multiple setCookie calls don't overwrite each other
- [ ] 8+ tests GREEN

#### DoD
- [ ] Tests GREEN
- [ ] Exported from `theo/server`
- [ ] `pnpm typecheck` passes

---

## Phase 1: Response in Context

**Objective:** Pass `response` to `createContext` so handlers can set cookies.

### T1.1 — Pass response to createContext

#### Objective
Modify middleware-runner to pass `response` alongside `request` to `createContext()`.

#### Evidence
Actions need to set cookies. Without `response`, `setCookie(res, ...)` is impossible from handler.

#### Files to edit
```
packages/theo/src/server/middleware-runner.ts (EDIT) — Pass res to createContext
```

#### Deep file dependency analysis
- `middleware-runner.ts` line 37-41: Currently calls `createContext({ request: req })`. Change to `createContext({ request: req, response: res })`.
- Downstream: user's `context.ts` receives both. Backward compat — `response` is new optional param.

#### Deep Dives
Change:
```typescript
// Before:
ctx = await (mod.createContext as Function)({ request: req })
// After:
ctx = await (mod.createContext as Function)({ request: req, response: res })
```

User's context.ts:
```typescript
// Before (still works):
export async function createContext({ request }) { ... }
// After (can use response):
export async function createContext({ request, response }) {
  return {
    requestId: crypto.randomUUID(),
    setCookie: (name, value, opts) => setCookie(response, name, value, opts),
  }
}
```

#### Tasks
1. Modify middleware-runner to pass `response`
2. Verify backward compat (existing context.ts without `response` still works)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_context_receives_response() — Given context.ts that uses response, When createContext, Then response is accessible
RED:     test_backward_compat() — Given context.ts without response param, When createContext, Then still works
RED:     test_setCookie_via_context() — Given handler that calls ctx.setCookie, When request, Then cookie header set
RED:     test_existing_tests_pass() — Given all existing tests, When pnpm test, Then 240 pass
GREEN:   Add response to createContext call
REFACTOR: None expected
VERIFY:  pnpm test
```

BDD scenarios:
- **Happy path**: Context factory receives response, can set cookies
- **Validation error**: N/A
- **Edge case**: Context without response param (backward compat)
- **Error scenario**: N/A

#### Acceptance Criteria
- [ ] `createContext({ request, response })` works
- [ ] Backward compat preserved
- [ ] Existing 240 tests GREEN

#### DoD
- [ ] Tests GREEN
- [ ] `pnpm typecheck` passes

---

## Phase 2: Template Flag in CLI

**Objective:** `create-theo my-app --template dashboard` selects template.

### T2.1 — --template flag

#### Objective
Add `--template` flag to create-theo CLI. Default: `default`.

#### Evidence
Templates need a selection mechanism. Flag is simplest (no prompts, convention).

#### Files to edit
```
packages/create-theo/src/cli.ts (EDIT) — Add --template arg parsing
packages/create-theo/src/index.ts (EDIT) — scaffold() accepts templateName
```

#### Deep file dependency analysis
- `cli.ts`: Parse `--template` from args. Pass to `scaffold()`.
- `index.ts`: `getTemplateDir()` resolves `templates/{name}/` instead of hardcoded `templates/default/`.

#### Deep Dives
```typescript
// cli.ts
const templateFlag = args.find(a => a.startsWith('--template='))
const templateName = templateFlag ? templateFlag.split('=')[1] : 'default'

// index.ts
function getTemplateDir(templateName: string): string {
  return resolve(__dirname, '../templates', templateName)
}
```

#### Tasks
1. Add flag parsing to cli.ts
2. Update scaffold() to accept templateName
3. Update getTemplateDir

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_default_template() — Given no --template flag, When scaffold, Then uses default template
RED:     test_custom_template() — Given --template=dashboard, When scaffold, Then uses dashboard template
RED:     test_invalid_template() — Given --template=nonexistent, When scaffold, Then error 'Template not found'
RED:     test_backward_compat() — Given create-theo my-app (no flag), When scaffold, Then works as before
GREEN:   Add --template parsing + scaffold update
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/create-theo-scaffold.test.ts
```

BDD scenarios:
- **Happy path**: `--template=dashboard` selects correct template
- **Validation error**: Unknown template → clear error
- **Edge case**: No flag → defaults to `default`
- **Error scenario**: Template dir missing → "Template not found"

#### Acceptance Criteria
- [ ] `--template` flag works
- [ ] Default template unchanged
- [ ] Invalid template → clear error
- [ ] Existing scaffold tests GREEN

#### DoD
- [ ] Tests GREEN
- [ ] `pnpm typecheck` passes

---

## Phase 3: Templates

**Objective:** Create `dashboard` and `api-only` templates.

### T3.1 — Dashboard + API-only templates

#### Objective
Two new templates that showcase Theo features beyond basic Hello World.

#### Evidence
ONDAS.md requires multiple templates. Dashboard shows routing+layouts. API-only shows backend-only.

#### Files to edit
```
packages/create-theo/templates/dashboard/ (NEW) — Full template with routing + layouts
packages/create-theo/templates/api-only/ (NEW) — Backend-only template
```

#### Deep file dependency analysis
- `dashboard/`: Copy of default + about page + dashboard page + root layout + dashboard layout. Shows routing + nested layouts.
- `api-only/`: No app/ frontend (minimal page), focused on server/routes with health + users CRUD. Shows API-first development.

#### Deep Dives

**Dashboard template:**
```
templates/dashboard/
├── app/
│   ├── page.tsx              # Home
│   ├── layout.tsx            # Root layout with nav
│   ├── about/page.tsx        # About page
│   └── dashboard/
│       ├── page.tsx           # Dashboard page
│       └── layout.tsx         # Dashboard layout
├── server/routes/health.ts
├── index.html
├── theo.config.ts
├── tsconfig.json
├── _gitignore
└── package.json.tmpl
```

**API-only template:**
```
templates/api-only/
├── app/page.tsx               # Minimal "API Server"
├── server/
│   └── routes/
│       ├── health.ts          # GET /api/health
│       └── users.ts           # GET + POST /api/users
├── index.html
├── theo.config.ts
├── tsconfig.json
├── _gitignore
└── package.json.tmpl
```

#### Tasks
1. Create dashboard template (8 files)
2. Create api-only template (8 files)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_dashboard_template_exists() — Given template dir, When ls, Then all files exist
RED:     test_dashboard_has_layouts() — Given template, When check, Then layout.tsx + dashboard/layout.tsx exist
RED:     test_api_only_has_routes() — Given template, When check, Then health.ts + users.ts exist
RED:     test_scaffold_dashboard() — Given --template=dashboard, When scaffold, Then all files copied correctly
GREEN:   Create both templates
REFACTOR: None expected
VERIFY:  ls packages/create-theo/templates/dashboard/ packages/create-theo/templates/api-only/
```

BDD scenarios:
- **Happy path**: Both templates scaffold correctly
- **Validation error**: N/A (static files)
- **Edge case**: Dashboard has nested layouts
- **Error scenario**: N/A

#### Acceptance Criteria
- [ ] Dashboard template: 8+ files with routing + layouts
- [ ] API-only template: 8+ files with routes
- [ ] Both scaffold correctly via `--template` flag

#### DoD
- [ ] Templates created
- [ ] Scaffold tests GREEN

---

## Phase 4: Integration Tests

**Objective:** Verify cookies + templates work end-to-end.

### T4.1 — Cookie + template tests

#### Objective
Integration tests for cookie helpers and template scaffolding.

#### Files to edit
```
fixtures/cookies-test/ (NEW) — Fixture with routes that use cookies
tests/integration/onda9-mandatory.test.ts (NEW) — Cookie + template tests
```

#### Deep file dependency analysis
- Fixture: route that sets cookie + route that reads cookie
- Tests: scaffold with --template, verify cookie headers

#### Tasks
1. Create cookie fixture
2. Create integration tests
3. Verify GREEN

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_setCookie_in_route() — Given route that calls setCookie, When GET, Then Set-Cookie header present
RED:     test_getCookie_in_route() — Given request with cookie, When GET, Then handler reads cookie
RED:     test_scaffold_dashboard() — Given --template=dashboard, When scaffold, Then validates structure
RED:     test_scaffold_api_only() — Given --template=api-only, When scaffold, Then validates structure
RED:     test_cookie_httpOnly_default() — Given setCookie with defaults, When check header, Then HttpOnly present
GREEN:   All tests pass
VERIFY:  npx vitest run tests/integration/onda9-mandatory.test.ts
```

BDD scenarios:
- **Happy path**: Cookie set and read works
- **Validation error**: N/A
- **Edge case**: httpOnly default applied
- **Error scenario**: Missing cookie returns undefined

#### Acceptance Criteria
- [ ] Cookie helpers work in real routes
- [ ] Templates scaffold correctly
- [ ] 5+ tests GREEN
- [ ] Existing 240 tests GREEN

#### DoD
- [ ] `pnpm test` all green
- [ ] `pnpm typecheck` passes

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | getCookie helper | T0.1 | Parse cookie header |
| 2 | setCookie with secure defaults | T0.1 | httpOnly + secure + sameSite |
| 3 | deleteCookie | T0.1 | Set maxAge=0 |
| 4 | Response in handler context | T1.1 | Pass res to createContext |
| 5 | --template flag | T2.1 | CLI flag parsing |
| 6 | Dashboard template | T3.1 | Routing + layouts showcase |
| 7 | API-only template | T3.1 | Backend-only showcase |
| 8 | Cookie integration test | T4.1 | End-to-end verification |

**Coverage: 8/8 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-4)
- [ ] All tests passing (`pnpm test`)
- [ ] All E2E passing (`pnpm test:e2e`)
- [ ] Zero TypeScript errors
- [ ] Zero `any` in production code
- [ ] Cookie helpers exportados de `theo/server`
- [ ] `--template` flag funciona
- [ ] 3 templates (default + dashboard + api-only) funcionais
- [ ] Onda 0-8 tests still green

## Final Phase: Dogfood QA (MANDATORY)

### Execution

```bash
# Cookie dogfood
curl -sI http://localhost:3000/api/set-cookie | grep set-cookie
# Template dogfood
npx tsx packages/create-theo/src/cli.ts test-dash --template=dashboard
cd test-dash && npx tsx ../packages/theo/src/cli/index.ts dev

# Plus /dogfood full
```

### Acceptance Criteria

- [ ] Health score >= 70/100
- [ ] Cookie headers correct
- [ ] Templates scaffold and run
- [ ] Zero CRITICAL issues
