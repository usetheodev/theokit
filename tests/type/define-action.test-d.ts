import { describe, it, expectTypeOf } from 'vitest'
import { defineAction } from 'theokit/server'
import { z } from 'zod'

describe('defineAction type inference', () => {
  it('should infer input type from Zod schema', () => {
    defineAction({
      input: z.object({ name: z.string(), email: z.string() }),
      handler: ({ input }) => {
        expectTypeOf(input).toEqualTypeOf<{ name: string; email: string }>()
        return { id: '1', ...input }
      },
    })
  })

  it('should require input property', () => {
    // @ts-expect-error — input is required, omitting it is a type error
    defineAction({
      handler: () => ({ ok: true }),
    })
  })

  it('should infer complex nested input', () => {
    defineAction({
      input: z.object({
        user: z.object({
          name: z.string(),
          address: z.object({ city: z.string() }),
        }),
      }),
      handler: ({ input }) => {
        expectTypeOf(input.user.address.city).toBeString()
        return { ok: true }
      },
    })
  })

  it('should default ctx to unknown when TCtx omitted', () => {
    defineAction({
      input: z.object({ name: z.string() }),
      handler: ({ ctx }) => {
        expectTypeOf(ctx).toBeUnknown()
        return { ok: true }
      },
    })
  })

  it('should infer ctx type from TCtx generic', () => {
    interface AppContext { userId: string }
    defineAction<z.ZodObject<{ name: z.ZodString }>, AppContext>({
      input: z.object({ name: z.string() }),
      handler: ({ ctx }) => {
        expectTypeOf(ctx).toEqualTypeOf<AppContext>()
        return { userId: ctx.userId }
      },
    })
  })
})
