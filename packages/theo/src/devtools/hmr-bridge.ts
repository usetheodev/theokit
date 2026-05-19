/**
 * T2.1 — HMR bridge: subscribes the dispatcher to server-side events
 * delivered over Vite's HMR WebSocket (`import.meta.hot.on`).
 *
 * Server-side code calls `server.ws.send({ type: 'custom', event, data })`
 * via `broadcastToDevtools`; this bridge wires the client-side listener.
 *
 * EC-25: each callback wrapped in try/catch — a throwing reducer / type
 * mismatch must NOT propagate to Vite's HMR client (would kill HMR).
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import {
  CHANNEL_CSRF_WARN,
  CHANNEL_ERROR,
  CHANNEL_MANIFEST,
  CHANNEL_REQUEST,
  CHANNEL_ROUTE_MATCHED,
  type CsrfWarnPayload,
  type ErrorRecord,
  type RequestRecord,
  type RouteManifest,
} from './shared.js'
import type { Dispatcher } from './dispatcher.js'

export interface ViteHot {
  on(event: string, cb: (data: unknown) => void): void
  off?: (event: string, cb: (data: unknown) => void) => void
  send?: (event: string, data?: unknown) => void
}

function getHot(): ViteHot | null {
  // import.meta.hot is undefined in production / non-Vite contexts.
  try {
    const hot = (import.meta as { hot?: ViteHot }).hot
    if (hot) return hot
  } catch {
    /* fall through */
  }
  // Test escape hatch — allow tests to inject a fake hot via globalThis.
  const g = (globalThis as { __theoViteHotForTests?: ViteHot }).__theoViteHotForTests
  return g ?? null
}

function wrap<T>(label: string, fn: (data: T) => void): (data: unknown) => void {
  return (data: unknown) => {
    try {
      fn(data as T)
    } catch (err) {
      // EC-25: never propagate to HMR
      // eslint-disable-next-line no-console
      console.error(`[theo devtools] ${label} callback failed`, err)
    }
  }
}

export interface BridgeSubscription {
  unsubscribe(): void
}

/**
 * Subscribe the dispatcher to all Theo devtools HMR channels.
 * Returns an unsubscribe function. No-op when not in dev / non-Vite context.
 */
export function subscribeToServerEvents(dispatcher: Dispatcher): BridgeSubscription {
  const hot = getHot()
  if (!hot) {
    // No HMR client (production, build, or non-Vite). No-op.
    return { unsubscribe: () => {} }
  }

  const reqHandler = wrap<RequestRecord>('request', (req) => dispatcher.onRequest(req))
  const errHandler = wrap<ErrorRecord>('error', (err) => dispatcher.onError(err))
  const csrfHandler = wrap<CsrfWarnPayload>('csrf.warn', (p) => dispatcher.onCsrfWarn(p))
  const manifestHandler = wrap<RouteManifest>('manifest', (m) => dispatcher.onManifestUpdated(m))
  const routeMatchedHandler = wrap<{ path: string; chain: string[] }>(
    'route-matched',
    ({ path, chain }) => dispatcher.onRouteMatched(path, chain),
  )

  hot.on(CHANNEL_REQUEST, reqHandler)
  hot.on(CHANNEL_ERROR, errHandler)
  hot.on(CHANNEL_CSRF_WARN, csrfHandler)
  hot.on(CHANNEL_MANIFEST, manifestHandler)
  hot.on(CHANNEL_ROUTE_MATCHED, routeMatchedHandler)

  // T3.1 — solicit the latest manifest. The initial manifest broadcast
  // happens during `load()` for the manifest virtual module, which fires
  // BEFORE this bridge subscribes (typical page-load race). By sending a
  // request-manifest message AFTER subscribing, the server replies and
  // the bridge catches it. Fire-and-forget: safe even if server ignores.
  try {
    hot.send?.('theo:devtools:request-manifest', null)
  } catch {
    /* no-op */
  }

  return {
    unsubscribe() {
      hot.off?.(CHANNEL_REQUEST, reqHandler)
      hot.off?.(CHANNEL_ERROR, errHandler)
      hot.off?.(CHANNEL_CSRF_WARN, csrfHandler)
      hot.off?.(CHANNEL_MANIFEST, manifestHandler)
      hot.off?.(CHANNEL_ROUTE_MATCHED, routeMatchedHandler)
    },
  }
}
