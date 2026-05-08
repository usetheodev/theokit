import { describe, it, expect } from 'vitest'
import { defineMiddleware } from 'theo/server'

describe('defineMiddleware', () => {
  it('should return the handler unchanged (same reference)', () => {
    const handler = async (request: Request, next: (req: Request) => Promise<Response>) => {
      return next(request)
    }
    const result = defineMiddleware(handler)
    expect(result).toBe(handler)
  })

  it('should accept a handler that short-circuits', () => {
    const handler = async (_request: Request, _next: (req: Request) => Promise<Response>) => {
      return new Response('Unauthorized', { status: 401 })
    }
    const result = defineMiddleware(handler)
    expect(result).toBe(handler)
  })

  it('should accept async handler with before/after logic', () => {
    const handler = async (request: Request, next: (req: Request) => Promise<Response>) => {
      const start = Date.now()
      const response = await next(request)
      response.headers.set('X-Response-Time', `${Date.now() - start}ms`)
      return response
    }
    const result = defineMiddleware(handler)
    expect(result).toBe(handler)
  })
})
