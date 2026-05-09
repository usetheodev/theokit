# Edge Case Review — onda-7-type-safety

Data: 2026-05-09
Tasks analisadas: 3 (T0.1, T1.1, T2.1)
Edge cases encontrados: 2 (MUST FIX: 0, SHOULD TEST: 1, DOCUMENT: 1)

## SHOULD TEST

### EC-1: `ctx` field name collision with handler context param
- **Task afetada:** T0.1
- **Familia:** Type
- **Cenario:** Handler param is already named `ctx` (the object `{ query, body, params, request, ctx }`). The outer param AND the `ctx` field inside it are different things. This could confuse devs: `handler: (ctx) => ctx.ctx.requestId` — double `ctx`.
- **Teste sugerido:** `test_handler_destructuring() — Given handler({ ctx }), When accessing ctx.requestId with type assertion, Then compiles`

## DOCUMENT

### EC-2: `any` audit false positives
- **Task afetada:** T2.1
- **Familia:** Type
- **Risco aceito:** The grep for `: any` could match comments like `// this accepts any value` or string literals. The audit should grep specifically for TypeScript type annotations (`: any`, `as any`, `<any>`) and exclude comments. Simple word-boundary regex handles most cases. False positives in comments are acceptable — if they show up, we handle individually.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 1 | 0 | 1 (EC-1) | 0 |
| T1.1 | 0 | 0 | 0 | 0 |
| T2.1 | 1 | 0 | 0 | 1 (EC-2) |

**Veredicto: PLANO OK** — zero MUST FIX.
