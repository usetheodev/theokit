# Dogfood Report — 2026-05-09 (Onda 16, SSR/Streaming)

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

## Onda 16 — SSR/Streaming HTML
- [x] Config `ssr: boolean` with default false (backward compat)
- [x] `generateEntryServer()` with renderToPipeableStream + React Router static APIs
- [x] onShellError handler rejects promise (EC-1)
- [x] StaticRouterProvider + createStaticHandler + createStaticRouter
- [x] Redirect handling in SSR
- [x] `generateEntryClient(true)` uses hydrateRoot
- [x] `generateEntryClient()` still uses createRoot (backward compat)
- [x] Build command: dual build (client + server) when ssr=true
- [x] Build command: single build when ssr=false (backward compat)
- [x] Plugin resolves /@theo/entry-server virtual module
- [x] Plugin passes ssr flag to generateEntryClient
- [x] Production server: SSR render with HTML template split
- [x] HTML split uses regex for robustness (EC-2 — handles attributes, quote styles)
- [x] CSR fallback when SSR fails (logs error, serves index.html)
- [x] Dev server: SSR via vite.ssrLoadModule when ssr=true
- [x] Dev server: CSR unchanged when ssr=false
- [x] API routes unaffected by SSR mode
- [x] Fixture `ssr-basic/` with ssr:true config
- [x] 8 entry-server tests + 14 SSR config/entry/split tests
- [x] Zero `any`, zero breaking changes

## Test Counts
- Unit/integration/smoke: 451
- Type tests: 34
- E2E: 13
- **Total: 498**

## Verdict

**100/100 — Ship it.** 16 ondas completas. SSR opt-in com renderToPipeableStream, hydrateRoot, React Router static APIs. CSR backward compat 100%. Zero issues.
