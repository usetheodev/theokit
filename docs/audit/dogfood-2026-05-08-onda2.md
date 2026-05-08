# Dogfood Report — 2026-05-08 (Onda 0+1+2)

## Environment
- Node: v20.19.2
- pnpm: 9.15.0
- Commit: d059330
- Mode: full

## Health Score: 90/100

| Phase | Score | Max | Status |
|-------|-------|-----|--------|
| Pre-flight | 20 | 20 | PASS |
| Scaffold | 20 | 20 | PASS |
| Dev Server | 20 | 20 | PASS |
| HMR | 10 | 10 | PASS |
| E2E | 15 | 15 | PASS |
| DX | 5/15 | 15 | 3.2/5 |

## Issues

### DG-1: `theo dev` mostra stack trace para erros de validação (CARRYOVER de Onda 1)
- **Severity:** MEDIUM
- **Phase:** DX Evaluation
- **Command:** `npx tsx packages/theo/src/cli/index.ts dev` (de /tmp)
- **Expected:** Mensagem limpa: `Error: Missing required directory: app/`
- **Actual:** Stack trace completo com `TheoProjectError`, file paths internos
- **Repro:** `cd /tmp && npx tsx /path/to/theo dev`
- **Fix:** try/catch em `devCommand()` que captura `TheoProjectError`/`TheoConfigError` e printa limpo

### DG-2: Routing funciona end-to-end (NEW — PASS)
- **Severity:** N/A (PASS)
- **Phase:** Dev Server + E2E
- **Nota:** File-based routing com React Router funciona: nested layouts, error boundaries, not-found. Route manifest auto-gerado pelo Vite plugin. 13 E2E tests passam.

### DG-3: HMR detecta nova rota (NEW — PASS)
- **Severity:** N/A (PASS)
- **Phase:** HMR
- **Nota:** Criar `app/contact/page.tsx` com server rodando → server detecta, invalida manifest, full-reload. GET /contact retorna 200.

## DX Scoring Detail

| Dimensão | Score | Notas |
|----------|-------|-------|
| Scaffold Speed | 5/5 | < 2s incluindo install |
| Zero Config | 5/5 | Funciona sem editar nenhum arquivo |
| Error Messages | 2/5 | create-theo: bom. theo dev: stack trace (DG-1) |
| Dev Startup | 4/5 | Vite startup rápido |
| File Structure | 5/5 | Intuitiva, convenção clara |

## Checklist Summary

- [x] TypeScript: zero errors
- [x] Unit tests: 154/154 green
- [x] Type tests: 11/11 green
- [x] Scaffold: creates valid project
- [x] Dev server: responds 200
- [x] Virtual module: route-manifest + entry-client serve JavaScript
- [x] E2E: 13/13 (Hello Theo + layouts + errors + not-found)
- [x] HMR: survives file edit + detects new routes
- [ ] Error messages: PARTIAL — DG-1 precisa fix
- [x] No crashes, no hangs
- [x] File-based routing: /, /about, /dashboard work
- [x] Nested layouts: root wraps all, dashboard wraps only dashboard
- [x] Error boundary: broken page shows error.tsx
- [x] Not found: unknown URL shows not-found.tsx

## Verdict

**90/100 — Ship it.** O framework funciona end-to-end com file-based routing, nested layouts, error boundaries, e 404. O único issue pendente (DG-1: stack trace no theo dev) é carryover da Onda 1 — cosmético, não bloqueia funcionalidade. 167 testes total (154 unit/integration + 13 E2E) todos passando.

## Ondas Coverage

| Onda | Status | Features |
|------|--------|----------|
| Onda 0 | ✅ Complete | Contracts, validation, config, fixtures |
| Onda 1 | ✅ Complete | create-theo, theo dev, Vite plugin, Hello Theo |
| Onda 2 | ✅ Complete | File-based routing, nested layouts, error boundaries, 404 |
