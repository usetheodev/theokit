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
>(config: RouteConfig<TQuery, TBody, TParams, TCtx, TResponse>): RouteConfig<TQuery, TBody, TParams, TCtx, TResponse> {
  return config
}
