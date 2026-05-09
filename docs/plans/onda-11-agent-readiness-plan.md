# Plan: Onda 11 — Preparação para Agents (sem implementar Agents)

> **Version 1.0** — Este plano garante que o core do Theo não bloqueia a camada futura de agentes. Faz ajustes mínimos: fix de streaming (ReadableStream é pipado, não bufferizado), genérico `TCtx` para context tipado, logger substituível via config, e testes guardrail que provam que `agents/` é ignorado e que o bundle não tem deps de LLM. Nenhum código de agents é implementado — apenas contratos que viabilizam a extensão futura. O resultado é um framework que aceita streaming, context extensível, e observability plugável sem pagar custo técnico de agents.

## Context

O Theo está em 10 ondas com 306+ testes, dogfood 100/100, e publicação npm preparada (`0.1.0-alpha.0`). A Onda 11 é a última antes de agents. O core tem gaps sutis que bloqueariam a camada de agents:

1. **Streaming bufferizado** — `execute.ts:167` faz `await handlerResult.text()` que bufferiza todo o body de um `Response` antes de enviar. Um handler que retorna `new Response(readableStream)` para SSE ou AI streaming teria todo o conteúdo esperado em memória antes de qualquer byte ser enviado ao cliente.
2. **Context não tipado** — `ctx: unknown` em `RouteConfig` e `ActionConfig` funciona mas perde autocomplete. Agents precisarão de context extensível com type safety.
3. **Logger não substituível** — `logRequest()` faz `console.log(JSON.stringify())` direto. Não há hook para custom loggers (ex: OpenTelemetry, Datadog).
4. **`agents/` dir não testado** — O framework provavelmente ignora dirs desconhecidos, mas não há teste que prove isso.
5. **Bundle não auditado para LLM deps** — Nenhum teste garante que deps de LLM não entrem acidentalmente no core.

Evidence: `packages/theo/src/server/execute.ts:165-169` (Response handling), `packages/theo/src/server/define-route.ts:12` (`ctx: unknown`), `packages/theo/src/server/logger.ts:11` (hardcoded console.log).

## Objective

**Done =** `pnpm test` passa com testes que provam: (1) streaming Response é pipado chunk-by-chunk, (2) `TCtx` generic funciona com type safety, (3) logger é substituível, (4) `agents/` dir não quebra o framework, (5) zero deps de LLM no bundle.

Metas:
1. ReadableStream pipado para Node.js response (não bufferizado)
2. `TCtx` generic no `RouteConfig` e `ActionConfig` com default `unknown`
3. Logger substituível via `theoConfigSchema` (campo `logger` opcional)
4. Fixture com `agents/` dir que prova que framework ignora
5. Teste de bundle audit que verifica zero deps de LLM
6. Zero breaking changes — todos os testes existentes passam
7. Type tests para `TCtx` inference

## ADRs

### D1 — ReadableStream pipe, não buffer
**Decision:** Quando handler retorna `Response` com body, pipar chunks via `getReader()` em vez de `await .text()`.
**Rationale:** `await .text()` acumula todo o body em memória antes de enviar. Para streaming (SSE, AI responses), o cliente não recebe nenhum byte até tudo estar pronto — inviável para LLM streaming que pode levar 30+ segundos. O pattern `getReader().read()` + `res.write()` envia cada chunk imediatamente.
**Consequences:** Streaming funciona nativamente. Sem mudança de API — handler continua retornando `Response`. Non-streaming `Response` (com body string) funciona igual porque ReadableStream.getReader() lê tudo em um chunk.

### D2 — TCtx como 4° genérico (default unknown)
**Decision:** Adicionar `TCtx = unknown` como generic param em `RouteConfig` e `ActionConfig`.
**Rationale:** `ctx: unknown` funciona para runtime mas perde IntelliSense. Com `TCtx`, o user pode tipar `defineRoute<..., AppContext>()` e ganhar autocomplete. Alternativa (Hono-style global ContextVariableMap) exige declarations merging, que é frágil e esconde bugs. O generic explícito é mais KISS.
**Consequences:** Zero breaking change (default é `unknown`). Verbosidade com 4 generics — mitigada pelo user criando wrapper: `const route = <TQ, TB, TP>(c: RouteConfig<TQ, TB, TP, AppCtx>) => defineRoute(c)`.

### D3 — Logger como callback no config
**Decision:** Adicionar campo `logger` opcional no `theoConfigSchema` que aceita uma função `(log: RequestLog) => void`.
**Rationale:** Hardcoded `console.log(JSON.stringify())` é inflexível. Um callback permite: Winston, Pino, OpenTelemetry, ou até `() => {}` para silenciar logs. Alternativa (event emitter) é mais complexa sem valor adicional — KISS.
**Consequences:** Default permanece `console.log(JSON.stringify())`. O campo `logger` é uma função, não serializável — aceito apenas em runtime, não no schema Zod (que é para config file). Implementação: o logger vem como argumento do runtime, não do `theo.config.ts`.

### D4 — Testar, não implementar
**Decision:** Onda 11 adiciona apenas testes guardrail e ajustes mínimos. Nenhum `defineAgent()`, nenhum `@theo/ai`, nenhum agents/ scaffold.
**Rationale:** YAGNI. Sem caso de uso concreto de agents no Theo, criar abstrações é especulação. Os testes provam que o core está preparado — implementação vem quando houver demanda real.
**Consequences:** O framework fica agent-ready sem pagar custo de agents.

### D5 — Logger no runtime, não no config schema
**Decision:** O campo `logger` NÃO vai no `theoConfigSchema` (Zod). Vai como argumento opcional no `logRequest()`.
**Rationale:** `theo.config.ts` é importado via dynamic import — funções não são serializáveis em JSON/Zod de forma limpa. O logger é injetado pelo runtime (CLI commands) que já tem acesso ao config. Abordagem mais simples: `logRequest()` aceita um 2° argumento opcional `customLogger`.
**Consequences:** Menos invasivo. Não muda o schema. O user pode customizar via middleware ou context factory.

## Dependency Graph

```
Phase 0 (streaming fix) ──┐
                           ├──▶ Phase 2 (guardrail tests) ──▶ Phase 3 (regression)
Phase 1 (TCtx + logger) ──┘
```

- **Phase 0** e **Phase 1** são paralelos (independentes)
- **Phase 2** depende de ambos (testa features de 0 e 1)
- **Phase 3** depende de tudo (regressão completa)

---

## Phase 0: Streaming Fix

**Objective:** Pipar ReadableStream para Node.js response em vez de bufferizar.

### T0.1 — Fix Response streaming em executeRoute

#### Objective
Substituir `await handlerResult.text()` por pipe de ReadableStream chunks.

#### Evidence
`packages/theo/src/server/execute.ts:165-169` — `await handlerResult.text()` acumula body inteiro. Para AI/SSE streaming, cliente espera 30+ segundos sem ver nada.

#### Files to edit
```
packages/theo/src/server/execute.ts (EDIT) — Fix Response handling para pipe chunks
```

#### Deep file dependency analysis
- `execute.ts`: Função `executeRoute()` chamada por `api-middleware.ts` (dev) e `cli/commands/start.ts` (prod). O Response handling está nas linhas 165-169. A mudança afeta apenas o branch `handlerResult instanceof Response`.
- Downstream: Todos os route handlers que retornam `Response`. Handlers que retornam JSON (maioria) não são afetados.

#### Deep Dives
- **ReadableStream pipe pattern**: 
  ```typescript
  const reader = handlerResult.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    res.write(value)
  }
  res.end()
  ```
- **Response sem body**: `new Response(null, { status: 204 })` tem `body === null`. O code path deve tratar isso.
- **Response com string body**: `new Response('hello')` cria ReadableStream internamente. O pipe funciona igual.
- **Backward compat**: Nenhuma mudança de API. Handler continua retornando `Response`. A diferença é que chunks são enviados imediatamente.
- **EC-1 MUST FIX — Error mid-stream**: Se o ReadableStream falha durante o pump (ex: upstream API drops), `reader.read()` rejeita. Nesse ponto, `res.writeHead()` já foi chamado. O catch DEVE verificar `res.headersSent` antes de tentar enviar erro — se headers já enviados, apenas `res.end()`.

#### Tasks
1. Alterar `execute.ts:165-169` para pipar ReadableStream
2. Tratar caso `body === null`
3. Verificar que testes existentes passam

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_streaming_response_pipes_chunks() — Given route returning Response with ReadableStream body, When executeRoute runs, Then chunks are written individually to res (not buffered)
RED:     test_response_without_body() — Given route returning Response(null, {status: 204}), When executeRoute runs, Then res.end() is called without body
RED:     test_response_with_string_body() — Given route returning new Response('hello'), When executeRoute runs, Then res receives 'hello'
RED:     test_response_headers_preserved() — Given route returning Response with custom headers, When executeRoute runs, Then headers are on res
RED:     test_stream_error_midway_closes_response() — Given ReadableStream that errors after 1 chunk, When executeRoute runs, Then res.end() is called (no ERR_HTTP_HEADERS_SENT crash) (EC-1 MUST FIX)
GREEN:   Fix execute.ts Response handling to pipe ReadableStream with error handling
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/streaming-response.test.ts
```

BDD scenarios:
- **Happy path**: ReadableStream chunks são pipados individualmente
- **Validation error**: N/A (Response é retorno do handler)
- **Edge case**: Response sem body (null) → res.end() sem conteúdo
- **Error scenario**: ReadableStream falha no meio → erro propagado

#### Acceptance Criteria
- [ ] Chunks de ReadableStream são escritos com `res.write()` individualmente
- [ ] Response sem body (`null`) funciona
- [ ] Response com string body funciona
- [ ] Headers são preservados
- [ ] Testes existentes passam

#### DoD
- [ ] Streaming funciona
- [ ] Zero regressão

---

## Phase 1: Context Extensível e Logger

**Objective:** Adicionar TCtx generic e tornar logger substituível.

### T1.1 — TCtx generic no RouteConfig e ActionConfig

#### Objective
Adicionar 4° generic `TCtx` com default `unknown` para context tipado nos handlers.

#### Evidence
`define-route.ts:12` — `ctx: unknown` perde autocomplete. Agents precisarão de context tipado.

#### Files to edit
```
packages/theo/src/server/define-route.ts (EDIT) — Adicionar TCtx generic
packages/theo/src/server/define-action.ts (EDIT) — Adicionar TCtx generic
tests/type/define-route.test-d.ts (EDIT) — Adicionar type test para TCtx
tests/type/define-action.test-d.ts (EDIT) — Adicionar type test para TCtx
```

#### Deep file dependency analysis
- `define-route.ts`: Exporta `RouteConfig` e `defineRoute`. Usado por todas as fixtures e type tests. Adicionar generic com default `unknown` é backward compatible.
- `define-action.ts`: Exporta `ActionConfig` e `defineAction`. Mesmo padrão.
- Type tests: Precisam provar que `TCtx` faz `ctx` tipado no handler.

#### Deep Dives
- **Generic com default**: `TCtx = unknown` significa que `defineRoute({ handler: ({ctx}) => ctx })` continua compilando. O user opt-in com `defineRoute<..., MyCtx>()`.
- **Backward compat**: 100%. Default `unknown` é o tipo atual. Nenhum consumer existente quebra.

#### Tasks
1. Adicionar `TCtx = unknown` como 4° generic em `RouteConfig`
2. Mudar `ctx: unknown` para `ctx: TCtx` no handler type
3. Fazer o mesmo em `ActionConfig`
4. Adicionar type tests que provam inference

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     type_ctx_defaults_to_unknown() — Given defineRoute without TCtx, When handler accesses ctx, Then ctx is unknown
RED:     type_ctx_inferred_from_generic() — Given defineRoute<..., {user: string}>, When handler accesses ctx, Then ctx.user is string
RED:     type_action_ctx_defaults_to_unknown() — Given defineAction without TCtx, When handler accesses ctx, Then ctx is unknown
RED:     type_action_ctx_inferred() — Given defineAction<..., {user: string}>, When handler accesses ctx, Then ctx.user is string
RED:     test_existing_routes_still_compile() — Given existing route without TCtx, When typecheck, Then compiles (backward compat)
GREEN:   Add TCtx generic to RouteConfig and ActionConfig
REFACTOR: None expected
VERIFY:  pnpm test:types
```

BDD scenarios:
- **Happy path**: TCtx generic resolve para tipo correto
- **Validation error**: N/A (compile-time)
- **Edge case**: TCtx omitido → defaults to unknown (backward compat)
- **Error scenario**: Acesso a propriedade inexistente no ctx → TypeScript error

#### Acceptance Criteria
- [ ] `RouteConfig` tem 4° generic `TCtx = unknown`
- [ ] `ActionConfig` tem 2° generic `TCtx = unknown`
- [ ] Handler `ctx` é tipado como `TCtx`
- [ ] Testes de tipo passam
- [ ] Testes existentes passam (zero breaking change)

#### DoD
- [ ] Type tests GREEN
- [ ] `pnpm test` passa
- [ ] `pnpm test:types` passa

---

### T1.2 — Logger substituível

#### Objective
Tornar `logRequest()` aceitar um custom logger como 2° argumento opcional.

#### Evidence
`logger.ts:11` — `console.log(JSON.stringify(log))` hardcoded. Agents precisarão de custom logging (OTel spans, etc.).

#### Files to edit
```
packages/theo/src/server/logger.ts (EDIT) — Aceitar custom logger
tests/unit/logger.test.ts (NEW) — Testes do logger substituível
```

#### Deep file dependency analysis
- `logger.ts`: Exporta `logRequest()` e `RequestLog`. Chamado por `api-middleware.ts` e `action-middleware.ts`. Adicionar 2° arg opcional não quebra callers existentes.
- Callers: `api-middleware.ts` chama `logRequest(info)`. Continua funcionando.

#### Deep Dives
- **Signature**: `logRequest(info, customLogger?)` onde `customLogger?: (log: RequestLog) => void`.
- **Default**: Se `customLogger` não fornecido, usa `console.log(JSON.stringify())`.
- **Sem mudança em callers**: Callers existentes não passam 2° arg → default é usado.

#### Tasks
1. Adicionar param opcional `customLogger` em `logRequest()`
2. Se `customLogger` fornecido, chamar ele em vez de `console.log`
3. Criar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_default_logger_uses_console() — Given no custom logger, When logRequest called, Then console.log is called with JSON
RED:     test_custom_logger_called() — Given custom logger function, When logRequest called, Then custom logger receives RequestLog
RED:     test_custom_logger_receives_all_fields() — Given custom logger, When logRequest called, Then log has level, method, url, status, duration, requestId, timestamp
RED:     test_default_logger_backward_compat() — Given existing logRequest(info) call, When invoked, Then works without 2nd arg
GREEN:   Add optional customLogger param to logRequest
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/logger.test.ts
```

BDD scenarios:
- **Happy path**: Custom logger recebe RequestLog
- **Validation error**: N/A (logger é callback)
- **Edge case**: Logger omitido → default console.log
- **Error scenario**: Custom logger throws → erro propagado (não silenciado)

#### Acceptance Criteria
- [ ] `logRequest(info)` continua funcionando (backward compat)
- [ ] `logRequest(info, myLogger)` chama `myLogger` com `RequestLog`
- [ ] Default é `console.log(JSON.stringify())`
- [ ] Testes passam

#### DoD
- [ ] Logger substituível
- [ ] Zero breaking change
- [ ] Testes GREEN

---

## Phase 2: Guardrail Tests

**Objective:** Testes que provam agent-readiness sem implementar agents.

### T2.1 — Fixture e teste: agents/ dir ignorado

#### Objective
Provar que criar `agents/` no projeto não quebra o framework.

#### Evidence
`validateProjectStructure()` verifica apenas `app/`, `theo.config.ts`, `package.json`. `scanRoutes()` lê apenas `app/`. Scanners de server leem apenas `server/`. Mas não há teste que prove que `agents/` é ignorado.

#### Files to edit
```
fixtures/agents-dir-ignored/ (NEW) — Fixture com agents/ dir
tests/unit/agents-ignored.test.ts (NEW) — Teste guardrail
```

#### Deep file dependency analysis
- Fixture: Cópia mínima de `basic-valid-app` com `agents/` dir adicionado.
- Teste: Chama `validateProjectStructure()`, `scanRoutes()`, `scanServerRoutes()` e verifica que nenhum falha.

#### Deep Dives
- A fixture precisa: `app/page.tsx`, `theo.config.ts`, `package.json`, `agents/my-agent.ts`.
- `agents/my-agent.ts` pode ser qualquer arquivo — o framework não deve tocá-lo.

#### Tasks
1. Criar fixture `fixtures/agents-dir-ignored/`
2. Adicionar `agents/my-agent.ts` com conteúdo dummy
3. Criar teste que valida estrutura e escaneia routes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_validate_structure_ignores_agents() — Given project with agents/ dir, When validateProjectStructure, Then does not throw
RED:     test_scan_routes_ignores_agents() — Given project with agents/ dir, When scanRoutes(appDir), Then returns routes only from app/
RED:     test_scan_server_routes_ignores_agents() — Given project with agents/ and server/routes/, When scanServerRoutes(serverDir), Then returns only server routes
RED:     test_agents_files_not_in_route_tree() — Given agents/my-agent.ts, When scanning all dirs, Then my-agent is NOT in any route tree
GREEN:   Create fixture (no code change needed — framework already ignores)
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/agents-ignored.test.ts
```

BDD scenarios:
- **Happy path**: Framework ignora `agents/` dir
- **Validation error**: N/A (agents/ é optional dir)
- **Edge case**: Projeto com APENAS `agents/` dir (sem server/) → funciona
- **Error scenario**: N/A

#### Acceptance Criteria
- [ ] `validateProjectStructure()` passa com `agents/` dir
- [ ] `scanRoutes()` não retorna nada de `agents/`
- [ ] `scanServerRoutes()` não retorna nada de `agents/`
- [ ] Fixture existe

#### DoD
- [ ] Fixture criada
- [ ] Testes GREEN
- [ ] Framework ignora agents/

---

### T2.2 — Teste: zero deps de LLM no bundle

#### Objective
Provar que o package `theo` não depende de libs de AI/LLM.

#### Evidence
Princípio: "Nenhum código de agents no bundle core".

#### Files to edit
```
tests/unit/bundle-audit.test.ts (NEW) — Teste guardrail
```

#### Deep file dependency analysis
- Lê `packages/theo/package.json` e `packages/create-theo/package.json`.
- Verifica que dependencies e peerDependencies não contêm providers de AI.

#### Deep Dives
- **Blocklist**: `openai`, `@anthropic-ai`, `langchain`, `@langchain`, `llamaindex`, `@ai-sdk`, `cohere`, `@google/generative-ai`, `groq-sdk`.
- Verifica tanto `dependencies` quanto `peerDependencies`.

#### Tasks
1. Criar teste que lê package.json e verifica contra blocklist
2. Rodar e verificar

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_theo_no_llm_deps() — Given theo package.json, When reading dependencies, Then none match LLM provider names
RED:     test_theo_no_llm_peer_deps() — Given theo package.json, When reading peerDependencies, Then none match LLM provider names
RED:     test_create_theo_no_llm_deps() — Given create-theo package.json, When reading dependencies, Then none match LLM provider names
RED:     test_blocklist_is_comprehensive() — Given blocklist, When checking count, Then has at least 8 providers
GREEN:   Create test (no code change needed — deps are already clean)
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/bundle-audit.test.ts
```

BDD scenarios:
- **Happy path**: Zero LLM deps encontradas
- **Validation error**: LLM dep encontrada → teste falha com nome da dep
- **Edge case**: Dev dependency de LLM (aceito — não vai para bundle do consumidor)
- **Error scenario**: package.json malformado → teste falha com erro claro

#### Acceptance Criteria
- [ ] Zero LLM providers em dependencies do `theo`
- [ ] Zero LLM providers em peerDependencies do `theo`
- [ ] Zero LLM providers em dependencies do `create-theo`
- [ ] Blocklist tem 8+ providers

#### DoD
- [ ] Testes GREEN
- [ ] Bundle limpo

---

### T2.3 — Teste: context aceita dados arbitrários

#### Objective
Provar que `createContext()` pode retornar qualquer shape e o handler recebe.

#### Evidence
`middleware-runner.ts:38` — `ctx = await mod.createContext(...)`. O ctx é `unknown` — qualquer retorno é aceito.

#### Files to edit
```
tests/unit/context-extensible.test.ts (NEW) — Teste de extensibilidade
```

#### Deep file dependency analysis
- Usa `runMiddlewareAndContext()` com um mock `loadModule` que retorna context factory com dados arbitrários.

#### Deep Dives
- Testar com context contendo: user object, feature flags, requestId, agent metadata (simulado).
- Provar que dados customizados chegam ao handler via ctx.

#### Tasks
1. Criar teste com mock loadModule e createContext customizado
2. Verificar que ctx contém os dados injetados

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_context_receives_custom_data() — Given createContext returning {user: 'alice', role: 'admin'}, When runMiddlewareAndContext, Then ctx has user and role
RED:     test_context_with_nested_objects() — Given createContext returning nested objects, When runMiddlewareAndContext, Then nested data preserved
RED:     test_context_with_agent_metadata() — Given createContext returning {agentId: '123', tools: ['search']}, When runMiddlewareAndContext, Then agent metadata in ctx
RED:     test_context_default_empty() — Given no context.ts, When runMiddlewareAndContext, Then ctx is {}
GREEN:   Create tests (no code change needed — ctx already extensible)
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/context-extensible.test.ts
```

BDD scenarios:
- **Happy path**: Custom context data chega ao handler
- **Validation error**: N/A (ctx é unknown)
- **Edge case**: Context retorna `{}` vazio
- **Error scenario**: createContext throws → erro propagado

#### Acceptance Criteria
- [ ] Context factory retorna dados arbitrários
- [ ] Dados estão no `ctx` do resultado
- [ ] Agent metadata (simulada) funciona
- [ ] Default {} quando sem context.ts

#### DoD
- [ ] Testes GREEN
- [ ] Context extensível provado

---

### T2.4 — Teste: streaming Response com ReadableStream

#### Objective
Provar que um route handler pode retornar streaming Response e chunks são enviados progressivamente.

#### Evidence
Fix do T0.1 precisa de teste de integração que prova streaming real.

#### Files to edit
```
tests/integration/streaming-response.test.ts (NEW) — Teste de streaming
```

#### Deep file dependency analysis
- Cria um mock de `executeRoute` com handler que retorna `new Response(readableStream)`.
- Verifica que `res.write()` é chamado múltiplas vezes (não apenas `res.end()`).

#### Deep Dives
- **ReadableStream de teste**: Cria stream que emite 3 chunks com delay entre cada.
- **Mock res**: `ServerResponse` mockado com `write` e `end` spies.
- **Verificação**: `write` chamado 3 vezes, `end` chamado 1 vez no final.

#### Tasks
1. Criar teste de integração com ReadableStream
2. Verificar que chunks são escritos individualmente

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_readablestream_chunks_piped() — Given handler returning Response with 3-chunk ReadableStream, When executeRoute, Then res.write called 3 times
RED:     test_readablestream_end_called() — Given streaming handler, When executeRoute, Then res.end called exactly once
RED:     test_sse_format_streaming() — Given handler returning Response with text/event-stream, When executeRoute, Then content-type is text/event-stream and chunks are piped
RED:     test_empty_readablestream() — Given handler returning Response with empty ReadableStream, When executeRoute, Then res.end called without writes
GREEN:   Tests should pass with the streaming fix from T0.1
REFACTOR: None expected
VERIFY:  npx vitest run tests/integration/streaming-response.test.ts
```

BDD scenarios:
- **Happy path**: 3 chunks piped individually
- **Validation error**: N/A
- **Edge case**: Empty ReadableStream → apenas end()
- **Error scenario**: SSE content-type preservada

#### Acceptance Criteria
- [ ] `res.write()` chamado uma vez por chunk
- [ ] `res.end()` chamado no final
- [ ] Headers preservados (incluindo `text/event-stream`)
- [ ] Stream vazio funciona

#### DoD
- [ ] Testes GREEN
- [ ] Streaming provado end-to-end

---

## Phase 3: Regressão Completa

**Objective:** Garantir zero regressão após todas as mudanças.

### T3.1 — Regressão completa

#### Objective
Rodar todos os testes e verificar que nada quebrou.

#### Evidence
Onda 11 modifica execute.ts, define-route.ts, define-action.ts, logger.ts — todos são core. Regressão é obrigatória.

#### Files to edit
```
Nenhum — apenas execução
```

#### Deep file dependency analysis
N/A — verificação.

#### Deep Dives
N/A.

#### Tasks
1. `pnpm typecheck`
2. `pnpm test`
3. `pnpm test:types`
4. `pnpm build`
5. `npx vitest run tests/smoke/`
6. Verificar zero `any`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_typecheck() — Given all changes, When pnpm typecheck, Then exit code 0
RED:     test_all_tests() — Given all changes, When pnpm test, Then all pass
RED:     test_types() — Given all changes, When pnpm test:types, Then all pass
RED:     test_build() — Given all changes, When pnpm build, Then exit code 0
RED:     test_zero_any() — Given production code, When grep any, Then 0 matches
GREEN:   All already implemented — this verifies
REFACTOR: Fix any regressions
VERIFY:  pnpm typecheck && pnpm test && pnpm test:types && pnpm build
```

BDD scenarios:
- **Happy path**: Todos os testes passam
- **Validation error**: Regressão → fix
- **Edge case**: Novos testes aumentam contagem
- **Error scenario**: Type inference quebrada → fix generics

#### Acceptance Criteria
- [ ] `pnpm typecheck` zero errors
- [ ] `pnpm test` — 306+ tests green
- [ ] `pnpm test:types` — 21+ type tests green
- [ ] `pnpm build` exit code 0
- [ ] Zero `any` em production code
- [ ] Smoke tests passam

#### DoD
- [ ] Zero regressão
- [ ] Contagens iguais ou superiores ao baseline

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Streaming bufferizado (ReadableStream) | T0.1, T2.4 | Pipe chunks via getReader() |
| 2 | Context não tipado (ctx: unknown) | T1.1 | TCtx generic com default unknown |
| 3 | Logger não substituível | T1.2 | Custom logger como 2° arg opcional |
| 4 | agents/ dir pode quebrar framework | T2.1 | Fixture + testes provam que ignora |
| 5 | Bundle pode ter deps de LLM | T2.2 | Teste guardrail com blocklist |
| 6 | Context extensível para plugins | T2.3 | Teste prova ctx aceita qualquer shape |
| 7 | Streaming Response testado | T2.4 | Teste de integração com ReadableStream |
| 8 | Backward compatibility | T3.1 | Regressão completa |

**Coverage: 8/8 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-3)
- [ ] All unit/integration tests passing (`pnpm test`)
- [ ] All type tests passing (`pnpm test:types`)
- [ ] All E2E tests passing (`pnpm test:e2e`)
- [ ] Zero TypeScript errors (`pnpm typecheck`)
- [ ] Zero `any` in production code
- [ ] `pnpm build` exit code 0
- [ ] Smoke tests passam
- [ ] ReadableStream pipe funciona (não bufferiza)
- [ ] TCtx generic em RouteConfig e ActionConfig
- [ ] Logger substituível via 2° argumento
- [ ] Fixture `agents-dir-ignored` existe
- [ ] Bundle audit: zero LLM deps
- [ ] Context extensível provado por teste
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
