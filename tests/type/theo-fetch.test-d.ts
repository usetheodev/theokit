import { describe, it, expectTypeOf } from 'vitest'
import { defineRoute } from 'theokit/server'
import type { InferResponse, InferQuery, InferBody } from 'theokit/client'
import { z } from 'zod'

// Sample route definitions for type testing
const _GET_users = defineRoute({
  query: z.object({ search: z.string(), page: z.number() }),
  handler: ({ query: _query }) => ({
    users: [{ id: '1', name: 'alice' }],
    total: 10,
  }),
})
type GET_users = typeof _GET_users

const _POST_users = defineRoute({
  body: z.object({ name: z.string(), email: z.string() }),
  status: 201,
  handler: ({ body }) => ({
    id: 'new-id',
    name: body.name,
    email: body.email,
  }),
})
type POST_users = typeof _POST_users

const _GET_health = defineRoute({
  handler: () => ({ ok: true }),
})
type GET_health = typeof _GET_health

describe('theoFetch type inference', () => {
  it('should infer response type from handler return', () => {
    type Result = InferResponse<GET_users>
    expectTypeOf<Result>().toEqualTypeOf<{
      users: { id: string; name: string }[]
      total: number
    }>()
  })

  it('should infer query type from Zod schema', () => {
    type Query = InferQuery<GET_users>
    expectTypeOf<Query>().toEqualTypeOf<{ search: string; page: number }>()
  })

  it('should infer body type from Zod schema', () => {
    type Body = InferBody<POST_users>
    expectTypeOf<Body>().toEqualTypeOf<{ name: string; email: string }>()
  })

  it('should return undefined for query when no query schema', () => {
    type Query = InferQuery<GET_health>
    expectTypeOf<Query>().toEqualTypeOf<undefined>()
  })

  it('should return undefined for body when no body schema', () => {
    type Body = InferBody<GET_health>
    expectTypeOf<Body>().toEqualTypeOf<undefined>()
  })

  it('should infer POST response type', () => {
    type Result = InferResponse<POST_users>
    expectTypeOf<Result>().toEqualTypeOf<{
      id: string
      name: string
      email: string
    }>()
  })

  it('should infer simple handler response', () => {
    type Result = InferResponse<GET_health>
    expectTypeOf<Result>().toEqualTypeOf<{ ok: boolean }>()
  })
})
