# Onda 17 — SOTA Research: WebSocket Support

**Data:** 2026-05-09
**Pesquisador:** Claude (SOTA Research Skill)
**Escopo:** WebSocket support para o Theo — server-side WS com `ws` library, integração com HTTP server, `defineWebSocket` pattern.

---

## 1. Análise Honesta: O Theo Precisa de WebSocket Built-in?

### O que o Theo já tem para realtime

O Theo desde a Onda 11 suporta **streaming responses** via ReadableStream. Um handler pode retornar `new Response(readableStream, { headers: { 'Content-Type': 'text/event-stream' } })` para Server-Sent Events (SSE). Isso cobre:

- AI/LLM streaming responses
- Live notifications (server → client)
- Real-time data feeds
- Progress updates

### O que SSE NÃO cobre (e WebSocket resolve)

- **Bidirecional**: SSE é server → client only. WebSocket é full-duplex.
- **Chat/messaging**: Client envia mensagens em tempo real.
- **Multiplayer/collaboration**: Múltiplos clients sincronizando estado.
- **Baixa latência**: WS tem menos overhead que HTTP requests repetidos.

### O que frameworks fazem

| Framework | WebSocket | Abordagem |
|-----------|-----------|-----------|
| **Next.js** | ❌ Não built-in | User usa ws/socket.io com custom server |
| **Remix** | ❌ Não built-in | User usa ws com Express adapter |
| **Hono** | ✅ Built-in helper | `upgradeWebSocket()` — runtime-specific adapters |
| **Fastify** | ✅ Plugin | `@fastify/websocket` — wraps ws |
| **SvelteKit** | ❌ Não built-in | User uses adapter-specific WS |
| **Rails** | ✅ Built-in | ActionCable — full pub/sub system |

### Decisão: WebSocket MINIMAL built-in

O Theo é opinativo como Rails. WebSocket built-in faz sentido. Mas mantendo KISS:

1. **`defineWebSocket()` helper** — identity function (como defineRoute)
2. **`ws` como peerDependency** — lib mais usada, 31k+ projects
3. **Integração com HTTP server** — upgrade handler no production server
4. **Dev server**: Vite já tem WS para HMR, não interferir
5. **File convention**: `server/ws/chat.ts` → WebSocket endpoint em `/ws/chat`

---

## 2. API Design

### `defineWebSocket()` — Pattern

```typescript
// server/ws/chat.ts
import { defineWebSocket } from 'theo/server'

export default defineWebSocket({
  onOpen(ws) {
    console.log('Client connected')
  },
  onMessage(ws, message) {
    // Echo back
    ws.send(`Echo: ${message}`)
  },
  onClose(ws) {
    console.log('Client disconnected')
  },
})
```

### WebSocket Handler Type

```typescript
interface WebSocketHandler {
  onOpen?: (ws: WebSocket, req: IncomingMessage) => void
  onMessage?: (ws: WebSocket, data: string | Buffer) => void
  onClose?: (ws: WebSocket, code: number, reason: string) => void
  onError?: (ws: WebSocket, error: Error) => void
}

function defineWebSocket(handler: WebSocketHandler): WebSocketHandler {
  return handler  // identity function
}
```

### File-Based WebSocket Routing

```
server/ws/
├── chat.ts    → ws://localhost:3000/ws/chat
└── events.ts  → ws://localhost:3000/ws/events
```

**Scanner**: Like `scanServerRoutes()` but for `server/ws/` directory. Produces `WebSocketRouteNode[]`.

### Production Server Integration

```typescript
// In start.ts
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (request, socket, head) => {
  const url = request.url ?? '/'
  if (!url.startsWith('/ws/')) return socket.destroy()
  
  const wsRoutes = scanWebSocketRoutes(serverDir)
  const match = matchWsRoute(url, wsRoutes)
  if (!match) return socket.destroy()
  
  wss.handleUpgrade(request, socket, head, (ws) => {
    const handler = loadModule(match.filePath)
    handler.onOpen?.(ws, request)
    ws.on('message', (data) => handler.onMessage?.(ws, data))
    ws.on('close', (code, reason) => handler.onClose?.(ws, code, reason))
    ws.on('error', (err) => handler.onError?.(ws, err))
  })
})
```

### Dev Server Integration

Em dev, o Vite já usa WebSocket para HMR na mesma porta. O Theo NÃO pode usar o mesmo WS server do Vite para app WebSockets.

**Opções:**
- **A**: Porta separada para WS em dev → confuso para o user
- **B**: Usar o Vite `server.ws` para proxy → complexo, frágil
- **C**: Attach ao HTTP server do Vite via `configureServer` → funciona

**Decisão: C** — usar o HTTP server do Vite via `server.httpServer.on('upgrade', ...)`.

---

## 3. Dependências

### `ws` como peerDependency

```json
{
  "peerDependencies": {
    "ws": "^8.0.0"
  },
  "peerDependenciesMeta": {
    "ws": { "optional": true }
  }
}
```

**Optional**: User que não usa WebSocket não precisa instalar `ws`. Se `server/ws/` não existe, nenhum código WS é carregado.

### Types

```json
{
  "devDependencies": {
    "@types/ws": "^8.0.0"
  }
}
```

---

## 4. Impacto

| Item | Mudança |
|------|---------|
| Arquivos novos | 3 (`server/websocket.ts`, `server/ws-scan.ts`, `server/define-websocket.ts`) |
| Arquivos modificados | 3 (`start.ts`, `vite-plugin/index.ts`, `server/index.ts`) |
| Deps novas | 1 peerDep (`ws`, optional) |
| Testes novos | ~10 |
| Breaking changes | Zero |

---

## 5. O Que NÃO Fazer

| Tentação | Por que NÃO |
|----------|-----------|
| Criar pub/sub system (ActionCable) | YAGNI. User que precisa de rooms/channels usa socket.io. |
| WebSocket authentication built-in | User faz auth no `onOpen` via cookie/token do request. |
| WebSocket broadcasting helpers | YAGNI. `ws.send()` é suficiente para MVP. |
| socket.io como dependency | Peso desnecessário. `ws` é suficiente. |
| Client-side WebSocket wrapper | `new WebSocket(url)` é Web Standard. Zero need for wrapper. |

---

## Sources

- [ws — Node.js WebSocket library](https://github.com/websockets/ws)
- [Node.js native WebSocket docs](https://nodejs.org/learn/getting-started/websocket)
- [Hono WebSocket Helper](https://hono.dev/docs/helpers/websocket)
- [@hono/node-ws on npm](https://www.npmjs.com/package/@hono/node-ws)
- [Hono WebSocket source](https://github.com/honojs/hono/blob/main/src/helper/websocket/index.ts)
