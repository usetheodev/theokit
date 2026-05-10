# Dogfood npm Report — 2026-05-10

## Package Info
- theokit: 0.1.0-alpha.1 on npm
- create-theokit: 0.1.0-alpha.2 on npm
- Published by: usetheodev

## Health Score: 90/100

| Phase | Score | Max | Status |
|-------|-------|-----|--------|
| npm Package Exists | 5 | 5 | PASS |
| Scaffold via npx | 10 | 10 | PASS |
| Install Dependencies | 10 | 10 | PASS |
| Import Validation | 15 | 15 | PASS |
| Dev Server | 10 | 10 | PASS |
| Generator | 10 | 10 | PASS |
| Route Listing | 5 | 5 | PASS |
| Build | 10 | 10 | PASS |
| Production Server | 7 | 10 | PASS (with note) |
| Docker | 5 | 5 | PASS |
| Error Messages | 5 | 5 | PASS |
| Template Scaffold | 5 | 5 | PASS |

## Issues Found

### Fixed During Test (republished)
1. **`workspace:*` in templates** — CRITICAL. Templates had `"theokit": "workspace:*"` which doesn't resolve outside monorepo. Fixed by replacing with `"^0.1.0-alpha.1"`. Republished as create-theokit@0.1.0-alpha.1.

2. **CLI couldn't load theo.config.ts** — CRITICAL. The `loadConfig()` does dynamic import of `.ts` file, but Node.js can't import TypeScript without a loader. Fixed by adding `tsx` as dependency and `import "tsx/esm"` in CLI banner. Republished as theokit@0.1.0-alpha.1.

### Known Issue (not blocking)
3. **WS endpoints crash start without `ws` installed** — MEDIUM. If user generates a WS endpoint (`theokit generate ws chat`) but doesn't `npm install ws`, `theokit start` crashes with "ws package not installed". The error message is clear, but ideally `start` should warn and skip WS, not crash. Fix in next release.

## Checklist

### Phase 1: npm exists
- [x] theokit@0.1.0-alpha.1 on npm
- [x] create-theokit@0.1.0-alpha.2 on npm

### Phase 2-3: Scaffold + Install
- [x] `npx create-theokit` works
- [x] `npm install` resolves all deps
- [x] node_modules/theokit/dist/ exists

### Phase 4: Imports
- [x] `theokit` → defineConfig ✓
- [x] `theokit/server` → defineRoute, defineAction, requireAuth, createSessionManager, defineWebSocket, getCookie ✓
- [x] `theokit/client` → theoFetch, TheoFetchError ✓

### Phase 5: Dev Server
- [x] `npx theokit dev` starts
- [x] `/` → 200
- [x] `/api/health` → JSON
- [x] x-request-id header present

### Phase 6-7: Generators + Routes
- [x] 4 generators create correct files with `theokit/server` imports
- [x] `npx theokit routes` lists 4 endpoints

### Phase 8-9: Build + Production
- [x] `npx theokit build` succeeds
- [x] `.theo/client/index.html` exists
- [x] `npx theokit start` serves / and /api/health (without ws endpoints)

### Phase 10-11: Docker + Errors
- [x] Dockerfile generated with node:22
- [x] 3 error messages all clear

### Phase 12: Templates
- [x] dashboard: app/dashboard/layout.tsx ✓
- [x] api-only: server/routes/users.ts ✓
- [x] postgres: db/schema.ts + drizzle.config.ts ✓
- [x] invalid: "Template not found" ✓

## Verdict

**90/100 — Ship it (with known WS issue).** O TheoKit funciona como pacote npm instalável. Dois bugs críticos foram encontrados e corrigidos durante o teste (workspace:* e tsx loader). Um issue médio (WS crash sem ws package) documentado para próxima release.
