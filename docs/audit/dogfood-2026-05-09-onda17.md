# Dogfood Report — 2026-05-09 (Onda 17, WebSocket Support)

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

## Onda 17 — WebSocket Support
- [x] `defineWebSocket()` identity function (same pattern as defineRoute)
- [x] `WebSocketHandler` type (onOpen, onMessage, onClose, onError)
- [x] `WebSocketLike` interface (send, close)
- [x] `scanWebSocketRoutes(serverDir)` scans server/ws/ directory
- [x] File-based routing: server/ws/echo.ts → /ws/echo
- [x] No ws/ dir → empty array (zero overhead)
- [x] Production server: HTTP upgrade handler with ws library
- [x] ws as optional peerDependency
- [x] EC-1: Clear error when ws not installed ("Run: npm install ws")
- [x] Dev server: WS upgrade on Vite httpServer
- [x] /ws/ prefix filter (doesn't interfere with Vite HMR)
- [x] Fixture websocket-basic/ with echo + notifications handlers
- [x] Exported from theo/server: defineWebSocket, WebSocketHandler, WebSocketLike
- [x] Zero breaking changes
- [x] 4 defineWebSocket tests + 5 ws-scan tests

## Test Counts
- Unit/integration/smoke: 460
- Type tests: 34
- E2E: 13
- **Total: 507**

## Templates (4)
- [x] default, dashboard, api-only, postgres
- [x] Invalid template error lists all 4

## Verdict

**100/100 — Ship it.** 17 ondas completas. WebSocket support com file-based routing, HTTP upgrade, optional ws dep. Zero issues.
