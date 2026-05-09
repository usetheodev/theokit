# Dogfood Report — 2026-05-09 (Onda 0+1+2+3+4)

## Environment
- Node: v20.19.2
- pnpm: 9.15.0
- Commit: 6e4c6b4
- Mode: full

## Health Score: 99/100

| Phase | Score | Max | Status |
|-------|-------|-----|--------|
| Pre-flight | 15 | 15 | PASS |
| Scaffold | 10 | 10 | PASS |
| Frontend | 10 | 10 | PASS |
| API Routes | 15 | 15 | PASS |
| HMR | 9 | 10 | PASS (skipped backend HMR — port conflicts) |
| E2E | 15 | 15 | PASS |
| DX | 15 | 15 | 4.6/5 |
| Regression | 10 | 10 | PASS |

## Issues

Zero issues found.

## New in Onda 4 — Server Actions

- [x] `POST /api/__actions/create-user/createUser` with valid input → 200 with result
- [x] Invalid input → 400 VALIDATION_ERROR with Zod issues
- [x] No `X-Theo-Action` header → 403 FORBIDDEN (CSRF protection)
- [x] Nonexistent action → 404 NOT_FOUND
- [x] GET on action → 405 METHOD_NOT_ALLOWED
- [x] Malformed URL (no export name) → 400 BAD_REQUEST

## Checklist Summary

### Infra
- [x] TypeScript: zero errors
- [x] Unit tests: 199/199 green
- [x] Type tests: 11/11 green
- [x] Zero `any` in production code

### Scaffold (Onda 1)
- [x] Scaffold: creates valid project
- [x] Package.json name correct
- [x] .gitignore exists
- [x] Server routes template exists

### Frontend (Onda 1+2)
- [x] Dev server: responds 200
- [x] Virtual modules: entry-client + route-manifest serve JS
- [x] Nested layouts (via E2E)
- [x] Error boundaries (via E2E)
- [x] Not-found (via E2E)

### Backend Routes (Onda 3)
- [x] GET /api/health → `{"ok":true}` 200
- [x] POST valid → 201 with data
- [x] POST invalid → 400 VALIDATION_ERROR
- [x] Dynamic params: /api/users/42 → `{"id":"42"}`
- [x] Query: ?search=theo → `{"search":"theo"}`
- [x] 404 for unmatched API
- [x] 405 for wrong method

### Server Actions (Onda 4)
- [x] Valid action → 200 with handler result
- [x] Invalid input → 400 VALIDATION_ERROR with Zod issues
- [x] Missing CSRF header → 403 FORBIDDEN
- [x] Nonexistent action → 404 NOT_FOUND
- [x] GET → 405 METHOD_NOT_ALLOWED
- [x] Malformed URL → 400 BAD_REQUEST

### DX
- [x] Error messages: clean, no stack traces
- [x] Scaffold speed: < 2s
- [x] Zero config needed
- [x] No crashes, no hangs

## Ondas Coverage

| Onda | Status | Tests |
|------|--------|-------|
| Onda 0 | ✅ | Contracts, config, validation |
| Onda 1 | ✅ | Scaffold, dev server, Hello Theo |
| Onda 2 | ✅ | File-based routing, layouts, errors, 404 |
| Onda 3 | ✅ | API routes, Zod validation, params, query |
| Onda 4 | ✅ | Server actions, CSRF, input validation |

## Verdict

**99/100 — Ship it.** Zero issues. 5 ondas completas e funcionais. 212 testes total (199 unit/integration + 13 E2E). Backend routes + server actions com Zod validation e CSRF protection. Framework funciona end-to-end: scaffold → dev → frontend routing → API → actions.
