import picomatch from 'picomatch'

export interface RouteRule {
  maxAge?: number
  swr?: number
  tags?: string[]
}

export type RouteRules = Record<string, RouteRule>

export interface CompiledRouteRule {
  matcher: (path: string) => boolean
  rule: RouteRule
  /** Original glob pattern (for debugging). */
  pattern: string
}

/**
 * Compile route-rule glob patterns into matcher functions.
 * First-match-wins semantics (preserves insertion order).
 *
 * EC-5: picomatch is a direct production dependency (see plan T7.2).
 */
export function compileRouteRules(rules: RouteRules): CompiledRouteRule[] {
  return Object.entries(rules).map(([pattern, rule]) => ({
    matcher: picomatch(pattern, { dot: true }),
    rule,
    pattern,
  }))
}

/**
 * Resolve the first matching rule for `path`, or `undefined` if none match.
 */
export function resolveRouteRule(
  path: string,
  compiled: CompiledRouteRule[],
): RouteRule | undefined {
  for (const c of compiled) {
    if (c.matcher(path)) return c.rule
  }
  return undefined
}
