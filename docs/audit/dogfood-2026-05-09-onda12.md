# Dogfood Report — 2026-05-09 (Onda 12, Quick Wins)

## Environment
- Node: v20.19.2
- pnpm: 9.15.0
- Mode: full

## Health Score: 100/100

| Phase | Score | Max | Status |
|-------|-------|-----|--------|
| Pre-flight | 10 | 10 | PASS |
| Scaffold Default | 5 | 5 | PASS |
| Scaffold Templates | 10 | 10 | PASS |
| Frontend | 7 | 7 | PASS |
| API+Actions | 10 | 10 | PASS |
| Cookies | 5 | 5 | PASS |
| Build | 8 | 8 | PASS |
| Production | 10 | 10 | PASS |
| E2E | 10 | 10 | PASS |
| HMR | 5 | 5 | PASS |
| DX | 12 | 12 | 5/5 |
| Regression | 8 | 8 | PASS |

## Issues

Zero issues found.

## Checklist Summary

### Infra
- [x] TypeScript: zero errors
- [x] Unit tests: 358/358 green
- [x] Type tests: 25/25 green
- [x] Zero `any`

### Onda 12 — Quick Wins
- [x] `THEO_PUBLIC_*` envPrefix configurado no theoPlugin
- [x] envPrefix coexiste com SSR aliases
- [x] `public/404.html` copiado para `.theo/client/404.html` no build
- [x] `public/500.html` copiado para `.theo/client/500.html` no build
- [x] Custom 404 servido para missing static files (URLs com extensão)
- [x] SPA routes (URLs sem extensão) continuam com SPA fallback (EC-2 verified)
- [x] Custom 500 servido em server crash (non-API)
- [x] Backward compat: sem custom pages → comportamento anterior
- [x] Rate limiter: `createRateLimiter({ windowMs, max })` funcional
- [x] Rate limiter: headers X-RateLimit-Limit, Remaining, Retry-After
- [x] Rate limiter: bloqueia após max requests
- [x] Rate limiter: reseta após window
- [x] Rate limiter: IPs separados
- [x] Rate limiter: cleanup periódico de entries expiradas (EC-1)
- [x] Rate limiter: opt-in via `rateLimit` no config schema
- [x] Rate limiter: integrado em dev (api-middleware) e prod (start.ts)
- [x] `createRateLimiter` exportado de `theo/server`
- [x] Config schema aceita `rateLimit` opcional

### Templates + Scaffold
- [x] `default`: scaffolds + runs
- [x] `dashboard`: scaffolds with layouts
- [x] `api-only`: scaffolds with health + users routes
- [x] Invalid template: clear error message

### DX (4 error messages tested)
- [x] "Invalid project name" → clean
- [x] "Invalid Theo project structure" → clean
- [x] "Run `theo build` first" → clean
- [x] "Template not found. Available: ..." → clean

## Ondas Coverage

| Onda | Status |
|------|--------|
| 0-11 | ✅ Complete |
| 12 | ✅ Env Vars (THEO_PUBLIC_*) + Error Pages + Rate Limiting |

## Verdict

**100/100 — Ship it.** 12 ondas completas. 396 testes total (358 unit/smoke + 13 E2E + 25 type). 3 quick wins entregues. Zero issues.
