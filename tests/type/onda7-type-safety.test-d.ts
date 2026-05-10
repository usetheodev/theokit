import { describe, it, expectTypeOf } from 'vitest'
import { defineRoute, defineAction } from 'theokit/server'
import { z } from 'zod'

describe('Onda 7 — Type Safety End-to-End', () => {
  // Teste 1 — Input inválido falha em compile-time
  it('route: wrong body type is compile error', () => {
    defineRoute({
      body: z.object({ name: z.string() }),
      handler: ({ body }) => {
        // @ts-expect-error — name is string, not number
        const _x: number = body.name
        return { ok: true }
      },
    })
  })

  it('action: wrong input type is compile error', () => {
    defineAction({
      input: z.object({ email: z.string() }),
      handler: ({ input }) => {
        // @ts-expect-error — email is string, not number
        const _x: number = input.email
        return { ok: true }
      },
    })
  })

  // Teste 2 — Output: handler return type is unknown (by design)
  it('handler return type is inferred from implementation', () => {
    const route = defineRoute({
      handler: () => ({ id: '1', name: 'test' }),
    })
    // Return type is inferred — TResponse generic captures the actual return
    expectTypeOf(route.handler).returns.toEqualTypeOf<{ id: string; name: string } | Promise<{ id: string; name: string }>>()
  })

  // Teste 3 — Params inferidos
  it('params inferred from Zod schema', () => {
    defineRoute({
      params: z.object({ id: z.string(), slug: z.string() }),
      handler: ({ params }) => {
        expectTypeOf(params.id).toBeString()
        expectTypeOf(params.slug).toBeString()
        return { ok: true }
      },
    })
  })

  // Teste 4 — Query inferida via Zod
  it('query inferred from Zod schema', () => {
    defineRoute({
      query: z.object({ page: z.number(), search: z.string().optional() }),
      handler: ({ query }) => {
        expectTypeOf(query.page).toBeNumber()
        expectTypeOf(query.search).toEqualTypeOf<string | undefined>()
        return { ok: true }
      },
    })
  })

  it('wrong query type is compile error', () => {
    defineRoute({
      query: z.object({ page: z.number() }),
      handler: ({ query }) => {
        // @ts-expect-error — page is number, not string
        const _x: string = query.page
        return { ok: true }
      },
    })
  })

  // ctx is unknown in route handler
  it('ctx is unknown in route handler', () => {
    defineRoute({
      handler: ({ ctx }) => {
        expectTypeOf(ctx).toBeUnknown()
        return { ok: true }
      },
    })
  })

  // ctx is unknown in action handler
  it('ctx is unknown in action handler', () => {
    defineAction({
      input: z.object({ value: z.string() }),
      handler: ({ ctx }) => {
        expectTypeOf(ctx).toBeUnknown()
        return { ok: true }
      },
    })
  })

  // ctx needs narrowing — can't use directly as typed
  it('ctx requires narrowing for typed access', () => {
    defineRoute({
      handler: ({ ctx }) => {
        // @ts-expect-error — ctx is unknown, can't access .requestId without narrowing
        const _x: string = ctx.requestId
        return { ok: true }
      },
    })
  })

  // Existing handlers without ctx still compile
  it('handler without ctx destructuring still compiles', () => {
    defineRoute({
      handler: ({ query }) => ({ ok: true }),
    })
    defineAction({
      input: z.object({ v: z.string() }),
      handler: ({ input }) => ({ ok: true }),
    })
  })
})
