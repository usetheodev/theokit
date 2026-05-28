/**
 * T3.1 — Translate the server-side RouteNode tree into the devtools-facing
 * RouteManifest shape, then broadcast over the HMR bridge.
 *
 * No-op in production / when no dev server is attached.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import type { RouteNode } from '../../core/contracts/route-node.js'
import type { RouteInfo, RouteManifest } from '../shared.js'

import { broadcastToDevtools } from './broadcast.js'

interface FlattenAccumulator {
  routes: RouteInfo[]
}

function buildPath(parents: string[], segment: string): string {
  const joined = [...parents, segment].filter(Boolean).join('/')
  return '/' + joined
}

function walk(
  node: RouteNode,
  parents: string[],
  layoutChain: string[],
  acc: FlattenAccumulator,
): void {
  const path = buildPath(parents, node.segment)
  // Layout file (if any) joins the chain for any descendant page.
  const nextChain = node.layout ? [...layoutChain, node.layout] : layoutChain

  if (node.page) {
    acc.routes.push({
      path,
      absoluteFilePath: node.page,
      layoutChain: [...layoutChain], // freeze chain at this leaf
      hasLoading: Boolean(node.loading),
      hasError: Boolean(node.error),
      hasNotFound: Boolean(node.notFound),
    })
  }

  for (const child of node.children) {
    const nextParents = node.segment ? [...parents, node.segment] : parents
    walk(child, nextParents, nextChain, acc)
  }
}

/**
 * Pure helper: convert RouteNode tree → RouteManifest for the devtools UI.
 * Exported for testing.
 */
export function buildRouteManifest(tree: RouteNode): RouteManifest {
  const acc: FlattenAccumulator = { routes: [] }
  walk(tree, [], [], acc)
  return { routes: acc.routes }
}

/**
 * Broadcast the manifest to the devtools UI over the HMR bridge.
 * Safe to call from any dev-server context — no-op in production.
 */
export function broadcastRouteManifest(tree: RouteNode): void {
  const manifest = buildRouteManifest(tree)
  broadcastToDevtools('theo:devtools:manifest', manifest)
}
