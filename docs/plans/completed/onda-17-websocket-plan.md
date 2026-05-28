# Plan: Onda 17 — WebSocket Support

> **Version 1.0** — Adiciona WebSocket support ao Theo com `defineWebSocket()` identity function, file-based routing em `server/ws/`, scanner de WS routes, integração com HTTP upgrade no production server, e integração com Vite httpServer em dev. Usa `ws` como peerDependency opcional. Zero breaking change — apps sem `server/ws/` não são afetados.

## Context

O Theo tem 16 ondas, 451 testes, e streaming via ReadableStream (SSE, Onda 11). Porém SSE é unidirecional (server→client). Apps com chat, collaboration, ou multiplayer precisam de comunicação bidirecional — WebSocket.

Nenhum framework JS/TS major (Next.js, Remix, SvelteKit) tem WS built-in. Hono e Fastify têm. O Theo, como framework opinativo, provê WS como feature built-in mas opt-in.

Evidence: Nenhum arquivo `ws` no codebase. Nenhuma referência a WebSocket em `server/`.

## Objective

**Done =** `server/ws/chat.ts` com `defineWebSocket()` → WebSocket endpoint em `/ws/chat`. Production server faz HTTP upgrade. Dev server integra com Vite httpServer. Testes provam conexão, mensagens, e desconexão.

Metas:
1. `defineWebSocket({ onOpen, onMessage, onClose, onError })` identity function
2. `server/ws/*.ts` → `/ws/*` file-based routing
3. `scanWebSocketRoutes(serverDir)` scanner
4. HTTP upgrade handler no production server
5. HTTP upgrade no dev server (via Vite httpServer)
6. `ws` como optional peerDependency
7. Fixture + testes
8. Zero breaking change

## ADRs

### D1 — defineWebSocket como identity function
**Decision:** `defineWebSocket(handler)` é identity function (retorna handler). Mesmo pattern de `defineRoute`, `defineAction`, `defineMiddleware`.
**Rationale:** Consistência com o resto do framework. Provê type inference e autocomplete sem runtime overhead.
**Consequences:** O handler é o contrato. O runtime chama `handler.onMessage(ws, data)`.

### D2 — File-based WS routing em server/ws/
**Decision:** Arquivos em `server/ws/` mapeiam para endpoints WebSocket: `server/ws/chat.ts` → `/ws/chat`.
**Rationale:** Consistente com `server/routes/` → `/api/`. Convention over configuration.
**Consequences:** Scanner precisa de `scanWebSocketRoutes()`. Conflito com `server/routes/ws/` não acontece — prefixos diferentes (`/api/` vs `/ws/`).

### D3 — ws como optional peerDependency
**Decision:** `ws` é peerDependency com `optional: true`. User só instala se usar WebSocket.
**Rationale:** Sem `server/ws/` directory, zero código WS é carregado. Sem `ws` instalado, zero overhead. Quem não usa WS não paga.
**Consequences:** User precisa `npm install ws` para usar WS. Error claro se esquece.

### D4 — HTTP upgrade no server existente
**Decision:** Usar `WebSocketServer({ noServer: true })` e `server.on('upgrade')` no HTTP server existente (tanto em dev quanto prod).
**Rationale:** Uma porta para tudo (HTTP + WS). `noServer: true` é o pattern recomendado pela lib `ws` para compartilhar HTTP server.
**Consequences:** WS endpoints compartilham porta com API. Sem porta separada.

## Dependency Graph

```
Phase 0 (defineWebSocket + scanner) ──▶ Phase 1 (prod integration) ──▶ Phase 2 (dev integration) ──▶ Phase 3 (regression)
```

- Sequencial — cada fase depende da anterior

---

## Phase 0: Core (defineWebSocket + scanner)

**Objective:** Criar o helper e o scanner de WS routes.

### T0.1 — defineWebSocket + types

#### Objective
Criar `defineWebSocket()` identity function e tipos `WebSocketHandler`.

#### Evidence
Padrão consistente com defineRoute/defineAction/defineMiddleware.

#### Files to edit
```
packages/theo/src/server/define-websocket.ts (NEW) — defineWebSocket + WebSocketHandler type
packages/theo/src/server/index.ts (EDIT) — Export defineWebSocket
tests/unit/define-websocket.test.ts (NEW) — Tests
```

#### Deep file dependency analysis
- `define-websocket.ts`: Novo módulo. Zero deps internas. Exporta `defineWebSocket` e `WebSocketHandler`.
- `server/index.ts`: Adiciona re-export.

#### Deep Dives
- **WebSocketHandler**: `{ onOpen?, onMessage?, onClose?, onError? }`. Cada callback recebe `ws` (WebSocket-like object) e event-specific data.
- **ws type**: Para não forçar import de `ws` package nos tipos, o handler usa interfaces genéricas: `ws: { send(data: string): void; close(): void }`.

#### Tasks
1. Criar types e identity function
2. Exportar de server/index.ts
3. Criar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_defineWebSocket_returns_same_ref() — Given handler, When defineWebSocket, Then result === handler
RED:     test_handler_with_all_callbacks() — Given handler with onOpen/onMessage/onClose/onError, When defineWebSocket, Then all preserved
RED:     test_handler_with_onMessage_only() — Given handler with only onMessage, When defineWebSocket, Then works
RED:     test_handler_empty_object() — Given {}, When defineWebSocket, Then returns {}
GREEN:   Implement defineWebSocket
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/define-websocket.test.ts
```

BDD scenarios:
- **Happy path**: All callbacks preserved
- **Validation error**: N/A (identity)
- **Edge case**: Empty handler, only onMessage
- **Error scenario**: N/A (identity)

#### Acceptance Criteria
- [ ] `defineWebSocket(handler) === handler`
- [ ] All callback types correct
- [ ] Exported from `theo/server`
- [ ] Tests pass

#### DoD
- [ ] defineWebSocket implemented
- [ ] Tests GREEN

---

### T0.2 — WebSocket route scanner

#### Objective
Criar `scanWebSocketRoutes(serverDir)` que escaneia `server/ws/` e retorna endpoints.

#### Evidence
File-based routing precisa de scanner (como `scanServerRoutes` para `/api/`).

#### Files to edit
```
packages/theo/src/server/ws-scan.ts (NEW) — Scanner de WS routes
tests/unit/ws-scan.test.ts (NEW) — Tests
fixtures/websocket-basic/ (NEW) — Fixture com WS endpoint
```

#### Deep file dependency analysis
- `ws-scan.ts`: Novo módulo. Importa `readdirSync`, `existsSync`, etc. Retorna `WebSocketRouteNode[]` com `filePath` e `wsPath`.
- Pattern: Muito similar a `server/scan.ts` (API routes) mas com prefixo `/ws/` em vez de `/api/`.

#### Deep Dives
- **WebSocketRouteNode**: `{ filePath: string; wsPath: string }` — `wsPath` é o URL path (ex: `/ws/chat`).
- **Scan logic**: Recursivo, `server/ws/*.ts` → strip extension → `/ws/{name}`. Suporta subdirs: `server/ws/rooms/main.ts` → `/ws/rooms/main`.
- Se `server/ws/` não existe, retorna `[]` (nenhum WS endpoint).

#### Tasks
1. Criar `ws-scan.ts`
2. Criar fixture `fixtures/websocket-basic/`
3. Criar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_scans_ws_directory() — Given server/ws/chat.ts, When scanWebSocketRoutes, Then returns [{wsPath: '/ws/chat'}]
RED:     test_no_ws_dir_returns_empty() — Given server without ws/, When scanWebSocketRoutes, Then returns []
RED:     test_multiple_ws_files() — Given server/ws/chat.ts and events.ts, When scan, Then returns 2 routes
RED:     test_nested_ws_routes() — Given server/ws/rooms/main.ts, When scan, Then wsPath is /ws/rooms/main
RED:     test_ignores_non_ts_files() — Given server/ws/readme.md, When scan, Then not in results
GREEN:   Implement scanWebSocketRoutes
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/ws-scan.test.ts
```

BDD scenarios:
- **Happy path**: Scans ws/ directory and returns routes
- **Validation error**: N/A
- **Edge case**: No ws/ dir → empty array; nested dirs
- **Error scenario**: Non-ts files ignored

#### Acceptance Criteria
- [ ] `scanWebSocketRoutes(serverDir)` returns WS routes
- [ ] Empty when no `server/ws/`
- [ ] Supports nested directories
- [ ] Fixture exists

#### DoD
- [ ] Scanner works
- [ ] Fixture created
- [ ] Tests GREEN

---

## Phase 1: Production Server Integration

**Objective:** HTTP upgrade handler in production server.

### T1.1 — WebSocket upgrade in start.ts

#### Objective
Add `server.on('upgrade')` handler that routes WS connections to matched handlers.

#### Evidence
Production server (`start.ts`) is plain Node.js HTTP server. `ws` library's `noServer: true` pattern is the standard way to share HTTP server.

#### Files to edit
```
packages/theo/src/cli/commands/start.ts (EDIT) — Add upgrade handler
packages/theo/package.json (EDIT) — Add ws as optional peerDep
tests/integration/websocket-prod.test.ts (NEW) — Integration test
```

#### Deep file dependency analysis
- `start.ts`: Add `server.on('upgrade')` after `server.listen()`. Scans WS routes, matches URL, loads module, wires callbacks.
- `package.json`: Add `ws` to `peerDependencies` with `optional: true`.
- `ws` import is conditional: only if `server/ws/` dir exists.

#### Deep Dives
- **Conditional import**: `const { WebSocketServer } = await import('ws')` — dynamic import wrapped in try/catch with clear error message if ws not installed (EC-1 MUST FIX): `throw new Error('WebSocket routes found but "ws" package is not installed. Run: npm install ws')`.
- **Route matching**: Simple string match on `wsPath` (no params for now).
- **Module loading**: Uses `createProductionLoader()` to load WS handler modules.
- **Error handling**: If ws module fails to load, close the socket.

#### Tasks
1. Add ws as optional peerDep
2. Add upgrade handler in start.ts
3. Conditionally create WebSocketServer only when ws routes exist
4. Create integration test

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_ws_peer_dep_optional() — Given package.json, When reading peerDependenciesMeta, Then ws is optional
RED:     test_no_ws_routes_no_upgrade() — Given no server/ws/ dir, When server starts, Then no upgrade listener added
RED:     test_ws_server_created_when_routes_exist() — Given ws routes, When server starts, Then WebSocketServer is created
RED:     test_invalid_ws_url_destroyed() — Given WS connection to /ws/nonexistent, When upgrade, Then socket destroyed
RED:     test_ws_not_installed_clear_error() — Given ws routes exist but ws package not installed, When server starts, Then throws clear error message mentioning 'npm install ws' (EC-1 MUST FIX)
GREEN:   Implement upgrade handler
REFACTOR: None expected
VERIFY:  npx vitest run tests/integration/websocket-prod.test.ts
```

BDD scenarios:
- **Happy path**: WS server created and handles connections
- **Validation error**: N/A
- **Edge case**: No ws routes → no WS server (zero overhead)
- **Error scenario**: Invalid WS URL → socket destroyed

#### Acceptance Criteria
- [ ] `ws` is optional peerDep
- [ ] Upgrade handler routes to correct WS handler
- [ ] No ws routes → no WS server
- [ ] Invalid URLs → socket destroyed

#### DoD
- [ ] Production WS works
- [ ] Tests GREEN

---

## Phase 2: Dev Server Integration

**Objective:** WebSocket support in Vite dev server.

### T2.1 — WebSocket upgrade in dev server

#### Objective
Attach WS upgrade handler to Vite's httpServer in `configureServer`.

#### Evidence
Dev server uses Vite which has its own httpServer. WS upgrade can be attached to it.

#### Files to edit
```
packages/theo/src/vite-plugin/index.ts (EDIT) — Add WS upgrade in configureServer
```

#### Deep file dependency analysis
- `vite-plugin/index.ts`: In `configureServer`, after setting up API middleware, attach `server.httpServer.on('upgrade')` for WS routes.
- Must NOT interfere with Vite's own WS for HMR (which uses `/__vite_hmr` path).

#### Deep Dives
- **Filter**: Only handle upgrade requests starting with `/ws/`. Let Vite handle all others (HMR, etc).
- **Module loading**: Use `vite.ssrLoadModule(filePath)` to load WS handler (same as API routes).
- **httpServer availability**: `server.httpServer` may be null in middleware mode. Guard with `if (!server.httpServer)`.

#### Tasks
1. Add WS upgrade handler in configureServer
2. Filter for `/ws/` prefix
3. Use ssrLoadModule for WS handlers

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_dev_ws_only_handles_ws_prefix() — Given WS upgrade on /other, When upgrade event, Then ignored (Vite handles)
RED:     test_dev_ws_handles_ws_routes() — Given WS upgrade on /ws/chat, When configureServer, Then handler attached
RED:     test_dev_no_ws_dir_no_handler() — Given no server/ws/, When configureServer, Then no upgrade listener
RED:     test_vite_hmr_not_affected() — Given Vite HMR WS, When dev server, Then HMR still works
GREEN:   Implement dev WS upgrade handler
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/ws-dev.test.ts
```

BDD scenarios:
- **Happy path**: Dev WS routes work
- **Validation error**: N/A
- **Edge case**: No ws dir → no handler; HMR unaffected
- **Error scenario**: Invalid ws route → socket destroyed

#### Acceptance Criteria
- [ ] Dev WS works on /ws/ prefix
- [ ] Vite HMR not affected
- [ ] No ws routes → zero overhead
- [ ] Uses ssrLoadModule for handlers

#### DoD
- [ ] Dev WS works
- [ ] Tests GREEN

---

## Phase 3: Regression

**Objective:** Zero regressão.

### T3.1 — Full regression

#### Objective
All existing tests pass.

#### Files to edit
```
Nenhum — apenas execução
```

#### Deep file dependency analysis
N/A.

#### Deep Dives
N/A.

#### Tasks
1. `pnpm typecheck`
2. `pnpm test`
3. `pnpm test:types`
4. `pnpm build`
5. Zero `any` audit
6. E2E tests

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_typecheck() — Given all changes, When pnpm typecheck, Then exit code 0
RED:     test_all_tests() — Given all changes, When pnpm test, Then all pass (451+)
RED:     test_types() — Given all changes, When pnpm test:types, Then all pass (34+)
RED:     test_build() — Given all changes, When pnpm build, Then exit code 0
GREEN:   Already implemented — verifies
REFACTOR: Fix regressions if found
VERIFY:  pnpm typecheck && pnpm test && pnpm test:types && pnpm build
```

BDD scenarios:
- **Happy path**: All pass
- **Validation error**: Regression → fix
- **Edge case**: New tests increase count
- **Error scenario**: start.ts changes break existing tests → fix

#### Acceptance Criteria
- [ ] `pnpm typecheck` zero errors
- [ ] `pnpm test` — 451+ tests green
- [ ] `pnpm test:types` — 34+ type tests green
- [ ] `pnpm build` exit code 0
- [ ] Zero `any`
- [ ] E2E tests pass

#### DoD
- [ ] Zero regressão

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | defineWebSocket identity function | T0.1 | Same pattern as defineRoute |
| 2 | WebSocketHandler types | T0.1 | onOpen/onMessage/onClose/onError |
| 3 | File-based WS routing | T0.2 | server/ws/*.ts → /ws/* |
| 4 | WS route scanner | T0.2 | scanWebSocketRoutes() |
| 5 | Production WS upgrade | T1.1 | server.on('upgrade') with ws lib |
| 6 | ws as optional peerDep | T1.1 | peerDependenciesMeta optional |
| 7 | Dev WS upgrade | T2.1 | Vite httpServer upgrade handler |
| 8 | HMR not affected | T2.1 | /ws/ prefix filter |
| 9 | Zero overhead without WS | T0.2, T1.1, T2.1 | Empty scan → no WS server |
| 10 | Fixture | T0.2 | fixtures/websocket-basic/ |
| 11 | Backward compat | T3.1 | Full regression |

**Coverage: 11/11 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-3)
- [ ] All tests passing (`pnpm test` — 451+)
- [ ] All type tests passing (`pnpm test:types` — 34+)
- [ ] Zero TypeScript errors
- [ ] Zero `any`
- [ ] `pnpm build` exit code 0
- [ ] `defineWebSocket` exported from `theo/server`
- [ ] `scanWebSocketRoutes` scans server/ws/
- [ ] Production server handles WS upgrade
- [ ] Dev server handles WS upgrade
- [ ] Vite HMR unaffected
- [ ] `ws` is optional peerDep
- [ ] Zero breaking changes
- [ ] **Dogfood QA PASS** — `/dogfood full` health score >= 70

## Final Phase: Dogfood QA (MANDATORY)

**Objective:** Validate WS support works end-to-end.

### Execution
Run `/dogfood full`.

### Acceptance Criteria
- [ ] Health score >= 70/100
- [ ] Zero CRITICAL issues
- [ ] CSR + SSR fixtures still work
- [ ] WS fixture exists
