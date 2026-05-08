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

export const ROUTE_FILE_NAMES = [
  'page',
  'layout',
  'error',
  'loading',
  'not-found',
] as const

export type RouteFileName = (typeof ROUTE_FILE_NAMES)[number]

export const ROUTE_FILE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'] as const

const ROUTE_FILE_REGEX =
  /^(page|layout|error|loading|not-found)\.(tsx|ts|jsx|js)$/

export function isRouteFile(filename: string): boolean {
  return ROUTE_FILE_REGEX.test(filename)
}
