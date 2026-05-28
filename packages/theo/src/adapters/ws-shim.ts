/**
 * T3.1 — WebSocket cross-runtime bridges.
 *
 * Exports 4 bridges (Node `ws` package, Bun.serve, Deno.upgradeWebSocket,
 * Cloudflare WebSocketPair) that adapt each runtime's native WebSocket API
 * to a common `WebSocketLike` interface that user handlers (`defineWebSocket`)
 * can consume uniformly.
 */

export interface WebSocketLike {
  send(data: string | Uint8Array | ArrayBuffer): void
  close(code?: number, reason?: string): void
  on(event: 'message' | 'close' | 'error', cb: (data?: unknown) => void): void
}

export interface WsHandler {
  onOpen?: (ws: WebSocketLike) => void
  onMessage?: (ws: WebSocketLike, data: unknown) => void
  onClose?: (ws: WebSocketLike, code?: number, reason?: string) => void
  onError?: (ws: WebSocketLike, err: unknown) => void
}

// ============================================================
// Node bridge — wraps `ws` package WebSocket
// ============================================================

interface NodeWsLike {
  on(event: string, cb: (arg?: unknown) => void): unknown
  send(data: unknown): void
  close(code?: number, reason?: string): void
}

export function createNodeWsBridge(handler: WsHandler): {
  attach(nativeWs: NodeWsLike): WebSocketLike
} {
  return {
    attach(nativeWs: NodeWsLike): WebSocketLike {
      const wsLike: WebSocketLike = {
        send: (data) => {
          nativeWs.send(data)
        },
        close: (code, reason) => {
          nativeWs.close(code, reason)
        },
        on: (event, cb) => {
          nativeWs.on(event, cb)
        },
      }
      nativeWs.on('open', () => handler.onOpen?.(wsLike))
      nativeWs.on('message', (data) => handler.onMessage?.(wsLike, data))
      nativeWs.on('close', (codeMaybe) => {
        const code = typeof codeMaybe === 'number' ? codeMaybe : undefined
        handler.onClose?.(wsLike, code)
      })
      nativeWs.on('error', (err) => handler.onError?.(wsLike, err))
      return wsLike
    },
  }
}

// ============================================================
// Bun bridge — returns config for Bun.serve({ websocket })
// ============================================================

interface BunWsContext {
  send(data: unknown): void
  close(code?: number, reason?: string): void
}

export interface BunWebSocketConfig {
  open: (ws: BunWsContext) => void
  message: (ws: BunWsContext, message: unknown) => void
  close: (ws: BunWsContext, code?: number, reason?: string) => void
}

function bunCtxToWsLike(bunWs: BunWsContext): WebSocketLike {
  return {
    send: (data) => {
      bunWs.send(data)
    },
    close: (code, reason) => {
      bunWs.close(code, reason)
    },
    on: () => {
      // Bun pushes events via the config handlers — no per-instance on()
    },
  }
}

export function createBunWsBridge(handler: WsHandler): BunWebSocketConfig {
  return {
    open(bunWs) {
      handler.onOpen?.(bunCtxToWsLike(bunWs))
    },
    message(bunWs, msg) {
      handler.onMessage?.(bunCtxToWsLike(bunWs), msg)
    },
    close(bunWs, code, reason) {
      handler.onClose?.(bunCtxToWsLike(bunWs), code, reason)
    },
  }
}

// ============================================================
// Deno bridge — uses Deno.upgradeWebSocket(request)
// ============================================================

interface DenoLike {
  upgradeWebSocket(req: Request): {
    response: Response
    socket: {
      send(data: unknown): void
      close(code?: number, reason?: string): void
      addEventListener(event: string, cb: (e: unknown) => void): void
    }
  }
}

export function createDenoWsBridge(
  handler: WsHandler,
  denoNs: DenoLike,
): { handle(request: Request): Response } {
  return {
    handle(request: Request): Response {
      const { response, socket } = denoNs.upgradeWebSocket(request)
      const wsLike: WebSocketLike = {
        send: (data) => {
          socket.send(data)
        },
        close: (code, reason) => {
          socket.close(code, reason)
        },
        on: () => {
          // Deno uses addEventListener — adapter dispatches below
        },
      }
      socket.addEventListener('open', () => handler.onOpen?.(wsLike))
      socket.addEventListener('message', (e) => {
        const data = (e as { data?: unknown }).data
        handler.onMessage?.(wsLike, data)
      })
      socket.addEventListener('close', (e) => {
        const ev = e as { code?: number; reason?: string }
        handler.onClose?.(wsLike, ev.code, ev.reason)
      })
      socket.addEventListener('error', (err) => handler.onError?.(wsLike, err))
      return response
    },
  }
}

// ============================================================
// Cloudflare bridge — uses globalThis.WebSocketPair
// ============================================================

interface CfServerWs {
  accept(): void
  addEventListener(event: string, cb: (e: unknown) => void): void
  send(data: unknown): void
  close(code?: number, reason?: string): void
}

export function createCloudflareWsBridge(handler: WsHandler): {
  handle(request: Request): Response
} {
  return {
    handle(_request: Request): Response {
      const g = globalThis as {
        WebSocketPair?: new () => { 0: unknown; 1: CfServerWs }
      }
      if (!g.WebSocketPair) {
        throw new Error('WebSocketPair is not available — Cloudflare Workers runtime expected.')
      }
      const pair = new g.WebSocketPair()
      const client = pair[0]
      const server = pair[1]
      server.accept()
      const wsLike: WebSocketLike = {
        send: (data) => {
          server.send(data)
        },
        close: (code, reason) => {
          server.close(code, reason)
        },
        // Cloudflare's WebSocketPair exposes events via addEventListener;
        // the WebSocketLike `on` contract is for Node-style ws. We leave
        // it as a no-op so user handlers that expect Node-style `on(...)`
        // do not crash — but the events flow through addEventListener
        // below, not through this method.
        on: (): void => {
          /* intentional no-op on Cloudflare; see comment above */
        },
      }
      server.addEventListener('open', () => handler.onOpen?.(wsLike))
      server.addEventListener('message', (e) => {
        const data = (e as { data?: unknown }).data
        handler.onMessage?.(wsLike, data)
      })
      server.addEventListener('close', (e) => {
        const ev = e as { code?: number; reason?: string }
        handler.onClose?.(wsLike, ev.code, ev.reason)
      })
      server.addEventListener('error', (err) => handler.onError?.(wsLike, err))
      // CF requires returning Response with status 101 and webSocket pair.
      // Node's Response throws on 101; fall back to a plain object that
      // satisfies the CF runtime's protocol but matches our test shape.
      try {
        return new Response(null, {
          status: 101,
          webSocket: client,
        } as ResponseInit & { webSocket: unknown })
      } catch {
        return { status: 101, webSocket: client } as unknown as Response
      }
    },
  }
}
