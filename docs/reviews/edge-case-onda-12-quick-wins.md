# Edge Case Review — onda-12-quick-wins

Data: 2026-05-09
Tasks analisadas: 5
Edge cases encontrados: 3 (MUST FIX: 1, SHOULD TEST: 1, DOCUMENT: 1)

## MUST FIX

### EC-1: Rate limiter Map cresce indefinidamente em produção
- **Task afetada:** T2.1
- **Família:** State / Resource
- **Cenário:** O `Map<string, { count, resetAt }>` nunca é limpo explicitamente. O plano diz "Entries expiradas são limpas lazily" — mas isso só acontece quando o MESMO IP faz outro request. Se 10.000 IPs únicos fazem 1 request cada e nunca voltam, o Map acumula 10.000 entries que nunca serão limpas. Em produção long-running, isso é memory leak.
- **Impacto:** Consumo de memória crescente em servers long-running com muitos IPs únicos (bot scanning, crawlers).
- **Fix sugerido:** Adicionar cleanup periódico simples: a cada N checks (ex: 1000), iterar o Map e deletar entries com `resetAt < now`. Adicionar ao T2.1:
  ```typescript
  let checkCount = 0
  // inside check function:
  if (++checkCount % 1000 === 0) {
    const now = Date.now()
    for (const [k, v] of store) { if (v.resetAt < now) store.delete(k) }
  }
  ```

## SHOULD TEST

### EC-2: 404.html served for static file paths that look like routes
- **Task afetada:** T1.1
- **Teste sugerido:** `test_404_not_served_for_spa_routes()` — Given 404.html exists AND URL is `/dashboard` (a valid SPA route), When request hits production server, Then serves index.html (SPA fallback) NOT 404.html. A lógica deve ser: serve 404.html SOMENTE se a URL tem extensão de arquivo (`.html`, `.css`, `.js`, `.png`, etc.) e o arquivo não existe. URLs sem extensão são SPA routes e devem receber index.html.

## DOCUMENT

### EC-3: Rate limiter in-memory não distribui entre processos
- **Risco aceito:** Se o Theo rodar em cluster mode (multiple workers) ou load balancer (multiple instances), cada instância tem seu próprio Map. O rate limit efetivo seria `max * N_instances`. Aceitável para alpha/MVP. User que precisa de rate limiting distribuído pode usar Redis via `@upstash/ratelimit` no middleware próprio. Documentar no ADR D3.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 0 | 0 | 0 | 0 |
| T1.1 | 1 | 0 | 1 (EC-2) | 0 |
| T2.1 | 1 | 1 (EC-1) | 0 | 0 |
| T2.2 | 1 | 0 | 0 | 1 (EC-3) |
| T3.1 | 0 | 0 | 0 | 0 |

**Veredicto:** PLANO PRECISA DE AJUSTE — 1 MUST FIX (EC-1: Map cleanup periódico no rate limiter).
