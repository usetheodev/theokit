# Edge Case Review — onda-4-server-actions

Data: 2026-05-08
Tasks analisadas: 5 (T0.1, T1.1, T2.1, T3.1, T4.1)
Edge cases encontrados: 5 (MUST FIX: 1, SHOULD TEST: 3, DOCUMENT: 1)

## MUST FIX

### EC-1: URL parsing — action URL sem exportName
- **Task afetada:** T2.1
- **Familia:** Input
- **Cenario:** Client faz `POST /api/__actions/create-user` (sem último segmento de exportName). O middleware split por `/` e pega último segmento como exportName = `create-user`, e actionPath fica vazio. Isso matcha o arquivo errado ou nenhum.
- **Impacto:** 500 ou comportamento inesperado em vez de 400 com mensagem clara.
- **Fix sugerido:** Validar que URL tem pelo menos 2 segmentos após strip do prefix. Se não: `sendError(res, 'BAD_REQUEST', 'Action URL must be /api/__actions/{file}/{exportName}', 400)`.

## SHOULD TEST

### EC-2: executeAction — export existe mas não é ActionConfig
- **Task afetada:** T1.1
- **Familia:** Input
- **Cenario:** Dev exporta uma função simples (`export const helper = () => {}`) que não tem `.input` nem `.handler`. O executor tenta acessar `.input.safeParse()` e crasharia.
- **Teste sugerido:** `test_non_action_export() — Given export without .input/.handler, When executeAction, Then 404 or 500 with clear message`

### EC-3: CSRF — curl sem Origin (non-browser client)
- **Task afetada:** T0.1 (CSRF)
- **Familia:** Security
- **Cenario:** `curl -X POST -H 'X-Theo-Action: 1'` não envia `Origin` header. Pelo plano, Origin ausente = same-origin = válido. Mas curl não é browser — é tool externo. Isso é aceitável?
- **Teste sugerido:** `test_csrf_curl_no_origin() — Given POST with X-Theo-Action but no Origin (curl), When validate, Then valid (accepted — custom header is the primary defense)`
- **Nota:** Aceitável. O custom header `X-Theo-Action: 1` é a primary defense. Browsers não enviam custom headers cross-origin sem CORS preflight. Curl é ferramenta dev, não ataque.

### EC-4: parseBody — action sem body (POST com Content-Length: 0)
- **Task afetada:** T1.1
- **Familia:** Input
- **Cenario:** Client faz POST sem body. `parseBody` retorna `undefined`. Zod `input.safeParse(undefined)` falha com "Required". Mensagem ok, mas edge case worth testing.
- **Teste sugerido:** `test_action_empty_body() — Given POST with no body AND input schema, When executeAction, Then 400 VALIDATION_ERROR`

## DOCUMENT

### EC-5: CORS preflight para actions
- **Task afetada:** T2.1
- **Familia:** Boundary
- **Risco aceito:** O custom header `X-Theo-Action: 1` torna o request "non-simple" em CORS. Browsers fazem preflight OPTIONS request antes do POST. O Vite dev server não trata OPTIONS especificamente — pode retornar 405 ou HTML catch-all. Em dev local (same-origin), não há CORS issue. Em produção com frontend e backend em origins diferentes, CORS headers seriam necessários. Aceitável para MVP — CORS é Onda futura (middleware).

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 1 | 0 | 1 (EC-3) | 0 |
| T1.1 | 2 | 0 | 2 (EC-2, EC-4) | 0 |
| T2.1 | 2 | 1 (EC-1) | 0 | 1 (EC-5) |
| T3.1 | 0 | 0 | 0 | 0 |
| T4.1 | 0 | 0 | 0 | 0 |

**Veredicto: PLANO PRECISA DE AJUSTE** — 1 MUST FIX a incorporar.

### Ajustes necessários no plano:

1. **T2.1 (Action middleware):** Validar que URL tem 2+ segmentos após strip prefix (EC-1). Adicionar 400 para URL malformada.
2. **T1.1 (executeAction):** Adicionar teste para export que não é ActionConfig (EC-2). Adicionar teste para POST sem body (EC-4).
