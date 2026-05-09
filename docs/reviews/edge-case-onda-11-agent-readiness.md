# Edge Case Review — onda-11-agent-readiness

Data: 2026-05-09
Tasks analisadas: 8
Edge cases encontrados: 3 (MUST FIX: 1, SHOULD TEST: 1, DOCUMENT: 1)

## MUST FIX

### EC-1: ReadableStream reader error mid-stream leaves response hanging
- **Task afetada:** T0.1
- **Família:** State / Resource
- **Cenário:** Handler retorna `Response` com `ReadableStream` body. O pipe loop (`reader.read()`) começa escrevendo chunks. Se o stream falha no meio (ex: upstream API drops connection), o `reader.read()` rejeita. Sem try/catch dentro do pump loop, o error propaga para o `catch` externo de `executeRoute`, que chama `sendError()`. Porém, `res.writeHead()` já foi chamado — tentar `writeHead` novamente (via `sendError` → `sendJson` → `res.writeHead`) causa `ERR_HTTP_HEADERS_SENT`.
- **Impacto:** Crash do processo Node.js com unhandled error, ou response que nunca fecha.
- **Fix sugerido:** Wrap o pump loop em try/catch. Se falhar após headers enviados, apenas `res.end()` sem tentar enviar novo header. Adicionar ao plano no T0.1:
  ```typescript
  try {
    // pump loop
  } catch {
    if (!res.headersSent) sendError(res, ...)
    else res.end()
  }
  ```

## SHOULD TEST

### EC-2: Response com body mas sem readable stream (body consumed)
- **Task afetada:** T0.1
- **Teste sugerido:** `test_response_body_already_consumed()` — Given handler returning Response whose body was already read (`.text()` called before return), When executeRoute, Then `body.getReader()` throws and error is handled gracefully. Este cenário é raro mas possível se o handler lê o body e depois retorna o mesmo Response.

## DOCUMENT

### EC-3: TCtx verbosity com 4 generics
- **Risco aceito:** Usar `defineRoute<z.ZodUndefined, z.ZodUndefined, z.ZodUndefined, AppContext>()` é verboso. O plano documenta isso e sugere que o user crie um wrapper. Não vale adicionar overloads ou utility types agora — YAGNI. Se virar problema real, endereçamos em onda futura.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 2 | 1 (EC-1) | 1 (EC-2) | 0 |
| T1.1 | 1 | 0 | 0 | 1 (EC-3) |
| T1.2 | 0 | 0 | 0 | 0 |
| T2.1 | 0 | 0 | 0 | 0 |
| T2.2 | 0 | 0 | 0 | 0 |
| T2.3 | 0 | 0 | 0 | 0 |
| T2.4 | 0 | 0 | 0 | 0 |
| T3.1 | 0 | 0 | 0 | 0 |

**Veredicto:** PLANO PRECISA DE AJUSTE — 1 MUST FIX (EC-1: error handling no pump loop).
