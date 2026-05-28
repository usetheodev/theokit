# Plan: Onda 12 — Quick Wins (Env Vars + Error Pages + Rate Limiting)

> **Version 1.0** — Três quick wins agrupados: (1) `THEO_PUBLIC_*` env vars expostos ao client via `envPrefix` do Vite, (2) custom error pages em produção (`public/404.html`, `public/500.html`), e (3) rate limiting built-in opt-in via `theoConfigSchema`. Juntos, adicionam ~80 linhas de produção e cobrem 3 gaps que todo app real precisa. Nenhuma breaking change — tudo é opt-in com defaults sensatos.

## Context

O Theo tem 11 ondas completas, 337 testes, dogfood 100/100. Porém faltam 3 features básicas que todo app real precisa:

1. **Env vars**: O user não tem como expor variáveis de ambiente ao client de forma segura. Vite usa `VITE_*` por default, mas o Theo deveria ter seu próprio prefixo (`THEO_PUBLIC_*`) para branding e clareza.
2. **Error pages em produção**: O production server (`start.ts`) retorna `index.html` (SPA fallback) para qualquer erro. Não há suporte para `public/500.html` custom quando o server crasha.
3. **Rate limiting**: Nenhuma proteção contra abuse de API. Qualquer client pode fazer requests ilimitados.

Evidence: `vite-plugin/index.ts:28-38` (config sem envPrefix), `cli/commands/start.ts:84-89` (SPA fallback sem error pages), nenhum rate limiter existente.

## Objective

**Done =** `THEO_PUBLIC_*` env vars acessíveis no client, `public/500.html` servido em server crash, rate limiter bloqueia após N requests. Todos com testes, zero breaking change, dogfood 100/100.

Metas:
1. `envPrefix: 'THEO_PUBLIC_'` no theoPlugin
2. `public/404.html` e `public/500.html` opcionais no production server
3. Rate limiter built-in, opt-in via `rateLimit` no config schema
4. Exports de `createRateLimiter` e `RateLimitConfig` de `theo/server`
5. Testes para cada feature
6. Zero breaking change

## ADRs

### D1 — THEO_PUBLIC_* como envPrefix
**Decision:** Usar `envPrefix: 'THEO_PUBLIC_'` no Vite config do theoPlugin. Apenas variáveis com este prefixo são expostas ao client via `import.meta.env`.
**Rationale:** Branding do framework (como `NEXT_PUBLIC_` é do Next.js). O prefixo `PUBLIC` no nome lembra o dev que o valor será público. Alternativa (`VITE_*` default) funciona mas é genérico.
**Consequences:** Variáveis `VITE_*` NÃO são mais expostas (envPrefix substitui o default). Variáveis server-only (`DATABASE_URL`, etc.) continuam acessíveis via `process.env`.

### D2 — Error pages como HTML estático opcional
**Decision:** O production server verifica se `public/500.html` existe (copiado para `.theo/client/500.html` no build). Se existe, serve com status 500 em erros não-capturados. Se não, mantém comportamento atual (JSON error).
**Rationale:** O Theo é CSR — não pode renderizar React no server para error pages. HTML estático é o approach mais simples. Next.js e Astro fazem similar. Alternativa (SSR error components) é escopo de Onda 16 (SSR).
**Consequences:** User cria `public/500.html` para custom error page. Sem esse arquivo, comportamento não muda (backward compat).

### D3 — Rate limiter built-in, opt-in
**Decision:** Rate limiter in-memory (Map-based, fixed window) como parte do core do Theo. Habilitado via campo `rateLimit` no `theoConfigSchema`. Desabilitado por default.
**Rationale:** ~40 linhas de código. Sem dependência externa. Fixed window é suficiente para MVP. User que precisa de sliding window ou Redis pode usar `@upstash/ratelimit` direto no middleware. Alternativa (lib externa `hono-rate-limiter`) adiciona dependência sem valor proporcional para um limiter simples.
**Consequences:** Opt-in — zero overhead quando não configurado. Funciona em dev e prod. In-memory = não distribudo (single process). Suficiente para alpha.

### D4 — Rate limit no schema Zod, não como função
**Decision:** `rateLimit` é um campo no `theoConfigSchema` com tipo `{ windowMs: number, max: number }`. Não é uma função/middleware custom.
**Rationale:** Config deve ser declarativa (serializável). O framework aplica o limiter baseado no config. User que quer lógica custom usa middleware próprio.
**Consequences:** Limiter é global para todas as rotas API. Per-route limiting é middleware do user.

## Dependency Graph

```
Phase 0 (env vars) ──────────┐
Phase 1 (error pages) ───────┼──▶ Phase 3 (regression + dogfood)
Phase 2 (rate limiting) ─────┘
```

- **Phases 0, 1, 2** são paralelos (independentes)
- **Phase 3** depende de todos (regressão completa)

---

## Phase 0: Env Vars (THEO_PUBLIC_*)

**Objective:** Expor variáveis `THEO_PUBLIC_*` ao client via envPrefix do Vite.

### T0.1 — envPrefix no theoPlugin

#### Objective
Adicionar `envPrefix: 'THEO_PUBLIC_'` no Vite config retornado pelo theoPlugin.

#### Evidence
`vite-plugin/index.ts:28-38` — config() retorna apenas aliases. Sem envPrefix, Vite usa default `VITE_`.

#### Files to edit
```
packages/theo/src/vite-plugin/index.ts (EDIT) — Adicionar envPrefix no config()
tests/unit/env-vars.test.ts (NEW) — Testes de env vars
```

#### Deep file dependency analysis
- `vite-plugin/index.ts`: `config()` hook retorna Vite config parcial. Adicionar `envPrefix` não afeta outros campos. Downstream: dev server e build usam theoPlugin.
- Novo test file valida que o plugin retorna envPrefix correto.

#### Deep Dives
- **envPrefix**: Vite aceita `string | string[]`. Usar `'THEO_PUBLIC_'` como string única.
- **Backward compat**: Se user tinha `VITE_*` vars, elas param de funcionar no client. Isso é breaking se alguém usava. Porém, nenhuma fixture ou template usa `VITE_*`, e o framework está em alpha.
- **import.meta.env**: Em dev, Vite faz replacement dinâmico. Em build, replacement estático. `import.meta.env.THEO_PUBLIC_API_URL` funciona em ambos.

#### Tasks
1. Adicionar `envPrefix: 'THEO_PUBLIC_'` no objeto retornado por `config()`
2. Criar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_plugin_config_has_env_prefix() — Given theoPlugin, When calling config(), Then result has envPrefix 'THEO_PUBLIC_'
RED:     test_env_prefix_is_string() — Given theoPlugin config, When reading envPrefix, Then it is a string (not array)
RED:     test_plugin_preserves_aliases() — Given theoPlugin config, When reading resolve.alias, Then aliases still present alongside envPrefix
RED:     test_plugin_config_structure() — Given theoPlugin, When inspecting returned config, Then has envPrefix AND resolve.alias
GREEN:   Add envPrefix to config() return
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/env-vars.test.ts
```

BDD scenarios:
- **Happy path**: envPrefix é `'THEO_PUBLIC_'`
- **Validation error**: N/A (config is static)
- **Edge case**: envPrefix coexiste com aliases sem conflito
- **Error scenario**: N/A

#### Acceptance Criteria
- [ ] `theoPlugin().config()` retorna `{ envPrefix: 'THEO_PUBLIC_', resolve: { alias: [...] } }`
- [ ] Aliases SSR preservados
- [ ] Testes passam

#### DoD
- [ ] envPrefix configurado
- [ ] Testes GREEN

---

## Phase 1: Error Pages em Produção

**Objective:** Servir `500.html` custom em erros de server, e `404.html` para rotas estáticas inexistentes.

### T1.1 — Custom error pages no production server

#### Objective
O production server serve `404.html` e `500.html` do diretório build quando disponíveis.

#### Evidence
`cli/commands/start.ts:84-89` — SPA fallback sem error pages. Server crash retorna JSON genérico via `sendError`.

#### Files to edit
```
packages/theo/src/cli/commands/start.ts (EDIT) — Adicionar error page handling
tests/unit/error-pages.test.ts (NEW) — Testes de error pages
fixtures/production-build/public/404.html (NEW) — Fixture de 404 custom
fixtures/production-build/public/500.html (NEW) — Fixture de 500 custom
```

#### Deep file dependency analysis
- `start.ts`: Production server HTTP handler. O try/catch externo (linha 87-89) catch errors e chama `sendError`. Mudança: verificar se `500.html` existe e servir HTML em vez de JSON para erros não-API.
- `static.ts`: Já serve arquivos estáticos. `404.html` e `500.html` em `.theo/client/` são arquivos estáticos — mas precisam ser servidos com status correto (404/500, não 200).

#### Deep Dives
- **404 para rotas estáticas**: Se uma URL não é API, não é arquivo estático, e `404.html` existe em `.theo/client/`, servir com status 404. Se não existe, SPA fallback (comportamento atual).
- **500 para server errors**: No catch global, se `500.html` existe, servir HTML com status 500. Se não, `sendError` JSON (comportamento atual).
- **Build copia public/**: O Vite build já copia `public/` para `.theo/client/`. Então `public/404.html` vira `.theo/client/404.html` automaticamente.
- **API errors não mudam**: API routes continuam retornando JSON errors. Error pages HTML são apenas para non-API routes.

#### Tasks
1. No `start.ts`, após static file check e antes do SPA fallback, verificar se `404.html` existe
2. No catch global, verificar se `500.html` existe e servir HTML
3. Criar fixture HTML files
4. Criar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_500_html_served_on_server_error() — Given 500.html exists in clientDir, When server catches unhandled error on non-API route, Then serves 500.html with status 500
RED:     test_500_fallback_json_when_no_html() — Given no 500.html in clientDir, When server catches error, Then sendError JSON (backward compat)
RED:     test_404_html_served_when_exists() — Given 404.html exists in clientDir, When non-API non-static URL requested, Then serves 404.html with status 404
RED:     test_spa_fallback_when_no_404_html() — Given no 404.html in clientDir, When non-API URL, Then serves index.html with 200 (backward compat)
RED:     test_api_errors_unchanged() — Given API route not found, When request, Then JSON error (not HTML)
RED:     test_spa_route_not_served_404() — Given 404.html exists AND URL is /dashboard (no file extension), When request, Then serves index.html SPA fallback (not 404.html) (EC-2 SHOULD TEST)
GREEN:   Add error page handling to start.ts
REFACTOR: Extract error page helper if needed
VERIFY:  npx vitest run tests/unit/error-pages.test.ts
```

BDD scenarios:
- **Happy path**: `500.html` servido com status 500
- **Validation error**: N/A
- **Edge case**: Sem custom error pages → backward compat (SPA fallback / JSON)
- **Error scenario**: API errors continuam JSON (não HTML)

#### Acceptance Criteria
- [ ] `500.html` servido com status 500 em server crash (non-API)
- [ ] `404.html` servido com status 404 quando disponível
- [ ] Sem custom pages → SPA fallback (backward compat)
- [ ] API errors → JSON (não afetados)
- [ ] Testes passam

#### DoD
- [ ] Error pages funcionais
- [ ] Fixtures criadas
- [ ] Zero breaking change

---

## Phase 2: Rate Limiting

**Objective:** Rate limiter built-in, opt-in via config, aplicado em rotas API.

### T2.1 — Rate limiter core

#### Objective
Criar `createRateLimiter()` function e tipo `RateLimitConfig`.

#### Evidence
Nenhum rate limiting existe. API routes aceitam requests ilimitados.

#### Files to edit
```
packages/theo/src/server/rate-limit.ts (NEW) — Rate limiter module
tests/unit/rate-limit.test.ts (NEW) — Testes do rate limiter
```

#### Deep file dependency analysis
- Novo módulo. Exporta `createRateLimiter`, `RateLimitConfig`, `RateLimitResult`. Usado pelo api-middleware (dev) e start command (prod).
- Sem dependências internas. Usa apenas `node:http` types.

#### Deep Dives
- **Store**: `Map<string, { count: number; resetAt: number }>`. Key é IP (`req.socket.remoteAddress`).
- **Fixed window**: No primeiro request, cria entry com `resetAt = now + windowMs`. Requests subsequentes incrementam `count`. Quando `count > max`, retorna limited. Quando `now > resetAt`, reseta.
- **Headers**: `X-RateLimit-Limit` (max), `X-RateLimit-Remaining` (restante), `Retry-After` (seconds until reset) quando limitado.
- **Cleanup**: Cleanup periódico a cada 1000 checks — itera o Map e deleta entries com `resetAt < now`. Previne memory leak de IPs únicos que nunca retornam (EC-1 MUST FIX).
- **Return type**: Não faz `res.end()` diretamente. Retorna `{ limited: boolean; headers: Record<string, string> }`. O caller decide o que fazer.

#### Tasks
1. Criar `packages/theo/src/server/rate-limit.ts`
2. Implementar `createRateLimiter(config)`
3. Criar testes extensivos

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_allows_requests_under_limit() — Given max=3 windowMs=10000, When 3 requests, Then all return limited=false
RED:     test_blocks_after_limit() — Given max=3 windowMs=10000, When 4th request, Then returns limited=true
RED:     test_resets_after_window() — Given max=1 windowMs=100, When 1 request then wait 150ms then another, Then second is allowed
RED:     test_headers_include_limit() — Given max=5, When request, Then headers have X-RateLimit-Limit=5
RED:     test_headers_include_remaining() — Given max=5 after 2 requests, When checking headers, Then X-RateLimit-Remaining=3
RED:     test_headers_include_retry_after() — Given limited request, When checking headers, Then Retry-After is positive number
RED:     test_different_ips_tracked_separately() — Given 2 different IPs, When both make requests, Then limits are independent
RED:     test_unknown_ip_uses_fallback_key() — Given request without remoteAddress, When rate check, Then uses 'unknown' key
RED:     test_expired_entries_cleaned_up() — Given 1000+ checks with expired entries, When periodic cleanup runs, Then stale entries are removed from Map (EC-1 MUST FIX)
GREEN:   Implement createRateLimiter
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/rate-limit.test.ts
```

BDD scenarios:
- **Happy path**: Requests under limit are allowed with correct headers
- **Validation error**: N/A (config is static)
- **Edge case**: IP unknown → fallback key; window boundary (exact reset time)
- **Error scenario**: 4th request blocked with 429 headers

#### Acceptance Criteria
- [ ] `createRateLimiter({ windowMs, max })` retorna check function
- [ ] Check function retorna `{ limited, headers }`
- [ ] Headers corretos (Limit, Remaining, Retry-After)
- [ ] IPs separados
- [ ] Window reset funciona
- [ ] 8 testes passam

#### DoD
- [ ] Rate limiter implementado
- [ ] Testes GREEN

---

### T2.2 — Config schema e integração

#### Objective
Adicionar `rateLimit` ao config schema e integrar nos middlewares de API (dev + prod).

#### Evidence
Rate limiter precisa ser configurável via `theo.config.ts` e aplicado em ambos dev e prod servers.

#### Files to edit
```
packages/theo/src/config/schema.ts (EDIT) — Adicionar rateLimit ao schema
packages/theo/src/vite-plugin/api-middleware.ts (EDIT) — Aplicar rate limiter em dev
packages/theo/src/cli/commands/start.ts (EDIT) — Aplicar rate limiter em prod
packages/theo/src/server/index.ts (EDIT) — Exportar rate-limit types
tests/unit/config-schema.test.ts (EDIT) — Testar novo campo
```

#### Deep file dependency analysis
- `schema.ts`: Adiciona campo `rateLimit` opcional. Tipo: `{ windowMs: number, max: number }` ou `undefined`. Default: `undefined` (desabilitado).
- `api-middleware.ts`: Se config tem `rateLimit`, cria limiter e aplica antes de route matching.
- `start.ts`: Mesmo — aplica antes de route matching.
- `server/index.ts`: Re-exporta `createRateLimiter`, `RateLimitConfig`.

#### Deep Dives
- **Config field**: `z.object({ windowMs: z.number().min(1), max: z.number().int().min(1) }).optional()`
- **Dev integration**: `api-middleware.ts` precisa receber config. Atualmente recebe apenas `vite` e `serverDir`. Adicionar param `rateLimit?`.
- **Prod integration**: `start.ts` já carrega config. Criar limiter se config.rateLimit existe.
- **Onde aplicar**: ANTES de route matching, DEPOIS de requestId assignment. Rate limit headers são sempre enviados.

#### Tasks
1. Adicionar `rateLimit` ao `theoConfigSchema`
2. Atualizar `createApiMiddleware` para aceitar `rateLimit` param
3. Atualizar `start.ts` para criar e usar rate limiter
4. Exportar types de `theo/server`
5. Atualizar testes de config schema

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_config_accepts_rateLimit() — Given { rateLimit: { windowMs: 60000, max: 100 } }, When parse, Then success
RED:     test_config_rateLimit_optional() — Given {}, When parse, Then rateLimit is undefined
RED:     test_config_rejects_invalid_rateLimit() — Given { rateLimit: { windowMs: -1, max: 0 } }, When safeParse, Then fails
RED:     test_config_rateLimit_requires_both_fields() — Given { rateLimit: { windowMs: 1000 } }, When safeParse, Then fails (max missing)
RED:     test_rate_limit_exported_from_server() — Given imports from theo/server, When importing createRateLimiter, Then is a function
GREEN:   Update schema, middleware, start command, exports
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/config-schema.test.ts
```

BDD scenarios:
- **Happy path**: Config com rateLimit aceito e aplicado
- **Validation error**: rateLimit com valores inválidos rejeitado
- **Edge case**: rateLimit omitido → desabilitado (backward compat)
- **Error scenario**: windowMs negativo ou max=0 → Zod rejeita

#### Acceptance Criteria
- [ ] `theoConfigSchema` aceita `rateLimit` opcional
- [ ] Rate limiter aplicado em dev (api-middleware)
- [ ] Rate limiter aplicado em prod (start.ts)
- [ ] `createRateLimiter` exportado de `theo/server`
- [ ] Config sem rateLimit → zero overhead
- [ ] Testes passam

#### DoD
- [ ] Schema atualizado
- [ ] Integração dev + prod
- [ ] Exports wired
- [ ] Testes GREEN

---

## Phase 3: Regressão Completa

**Objective:** Garantir zero regressão e dogfood 100/100.

### T3.1 — Regressão

#### Objective
Rodar todos os testes e verificar zero regressão.

#### Evidence
Onda 12 modifica vite-plugin, start.ts, config schema, api-middleware — todos core.

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
RED:     test_all_tests() — Given all changes, When pnpm test, Then all pass
RED:     test_types() — Given all changes, When pnpm test:types, Then all pass
RED:     test_build() — Given all changes, When pnpm build, Then exit code 0
GREEN:   Already implemented — this verifies
REFACTOR: Fix regressions if found
VERIFY:  pnpm typecheck && pnpm test && pnpm test:types && pnpm build
```

BDD scenarios:
- **Happy path**: All pass
- **Validation error**: Regression → fix
- **Edge case**: New tests increase count
- **Error scenario**: Config schema change breaks existing tests → fix

#### Acceptance Criteria
- [ ] `pnpm typecheck` zero errors
- [ ] `pnpm test` all green
- [ ] `pnpm test:types` all green
- [ ] `pnpm build` exit code 0
- [ ] Zero `any`

#### DoD
- [ ] Zero regressão

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | THEO_PUBLIC_* env vars no client | T0.1 | envPrefix no theoPlugin config |
| 2 | Env vars privadas NÃO vazam | T0.1 | envPrefix filtra automaticamente |
| 3 | Custom 404 page em produção | T1.1 | public/404.html servido com status 404 |
| 4 | Custom 500 page em produção | T1.1 | public/500.html servido com status 500 |
| 5 | SPA fallback backward compat | T1.1 | Sem custom pages → SPA fallback mantido |
| 6 | Rate limiter bloqueia após N requests | T2.1 | createRateLimiter com fixed window |
| 7 | Rate limiter reseta após window | T2.1 | resetAt timestamp check |
| 8 | Rate limit headers | T2.1 | X-RateLimit-Limit, Remaining, Retry-After |
| 9 | Rate limit configurável via config | T2.2 | Campo rateLimit no theoConfigSchema |
| 10 | Rate limit opt-in (zero overhead default) | T2.2 | undefined por default |
| 11 | Rate limit em dev E prod | T2.2 | api-middleware + start.ts |
| 12 | Backward compatibility | T3.1 | Regressão completa |

**Coverage: 12/12 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-3)
- [ ] All tests passing (`pnpm test`)
- [ ] All type tests passing (`pnpm test:types`)
- [ ] All E2E tests passing (`pnpm test:e2e`)
- [ ] Zero TypeScript errors (`pnpm typecheck`)
- [ ] Zero `any` in production code
- [ ] `pnpm build` exit code 0
- [ ] `THEO_PUBLIC_*` env vars acessíveis no client
- [ ] `public/500.html` servido em server crash
- [ ] Rate limiter bloqueia após max requests
- [ ] Rate limiter opt-in (desabilitado por default)
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
