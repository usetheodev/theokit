import { describe, test, expectTypeOf } from 'vitest'
import type {
  InferQuery,
  InferBody,
  InferResponse,
} from '../../packages/theo/src/client/theo-fetch.js'
import type { GET, POST, User } from '../../fixtures/typed-client/server/routes/users.js'

/**
 * T4.1 — typed-client fixture type tests.
 *
 * These tests prove end-to-end inference from Zod route schemas to
 * client-side `theoFetch<typeof GET>(...)` calls.
 */
describe('typed-client inference', () => {
  test('GET query is inferred as { search?: string } from Zod schema', () => {
    expectTypeOf<InferQuery<typeof GET>>().toEqualTypeOf<{ search?: string }>()
  })

  test('GET response is inferred as User[] from handler return type', () => {
    expectTypeOf<InferResponse<typeof GET>>().toEqualTypeOf<User[]>()
  })

  test('POST body is inferred as { name: string; email: string }', () => {
    expectTypeOf<InferBody<typeof POST>>().toEqualTypeOf<{ name: string; email: string }>()
  })

  test('POST response is inferred as User', () => {
    expectTypeOf<InferResponse<typeof POST>>().toEqualTypeOf<User>()
  })

  test('GET body is undefined (no body schema)', () => {
    expectTypeOf<InferBody<typeof GET>>().toEqualTypeOf<undefined>()
  })

  test('POST query is undefined (no query schema)', () => {
    expectTypeOf<InferQuery<typeof POST>>().toEqualTypeOf<undefined>()
  })
})
