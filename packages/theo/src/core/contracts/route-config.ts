/**
 * core/contracts/route-config.ts
 *
 * Canonical home for `RouteConfig<TQuery, TBody, TParams, TCtx, TResponse>` —
 * the contract shape consumed by `defineRoute()` (server) and
 * `defineCachedRoute()` (cache).
 *
 * Moved here in T2.2 of architecture-cleanup so `cache → core/contracts`
 * is the legal edge (replacing the prior `cache → server` violation).
 *
 * GAP-4 (plan v1.1): the 5-arity generic shape `<TQuery, TBody, TParams, TCtx, TResponse>`
 * MUST be preserved byte-by-byte. Type tests assert this in
 * `tests/unit/route-config-generic-arity.test.ts`.
 */

import type { z } from 'zod'

export interface RouteConfig<
  TQuery extends z.ZodType = z.ZodUndefined,
  TBody extends z.ZodType = z.ZodUndefined,
  TParams extends z.ZodType = z.ZodUndefined,
  TCtx = unknown,
  TResponse = unknown,
> {
  query?: TQuery
  body?: TBody
  params?: TParams
  status?: number
  /**
   * Opt out of CSRF enforcement for this route. Use for endpoints that
   * legitimately receive third-party POSTs (Stripe webhooks, GitHub
   * webhooks, OAuth callbacks). Defaults to enforced per `config.security.csrf`.
   *
   * Setting `csrf: false` only disables the per-route check — it does NOT
   * disable the global mode setting for other routes.
   */
  csrf?: false
  handler: (ctx: {
    query: z.infer<TQuery>
    body: z.infer<TBody>
    params: z.infer<TParams>
    request: Request
    ctx: TCtx
  }) => TResponse | Promise<TResponse>
}
