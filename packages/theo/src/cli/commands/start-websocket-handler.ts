/**
 * WebSocket upgrade handler for `theokit start` (T4.2 architecture-cleanup).
 *
 * Wires `server.on('upgrade')` for declared WS routes. Opt-in: only attached
 * when `wsRoutes.length > 0`. Lazy-imports `ws` package — throws an actionable
 * error when wsRoutes declared but `ws` not installed.
 */

import type { Server as HttpServer } from 'node:http'

import type * as WsLib from 'ws'

import type { WebSocketHandler } from '../../server/define/define-websocket.js'
import type { LoadModule } from '../../server/scan/module-loader.js'
import type { WebSocketRouteNode } from '../../server/scan/ws-scan.js'

export async function attachWebSocketHandler(
  server: HttpServer,
  wsRoutes: WebSocketRouteNode[],
  loadModule: LoadModule,
): Promise<void> {
  if (wsRoutes.length === 0) return

  let WebSocketServerCtor: typeof WsLib.WebSocketServer
  try {
    const wsModule = await import('ws')
    WebSocketServerCtor = wsModule.WebSocketServer
  } catch {
    throw new Error('WebSocket routes found but "ws" package is not installed. Run: npm install ws')
  }

  const wss = new WebSocketServerCtor({ noServer: true })

  server.on('upgrade', (request, socket, head) => {
    void (async () => {
      const url = request.url ?? '/'
      if (!url.startsWith('/ws/')) {
        socket.destroy()
        return
      }

      const wsPath = url.split('?')[0]
      const match = wsRoutes.find((r) => r.wsPath === wsPath)
      if (!match) {
        socket.destroy()
        return
      }

      try {
        const mod = await loadModule(match.filePath)
        const handler = ((mod as { default?: unknown }).default ?? mod) as WebSocketHandler

        wss.handleUpgrade(request, socket, head, (ws) => {
          handler.onOpen?.(ws, request)
          ws.on('message', (data: Buffer) => {
            handler.onMessage?.(ws, data.toString())
          })
          ws.on('close', (code: number, reason: Buffer) => {
            handler.onClose?.(ws, code, reason)
          })
          ws.on('error', (err: Error) => {
            handler.onError?.(ws, err)
          })
        })
      } catch {
        socket.destroy()
      }
    })()
  })
}
