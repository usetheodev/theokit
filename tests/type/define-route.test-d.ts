import { describe, it, expectTypeOf } from 'vitest'
import { defineRoute } from 'theo/server'
import { z } from 'zod'

describe('defineRoute type inference', () => {
  it('should infer query type from Zod schema', () => {
    defineRoute({
      query: z.object({ search: z.string(), page: z.number() }),
      handler: ({ query }) => {
        expectTypeOf(query).toEqualTypeOf<{ search: string; page: number }>()
        return { results: [] }
      },
    })
  })

  it('should infer body type from Zod schema', () => {
    defineRoute({
      body: z.object({ name: z.string(), email: z.string() }),
      handler: ({ body }) => {
        expectTypeOf(body).toEqualTypeOf<{ name: string; email: string }>()
        return { ok: true }
      },
    })
  })

  it('should infer params type from Zod schema', () => {
    defineRoute({
      params: z.object({ id: z.string() }),
      handler: ({ params }) => {
        expectTypeOf(params).toEqualTypeOf<{ id: string }>()
        return { id: params.id }
      },
    })
  })

  it('should accept handler-only route', () => {
    const route = defineRoute({
      handler: () => ({ ok: true }),
    })
    expectTypeOf(route.handler).toBeFunction()
  })

  it('should accept handler returning void (EC-5)', () => {
    defineRoute({
      handler: () => {
        // void return
      },
    })
  })
})
