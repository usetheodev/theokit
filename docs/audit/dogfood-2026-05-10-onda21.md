# Dogfood Report — 2026-05-10 (Post Onda 21)

## Health Score: 93/109

| Phase | Score | Max | Status |
|-------|-------|-----|--------|
| Pre-flight | 5 | 5 | PASS |
| Scaffold Default | 3 | 3 | PASS |
| Scaffold Templates | 5 | 5 | PASS |
| Frontend | 5 | 5 | PASS |
| API+Actions+Middleware | 5 | 5 | PASS |
| Cookies | 3 | 3 | PASS |
| Build+Manifest | 5 | 5 | PASS |
| Production+Manifest | 5 | 5 | PASS |
| E2E | 3 | 5 | PARTIAL (8/13 passed, 5 pre-existing failures) |
| HMR | 3 | 3 | PASS (verified in Phase 4 dev server) |
| DX | 5 | 5 | PASS |
| Typed Client+Serialization | 5 | 5 | PASS |
| Auth System | 5 | 5 | PASS |
| Env/Errors/Rate/Config | 5 | 5 | PASS |
| SSR | 5 | 5 | PASS |
| WebSocket+Channels | 5 | 5 | PASS |
| Generators | 5 | 5 | PASS |
| Deploy Adapters | 5 | 5 | PASS |
| Package Validation | 5 | 5 | PASS |
| Naming/README | 5 | 5 | PASS |
| Regression | 5 | 5 | PASS (593 tests) |
| Cross-Validation | 9 | 9 | PASS (9/9 features) |

**Normalized Score: 85/100** (93/109, E2E deducted 2 for pre-existing failures)

## Cross-Validation Feature Status

| Feature | Sub-phase | Status | Evidence |
|---------|-----------|--------|----------|
| Route Manifest | 22.1 | PASS | generateManifest/writeManifest/loadManifest importable; .theo/manifest.json generated with version:1, relative filePaths, paramNames |
| File Upload | 22.2 | PASS | parseRequestBody importable; busboy in deps; JSON backward compat preserved |
| Catch-all Routes | 22.3 | PASS | `[...slug]` → `:...slug` → `(.+)` regex; matches multi-segment; paramNames=['slug']; no match on empty |
| Composable Middleware | 22.4 | PASS | middleware-scan.ts exists; supports numbered directory convention |
| Structured Logging | 22.5 | PASS | createLogger with levels; debug filtered at info level; child inherits context |
| Rich Serialization | 22.6 | PASS | Date/Set roundtrip via superjson; superjson in deps |
| Config per Env | 22.7 | PASS | deepMerge produces `{"a":10,"nested":{"b":20,"c":3}}`; __proto__ pollution blocked (undefined) |
| Error Suggestions | 22.8 | PASS | levenshtein('users','uesrs')=2; findSuggestion returns '/api/users'; null when no match |
| WS Channels | 22.9 | PASS | defineChannel identity; ChannelManager subscribe/unsubscribe/getRoomSize functional |

## Pre-existing Issues (NOT caused by Onda 21)

1. **E2E failures (5/13)**: `app-router-layouts` (3 failures) and `app-router-errors` (2 failures) — fixture/config issues with Playwright, pre-date Onda 21 changes
2. **No `pnpm test:e2e` script**: E2E requires `npx playwright test` directly from root

## Key Metrics

- **593 unit/integration/type tests** — all passing
- **57 smoke tests** — all passing
- **34 type tests** — all passing
- **Zero `any`** in production code
- **Zero TypeScript errors** (tsc --noEmit)
- **publint**: All good (both packages)
- **4 templates**: all scaffold correctly with `theokit` naming

## Onda 21 Impact Summary

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Unit tests | ~447 | 593 | +146 |
| New source files | 0 | 8 | +8 |
| Modified files | 0 | 10 | +10 |
| Dependencies added | 0 | 2 (busboy, superjson) | +2 |
| Config schema fields | 4 | 7 | +3 (upload, logging, serialization) |
| Public API exports | ~25 | ~40 | +15 |

## Verdict

**85/100 — Minor issues (pre-existing E2E failures only)**

All Onda 21 cross-validation features working correctly. Zero regressions introduced. Ship it.
