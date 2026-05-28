/**
 * core/contracts/route-node.ts
 *
 * Canonical home for `RouteNode` (file-system route tree shape) — consumed
 * by `router/`, `vite-plugin/`, AND `devtools/server-side/`. Moved here in
 * T2.2 of architecture-cleanup so `devtools → core/contracts` is the legal
 * edge (replacing the prior `devtools → router` violation).
 */

export interface RouteNode {
  segment: string
  path: string
  page?: string
  layout?: string
  error?: string
  loading?: string
  notFound?: string
  children: RouteNode[]
}
