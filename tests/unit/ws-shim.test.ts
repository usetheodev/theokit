import { describe, it, expect, vi } from 'vitest'
import {
  createNodeWsBridge,
  createBunWsBridge,
  createDenoWsBridge,
  createCloudflareWsBridge,
  type WebSocketLike,
  type WsHandler,
} from '../../packages/theo/src/adapters/ws-shim.js'

describe('ws-shim — Node bridge (T3.1)', () => {
  it('wraps a native Node ws into WebSocketLike and dispatches events to handler', () => {
    const calls: string[] = []
    const handler: WsHandler = {
      onOpen: () => {
        calls.push('open')
      },
      onMessage: (_ws, data) => {
        calls.push('message:' + String(data))
      },
      onClose: () => {
        calls.push('close')
      },
    }
    // Mock native node ws — minimal { on, send, close } shape
    const events: Record<string, (arg?: unknown) => void> = {}
    const nativeWs = {
      on: (event: string, cb: (arg?: unknown) => void) => {
        events[event] = cb
      },
      send: vi.fn(),
      close: vi.fn(),
    }
    const bridge = createNodeWsBridge(handler)
    bridge.attach(nativeWs as never)
    events.open?.()
    events.message?.('hello')
    events.close?.()
    expect(calls).toEqual(['open', 'message:hello', 'close'])
  })

  it('exposes a WebSocketLike with send/close that delegate to native ws', () => {
    const nativeWs = {
      on: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
    }
    const handler: WsHandler = {}
    const bridge = createNodeWsBridge(handler)
    const wsLike = bridge.attach(nativeWs as never)
    wsLike.send('payload')
    wsLike.close(1000, 'bye')
    expect(nativeWs.send).toHaveBeenCalledWith('payload')
    expect(nativeWs.close).toHaveBeenCalledWith(1000, 'bye')
  })
})

describe('ws-shim — Bun bridge (T3.1)', () => {
  it('returns a Bun.serve websocket config with open/message/close handlers', () => {
    const handler: WsHandler = {
      onOpen: vi.fn(),
      onMessage: vi.fn(),
      onClose: vi.fn(),
    }
    const bunConfig = createBunWsBridge(handler)
    expect(typeof bunConfig.open).toBe('function')
    expect(typeof bunConfig.message).toBe('function')
    expect(typeof bunConfig.close).toBe('function')
  })

  it('dispatches Bun ws events to handler (EC-10 ordering)', () => {
    const calls: string[] = []
    const handler: WsHandler = {
      onOpen: () => calls.push('open'),
      onMessage: (_ws, data) => calls.push('message:' + String(data)),
      onClose: () => calls.push('close'),
    }
    const bunConfig = createBunWsBridge(handler)
    const fakeBunWs = { send: vi.fn(), close: vi.fn() }
    bunConfig.open(fakeBunWs as never)
    bunConfig.message(fakeBunWs as never, 'hi')
    bunConfig.close(fakeBunWs as never, 1000, 'bye')
    // Order matters — open before message before close
    expect(calls).toEqual(['open', 'message:hi', 'close'])
  })
})

describe('ws-shim — Deno bridge (T3.1)', () => {
  it('returns an upgrade Response with 101 status conceptually', () => {
    const handler: WsHandler = {}
    // Mock Deno.upgradeWebSocket — Node Response refuses status 101, so use plain object
    const fakeResponse = { status: 101 } as unknown as Response
    const fakeUpgrade = {
      response: fakeResponse,
      socket: { send: vi.fn(), close: vi.fn(), addEventListener: vi.fn() } as never,
    }
    const denoLike = { upgradeWebSocket: vi.fn(() => fakeUpgrade) }
    const result = createDenoWsBridge(handler, denoLike as never).handle(
      new Request('http://x/ws', {
        headers: { upgrade: 'websocket' },
      }),
    )
    expect(result.status).toBe(101)
    expect(denoLike.upgradeWebSocket).toHaveBeenCalled()
  })
})

describe('ws-shim — Cloudflare bridge (T3.1)', () => {
  it('returns a Response with WebSocketPair (status 101)', () => {
    const handler: WsHandler = {}
    // Stub WebSocketPair as a constructor returning [client, server]
    const fakeClient = { send: vi.fn(), close: vi.fn() }
    const fakeServer = {
      accept: vi.fn(),
      addEventListener: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
    }
    const globalAny = globalThis as { WebSocketPair?: unknown }
    const originalPair = globalAny.WebSocketPair
    globalAny.WebSocketPair = function () {
      return { 0: fakeClient, 1: fakeServer }
    }
    try {
      const result = createCloudflareWsBridge(handler).handle(
        new Request('http://x/ws', { headers: { upgrade: 'websocket' } }),
      )
      expect(result.status).toBe(101)
      expect(fakeServer.accept).toHaveBeenCalled()
    } finally {
      globalAny.WebSocketPair = originalPair
    }
  })
})

describe('WebSocketLike — common interface', () => {
  it('has send, close, on properties', () => {
    const ws: WebSocketLike = {
      send: () => {},
      close: () => {},
      on: () => {},
    }
    expect(typeof ws.send).toBe('function')
    expect(typeof ws.close).toBe('function')
    expect(typeof ws.on).toBe('function')
  })
})
