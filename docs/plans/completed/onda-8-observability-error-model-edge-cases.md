# Edge Case Review — onda-8-observability-error-model

Data: 2026-05-09
Tasks analisadas: 3 (T0.1, T1.1, T2.1)
Edge cases encontrados: 3 (MUST FIX: 0, SHOULD TEST: 2, DOCUMENT: 1)

## SHOULD TEST

### EC-1: logRequest com res.statusCode antes de end
- **Task afetada:** T1.1
- **Familia:** Timing
- **Cenario:** Logging acontece APÓS executeRoute. Mas se middleware short-circuited (status 401), o statusCode pode não refletir. `res.statusCode` é setado por `writeHead` — se o response já terminou, o status está correto.
- **Teste sugerido:** `test_log_correct_status_on_error() — Given 400 error, When checking log, Then status is 400`

### EC-2: sendError chamado com requestId depois de res já enviada
- **Task afetada:** T0.1
- **Familia:** State
- **Cenario:** Se middleware já respondeu (short-circuit) e depois sendError é chamado por engano, `res.writeHead` falha com `ERR_HTTP_HEADERS_SENT`. Já mitigado pelo `aborted` check na Onda 5.
- **Teste sugerido:** Já coberto pelo middleware-runner aborted check.

## DOCUMENT

### EC-3: Logging verboso em dev
- **Task afetada:** T1.1
- **Familia:** DX
- **Risco aceito:** JSON logs em console durante `theo dev` podem ser verbosos. Aceitável para MVP — dev pode filtrar. Log level configurável é feature futura.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 1 | 0 | 0 | 0 |
| T1.1 | 2 | 0 | 1 (EC-1) | 1 (EC-3) |
| T2.1 | 0 | 0 | 0 | 0 |

**Veredicto: PLANO OK** — Zero MUST FIX.
