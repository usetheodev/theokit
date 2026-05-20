export interface ServerRouteNode {
  filePath: string
  routePath: string
  paramNames: string[]
  pattern: RegExp
}

export function compilePattern(routePath: string): {
  pattern: RegExp
  paramNames: string[]
} {
  const paramNames: string[] = []
  // Single pass: handle both catch-all (:...name) and regular (:name) params
  const regexStr = routePath.replace(/:(?:\.\.\.)?([^/]+)/g, (match: string, name: string) => {
    paramNames.push(name)
    // Catch-all matches across slashes, regular matches single segment
    return match.startsWith(':...') ? '(.+)' : '([^/]+)'
  })
  // `regexStr` is derived from a developer-authored route path (build-time
  // input, not HTTP-controlled). The `security/detect-non-literal-regexp`
  // rule cannot see this constraint — disable narrowly.
  // eslint-disable-next-line security/detect-non-literal-regexp -- route pattern from build-time scan, never HTTP input
  return { pattern: new RegExp(`^${regexStr}$`), paramNames }
}

export function matchRoute(
  url: string,
  routes: ServerRouteNode[],
): { route: ServerRouteNode; params: Record<string, string> } | null {
  // Strip query string and trailing slash
  let path = url.split('?')[0]
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1)
  }

  for (const route of routes) {
    const match = route.pattern.exec(path)
    if (match) {
      const params: Record<string, string> = {}
      route.paramNames.forEach((name, i) => {
        params[name] = match[i + 1]
      })
      return { route, params }
    }
  }
  return null
}
