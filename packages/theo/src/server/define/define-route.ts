import type { z } from 'zod'

// T2.2 (architecture-cleanup) — RouteConfig type moved to core/contracts/
// (canonical home per ADR-0001 v3). Re-export preserves the public path
// `import { type RouteConfig } from 'theokit/server'`.
export type { RouteConfig } from '../../core/contracts/route-config.js'

import type { RouteConfig } from '../../core/contracts/route-config.js'

/**
 * Define a typed HTTP route.
 * Identity function — provides type inference for route handlers.
 */
export function defineRoute<
  TQuery extends z.ZodType = z.ZodUndefined,
  TBody extends z.ZodType = z.ZodUndefined,
  TParams extends z.ZodType = z.ZodUndefined,
  TCtx = unknown,
  TResponse = unknown,
>(
  config: RouteConfig<TQuery, TBody, TParams, TCtx, TResponse>,
): RouteConfig<TQuery, TBody, TParams, TCtx, TResponse> {
  return config
}
