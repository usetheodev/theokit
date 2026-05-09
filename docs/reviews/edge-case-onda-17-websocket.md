# Edge Case Review — onda-17-websocket

Data: 2026-05-09
Tasks analisadas: 5
Edge cases encontrados: 3 (MUST FIX: 1, SHOULD TEST: 1, DOCUMENT: 1)

## MUST FIX

### EC-1: ws not installed causes crash at import time
- **Task afetada:** T1.1
- **Família:** Resource / Boundary
- **Cenário:** User sets up `server/ws/chat.ts` but forgets to `npm install ws`. The plan uses `await import('ws')` (dynamic import) in start.ts. If `ws` is not installed, this throws `ERR_MODULE_NOT_FOUND`. But the plan creates the WebSocketServer eagerly at startup (before any WS connection). So the server crashes on boot with a confusing module-not-found error instead of a clear message.
- **Impacto:** Server won't start. Error message is Node.js internal, not user-friendly.
- **Fix sugerido:** Wrap the dynamic import in try/catch with a clear error: `try { const { WebSocketServer } = await import('ws') } catch { throw new Error('WebSocket routes found but "ws" package is not installed. Run: npm install ws') }`.

## SHOULD TEST

### EC-2: Vite HMR WebSocket conflicts with app WebSocket
- **Task afetada:** T2.1
- **Teste sugerido:** `test_vite_hmr_path_not_intercepted()` — Given dev server with WS routes, When Vite HMR sends upgrade on `/__vite_hmr` or `/?token=...`, Then the app WS handler does NOT intercept it. The plan mentions filtering by `/ws/` prefix, but verify that Vite's internal WS paths (which may vary by version) are never caught by the app handler.

## DOCUMENT

### EC-3: No WebSocket authentication built-in
- **Risco aceito:** The plan does not include auth for WS connections. The user can check cookies/tokens in `onOpen` via the `req` (IncomingMessage) parameter that the upgrade event provides. This is the standard pattern used by all WS frameworks (Hono, socket.io, etc.). Building auth into WS is YAGNI for alpha.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 0 | 0 | 0 | 0 |
| T0.2 | 0 | 0 | 0 | 0 |
| T1.1 | 1 | 1 (EC-1) | 0 | 0 |
| T2.1 | 1 | 0 | 1 (EC-2) | 0 |
| General | 1 | 0 | 0 | 1 (EC-3) |

**Veredicto:** PLANO PRECISA DE AJUSTE — 1 MUST FIX (EC-1: clear error when ws not installed).
