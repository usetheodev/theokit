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
