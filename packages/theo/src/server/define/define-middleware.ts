export type MiddlewareHandler = (
  request: Request,
  next: (request: Request) => Promise<Response>,
) => Response | Promise<Response>

/**
 * Define a middleware handler.
 * Identity function — provides type annotation for middleware.
 */
export function defineMiddleware(handler: MiddlewareHandler): MiddlewareHandler {
  return handler
}
