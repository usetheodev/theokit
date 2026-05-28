// T2.2 (architecture-cleanup) — RouteNode moved to core/contracts/route-node.ts
// (canonical home per ADR-0001 v3). Re-export keeps the local path stable.
export type { RouteNode } from '../core/contracts/route-node.js'

export const ROUTE_FILE_NAMES = ['page', 'layout', 'error', 'loading', 'not-found'] as const

export type RouteFileName = (typeof ROUTE_FILE_NAMES)[number]

export const ROUTE_FILE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'] as const

const ROUTE_FILE_REGEX = /^(page|layout|error|loading|not-found)\.(tsx|ts|jsx|js)$/

export function isRouteFile(filename: string): boolean {
  return ROUTE_FILE_REGEX.test(filename)
}
