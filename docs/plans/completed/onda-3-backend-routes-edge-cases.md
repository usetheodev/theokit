# Edge Case Review — onda-3-backend-routes

Data: 2026-05-08
Tasks analisadas: 7 (T0.1, T0.2, T1.1, T2.1, T3.1, T4.1, T5.1)
Edge cases encontrados: 7 (MUST FIX: 2, SHOULD TEST: 3, DOCUMENT: 2)

## MUST FIX

### EC-1: parseBody — Content-Type não é application/json
- **Task afetada:** T1.1
- **Familia:** Input
- **Cenario:** Dev envia POST com `Content-Type: text/plain` ou sem Content-Type. O `parseBody` tenta `JSON.parse` e falha com erro genérico de parsing, não com mensagem clara sobre content-type.
- **Impacto:** Mensagem de erro confusa — dev acha que o JSON está malformado quando na verdade o content-type está errado.
- **Fix sugerido:** Em `parseBody`, checar `req.headers['content-type']?.includes('application/json')`. Se não JSON e body existe, retornar erro: `"Expected Content-Type: application/json"`. Se GET/HEAD/DELETE, skip.

### EC-2: executeRoute — handler retorna undefined/null
- **Task afetada:** T1.1
- **Familia:** Input
- **Cenario:** Handler esquece de retornar valor: `handler: () => { console.log('oops') }`. `JSON.stringify(undefined)` retorna `undefined` (não é JSON válido). `sendJson(res, undefined, 200)` envia response mal-formada.
- **Impacto:** Client recebe response body vazio ou `undefined` literal — não é JSON válido.
- **Fix sugerido:** Em `executeRoute`, após chamar handler: `if (result === undefined || result === null) { sendJson(res, null, config.status ?? 204) }` — tratar como 204 No Content.

## SHOULD TEST

### EC-3: matchRoute — URL com trailing slash
- **Task afetada:** T0.1
- **Familia:** Input
- **Cenario:** `GET /api/health/` (com trailing slash) vs padrão `/api/health` (sem). RegExp `^/api/health$` não matcha `/api/health/`.
- **Teste sugerido:** `test_match_trailing_slash() — Given '/api/health', When matchRoute('/api/health/'), Then still matches (strip trailing slash before match)`
- **Fix:** Strip trailing slash em `matchRoute`: `const path = urlPath.replace(/\/$/, '') || '/'`

### EC-4: scanServerRoutes — arquivo .ts com nome que parece dynamic segment
- **Task afetada:** T0.2
- **Familia:** Input
- **Cenario:** Dev cria `server/routes/[weird-name].ts` com hífens no param name. Route path vira `/api/:weird-name` que é identifier válido mas confuso.
- **Teste sugerido:** `test_scan_hyphenated_param() — Given server/routes/[user-id].ts, When scan, Then paramNames=['user-id']`
- **Nota:** Não bloquear — param names com hífens funcionam como string keys em `params['user-id']`.

### EC-5: executeRoute — POST sem body (empty request)
- **Task afetada:** T1.1
- **Familia:** Input
- **Cenario:** `POST /api/users` sem body (Content-Length: 0 ou sem Content-Length). `parseBody` retorna `undefined`. Se route tem body schema, Zod validation falha com `"Required"` — que é correto mas pode confundir.
- **Teste sugerido:** `test_execute_post_empty_body() — Given POST without body AND body schema, When executeRoute, Then 400 with VALIDATION_ERROR (body required)`

## DOCUMENT

### EC-6: ssrLoadModule — module caching entre requests
- **Task afetada:** T2.1
- **Familia:** Timing / State
- **Risco aceito:** `vite.ssrLoadModule` cacheia modules. Se dev edita um route file, Vite invalida o cache via HMR. Re-scan em cada request garante que novos arquivos são detectados. O pipeline é: scan FS (novo a cada request) + load module (cached com invalidation). Aceitável para dev.

### EC-7: Concurrent requests — race conditions
- **Task afetada:** T1.1
- **Familia:** Timing
- **Risco aceito:** Se dois requests chegam simultaneamente ao mesmo route, ambos chamam `parseBody` e `executeRoute` independentemente. Não há shared mutable state entre requests — cada request tem seu próprio `req`/`res`. Sem race condition. Aceitável.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 1 | 0 | 1 (EC-3) | 0 |
| T0.2 | 1 | 0 | 1 (EC-4) | 0 |
| T1.1 | 3 | 2 (EC-1, EC-2) | 1 (EC-5) | 1 (EC-7) |
| T2.1 | 1 | 0 | 0 | 1 (EC-6) |
| T3.1 | 0 | 0 | 0 | 0 |
| T4.1 | 0 | 0 | 0 | 0 |
| T5.1 | 0 | 0 | 0 | 0 |

**Veredicto: PLANO PRECISA DE AJUSTE** — 2 MUST FIX devem ser incorporados.

### Ajustes necessários no plano:

1. **T1.1 (executeRoute):** Adicionar Content-Type check em `parseBody` (EC-1). Adicionar handling de `undefined`/`null` return do handler (EC-2). Adicionar teste para POST sem body (EC-5).
2. **T0.1 (matchRoute):** Adicionar teste para trailing slash (EC-3).
3. **T0.2 (scanServerRoutes):** Adicionar teste para hyphenated param name (EC-4).
