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
import type { Dispatcher } from './dispatcher.js'
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

// `wrap` adapts a typed handler `(data: T) => void` into the untyped
// Vite HMR contract `(data: unknown) => void`, casting once at the
// boundary. `T` appears only on the argument by design — the cast IS
// the value of the helper. ESLint flags this as `unnecessary-type-
// parameters`, but removing T would force every call site to cast
// internally, which is worse for readability.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T is the documentation; the cast lives here so call sites don't repeat it
function wrap<T>(label: string, fn: (data: T) => void): (data: unknown) => void {
  return (data: unknown): void => {
    try {
      fn(data as T)
    } catch (err) {
      // EC-25: never propagate to HMR
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
    // No HMR client (production, build, or non-Vite). No-op subscription
    // — unsubscribe() is a documented contract that intentionally does
    // nothing in this path.
    return {
      unsubscribe(): void {
        /* no-op: nothing to detach in non-HMR contexts */
      },
    }
  }

  const reqHandler = wrap<RequestRecord>('request', (req) => {
    dispatcher.onRequest(req)
  })
  const errHandler = wrap<ErrorRecord>('error', (err) => {
    dispatcher.onError(err)
  })
  const csrfHandler = wrap<CsrfWarnPayload>('csrf.warn', (p) => {
    dispatcher.onCsrfWarn(p)
  })
  const manifestHandler = wrap<RouteManifest>('manifest', (m) => {
    dispatcher.onManifestUpdated(m)
  })
  const routeMatchedHandler = wrap<{ path: string; chain: string[] }>(
    'route-matched',
    ({ path, chain }) => {
      dispatcher.onRouteMatched(path, chain)
    },
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
