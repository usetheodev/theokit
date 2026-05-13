# Plan: Cross-Validation Reference Gaps — Theo vs Next.js vs Rails

> **Version 1.0** — Este plano corrige todos os gaps identificados na cross-validation do Theo contra as implementações de referência (Next.js e Rails). Os gaps vão de inconsistências com Web Standards no middleware até falta de route groups e global-error.tsx. O objetivo é elevar o Theo ao nível de qualidade e completude dos frameworks de referência, mantendo a simplicidade que é o diferencial do projeto.

## Context

A cross-validation de 2026-05-11 comparou o Theo framework contra Next.js (repositório em `referencias/next.js/`) e Rails (repositório em `referencias/rails/`). Foram identificados 12 gaps organizados em 3 prioridades:

**P0 (Crítico):**
1. Middleware usa `IncomingMessage`/`ServerResponse` (Node.js) em vez de `Request`/`Response` (Web Standards)
2. Type tests existem mas faltam para APIs novas (WebSocket, Channel, logger, middleware, session)

**P1 (Alto):**
3. CSRF usa header custom em vez de `Sec-Fetch-Site` (padrão moderno adotado pelo Rails 8)
4. `defineAction` não tem `output` schema (assimetria com `defineRoute`)
5. Logger e session não integrados automaticamente no context

**P2 (Médio):**
6. Sem route groups `(folder)` no frontend router
7. Sem `global-error.tsx` como fallback raiz
8. Sem route-level middleware (middleware seletivo por rota)
9. Sem named routes / URL helpers no backend
10. Sem adapter pattern para WebSocket broadcast (só in-memory)
11. Sem event system / notifications (pós-MVP, documentar decisão)
12. Fixtures de teste ausentes para features completas

**Estado atual:** O Theo já tem 71 arquivos de teste (unit + integration + e2e + smoke) e 6 type test files. O sistema de tipos end-to-end (Zod → defineRoute → typed client) é superior a ambas referências. O codebase é relativamente pequeno (~60 arquivos de source) o que facilita refactors.

## Objective

Corrigir todos os 12 gaps identificados, resultando em um framework que usa Web Standards no core, tem CSRF moderno, type safety completa com output schemas, context integrado, route groups, global-error, e fixtures de teste para cada feature.

**Métricas de sucesso:**
- Zero gaps P0 restantes
- Zero gaps P1 restantes
- P2 gaps resolvidos ou documentados como ADR
- 100% das APIs públicas com type tests
- Fixtures de teste para cada feature do framework
- Dogfood score >= 70

## ADRs

### D1 — Web Standards no defineMiddleware, manter Node APIs no server interno

**Decision:** `defineMiddleware` aceita `(request: Request, next) => Response` (Web Standards). Internamente, o server continua usando `IncomingMessage`/`ServerResponse` pois Vite `configureServer` exige isso. Uma bridge converte entre os dois.

**Rationale:** A regra `.claude/rules/architecture.md` exige "Node.js APIs only in adapter layer (use Web Standards in core)". Next.js usa Web APIs no middleware. Mudar o server interno inteiro seria disruptivo e Vite não suporta Web APIs nativamente.

**Consequences:** O `defineMiddleware` fica portável entre runtimes. O custo é uma conversão `IncomingMessage → Request → Response → ServerResponse` no middleware runner. Cookies, session e body-parser que operam no server interno continuam com Node APIs (isso é adapter layer).

### D2 — CSRF com Sec-Fetch-Site como defesa primária, header custom como fallback

**Decision:** Adicionar verificação de `Sec-Fetch-Site` como defesa primária. Manter `X-Theo-Action` como fallback para clientes programáticos.

**Rationale:** Rails 8 migrou para `Sec-Fetch-Site` como defesa principal (ver `referencias/rails/actionpack/lib/action_controller/metal/request_forgery_protection.rb`). É um header do browser que não pode ser forjado por requisições cross-origin. O header custom continua necessário para chamadas de API (fetch/curl).

**Consequences:** Segurança mais robusta sem exigir token stateful. Browsers modernos são protegidos automaticamente. Clientes programáticos usam o header custom.

### D3 — Output schema em defineAction via campo `output` opcional

**Decision:** Adicionar campo `output` opcional ao `ActionConfig` com Zod schema. Não validar runtime (output é do server), usar apenas para inferência de tipos no client.

**Rationale:** `defineRoute` já tem tipagem de response via `TResponse`. Actions têm só `input`. Para type safety end-to-end, o client precisa saber o tipo do retorno. Validar output em runtime seria overhead desnecessário (output é trustworthy).

**Consequences:** O typed client pode inferir o tipo de retorno das actions. OpenAPI generation pode documentar responses. Zero overhead em runtime.

### D4 — Route groups com sintaxe `(folder)` ignorados no path

**Decision:** Diretórios com nome entre parênteses `(marketing)`, `(auth)` são tratados como route groups: organizam arquivos mas não adicionam segmento ao path.

**Rationale:** Padrão do Next.js App Router. Permite organizar rotas por domínio sem afetar URLs.

**Consequences:** O scanner de rotas precisa detectar e "pular" segmentos entre parênteses. Layouts dentro de groups se aplicam apenas àquele grupo.

### D5 — global-error.tsx como fallback de último recurso

**Decision:** Adicionar suporte a `app/global-error.tsx` que captura erros no root layout.

**Rationale:** Next.js tem `global-error.tsx` porque `error.tsx` na raiz não captura erros do root layout (pois o error boundary fica dentro do layout). Sem global-error, um crash no root layout resulta em tela branca.

**Consequences:** Mais resiliência em produção. Requer mudança no entry client e no route manifest generator.

### D6 — Context factory integra logger e session automaticamente

**Decision:** Quando `server/context.ts` exporta `createContext`, o framework injeta logger (child com requestId) e session manager automaticamente no contexto base, antes de chamar `createContext`.

**Rationale:** Rails injeta `session`, `logger`, `request` automaticamente. Exigir setup manual é friction desnecessário e leva a inconsistências.

**Consequences:** `createContext` recebe `{ request, response, logger, session }` como argumento. O tipo base é exportado para que o user possa extender.

### D7 — Route-level middleware via export `middleware` em route files

**Decision:** Server route files podem exportar `middleware` como array de middleware handlers que rodam ANTES do handler daquela rota.

**Rationale:** Rails tem `before_action only:`, Next.js tem `matcher`. Middleware global é insuficiente para auth per-route ou rate-limit per-route.

**Consequences:** Permite auth granular. Middleware de rota roda DEPOIS do middleware global e ANTES do handler.

### D8 — Event system é POST-MVP (não implementar agora)

**Decision:** Não implementar event system / notification system nesta onda.

**Rationale:** Rails `ActiveSupport::Notifications` é poderoso mas o Theo ainda não tem complexidade que justifique. YAGNI. O logger structured já cobre observability básica.

**Consequences:** Documentar como gap aceito. Revisitar quando houver 3+ casos de uso concretos.

## Dependency Graph

```
Phase 0 (Web Standards Middleware) ──▶ Phase 1 (CSRF Moderno) ──▶ Phase 2 (Context Integrado)
                                                                          │
Phase 3 (Output Schema Actions) ────────────────────────────────────────▶ │
                                                                          │
Phase 4 (Route Groups + Global Error) ──────────────────────────────────▶ │
                                                                          │
Phase 5 (Route-Level Middleware) ───────────────────────────────────────▶ │
                                                                          │
                                                                          ▼
                                                                   Phase 6 (Type Tests Completos)
                                                                          │
                                                                          ▼
                                                                   Phase 7 (Fixtures de Teste)
                                                                          │
                                                                          ▼
                                                                   Phase 8 (Dogfood QA)
```

- **Phase 0** é bloqueante para Phase 1 (CSRF depende do novo Request)
- **Phase 1** é bloqueante para Phase 2 (context usa middleware)
- **Phases 3, 4, 5** podem rodar em paralelo entre si, mas precisam do Phase 2
- **Phase 6** precisa de todas as features implementadas (3, 4, 5)
- **Phase 7** precisa dos type tests (Phase 6)
- **Phase 8** é o gate final

---

## Phase 0: Web Standards no defineMiddleware

**Objective:** Migrar `defineMiddleware` para aceitar `Request`/`Response` (Web Standards) em vez de `IncomingMessage`/`ServerResponse`, com bridge de conversão no middleware runner.

### T0.1 — Bridge de conversão IncomingMessage ↔ Request

#### Objective
Criar funções utilitárias que convertem entre Node.js HTTP e Web Standard Request/Response.

#### Evidence
A regra `.claude/rules/architecture.md` proíbe Node APIs fora do adapter layer. O `defineMiddleware` atual em `packages/theo/src/server/define-middleware.ts:1-4` recebe `(request: Request, next)` na assinatura mas o `middleware-runner.ts:39` passa `(req, res, next)` que são `IncomingMessage`/`ServerResponse`. Há inconsistência: o tipo diz Web Standard mas a implementação passa Node.

#### Files to edit
```
packages/theo/src/server/web-bridge.ts — (NEW) funções toWebRequest e fromWebResponse
packages/theo/src/server/index.ts — exportar web-bridge
```

#### Deep file dependency analysis
- `web-bridge.ts` (NEW): Módulo novo, sem dependentes iniciais. Será usado por `middleware-runner.ts`.
- `server/index.ts`: Já exporta tudo do server. Adicionar exports da bridge.

#### Deep Dives
**toWebRequest(req: IncomingMessage):**
- Lê `req.url`, `req.method`, `req.headers` para construir `new Request(url, { method, headers, body })`
- Body: para métodos com body (POST/PUT/PATCH), usa `ReadableStream` wrapping do `IncomingMessage`
- Headers: converte de `IncomingHttpHeaders` para `Headers`
- URL: constrói URL completa com `http://${req.headers.host}${req.url}`

**fromWebResponse(webRes: Response, nodeRes: ServerResponse):**
- Copia status, headers e body do `Response` para o `ServerResponse`
- Body: usa `webRes.body` (ReadableStream) e pipe para `nodeRes`
- Headers: itera `webRes.headers.entries()` e seta no `nodeRes`

**Invariantes:**
- `toWebRequest` DEVE bufferizar o body inteiro do IncomingMessage uma vez. O buffer é usado para criar o `Request` e também disponibilizado para `parseRequestBody` downstream (via `(req as any)._theoBody = buffer`). Isso evita o bug de body consumido duas vezes quando middleware lê o body e depois o handler tenta ler de novo (EC-1).
- `fromWebResponse` DEVE copiar TODOS os headers, incluindo Set-Cookie múltiplos

#### Tasks
1. Criar `packages/theo/src/server/web-bridge.ts`
2. Implementar `toWebRequest(req: IncomingMessage): Request`
3. Implementar `fromWebResponse(webRes: Response, nodeRes: ServerResponse): Promise<void>`
4. Exportar em `server/index.ts`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_toWebRequest_converts_get_request() — Given GET /api/users with host header, When toWebRequest(), Then Request has correct URL, method GET, no body
RED:     test_toWebRequest_converts_post_with_body() — Given POST /api/users with JSON body, When toWebRequest(), Then Request has body readable as JSON
RED:     test_toWebRequest_copies_all_headers() — Given request with custom headers, When toWebRequest(), Then all headers present in Request
RED:     test_toWebRequest_handles_missing_host() — Given request without host header, When toWebRequest(), Then uses localhost fallback
RED:     test_fromWebResponse_copies_status() — Given Response(null, { status: 201 }), When fromWebResponse(), Then nodeRes.statusCode = 201
RED:     test_fromWebResponse_copies_headers() — Given Response with Content-Type and custom headers, When fromWebResponse(), Then all headers set on nodeRes
RED:     test_fromWebResponse_streams_body() — Given Response with JSON body, When fromWebResponse(), Then nodeRes receives the body
RED:     test_fromWebResponse_handles_empty_body() — Given Response(null, { status: 204 }), When fromWebResponse(), Then nodeRes.end() called without body
RED:     test_toWebRequest_body_not_consumed_twice() — Given POST with JSON body, When toWebRequest() called and body read, Then original IncomingMessage body still accessible via _theoBody (EC-1)
GREEN:   Implement minimal web-bridge.ts
REFACTOR: Extract common header conversion logic
VERIFY:  npx vitest run tests/unit/web-bridge.test.ts
```

#### Acceptance Criteria
- [ ] `toWebRequest` converte GET, POST, PUT, PATCH, DELETE corretamente
- [ ] `fromWebResponse` copia status, headers e body
- [ ] Headers múltiplos (Set-Cookie) preservados
- [ ] Body não consumido prematuramente
- [ ] Pass: `tsc --noEmit`
- [ ] Pass: `eslint`
- [ ] Pass: `vitest`

#### DoD
- [ ] Todas as tasks completadas
- [ ] Todos os testes passando
- [ ] Zero erros TypeScript
- [ ] Zero warnings de lint

---

### T0.2 — Migrar defineMiddleware para Web Standards

#### Objective
Alterar a assinatura de `defineMiddleware` para usar `Request`/`Response` e atualizar o middleware runner para usar a bridge.

#### Evidence
`define-middleware.ts` atualmente define `MiddlewareHandler` como `(request: Request, next: (request: Request) => Promise<Response>) => Response | Promise<Response>` — a interface JÁ usa Web Standards. Porém `middleware-runner.ts:39` passa `(req, res, next)` com tipos Node. A incompatibilidade é no runner, não na definição.

#### Files to edit
```
packages/theo/src/server/middleware-runner.ts — usar bridge para converter req/res antes de chamar middleware
packages/theo/src/server/define-middleware.ts — confirmar que usa Web Standards (já está correto)
packages/theo/src/cli/commands/start.ts — verificar que chamadas a runMiddlewareAndContext continuam funcionando (EC-2)
tests/unit/middleware-composable.test.ts — atualizar testes para Web Standard interface
```

#### Deep file dependency analysis
- `define-middleware.ts`: Interface já correta. Não precisa mudar.
- `middleware-runner.ts`: Linhas 33-44 passam `req` (IncomingMessage) direto para middleware. Precisa converter via `toWebRequest`. O `next()` callback precisa ser alterado: atualmente `async () => { nextCalled = true }`, precisa retornar `Promise<Response>`. Se o middleware retorna um `Response`, precisa converter de volta via `fromWebResponse`.
- `middleware-composable.test.ts`: Dependente direto. Testes existentes usam mock de `IncomingMessage`.
- `cli/commands/start.ts`: Servidor de produção. Chama `runMiddlewareAndContext` nas linhas 131 e 164. A interface externa de `runMiddlewareAndContext` NÃO muda (continua recebendo IncomingMessage/ServerResponse) — a bridge é interna. Mas DEVE ser verificado com teste de integração (EC-2).

#### Deep Dives
**Novo fluxo do middleware runner:**
1. Converte `IncomingMessage` → `Request` via `toWebRequest`
2. Para cada middleware: chama `mw(webRequest, next)`
3. `next` retorna `Promise<Response>` que representa "o resto do pipeline"
4. Se middleware retorna `Response` diferente, converte via `fromWebResponse`
5. Se middleware chama `next()` sem modificar, pipeline continua

**Edge cases:**
- Middleware que modifica headers na request: precisa propagar para a próxima Request
- Middleware que short-circuits (retorna Response sem chamar next): aborted = true
- Middleware directory: ordem alfabética, cada um recebe o resultado do anterior

#### Tasks
1. Atualizar `middleware-runner.ts` para usar `toWebRequest` antes de chamar middlewares
2. Atualizar callback `next` para retornar `Promise<Response>`
3. Converter `Response` de volta para `ServerResponse` quando middleware retorna
4. Atualizar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_middleware_receives_web_request() — Given middleware.ts, When request arrives, Then middleware receives Request (not IncomingMessage)
RED:     test_middleware_next_returns_response() — Given middleware calling next(), When next() resolves, Then returns Response object
RED:     test_middleware_can_return_custom_response() — Given middleware returning new Response('blocked', { status: 403 }), When request arrives, Then client receives 403
RED:     test_middleware_short_circuit() — Given middleware not calling next(), When request arrives, Then pipeline aborts and response is sent
RED:     test_middleware_modifies_headers() — Given middleware adding X-Custom header to response, When request arrives, Then response has X-Custom header
RED:     test_middleware_directory_order() — Given middleware/ dir with 01-auth.ts and 02-log.ts, When request arrives, Then auth runs before log
RED:     test_middleware_error_propagates() — Given middleware throwing Error, When request arrives, Then error is caught and 500 returned
GREEN:   Implement middleware runner with web bridge
REFACTOR: Simplify response chaining
VERIFY:  npx vitest run tests/unit/middleware-composable.test.ts
```

#### Acceptance Criteria
- [ ] Middlewares recebem `Request` e retornam `Response`
- [ ] `next()` retorna `Promise<Response>`
- [ ] Short-circuit funciona (não chamar next = abortar)
- [ ] Headers modificados por middleware propagam
- [ ] Backward compat: middleware antigo que usa req/res detectado com warning
- [ ] Pass: `tsc --noEmit`
- [ ] Pass: `eslint`
- [ ] Pass: `vitest`

#### DoD
- [ ] Todos os testes passando
- [ ] Zero TypeScript errors
- [ ] Zero lint warnings
- [ ] Integration tests existentes continuam passando

---

## Phase 1: CSRF Moderno com Sec-Fetch-Site

**Objective:** Adicionar `Sec-Fetch-Site` como defesa primária de CSRF, mantendo o header custom como fallback.

### T1.1 — Implementar verificação Sec-Fetch-Site

#### Objective
Atualizar `csrf.ts` para verificar `Sec-Fetch-Site` header como defesa primária conforme Rails 8.

#### Evidence
Rails 8 (`referencias/rails/actionpack/lib/action_controller/metal/request_forgery_protection.rb`) usa `Sec-Fetch-Site` como mecanismo primário. O header é setado pelo browser e não pode ser forjado por cross-origin requests. Valores: `same-origin`, `same-site`, `cross-site`, `none`.

#### Files to edit
```
packages/theo/src/server/csrf.ts — adicionar check de Sec-Fetch-Site antes do header custom
tests/unit/csrf.test.ts — adicionar cenários de Sec-Fetch-Site
```

#### Deep file dependency analysis
- `csrf.ts`: Função `validateCsrf(req)` usada por `action-execute.ts:27`. Mudança é interna — interface permanece `{ valid: boolean; reason?: string }`.
- `csrf.test.ts`: Testes existentes cobrem header custom e origin matching. Precisam de cenários novos.
- `action-execute.ts`: Não precisa mudar — já chama `validateCsrf()`.

#### Deep Dives
**Novo fluxo de validação CSRF:**
1. Se `Sec-Fetch-Site` presente:
   - `same-origin` → válido
   - `same-site` → válido
   - `none` → válido (navegação direta)
   - `cross-site` → **inválido** (CSRF attempt)
2. Se `Sec-Fetch-Site` ausente (browser antigo ou programático):
   - Fallback para `X-Theo-Action` header check (existente)
   - Se nem Sec-Fetch-Site nem X-Theo-Action → **inválido**

**Edge cases:**
- Browsers antigos (IE): não enviam Sec-Fetch-Site → fallback funciona
- curl/Postman: não enviam Sec-Fetch-Site → precisa do X-Theo-Action
- Proxy que strip headers: fallback para X-Theo-Action

#### Tasks
1. Adicionar check de `Sec-Fetch-Site` como primeiro passo em `validateCsrf`
2. Manter fallback para `X-Theo-Action`
3. Atualizar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_csrf_valid_same_origin() — Given Sec-Fetch-Site: same-origin, When validateCsrf(), Then valid
RED:     test_csrf_valid_same_site() — Given Sec-Fetch-Site: same-site, When validateCsrf(), Then valid
RED:     test_csrf_valid_none() — Given Sec-Fetch-Site: none, When validateCsrf(), Then valid
RED:     test_csrf_invalid_cross_site() — Given Sec-Fetch-Site: cross-site, When validateCsrf(), Then invalid with reason
RED:     test_csrf_fallback_to_custom_header() — Given no Sec-Fetch-Site but X-Theo-Action: 1, When validateCsrf(), Then valid
RED:     test_csrf_both_absent_invalid() — Given neither Sec-Fetch-Site nor X-Theo-Action, When validateCsrf(), Then invalid
RED:     test_csrf_cross_site_ignores_custom_header() — Given Sec-Fetch-Site: cross-site AND X-Theo-Action: 1, When validateCsrf(), Then invalid (Sec-Fetch-Site wins)
GREEN:   Implement Sec-Fetch-Site check
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/csrf.test.ts
```

#### Acceptance Criteria
- [ ] `Sec-Fetch-Site: same-origin` passa
- [ ] `Sec-Fetch-Site: cross-site` falha
- [ ] Fallback para `X-Theo-Action` quando Sec-Fetch-Site ausente
- [ ] `Sec-Fetch-Site: cross-site` rejeita MESMO com `X-Theo-Action` presente
- [ ] Pass: `tsc --noEmit`
- [ ] Pass: `eslint`
- [ ] Pass: `vitest`

#### DoD
- [ ] Todos os testes passando
- [ ] Zero TypeScript errors
- [ ] Zero lint warnings

---

## Phase 2: Context Integrado com Logger e Session

**Objective:** Integrar logger (child com requestId) e session manager automaticamente no contexto base que `createContext` recebe.

### T2.1 — Tipo base de context e injeção automática

#### Objective
Definir `TheoBaseContext` com logger e session, e injetar automaticamente no middleware runner antes de chamar `createContext`.

#### Evidence
Rails injeta `session`, `logger`, `request` automaticamente em todo controller. No Theo atual, `middleware-runner.ts:63-69` chama `createContext({ request, response })` mas não injeta logger nem session. O user precisa configurar manualmente — friction desnecessário.

#### Files to edit
```
packages/theo/src/server/context.ts — (NEW) definir TheoBaseContext e createBaseContext
packages/theo/src/server/middleware-runner.ts — injetar base context antes de chamar createContext
packages/theo/src/server/index.ts — exportar TheoBaseContext e createBaseContext
```

#### Deep file dependency analysis
- `context.ts` (NEW): Define o tipo base. Será importado pelo middleware-runner e exportado publicamente.
- `middleware-runner.ts`: Linhas 63-69 criam context. Precisa chamar `createBaseContext()` antes e passar como argumento para `createContext`.
- `server/index.ts`: Adicionar exports.
- Downstream: `execute.ts:99` e `action-execute.ts:37` recebem `ctx` — não precisam mudar (context é opaco).

#### Deep Dives
**TheoBaseContext:**
```typescript
interface TheoBaseContext {
  request: IncomingMessage
  response: ServerResponse
  requestId: string
  logger: TheoLogger  // child com requestId
}
```

**createBaseContext:**
- Gera `requestId` (UUID)
- Cria child logger com `{ requestId }`
- Retorna `TheoBaseContext`

**Fluxo atualizado de middleware-runner:**
1. `createBaseContext(req, res)` → `baseCtx`
2. Se `server/context.ts` existe: `ctx = await createContext(baseCtx)` — user EXTENDE o baseCtx
3. Se não existe: `ctx = baseCtx`

**Edge cases:**
- User não tem `server/context.ts` → usa base context (logger + requestId grátis)
- User tem `context.ts` mas não usa os campos base → funciona, campos ficam disponíveis mas ignorados
- Session: só injeta se `THEO_SESSION_SECRET` env var existe (não força setup)

#### Tasks
1. Criar `packages/theo/src/server/context.ts` com `TheoBaseContext` e `createBaseContext`
2. Atualizar `middleware-runner.ts` para injetar base context
3. Exportar tipos em `server/index.ts`
4. Atualizar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_base_context_has_request_id() — Given any request, When context created, Then ctx.requestId is UUID
RED:     test_base_context_has_logger() — Given any request, When context created, Then ctx.logger is TheoLogger with requestId
RED:     test_base_context_without_user_context() — Given no server/context.ts, When request arrives, Then ctx has base fields
RED:     test_base_context_with_user_context() — Given server/context.ts exporting createContext, When request arrives, Then user context merged with base
RED:     test_base_context_logger_child() — Given base context, When ctx.logger.info('test'), Then log includes requestId
RED:     test_base_context_missing_session_secret() — Given no THEO_SESSION_SECRET, When context created, Then ctx has no session (no crash)
GREEN:   Implement context.ts and update middleware-runner
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/context-extensible.test.ts tests/unit/middleware-composable.test.ts
```

#### Acceptance Criteria
- [ ] Base context sempre tem `requestId` e `logger`
- [ ] Logger é child com requestId no contexto
- [ ] User `createContext` recebe base context como argumento
- [ ] Funciona sem `server/context.ts`
- [ ] Pass: `tsc --noEmit`
- [ ] Pass: `eslint`
- [ ] Pass: `vitest`

#### DoD
- [ ] Todos os testes passando
- [ ] Zero TypeScript errors
- [ ] Zero lint warnings
- [ ] Integration tests existentes continuam passando

---

## Phase 3: Output Schema em defineAction

**Objective:** Adicionar campo `output` opcional ao `defineAction` para type safety end-to-end em actions.

### T3.1 — Adicionar output schema ao ActionConfig

#### Objective
Extender `defineAction` com campo `output` Zod opcional, e ajustar o typed client para inferir o tipo de retorno.

#### Evidence
`defineRoute` em `define-route.ts:8` tem `TResponse` genérico. `defineAction` em `define-action.ts:3-6` tem `handler` retornando `unknown`. O typed client (`theo-fetch.ts`) não consegue inferir o tipo de retorno de actions.

#### Files to edit
```
packages/theo/src/server/define-action.ts — adicionar campo output ao ActionConfig
packages/theo/src/client/theo-fetch.ts — adicionar InferActionOutput type utility
packages/theo/src/client/index.ts — exportar InferActionOutput
```

#### Deep file dependency analysis
- `define-action.ts`: `ActionConfig` ganha `output?: TOutput`. `handler` return type muda de `unknown` para `z.infer<TOutput> | unknown`.
- `theo-fetch.ts`: Adicionar `InferActionOutput<T>` similar a `InferResponse<T>`.
- `client/index.ts`: Exportar novo tipo.
- `action-execute.ts`: Não muda — não valida output em runtime (D3).

#### Deep Dives
**Nova interface ActionConfig:**
```typescript
interface ActionConfig<
  TInput extends z.ZodType,
  TOutput extends z.ZodType = z.ZodUnknown,
  TCtx = unknown,
> {
  input: TInput
  output?: TOutput
  handler: (ctx: { input: z.infer<TInput>; ctx: TCtx }) => z.infer<TOutput> | Promise<z.infer<TOutput>>
}
```

**Invariantes:**
- `output` é opcional — backward compatible
- Sem validação runtime do output (overhead desnecessário, D3)
- Tipo inferido: se `output` presente, `InferActionOutput<T>` resolve para `z.infer<output>`; senão, `unknown`

#### Tasks
1. Atualizar `ActionConfig` com genérico `TOutput`
2. Atualizar `defineAction` para aceitar e propagar `TOutput`
3. Criar `InferActionOutput` em `theo-fetch.ts`
4. Exportar em `client/index.ts`
5. Atualizar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_define_action_with_output() — Given defineAction with output: z.object({ id: z.string() }), When handler returns { id: '1' }, Then compiles
RED:     test_define_action_without_output() — Given defineAction without output, When handler returns anything, Then compiles (backward compat)
RED:     test_define_action_output_type_mismatch() — Given output: z.object({ id: z.string() }), When handler returns { name: 'x' }, Then type error
RED:     test_infer_action_output() — Given action with output schema, When InferActionOutput<typeof action>, Then type matches output schema
RED:     test_infer_action_output_unknown() — Given action without output, When InferActionOutput<typeof action>, Then type is unknown
GREEN:   Implement output in ActionConfig
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/define-action.test.ts && npx vitest typecheck tests/type/define-action.test-d.ts
```

#### Acceptance Criteria
- [ ] `defineAction` aceita `output` Zod schema
- [ ] Handler return type inferido do output schema
- [ ] Backward compatible (output é opcional)
- [ ] `InferActionOutput` resolve corretamente
- [ ] Pass: `tsc --noEmit`
- [ ] Pass: `eslint`
- [ ] Pass: `vitest`
- [ ] Pass: type tests

#### DoD
- [ ] Todos os testes passando (unit + type)
- [ ] Zero TypeScript errors
- [ ] Zero lint warnings

---

## Phase 4: Route Groups e Global Error

**Objective:** Adicionar suporte a route groups `(folder)` e `global-error.tsx` no frontend router.

### T4.1 — Route groups `(folder)` no scanner

#### Objective
Alterar o scanner de rotas para tratar diretórios entre parênteses como groups (sem adicionar segmento ao path).

#### Evidence
Next.js App Router trata `app/(marketing)/about/page.tsx` como URL `/about` (não `/(marketing)/about`). O scanner atual em `router/scan.ts:44-45` usa `entry.name` como path segment para todos os diretórios.

#### Files to edit
```
packages/theo/src/router/scan.ts — detectar (folder) e pular segmento
packages/theo/src/router/types.ts — adicionar isGroup ao RouteNode (opcional)
```

#### Deep file dependency analysis
- `scan.ts`: Função `scanDir` linha 44: `const childPath = routePath === '/' ? \`/${entry.name}\` : \`${routePath}/${entry.name}\``. Para groups, `childPath` deve ser `routePath` (sem adicionar segmento).
- `types.ts`: `RouteNode` pode ganhar campo `isGroup?: boolean` para downstream saber que é grupo.
- `generate.ts`: Usa `node.segment` para gerar path. Se `segment` é vazio (group), gera rota sem path (pathless route wrapper).

#### Deep Dives
**Detecção de group:** `entry.name.startsWith('(') && entry.name.endsWith(')')`

**Comportamento:**
- Group NÃO adiciona segmento ao URL
- Group PODE ter layout (aplica apenas aos filhos do group)
- Group PODE ter error, loading, not-found (escoped ao group)
- Dois groups podem ter pages com mesmo path → **conflito detectável**

**Edge cases:**
- `(auth)/login/page.tsx` e `(public)/login/page.tsx` → conflito de path `/login`
- Group vazio (sem pages) → prunado (como qualquer dir vazio)
- Group aninhado `(a)/(b)/page.tsx` → ambos ignorados no path
- Conflito entre groups para QUALQUER route file (page, layout, error, loading), não só pages — dois groups produzindo o mesmo path com layout diferente é igualmente inválido (EC-3)

#### Tasks
1. Atualizar `scanDir` em `scan.ts` para detectar `(folder)` e não adicionar ao path
2. Atualizar `generateRouteManifest` em `generate.ts` para tratar nodes sem segment
3. Adicionar detecção de conflito de path entre groups
4. Atualizar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_route_group_ignored_in_path() — Given app/(marketing)/about/page.tsx, When scanRoutes(), Then path is '/about'
RED:     test_route_group_layout_scoped() — Given app/(auth)/layout.tsx with login/page.tsx, When scanRoutes(), Then layout wraps only auth group pages
RED:     test_route_group_preserves_root_path() — Given app/(main)/page.tsx, When scanRoutes(), Then path is '/'
RED:     test_route_group_nested() — Given app/(a)/(b)/page.tsx, When scanRoutes(), Then path is '/'
RED:     test_route_group_empty_pruned() — Given app/(empty)/ with no pages, When scanRoutes(), Then no node created
RED:     test_route_group_conflict_detected_pages() — Given app/(a)/about/page.tsx and app/(b)/about/page.tsx, When scanRoutes(), Then error about conflicting paths
RED:     test_route_group_conflict_detected_layouts() — Given app/(a)/about/layout.tsx and app/(b)/about/layout.tsx, When scanRoutes(), Then error about conflicting layouts (EC-3)
RED:     test_route_group_with_error() — Given app/(auth)/error.tsx, When scanRoutes(), Then error boundary scoped to group
GREEN:   Implement group detection in scanner
REFACTOR: Extract group detection into isRouteGroup() helper
VERIFY:  npx vitest run tests/unit/router-scan.test.ts tests/unit/router-generate.test.ts
```

#### Acceptance Criteria
- [ ] `(folder)` não gera segmento no URL
- [ ] Layout em group é scoped aos filhos do group
- [ ] Conflitos entre groups detectados com erro claro
- [ ] Groups vazios são prunados
- [ ] Pass: `tsc --noEmit`
- [ ] Pass: `eslint`
- [ ] Pass: `vitest`

#### DoD
- [ ] Todos os testes passando
- [ ] Zero TypeScript errors
- [ ] Zero lint warnings

---

### T4.2 — global-error.tsx como fallback raiz

#### Objective
Adicionar suporte a `app/global-error.tsx` que captura erros no root layout (caso impossível de capturar com `error.tsx` normal).

#### Evidence
Next.js tem `global-error.tsx` porque `error.tsx` na raiz fica DENTRO do root layout — se o layout crashar, o error boundary não funciona. O scanner em `router/types.ts` define `ROUTE_FILE_NAMES` que não inclui `global-error`.

#### Files to edit
```
packages/theo/src/router/types.ts — adicionar 'global-error' a ROUTE_FILE_NAMES
packages/theo/src/router/scan.ts — scanner pega global-error na raiz
packages/theo/src/router/generate.ts — gerar wrapper com ErrorBoundary global
packages/theo/src/router/entry.ts — importar global error no entry client
```

#### Deep file dependency analysis
- `types.ts`: `ROUTE_FILE_NAMES` é array constante usado pelo scanner. `RouteNode` precisa de campo `globalError?: string`.
- `scan.ts`: `scanDir` já itera `ROUTE_FILE_NAMES`. Precisa de tratamento especial: `global-error` só válido na raiz.
- `generate.ts`: `generateRouteManifest` precisa envolver todo o route tree num ErrorBoundary global se presente.
- `entry.ts`: O entry client precisa importar e usar o global error.

#### Deep Dives
**Comportamento:**
- `global-error.tsx` exporta `default` component
- Só válido na raiz (`app/global-error.tsx`), ignorado em subdiretórios
- Envolve o root layout inteiro (inclusive o próprio layout)
- Em dev: mostra o error overlay do Vite (não bloqueia)
- Props: `{ error: Error, reset: () => void }` (mesmo contrato do `error.tsx`)

**Edge cases:**
- `global-error.tsx` em subdiretório → ignorado com warning
- Sem root layout + sem global-error → funciona como hoje
- Error no global-error → fallback do browser (não há mais nada acima)

#### Tasks
1. Adicionar `'global-error'` ao `ROUTE_FILE_NAMES` e campo no `RouteNode`
2. Atualizar scanner para capturar `global-error` apenas na raiz
3. Atualizar `generateRouteManifest` para envolver route tree em ErrorBoundary global
4. Atualizar `generateEntryClient` para suportar global error
5. Atualizar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_global_error_scanned_at_root() — Given app/global-error.tsx, When scanRoutes(), Then root node has globalError set
RED:     test_global_error_ignored_in_subdir() — Given app/about/global-error.tsx, When scanRoutes(), Then about node does NOT have globalError
RED:     test_global_error_wraps_root_layout() — Given app/global-error.tsx, When generateRouteManifest(), Then output has ErrorBoundary wrapping entire tree
RED:     test_global_error_absent() — Given no global-error.tsx, When generateRouteManifest(), Then no global ErrorBoundary
RED:     test_global_error_file_detection() — Given global-error.tsx, When isRouteFile('global-error.tsx'), Then true
GREEN:   Implement global-error support
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/router-scan.test.ts tests/unit/router-generate.test.ts tests/unit/router-types.test.ts
```

#### Acceptance Criteria
- [ ] `global-error.tsx` detectado na raiz
- [ ] Ignorado em subdiretórios
- [ ] Route manifest envolve tree em ErrorBoundary quando presente
- [ ] Pass: `tsc --noEmit`
- [ ] Pass: `eslint`
- [ ] Pass: `vitest`

#### DoD
- [ ] Todos os testes passando
- [ ] Zero TypeScript errors
- [ ] Zero lint warnings

---

## Phase 5: Route-Level Middleware

**Objective:** Permitir que server route files exportem `middleware` para execução antes do handler daquela rota.

### T5.1 — Suporte a middleware export em route files

#### Objective
Detectar e executar `export const middleware` em arquivos de server routes, rodando depois do middleware global e antes do handler.

#### Evidence
Rails tem `before_action only: [:show, :edit]`. Next.js tem `matcher` config. O Theo atual só tem middleware global. Auth per-route requer que o user crie verificações manuais no handler — friction.

#### Files to edit
```
packages/theo/src/server/execute.ts — verificar e rodar middleware de rota antes do handler
```

#### Deep file dependency analysis
- `execute.ts`: `executeRoute` (linhas 83-204) já carrega o módulo da rota com `loadModule(route.filePath)`. Pode verificar `mod.middleware` como array de handlers. Roda DEPOIS de `runMiddlewareAndContext` e ANTES do handler.
- Downstream: `api-middleware.ts` chama `executeRoute` — não precisa mudar.

#### Deep Dives
**Convenção:**
```typescript
// server/routes/admin/users.ts
import { defineRoute, defineMiddleware } from 'theokit/server'

export const middleware = [
  defineMiddleware(async (request, next) => {
    // auth check
    if (!isAdmin(request)) return new Response('Forbidden', { status: 403 })
    return next(request)
  })
]

export const GET = defineRoute({
  handler: () => ({ users: [] })
})
```

**Fluxo:**
1. Middleware global roda (pipeline existente)
2. Route module carregado
3. Se `mod.middleware` existe e é array: roda cada middleware na ordem
4. Se qualquer route middleware retorna Response sem chamar next → aborta
5. Handler roda

**Edge cases:**
- `middleware` não é array → ignorado com warning
- `middleware` é array vazio → noop
- Route middleware usa Web Standards (Request/Response) igual defineMiddleware

#### Tasks
1. Em `executeRoute`, após carregar módulo, verificar `mod.middleware`
2. Se presente, executar cada middleware (usando bridge Web Standards)
3. Se middleware aborta, retornar response sem chamar handler
4. Atualizar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_route_middleware_runs_before_handler() — Given route with middleware export, When request arrives, Then middleware runs before handler
RED:     test_route_middleware_can_block() — Given route middleware returning 403, When request arrives, Then 403 returned, handler NOT called
RED:     test_route_middleware_passes_through() — Given route middleware calling next(), When request arrives, Then handler runs normally
RED:     test_route_middleware_runs_after_global() — Given global + route middleware, When request arrives, Then global runs first, then route
RED:     test_route_without_middleware() — Given route without middleware export, When request arrives, Then handler runs directly (backward compat)
RED:     test_route_middleware_invalid_type() — Given middleware export as string (not array), When request arrives, Then ignored with no crash
GREEN:   Implement route-level middleware in executeRoute
REFACTOR: Extract middleware execution into helper
VERIFY:  npx vitest run tests/unit/route-middleware.test.ts tests/integration/onda3-mandatory.test.ts
```

#### Acceptance Criteria
- [ ] Route-level middleware roda antes do handler
- [ ] Route middleware pode bloquear (retornar Response)
- [ ] Roda após middleware global
- [ ] Backward compatible (routes sem middleware continuam funcionando)
- [ ] Pass: `tsc --noEmit`
- [ ] Pass: `eslint`
- [ ] Pass: `vitest`

#### DoD
- [ ] Todos os testes passando
- [ ] Zero TypeScript errors
- [ ] Zero lint warnings

---

## Phase 6: Type Tests Completos

**Objective:** Garantir que TODAS as APIs públicas do Theo têm type tests com `expectTypeOf`.

### T6.1 — Type tests para APIs novas e existentes sem cobertura

#### Objective
Adicionar type tests para: defineMiddleware (Web Standards), defineWebSocket, defineChannel, TheoBaseContext, InferActionOutput, route groups.

#### Evidence
Existem 6 type test files cobrindo: define-route, define-action, define-config, auth, theo-fetch, onda7-type-safety. Faltam: defineMiddleware, defineWebSocket, defineChannel, context types, output schema.

#### Files to edit
```
tests/type/define-middleware.test-d.ts — (NEW) type tests para middleware Web Standards
tests/type/define-websocket.test-d.ts — (NEW) type tests para WebSocket handler
tests/type/define-channel.test-d.ts — (NEW) type tests para channel handler
tests/type/context.test-d.ts — (NEW) type tests para TheoBaseContext
tests/type/define-action.test-d.ts — adicionar cenários de output schema
```

#### Deep file dependency analysis
- Todos os type test files são novos ou extensões. Sem impacto em código de produção.
- `define-action.test-d.ts`: Já existe com 58 linhas. Adicionar cenários de output.

#### Deep Dives
**Type tests para defineMiddleware:**
- Verifica que handler recebe `Request` (não `IncomingMessage`)
- Verifica que `next` retorna `Promise<Response>`
- Verifica que retorno é `Response | Promise<Response>`

**Type tests para defineWebSocket:**
- `WebSocketLike` tem `send` e `close`
- `onMessage` recebe `string | Buffer`

**Type tests para TheoBaseContext:**
- `requestId` é `string`
- `logger` é `TheoLogger`

#### Tasks
1. Criar `tests/type/define-middleware.test-d.ts`
2. Criar `tests/type/define-websocket.test-d.ts`
3. Criar `tests/type/define-channel.test-d.ts`
4. Criar `tests/type/context.test-d.ts`
5. Atualizar `tests/type/define-action.test-d.ts` com output schema

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     (todos os type tests falham antes da implementação das fases anteriores — este é o teste de que type safety funciona)
GREEN:   Com as implementações das fases 0-5, todos os type tests passam
REFACTOR: None expected
VERIFY:  npx vitest typecheck tests/type/
```

BDD scenarios por file:
- **define-middleware**: handler recebe Request, next retorna Response, retorno é Response
- **define-websocket**: WebSocketLike.send aceita string|Buffer, handler com todos os callbacks
- **define-channel**: TMessage genérico funciona, onMessage recebe TMessage tipado
- **context**: TheoBaseContext tem requestId string, logger TheoLogger
- **define-action output**: output schema infere retorno, sem output retorna unknown

#### Acceptance Criteria
- [ ] Todas as APIs públicas têm type tests
- [ ] `expectTypeOf` usado em todos os cenários
- [ ] Pass: `npx vitest typecheck tests/type/`
- [ ] Pass: `tsc --noEmit`

#### DoD
- [ ] Todos os type tests passando
- [ ] 100% das APIs públicas cobertas

---

## Phase 7: Fixtures de Teste

**Objective:** Criar fixture projects mínimos que demonstram e testam cada feature do framework.

### T7.1 — Criar fixtures para features core

#### Objective
Criar mini-projetos de fixture para: route groups, global error, route-level middleware, actions com output, Web Standard middleware.

#### Evidence
A regra `.claude/rules/testing.md` exige: "Every framework feature needs a mini-project fixture". Atualmente `tests/fixtures/` não existe. Tests usam mocks diretos.

#### Files to edit
```
tests/fixtures/route-groups/ — (NEW) app com route groups (auth) e (public)
tests/fixtures/global-error/ — (NEW) app com global-error.tsx
tests/fixtures/route-middleware/ — (NEW) server routes com middleware export
tests/fixtures/action-output/ — (NEW) actions com output schema
tests/fixtures/web-middleware/ — (NEW) middleware usando Web Standards
tests/fixtures/basic-app/ — (NEW) app mínima (page + layout)
```

#### Deep file dependency analysis
- Todos novos. Cada fixture é um mini-projeto Theo autocontido com `app/`, `server/`, e configuração mínima.

#### Deep Dives
**Estrutura de cada fixture:**
```
tests/fixtures/{name}/
├── app/
│   ├── page.tsx
│   └── layout.tsx (quando relevante)
├── server/
│   ├── routes/ (quando relevante)
│   └── middleware.ts (quando relevante)
├── theo.config.ts
└── package.json (mínimo)
```

**Uso nos testes:**
```typescript
const fixture = resolve(__dirname, '../fixtures/route-groups')
const tree = scanRoutes(resolve(fixture, 'app'))
```

#### Tasks
1. Criar diretório `tests/fixtures/`
2. Criar fixture `basic-app` (mínima)
3. Criar fixture `route-groups` com `(auth)/` e `(public)/`
4. Criar fixture `global-error` com `app/global-error.tsx`
5. Criar fixture `route-middleware` com routes exportando middleware
6. Criar fixture `action-output` com actions usando output schema
7. Criar fixture `web-middleware` com middleware Web Standards
8. Atualizar testes existentes para usar fixtures onde aplicável

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_fixture_basic_app_scans() — Given basic-app fixture, When scanRoutes(), Then finds page and layout
RED:     test_fixture_route_groups_scans() — Given route-groups fixture, When scanRoutes(), Then groups are transparent in paths
RED:     test_fixture_global_error_scans() — Given global-error fixture, When scanRoutes(), Then globalError on root node
RED:     test_fixture_route_middleware_exists() — Given route-middleware fixture, When loading route module, Then middleware export present
RED:     test_fixture_action_output_types() — Given action-output fixture, When defineAction called, Then output schema present
GREEN:   Create all fixtures
REFACTOR: Remove hardcoded test paths in favor of fixtures
VERIFY:  npx vitest run tests/unit/ tests/integration/
```

#### Acceptance Criteria
- [ ] Cada feature tem pelo menos 1 fixture
- [ ] Fixtures são autocontidos (não dependem de estado externo)
- [ ] Testes existentes migrados para usar fixtures onde faz sentido
- [ ] Pass: `vitest`

#### DoD
- [ ] Todas as fixtures criadas
- [ ] Testes usando fixtures passando
- [ ] Zero TypeScript errors

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Middleware usa Node APIs em vez de Web Standards | T0.1, T0.2 | Bridge de conversão + defineMiddleware Web Standard |
| 2 | Type tests faltando para APIs novas | T6.1 | Type tests para middleware, WebSocket, channel, context, output |
| 3 | CSRF usa header custom em vez de Sec-Fetch-Site | T1.1 | Sec-Fetch-Site como defesa primária, header custom como fallback |
| 4 | defineAction sem output schema | T3.1 | Campo output opcional com Zod |
| 5 | Logger/session não integrados no context | T2.1 | TheoBaseContext com logger child e requestId |
| 6 | Sem route groups (folder) | T4.1 | Scanner detecta (folder) e pula segmento |
| 7 | Sem global-error.tsx | T4.2 | global-error.tsx na raiz como fallback |
| 8 | Sem route-level middleware | T5.1 | Export middleware em route files |
| 9 | Sem named routes / URL helpers | ADR D8 variant | Documentado como POST-MVP (YAGNI — poucos casos de uso) |
| 10 | Sem adapter pattern para WebSocket broadcast | ADR | Documentado como POST-MVP (só in-memory por agora, YAGNI) |
| 11 | Sem event system / notifications | ADR D8 | Documentado como POST-MVP (YAGNI) |
| 12 | Fixtures de teste ausentes | T7.1 | Fixtures para cada feature |

**Coverage: 12/12 gaps cobertos (100%)** — 9 resolvidos via implementação, 3 documentados como decisão consciente (YAGNI/POST-MVP).

## Global Definition of Done

- [ ] Todas as fases completadas (0-7)
- [ ] Todos os testes passando (Vitest + Playwright)
- [ ] Zero TypeScript errors (`tsc --noEmit`)
- [ ] Zero lint warnings
- [ ] Backward compatibility preservada (defineAction sem output continua funcionando)
- [ ] Code-audit checks passando
- [ ] Type tests cobrindo 100% das APIs públicas
- [ ] Fixtures existem para cada feature do framework
- [ ] **Dogfood QA PASS** — `/dogfood full` health score >= 70, zero CRITICAL issues
- [ ] **Fixture proof** — every framework feature has a reproducible fixture project in tests/fixtures/

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
