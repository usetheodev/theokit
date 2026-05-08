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
  const regexStr = routePath.replace(/:([^/]+)/g, (_, name) => {
    paramNames.push(name)
    return '([^/]+)'
  })
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
