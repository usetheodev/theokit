import type { z } from 'zod'

export interface RouteConfig<
  TQuery extends z.ZodType = z.ZodUndefined,
  TBody extends z.ZodType = z.ZodUndefined,
  TParams extends z.ZodType = z.ZodUndefined,
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
    ctx: unknown
  }) => unknown | Promise<unknown>
}

/**
 * Define a typed HTTP route.
 * Identity function — provides type inference for route handlers.
 */
export function defineRoute<
  TQuery extends z.ZodType = z.ZodUndefined,
  TBody extends z.ZodType = z.ZodUndefined,
  TParams extends z.ZodType = z.ZodUndefined,
>(config: RouteConfig<TQuery, TBody, TParams>): RouteConfig<TQuery, TBody, TParams> {
  return config
}
