# Edge Case Review — onda-13-typed-client

Data: 2026-05-09
Tasks analisadas: 4
Edge cases encontrados: 3 (MUST FIX: 1, SHOULD TEST: 1, DOCUMENT: 1)

## MUST FIX

### EC-1: Response body parse fails silently when server returns non-JSON
- **Task afetada:** T0.1
- **Família:** Input / Boundary
- **Cenário:** `theoFetch` calls `response.json()` on success. If the server returns non-JSON (e.g., a `Response` with `text/plain` body from a streaming route, or an empty 204 response), `response.json()` throws a SyntaxError. The plan doesn't handle non-JSON successful responses.
- **Impacto:** `theoFetch` throws SyntaxError for valid 204 responses (no content) or text responses. This is a runtime crash.
- **Fix sugerido:** Check `response.status === 204` or empty body before calling `.json()`:
  ```typescript
  if (response.status === 204 || response.headers.get('content-length') === '0') return null as InferResponse<T>
  return response.json()
  ```

## SHOULD TEST

### EC-2: Handler returning Response object breaks InferResponse
- **Task afetada:** T0.1
- **Teste sugerido:** `type_handler_returning_response_object()` — Given defineRoute handler returning `new Response(...)`, When using `InferResponse<typeof GET>`, Then type is `Response` (not the inner data). The user needs to know that `theoFetch` only types JSON returns, not raw Response objects. Add a type test documenting this edge.

## DOCUMENT

### EC-3: Query params with undefined values
- **Risco aceito:** If a Zod query schema has optional fields (e.g., `z.object({ search: z.string().optional() })`), the inferred type includes `string | undefined`. When serializing to URL params, `String(undefined)` becomes the string `"undefined"` in the URL. This is technically wrong but matches what most frameworks do (including Next.js). The correct fix (skip undefined values in serialization) is a 1-line fix but is not critical for alpha. Document as known behavior.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 3 | 1 (EC-1) | 1 (EC-2) | 1 (EC-3) |
| T1.1 | 0 | 0 | 0 | 0 |
| T1.2 | 0 | 0 | 0 | 0 |
| T2.1 | 0 | 0 | 0 | 0 |

**Veredicto:** PLANO PRECISA DE AJUSTE — 1 MUST FIX (EC-1: handle 204/non-JSON responses).
