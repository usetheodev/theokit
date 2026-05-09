import { describe, it, expectTypeOf } from 'vitest'
import { defineRoute } from 'theo/server'
import { theoFetch } from 'theo/client'
import type { InferResponse, InferQuery, InferBody } from 'theo/client'
import { z } from 'zod'

// Sample route definitions for type testing
const GET_users = defineRoute({
  query: z.object({ search: z.string(), page: z.number() }),
  handler: ({ query }) => ({
    users: [{ id: '1', name: 'alice' }],
    total: 10,
  }),
})

const POST_users = defineRoute({
  body: z.object({ name: z.string(), email: z.string() }),
  status: 201,
  handler: ({ body }) => ({
    id: 'new-id',
    name: body.name,
    email: body.email,
  }),
})

const GET_health = defineRoute({
  handler: () => ({ ok: true }),
})

describe('theoFetch type inference', () => {
  it('should infer response type from handler return', () => {
    type Result = InferResponse<typeof GET_users>
    expectTypeOf<Result>().toEqualTypeOf<{
      users: { id: string; name: string }[]
      total: number
    }>()
  })

  it('should infer query type from Zod schema', () => {
    type Query = InferQuery<typeof GET_users>
    expectTypeOf<Query>().toEqualTypeOf<{ search: string; page: number }>()
  })

  it('should infer body type from Zod schema', () => {
    type Body = InferBody<typeof POST_users>
    expectTypeOf<Body>().toEqualTypeOf<{ name: string; email: string }>()
  })

  it('should return undefined for query when no query schema', () => {
    type Query = InferQuery<typeof GET_health>
    expectTypeOf<Query>().toEqualTypeOf<undefined>()
  })

  it('should return undefined for body when no body schema', () => {
    type Body = InferBody<typeof GET_health>
    expectTypeOf<Body>().toEqualTypeOf<undefined>()
  })

  it('should infer POST response type', () => {
    type Result = InferResponse<typeof POST_users>
    expectTypeOf<Result>().toEqualTypeOf<{
      id: string
      name: string
      email: string
    }>()
  })

  it('should infer simple handler response', () => {
    type Result = InferResponse<typeof GET_health>
    expectTypeOf<Result>().toEqualTypeOf<{ ok: boolean }>()
  })
})
