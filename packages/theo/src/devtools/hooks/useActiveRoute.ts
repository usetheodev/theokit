/**
 * T3.1 — Track the current pathname and dispatch ROUTE_MATCHED
 * with the matching route's layoutChain + leaf.
 *
 * Subscribes to `popstate` events; also patches history.pushState/replaceState
 * to fire a synthetic 'theo:devtools:locationchange' event so SPA navigation
 * is captured.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { useEffect } from 'react'

import type { RouteManifest } from '../shared.js'

import { useDevtoolsContext } from './useDevtoolsContext.js'

const LOCATION_CHANGE_EVENT = 'theo:devtools:locationchange'

let _historyPatched = false

function patchHistoryOnce(): void {
  if (_historyPatched || typeof history === 'undefined') return
  _historyPatched = true
  const originalPush = history.pushState.bind(history)
  const originalReplace = history.replaceState.bind(history)
  history.pushState = function patchedPush(...args) {
    originalPush(...args)
    window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT))
  }
  history.replaceState = function patchedReplace(...args) {
    originalReplace(...args)
    window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT))
  }
}

/**
 * Match a runtime pathname against the manifest's route patterns.
 *
 * The route's `path` may contain `:slug` / `:slug?` / `*` style params
 * (the framework lifts react-router-style patterns). For v0 we do an
 * exact-or-prefix match: if the pathname equals the pattern after
 * normalizing trailing slash, return that route; otherwise pick the
 * longest-prefix match.
 *
 * Exported for unit testing.
 */
export function matchActiveRoute(
  pathname: string,
  manifest: RouteManifest,
): { path: string; chain: string[] } | null {
  const norm = (s: string) => (s.length > 1 && s.endsWith('/') ? s.slice(0, -1) : s)
  const target = norm(pathname)

  // Exact match wins
  for (const route of manifest.routes) {
    if (norm(route.path) === target) {
      return { path: route.path, chain: [...route.layoutChain, route.absoluteFilePath] }
    }
  }

  // Otherwise longest-prefix match (for nested routes)
  let best: { path: string; chain: string[] } | null = null
  let bestLen = -1
  for (const route of manifest.routes) {
    const rp = norm(route.path)
    if (rp === '/' || target.startsWith(`${rp}/`)) {
      const len = rp.length
      if (len > bestLen) {
        bestLen = len
        best = { path: route.path, chain: [...route.layoutChain, route.absoluteFilePath] }
      }
    }
  }
  return best
}

export function useActiveRoute(): void {
  const { state, dispatch } = useDevtoolsContext()
  const manifest = state.routeManifest

  useEffect(() => {
    if (typeof window === 'undefined') return
    patchHistoryOnce()

    function update(): void {
      if (!manifest) return
      const match = matchActiveRoute(window.location.pathname, manifest)
      if (match) {
        dispatch({ type: 'ROUTE_MATCHED', path: match.path, chain: match.chain })
      }
    }

    // Initial match
    update()

    window.addEventListener('popstate', update)
    window.addEventListener(LOCATION_CHANGE_EVENT, update)

    return () => {
      window.removeEventListener('popstate', update)
      window.removeEventListener(LOCATION_CHANGE_EVENT, update)
    }
  }, [dispatch, manifest])
}
