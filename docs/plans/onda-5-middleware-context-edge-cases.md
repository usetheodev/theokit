# Edge Case Review — onda-5-middleware-context

Data: 2026-05-09
Tasks analisadas: 4 (T0.1, T1.1, T2.1, T3.1)
Edge cases encontrados: 5 (MUST FIX: 1, SHOULD TEST: 2, DOCUMENT: 2)

## MUST FIX

### EC-1: Middleware short-circuit detection — res already sent
- **Task afetada:** T0.1
- **Familia:** State
- **Cenario:** Middleware chama `res.end()` sem chamar `next()`. O `runMiddlewareAndContext` detecta via `nextCalled === false`. Mas e se middleware chama `next()` E TAMBÉM `res.end()` (bug do dev)? O handler executaria e tentaria escrever em response já encerrada → crash `ERR_STREAM_WRITE_AFTER_END`.
- **Impacto:** Server crash com stack trace do Node.js.
- **Fix sugerido:** Após middleware executar, checar `res.writableEnded`. Se true e `nextCalled` é true, tratar como aborted (middleware respondeu mesmo tendo chamado next). `if (res.writableEnded) return { ctx: {}, aborted: true }`.

## SHOULD TEST

### EC-2: Middleware runs for EVERY API request (performance)
- **Task afetada:** T1.1
- **Familia:** Timing
- **Cenario:** O middleware carrega via `ssrLoadModule` em cada request. `ssrLoadModule` é cached pelo Vite (não re-parsa o arquivo), mas a function still executes. Se middleware é lento (database query), cada request paga o custo.
- **Teste sugerido:** `test_middleware_runs_per_request() — Given middleware that increments counter, When 3 requests, Then counter is 3`
- **Nota:** Esperado e correto (middleware DEVE rodar per-request). Mas bom testar que é de fato per-request, não cached.

### EC-3: createContext throws
- **Task afetada:** T0.1
- **Familia:** Error
- **Cenario:** `createContext` faz database call que falha. O error deve propagar para o executor's try/catch e retornar 500.
- **Teste sugerido:** `test_context_throws() — Given createContext that throws, When run, Then error propagates`

## DOCUMENT

### EC-4: Middleware ordering com CSRF (actions)
- **Task afetada:** T1.1
- **Familia:** Security
- **Risco aceito:** Na Onda 4, CSRF check acontece DENTRO do `executeAction` (antes do handler). Na Onda 5, middleware roda ANTES do CSRF check. Isso significa que middleware roda mesmo para requests sem CSRF header. Aceitável — middleware é para logging/auth, não para CSRF. CSRF continua no executor.

### EC-5: Middleware modifica headers DEPOIS de next() — mas executor já enviou response
- **Task afetada:** T0.1
- **Familia:** Timing
- **Risco aceito:** O plano diz que middleware pode modificar response headers após `await next()`. Mas se o handler já chamou `sendJson` (que chama `res.end()`), os headers já foram enviados. `res.setHeader()` após `res.end()` é silenciosamente ignorado pelo Node.js (não crash). Aceitável para MVP — dev precisa setar headers no response ANTES de res.end. Para middleware after-hooks, usariam `res.on('finish', cb)` que é complexo demais para Onda 5.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 3 | 1 (EC-1) | 1 (EC-3) | 1 (EC-5) |
| T1.1 | 1 | 0 | 1 (EC-2) | 1 (EC-4) |
| T2.1 | 0 | 0 | 0 | 0 |
| T3.1 | 0 | 0 | 0 | 0 |

**Veredicto: PLANO PRECISA DE AJUSTE** — 1 MUST FIX a incorporar.

### Ajustes necessários no plano:

1. **T0.1:** Após middleware executar, checar `res.writableEnded` — se true, tratar como aborted (EC-1). Adicionar teste para `createContext` que throws (EC-3).
