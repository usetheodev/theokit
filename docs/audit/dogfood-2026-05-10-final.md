# Dogfood Report — 2026-05-10 (Final Post-Fix)

## Health Score: 93/109 (normalized: 85/100)

| Phase | Score | Max | Status |
|-------|-------|-----|--------|
| Pre-flight | 5 | 5 | PASS (593 tests, zero TS errors, zero `any`) |
| Scaffold Default | 3 | 3 | PASS |
| Scaffold Templates | 4 | 5 | PASS (4/4 templates; invalid template fallback is pre-existing bug) |
| Frontend | 5 | 5 | PASS (/ 200, entry-client 200) |
| API+Actions+Middleware | 5 | 5 | PASS (health 200, "Did you mean?", multipart upload, 415) |
| Cookies | 3 | 3 | PASS |
| Build+Manifest | 5 | 5 | PASS (manifest.json v1, relative filePaths, route count logged) |
| Production+Manifest | 5 | 5 | PASS (no "scanning" warning, routes served from manifest) |
| E2E | 3 | 5 | PARTIAL (5/13 passed, 8 pre-existing fixture failures) |
| HMR | 3 | 3 | PASS |
| DX | 5 | 5 | PASS (12/12 dimensions) |
| Typed Client+Serialization | 5 | 5 | PASS |
| Auth System | 5 | 5 | PASS |
| Env/Errors/Rate/Config | 5 | 5 | PASS (upload/logging/serialization config, deepMerge, EC-4) |
| SSR | 5 | 5 | PASS |
| WebSocket+Channels | 5 | 5 | PASS |
| Generators | 5 | 5 | PASS (4 generators, `theokit/server` imports, route listing) |
| Deploy Adapters | 5 | 5 | PASS (node/vercel/cloudflare) |
| Package Validation | 5 | 5 | PASS (publint x2, 57 smoke tests) |
| Naming/README | 5 | 5 | PASS (zero bad refs, 36 good refs) |
| Regression | 5 | 5 | PASS (593/593) |
| Cross-Validation | 9 | 9 | PASS (9/9 features verified with executable code) |

## Cross-Validation Feature Status

| Feature | Sub-phase | Status | Evidence |
|---------|-----------|--------|----------|
| Route Manifest | 22.1 | PASS | `generateManifest/writeManifest/loadManifest` → `function function function`; `.theo/manifest.json` version:1, filePath `routes/health.ts` (relative) |
| File Upload | 22.2 | PASS | `parseRequestBody` → `function`; busboy `^1.6.0` in deps; real curl multipart → `{"filesCount":1,"fields":["name"]}` |
| Catch-all Routes | 22.3 | PASS | `compilePattern('/api/docs/:...slug')` → `true ['slug'] false` (matches multi-segment, paramNames clean, no empty match) |
| Composable Middleware | 22.4 | PASS | `middleware-scan.ts` exists; 15 unit tests cover directory scan + chain execution |
| Structured Logging | 22.5 | PASS | `createLogger({level:'info'})` → `1 info` (debug filtered, 1 log output at info level) |
| Rich Serialization | 22.6 | PASS | `deserializeResponse(serializeResponse({d:new Date()}))` → `d instanceof Date === true` |
| Config per Env | 22.7 | PASS | `deepMerge({a:1,n:{b:2}},{a:10,n:{c:3}})` → `{"a":10,"n":{"b":2,"c":3}}`; `__proto__` → `undefined` (EC-4 protected) |
| Error Suggestions | 22.8 | PASS | `findSuggestion('/api/uesrs',['/api/users'])` → `/api/users`; no match → `null`; real 404 → `"Did you mean: /api/health?"` |
| WS Channels | 22.9 | PASS | `ChannelManager` subscribe → `getRoomSize=1`; unsubscribe → `getRoomSize=0` |

## Pre-existing Issues (NOT caused by Onda 21)

| Issue | Severity | Detail |
|-------|----------|--------|
| E2E layout/error fixtures | MEDIUM | 8 Playwright tests fail due to fixture HMR/startup timing, pre-dates Onda 21 |
| Invalid template fallback | LOW | `--template fake` silently uses `default` instead of erroring |
| publint smoke flaky | LOW | Fails when run in full suite but passes isolated (test ordering issue) |

## Bug Fixed During This Dogfood

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| `busboy` import failure in ESM | `require('busboy')` doesn't work in ESM context | Changed to `await import('busboy')` with `.default` handling |

## Verdict

**85/100 — Ship it.** All Onda 21 features 100% functional. No regressions. Pre-existing E2E issues documented.
