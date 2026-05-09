# Edge Case Review — onda-18-deploy-adapters

Data: 2026-05-09
Tasks analisadas: 5
Edge cases encontrados: 3 (MUST FIX: 1, SHOULD TEST: 1, DOCUMENT: 1)

## MUST FIX

### EC-1: Vercel serverless function needs env vars at runtime, not build time
- **Task afetada:** T2.1
- **Família:** Boundary / Security
- **Cenário:** The Vercel adapter bundles server code into a serverless function. If the function references `process.env.DATABASE_URL` or `process.env.SESSION_SECRET`, these must be available at RUNTIME in Vercel (via project settings), not at BUILD time. The adapter must NOT bake env vars into the bundle — they should remain as `process.env.X` references, resolved at invocation time by Vercel's runtime.
- **Impacto:** If env vars are inlined at build time (Vite's `define` or Rollup's `replace`), secrets leak into the deployed bundle. Security hole.
- **Fix sugerido:** Ensure the Vercel adapter's server build uses `external: ['process']` or equivalent to keep `process.env.*` as runtime lookups. Add test: `test_vercel_function_has_no_inlined_env()` — Given built function, When grepping for DATABASE_URL value, Then NOT found (it stays as `process.env.DATABASE_URL`).

## SHOULD TEST

### EC-2: Cloudflare Worker bundle size exceeds Workers limit
- **Task afetada:** T2.2
- **Teste sugerido:** `test_cloudflare_worker_size_under_limit()` — Given Cloudflare adapter output, When measuring worker entry file size, Then under 10MB (Workers compressed limit is 10MB for paid, 1MB for free). The Theo server code + all route handlers + Zod + React SSR could be significant. If it exceeds the limit, the user gets a confusing Wrangler error. At minimum, log the bundle size after build.

## DOCUMENT

### EC-3: WebSocket and in-memory rate limiting don't work in serverless targets
- **Risco aceito:** Already noted in the SOTA research. WebSocket requires persistent connections (not available in Vercel serverless). In-memory rate limiting resets per invocation in serverless/edge. These are fundamental platform limitations, not Theo bugs. Document in adapter output: generate a comment in the Vercel/Cloudflare configs noting these limitations.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 0 | 0 | 0 | 0 |
| T1.1 | 0 | 0 | 0 | 0 |
| T2.1 | 1 | 1 (EC-1) | 0 | 0 |
| T2.2 | 1 | 0 | 1 (EC-2) | 0 |
| General | 1 | 0 | 0 | 1 (EC-3) |

**Veredicto:** PLANO PRECISA DE AJUSTE — 1 MUST FIX (EC-1: env vars not inlined in Vercel bundle).
