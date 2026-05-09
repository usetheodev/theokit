# Plan: Onda 14 — Auth Hooks

> **Version 1.0** — Adiciona autenticação ao Theo via encrypted cookie sessions (AES-256-GCM) e `requireAuth()` guard com type narrowing. Três módulos: `crypto.ts` (encrypt/decrypt via Web Crypto), `session.ts` (`createSessionManager<TSession>` com getSession/createSession/destroySession), e `auth.ts` (`requireAuth()` asserts function + `AuthRequiredError`). O handler de `executeRoute` trata `AuthRequiredError` retornando 401. Zero deps novas, zero breaking changes.

## Context

O Theo tem 13 ondas, 387 testes, cookies helpers (getCookie/setCookie/deleteCookie desde Onda 9), e context extensível (TCtx desde Onda 11). Porém não tem auth:

1. **Sem session management** — não há forma de criar/ler/destruir sessions
2. **Sem encryption** — cookies são plain text; session data ficaria exposta
3. **Sem guard function** — routes não têm `requireAuth()` para proteger endpoints
4. **Sem error tipado** — erros de auth retornam erro genérico, não `AUTH_REQUIRED`

Evidence: `server/index.ts` exporta cookies mas não session. `execute.ts:186` catch block não diferencia `AuthRequiredError` de outros erros.

## Objective

**Done =** `createSessionManager<T>()` cria/lê/destrói sessions via encrypted cookies, `requireAuth()` bloqueia requests sem session com 401 e faz type narrowing do ctx.user, `AuthRequiredError` é tratada pelo runtime.

Metas:
1. `encrypt(data, secret)` / `decrypt(token, secret)` via Web Crypto AES-256-GCM
2. `createSessionManager<TSession>(config)` com getSession/createSession/destroySession
3. `requireAuth(session)` como `asserts session is TSession` → 401 se null
4. `AuthRequiredError` capturada por `executeRoute` → JSON 401 com code `AUTH_REQUIRED`
5. Type tests para session generics e requireAuth narrowing
6. Zero deps, zero breaking changes

## ADRs

### D1 — Encrypted cookies via Web Crypto (AES-256-GCM)
**Decision:** Session data é encriptada com AES-256-GCM usando `crypto.subtle` (Web Crypto API). Sem dependência de `iron-webcrypto` ou `jose`.
**Rationale:** Web Crypto é built-in em Node 18+, Deno, Bun. AES-256-GCM provê confidencialidade + integridade. São ~30 linhas vs 15KB de iron-webcrypto. O Theo já tem Node 20 como target mínimo.
**Consequences:** Session data é invisível no cookie (encrypted, não apenas signed). Sem password rotation nativa (pode ser adicionada depois). Key derivation via PBKDF2 do secret string.

### D2 — Stateless sessions (cookie-only, sem DB)
**Decision:** Sessions são armazenadas inteiramente no cookie. Sem database, sem Redis.
**Rationale:** Zero infra requirement. Serverless-friendly. Database sessions são responsabilidade do user (Onda 15 — DB integration). Alternativa (DB sessions) criaria dependência circular.
**Consequences:** Sessions não podem ser invalidadas server-side (exceto mudando o secret). Cookie size limit (~4KB). Suficiente para alpha.

### D3 — requireAuth como `asserts` function
**Decision:** `requireAuth(session)` é typed como `asserts session is TSession`. Quando passa, TypeScript sabe que session é non-null e tipado.
**Rationale:** TypeScript assertion functions fazem type narrowing nativo — sem casts, sem `as`. A alternativa (retornar session e fazer if) é mais verbose e perde narrowing no escopo do caller.
**Consequences:** `requireAuth` não retorna valor — ou passa (session é garantidamente válido) ou throw. O handler faz `requireAuth(ctx.user); return ctx.user.userId`.

### D4 — AuthRequiredError tratado por executeRoute
**Decision:** `executeRoute` faz `catch` de `AuthRequiredError` e retorna JSON 401 com `code: 'AUTH_REQUIRED'`. Mesmo pattern já existe para `VALIDATION_ERROR` e `INTERNAL_ERROR`.
**Rationale:** Centralizar error handling no runtime. O handler apenas faz `throw` via `requireAuth()`. O runtime traduz para HTTP response.
**Consequences:** Nenhuma mudança de API. O handler não precisa conhecer o formato do error response.

### D5 — Session shape via generic TSession
**Decision:** `createSessionManager<TSession>()` aceita um generic que define a forma do session data. `getSession()` retorna `TSession | null`.
**Rationale:** O user define o que quer no session (userId, role, permissions, etc.). O framework não opina sobre a forma. Type safety end-to-end via generics.
**Consequences:** Se o user mudar o shape do session e tiver cookies antigos com shape diferente, decrypt vai funcionar mas o type pode não corresponder. Aceito para alpha.

## Dependency Graph

```
Phase 0 (crypto) ──▶ Phase 1 (session manager) ──▶ Phase 2 (auth guard + error handling) ──▶ Phase 3 (regression)
```

- **Phase 0** bloqueia tudo (encryption é base)
- **Phase 1** depende de Phase 0 (session usa crypto)
- **Phase 2** depende de Phase 1 (requireAuth usa session)
- **Phase 3** regressão completa

---

## Phase 0: Crypto (encrypt/decrypt)

**Objective:** Implementar encrypt/decrypt via Web Crypto AES-256-GCM.

### T0.1 — encrypt e decrypt

#### Objective
Criar funções `encrypt(data, secret)` e `decrypt(token, secret)` usando AES-256-GCM.

#### Evidence
Session data precisa ser encriptada no cookie. `crypto.subtle` é disponível em Node 20+ (target do Theo).

#### Files to edit
```
packages/theo/src/server/crypto.ts (NEW) — encrypt/decrypt functions
tests/unit/crypto.test.ts (NEW) — Tests
```

#### Deep file dependency analysis
- `crypto.ts`: Novo módulo. Zero deps internas. Exporta `encrypt` e `decrypt`. Usado por `session.ts`.
- Testes: Verificam round-trip, tampering detection, invalid secret.

#### Deep Dives
- **Key derivation**: `crypto.subtle.importKey('raw', ...)` com SHA-256 hash do secret para gerar key de 256 bits.
- **IV**: 12 bytes random via `crypto.getRandomValues()` (recomendado para AES-GCM).
- **Format**: `base64url(iv):base64url(ciphertext)` — dois segmentos separados por `:`.
- **Data serialization**: `JSON.stringify(data)` antes de encrypt, `JSON.parse()` após decrypt.
- **Error handling**: `decrypt` retorna `null` se token é inválido (não throw).
- **EC-1 MUST FIX — Secret validation**: `createSessionManager` deve rejeitar secrets < 32 chars. SHA-256 hash de secret curto é tecnicamente válido mas trivialmente brute-forceable.

#### Tasks
1. Criar `packages/theo/src/server/crypto.ts`
2. Implementar `deriveKey(secret)` via SHA-256
3. Implementar `encrypt<T>(data: T, secret: string): Promise<string>`
4. Implementar `decrypt<T>(token: string, secret: string): Promise<T | null>`
5. Criar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_encrypt_returns_string() — Given data object, When encrypt, Then returns non-empty string
RED:     test_decrypt_roundtrip() — Given encrypted token, When decrypt with same secret, Then returns original data
RED:     test_decrypt_wrong_secret() — Given encrypted token, When decrypt with different secret, Then returns null
RED:     test_decrypt_tampered_token() — Given modified token, When decrypt, Then returns null
RED:     test_decrypt_invalid_format() — Given random string, When decrypt, Then returns null
RED:     test_encrypt_complex_data() — Given nested object with arrays, When encrypt+decrypt, Then data preserved
RED:     test_each_encrypt_is_unique() — Given same data encrypted twice, When comparing tokens, Then different (random IV)
RED:     test_empty_object() — Given {}, When encrypt+decrypt, Then returns {}
GREEN:   Implement encrypt/decrypt with AES-256-GCM
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/crypto.test.ts
```

BDD scenarios:
- **Happy path**: encrypt → decrypt round-trip preserves data
- **Validation error**: Wrong secret → null (not throw)
- **Edge case**: Empty object, nested data, unicode strings
- **Error scenario**: Tampered token → null; invalid format → null

#### Acceptance Criteria
- [ ] `encrypt(data, secret)` returns base64url string
- [ ] `decrypt(token, secret)` returns original data
- [ ] Wrong secret returns null
- [ ] Tampered token returns null
- [ ] Each encryption produces unique output (random IV)
- [ ] Zero external dependencies (Web Crypto only)

#### DoD
- [ ] Crypto functions work
- [ ] 8 tests GREEN

---

## Phase 1: Session Manager

**Objective:** Implementar `createSessionManager<TSession>()` com getSession/createSession/destroySession.

### T1.1 — createSessionManager

#### Objective
Factory function que retorna session helpers para um dado secret e cookie config.

#### Evidence
O Theo tem cookies helpers (getCookie/setCookie/deleteCookie) mas sem encryption layer para sessions.

#### Files to edit
```
packages/theo/src/server/session.ts (NEW) — Session manager
tests/unit/session.test.ts (NEW) — Tests
```

#### Deep file dependency analysis
- `session.ts`: Importa `encrypt`/`decrypt` de `./crypto.js` e `getCookie`/`setCookie`/`deleteCookie` de `./cookies.js`. Exporta `createSessionManager`, `SessionConfig`, `SessionManager` types.
- Downstream: `server/index.ts` re-exporta. User usa em `server/context.ts`.

#### Deep Dives
- **SessionConfig**: `{ secret: string; cookieName?: string; maxAge?: number }`
  - `secret`: Obrigatório. Usado para encrypt/decrypt.
  - `cookieName`: Default `'theo_session'`.
  - `maxAge`: Default `604800` (7 dias em segundos).
- **getSession(req)**: Lê cookie → decrypt → retorna `TSession | null`.
- **createSession(res, data)**: Encrypt data → setCookie.
- **destroySession(res)**: deleteCookie.
- **Session envelope**: `{ data: TSession, exp: number }` — inclui expiration timestamp. `getSession` verifica se `exp > Date.now()`.

#### Tasks
1. Criar `packages/theo/src/server/session.ts`
2. Implementar `createSessionManager<TSession>(config)`
3. Implementar `getSession(req)`, `createSession(res, data)`, `destroySession(res)`
4. Criar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_create_session_sets_cookie() — Given session manager, When createSession called, Then res has Set-Cookie header
RED:     test_get_session_returns_data() — Given session cookie set, When getSession called, Then returns original data
RED:     test_get_session_no_cookie() — Given no cookie, When getSession called, Then returns null
RED:     test_get_session_expired() — Given expired session, When getSession called, Then returns null
RED:     test_destroy_session_clears_cookie() — Given active session, When destroySession called, Then cookie is deleted
RED:     test_session_cookie_is_encrypted() — Given createSession, When reading raw cookie value, Then not readable JSON
RED:     test_custom_cookie_name() — Given cookieName='my_session', When createSession, Then cookie name is 'my_session'
RED:     test_session_roundtrip() — Given createSession then getSession, When using same req/res, Then data matches
RED:     test_short_secret_rejected() — Given secret with < 32 chars, When createSessionManager, Then throws Error (EC-1 MUST FIX)
GREEN:   Implement session manager
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/session.test.ts
```

BDD scenarios:
- **Happy path**: createSession → getSession round-trip
- **Validation error**: No cookie → null
- **Edge case**: Expired session → null; custom cookie name
- **Error scenario**: Tampered cookie → null (via decrypt failure)

#### Acceptance Criteria
- [ ] `createSession(res, data)` sets encrypted cookie
- [ ] `getSession(req)` decrypts and returns data
- [ ] Expired sessions return null
- [ ] `destroySession(res)` deletes the cookie
- [ ] Cookie is encrypted (not readable)
- [ ] Generic `TSession` preserved through round-trip

#### DoD
- [ ] Session manager functional
- [ ] 8 tests GREEN

---

## Phase 2: Auth Guard + Error Handling

**Objective:** Implementar `requireAuth()` guard e tratar `AuthRequiredError` no runtime.

### T2.1 — requireAuth e AuthRequiredError

#### Objective
Criar `requireAuth(session)` asserts function e `AuthRequiredError` class.

#### Evidence
Routes precisam de guard pattern para proteger endpoints. TypeScript `asserts` functions provêm type narrowing nativo.

#### Files to edit
```
packages/theo/src/server/auth.ts (NEW) — requireAuth + AuthRequiredError
tests/unit/auth.test.ts (NEW) — Unit tests
tests/type/auth.test-d.ts (NEW) — Type narrowing tests
```

#### Deep file dependency analysis
- `auth.ts`: Novo módulo. Zero deps internas. Exporta `requireAuth`, `AuthRequiredError`.
- Type tests: Provam que `requireAuth(session)` faz narrowing de `T | null` para `T`.

#### Deep Dives
- **requireAuth signature**: `function requireAuth<T>(session: T | null): asserts session is T`
- **AuthRequiredError**: `extends Error` com `code: 'AUTH_REQUIRED'` e `status: 401`.
- **Type narrowing**: Após `requireAuth(ctx.user)`, TypeScript sabe que `ctx.user` é non-null.

#### Tasks
1. Criar `packages/theo/src/server/auth.ts`
2. Implementar `requireAuth()` e `AuthRequiredError`
3. Criar unit tests e type tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_requireAuth_passes_with_session() — Given valid session object, When requireAuth called, Then does not throw
RED:     test_requireAuth_throws_without_session() — Given null, When requireAuth called, Then throws AuthRequiredError
RED:     test_auth_error_has_code() — Given thrown AuthRequiredError, When checking code, Then is 'AUTH_REQUIRED'
RED:     test_auth_error_has_status() — Given thrown AuthRequiredError, When checking status, Then is 401
RED:     test_auth_error_is_error_instance() — Given AuthRequiredError, When instanceof Error, Then true
RED:     type_requireAuth_narrows_type() — Given T | null, When requireAuth passes, Then T (type test)
RED:     type_requireAuth_with_custom_type() — Given { userId: string } | null, When requireAuth passes, Then { userId: string }
GREEN:   Implement requireAuth and AuthRequiredError
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/auth.test.ts && pnpm test:types
```

BDD scenarios:
- **Happy path**: Valid session → passes, type narrowed
- **Validation error**: null session → AuthRequiredError thrown
- **Edge case**: `undefined` session → also throws
- **Error scenario**: AuthRequiredError has correct code and status

#### Acceptance Criteria
- [ ] `requireAuth(session)` passes for non-null
- [ ] `requireAuth(null)` throws `AuthRequiredError`
- [ ] Error has `code: 'AUTH_REQUIRED'` and `status: 401`
- [ ] TypeScript narrows type after requireAuth
- [ ] Type tests pass

#### DoD
- [ ] Auth guard functional
- [ ] Type narrowing proven
- [ ] Tests GREEN

---

### T2.2 — executeRoute trata AuthRequiredError

#### Objective
Atualizar `executeRoute` para capturar `AuthRequiredError` e retornar 401 JSON.

#### Evidence
`execute.ts:186` catch block trata tudo como `INTERNAL_ERROR` 500. `AuthRequiredError` deve retornar 401.

#### Files to edit
```
packages/theo/src/server/execute.ts (EDIT) — Tratar AuthRequiredError no catch
packages/theo/src/server/action-execute.ts (EDIT) — Mesmo para actions
```

#### Deep file dependency analysis
- `execute.ts`: Catch block na linha 186. Adicionar check `if (err instanceof AuthRequiredError)` antes do catch genérico.
- `action-execute.ts`: Mesmo catch pattern na linha 76. Mesmo fix.
- Downstream: Todos os handlers que usam `requireAuth()` terão 401 tratado corretamente.

#### Deep Dives
- Import `AuthRequiredError` de `./auth.js`.
- Check: `if (err instanceof AuthRequiredError) { sendError(res, err.code, err.message, err.status, undefined, requestId); return; }`
- Deve vir ANTES do catch genérico `INTERNAL_ERROR`.

#### Tasks
1. Importar `AuthRequiredError` em `execute.ts`
2. Adicionar check no catch block
3. Fazer o mesmo em `action-execute.ts`
4. Criar teste de integração

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_route_returns_401_on_auth_error() — Given handler that throws requireAuth(null), When executeRoute, Then res status 401 with code AUTH_REQUIRED
RED:     test_route_401_has_request_id() — Given auth error, When response, Then has requestId
RED:     test_action_returns_401_on_auth_error() — Given action handler that throws requireAuth(null), When executeAction, Then 401
RED:     test_non_auth_errors_still_500() — Given handler that throws generic Error, When executeRoute, Then 500 INTERNAL_ERROR (backward compat)
GREEN:   Update execute.ts and action-execute.ts catch blocks
REFACTOR: None expected
VERIFY:  npx vitest run tests/integration/auth-error.test.ts
```

BDD scenarios:
- **Happy path**: AuthRequiredError → 401 JSON with AUTH_REQUIRED code
- **Validation error**: N/A
- **Edge case**: requestId preserved in 401 response
- **Error scenario**: Non-auth errors still return 500 (backward compat)

#### Acceptance Criteria
- [ ] `AuthRequiredError` → 401 with `code: 'AUTH_REQUIRED'`
- [ ] requestId in 401 response
- [ ] Non-auth errors → 500 (backward compat)
- [ ] Both routes and actions handle AuthRequiredError

#### DoD
- [ ] Error handling updated
- [ ] Integration tests GREEN

---

### T2.3 — Wire exports

#### Objective
Exportar session, auth, e crypto de `theo/server`.

#### Evidence
New modules need to be accessible via `import { createSessionManager, requireAuth } from 'theo/server'`.

#### Files to edit
```
packages/theo/src/server/index.ts (EDIT) — Add exports
```

#### Deep file dependency analysis
- `server/index.ts`: Barrel exports. Add session, auth, crypto exports.

#### Deep Dives
None — wiring.

#### Tasks
1. Add exports for `createSessionManager`, `SessionManager`, `SessionConfig`
2. Add exports for `requireAuth`, `AuthRequiredError`
3. Verify typecheck

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_createSessionManager_exported() — Given import from theo/server, When importing createSessionManager, Then is a function
RED:     test_requireAuth_exported() — Given import from theo/server, When importing requireAuth, Then is a function
RED:     test_AuthRequiredError_exported() — Given import from theo/server, When importing AuthRequiredError, Then is a function
RED:     test_smoke_imports_from_dist() — Given built dist, When importing from dist/server, Then all auth exports present
GREEN:   Add exports to server/index.ts
REFACTOR: None expected
VERIFY:  pnpm test && pnpm build
```

BDD scenarios:
- **Happy path**: All exports resolve
- **Validation error**: N/A
- **Edge case**: Type exports (SessionConfig, SessionManager) resolve
- **Error scenario**: Missing export → test fails

#### Acceptance Criteria
- [ ] `createSessionManager` importable from `theo/server`
- [ ] `requireAuth` importable from `theo/server`
- [ ] `AuthRequiredError` importable from `theo/server`
- [ ] Build includes new exports in dist/

#### DoD
- [ ] Exports wired
- [ ] Build produces correct dist/

---

## Phase 3: Regression + Dogfood

**Objective:** Garantir zero regressão.

### T3.1 — Regressão completa

#### Objective
Verificar todos os testes passam.

#### Evidence
Onda 14 modifica execute.ts e action-execute.ts (core runtime). Regressão obrigatória.

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
6. Smoke tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_typecheck() — Given all changes, When pnpm typecheck, Then exit code 0
RED:     test_all_tests() — Given all changes, When pnpm test, Then all pass (387+)
RED:     test_types() — Given all changes, When pnpm test:types, Then all pass (32+)
RED:     test_build() — Given all changes, When pnpm build, Then exit code 0
GREEN:   Already implemented — verifies
REFACTOR: Fix regressions if found
VERIFY:  pnpm typecheck && pnpm test && pnpm test:types && pnpm build
```

BDD scenarios:
- **Happy path**: All pass
- **Validation error**: Regression → fix
- **Edge case**: New tests increase count
- **Error scenario**: execute.ts change breaks existing tests → fix

#### Acceptance Criteria
- [ ] `pnpm typecheck` zero errors
- [ ] `pnpm test` — 387+ tests green
- [ ] `pnpm test:types` — 32+ type tests green
- [ ] `pnpm build` exit code 0
- [ ] Zero `any`

#### DoD
- [ ] Zero regressão

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Session encrypt/decrypt | T0.1 | AES-256-GCM via Web Crypto |
| 2 | createSession sets encrypted cookie | T1.1 | createSessionManager.createSession |
| 3 | getSession reads + decrypts cookie | T1.1 | createSessionManager.getSession |
| 4 | destroySession clears cookie | T1.1 | createSessionManager.destroySession |
| 5 | Session expiration | T1.1 | exp timestamp in session envelope |
| 6 | requireAuth blocks without session → 401 | T2.1 | asserts function throws AuthRequiredError |
| 7 | requireAuth permits with valid session | T2.1 | asserts passes, type narrowed |
| 8 | ctx.user tipado após requireAuth | T2.1 | TypeScript asserts narrowing |
| 9 | Auth error JSON with code AUTH_REQUIRED | T2.2 | executeRoute catch block |
| 10 | Both routes and actions handle auth errors | T2.2 | execute.ts + action-execute.ts |
| 11 | Exports from theo/server | T2.3 | server/index.ts wiring |
| 12 | Backward compatibility | T3.1 | Full regression |

**Coverage: 12/12 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-3)
- [ ] All tests passing (`pnpm test` — 387+)
- [ ] All type tests passing (`pnpm test:types` — 32+)
- [ ] Zero TypeScript errors (`pnpm typecheck`)
- [ ] Zero `any` in production code
- [ ] `pnpm build` exit code 0
- [ ] `encrypt`/`decrypt` round-trip works (AES-256-GCM)
- [ ] `createSessionManager<T>()` creates encrypted sessions
- [ ] `getSession` returns null for expired/invalid/missing sessions
- [ ] `requireAuth` throws AuthRequiredError for null
- [ ] `requireAuth` narrows type (proven by type test)
- [ ] `executeRoute` returns 401 for AuthRequiredError
- [ ] Zero breaking changes
- [ ] **Dogfood QA PASS** — `/dogfood full` health score >= 70

## Final Phase: Dogfood QA (MANDATORY)

> This phase runs AFTER all implementation phases are complete. The plan is NOT done until dogfood passes.

**Objective:** Validate that the implemented changes work as a real user would experience them.

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
