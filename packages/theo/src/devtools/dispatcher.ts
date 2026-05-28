/**
 * T2.1 — Devtools dispatcher with pre-mount event queue.
 *
 * Pattern: events emitted from anywhere (server WS, browser console.error,
 * dispatcher.onCsrfWarn) can fire BEFORE the React tree mounts. Each call
 * either dispatches immediately (when `setDispatch` registered a dispatch
 * fn) or queues until React is ready, then flushes on first mount.
 *
 * EC-23: queue capped at MAX_QUEUE_SIZE (FIFO eviction).
 * EC-24: setDispatch is idempotent — flush only on NULL → non-null
 *   transition (StrictMode re-mount safe).
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import {
  type CsrfWarnPayload,
  type DevtoolsAction,
  type ErrorRecord,
  MAX_QUEUE_SIZE,
  type RequestRecord,
  type RouteManifest,
} from './shared.js'

type Dispatch = (action: DevtoolsAction) => void
type QueuedItem = (d: Dispatch) => void

let _dispatch: Dispatch | null = null
const _queue: QueuedItem[] = []

function queuable<Args extends unknown[]>(
  fn: (d: Dispatch, ...args: Args) => void,
): (...args: Args) => void {
  return (...args: Args) => {
    if (_dispatch) {
      try {
        fn(_dispatch, ...args)
      } catch (err) {
        // EC-25: an error inside reducer-bound dispatch path MUST NOT bubble
        // to the original event source (e.g. logger / HMR callback / global
        // error handler). Log and continue.

        console.error('[theo devtools] dispatch failed', err)
      }
    } else {
      // EC-23: cap queue, FIFO-evict if full
      if (_queue.length >= MAX_QUEUE_SIZE) _queue.shift()
      _queue.push((d) => {
        fn(d, ...args)
      })
    }
  }
}

function flushQueue(): void {
  while (_queue.length) {
    const fn = _queue.shift()
    if (!fn || !_dispatch) break
    try {
      fn(_dispatch)
    } catch (err) {
      console.error('[theo devtools] queued event failed', err)
    }
  }
}

export const dispatcher = {
  onRequest: queuable((d: Dispatch, req: RequestRecord) => {
    d({ type: 'REQUEST_ADD', request: req })
  }),
  onError: queuable((d: Dispatch, err: ErrorRecord) => {
    d({ type: 'ERROR_ADD', error: err })
  }),
  onCsrfWarn: queuable((d: Dispatch, payload: CsrfWarnPayload) => {
    d({ type: 'CSRF_WARN', payload })
  }),
  onManifestUpdated: queuable((d: Dispatch, manifest: RouteManifest) => {
    d({ type: 'MANIFEST_UPDATED', manifest })
  }),
  onRouteMatched: queuable((d: Dispatch, path: string, chain: string[]) => {
    d({ type: 'ROUTE_MATCHED', path, chain })
  }),

  /**
   * Wire React's dispatch function in. Idempotent (EC-24): only the
   * NULL → non-null transition flushes the queue; subsequent non-null
   * sets just replace the reference (used for StrictMode re-mount).
   */
  setDispatch(d: Dispatch | null): void {
    const prev = _dispatch
    _dispatch = d
    if (d && !prev) flushQueue()
  },

  /** Testing helper — clear queue + dispatch reference between tests. */
  _reset(): void {
    _dispatch = null
    _queue.length = 0
  },

  /** Testing helper — observe queue length. */
  _queueLength(): number {
    return _queue.length
  },
}

export type Dispatcher = typeof dispatcher
