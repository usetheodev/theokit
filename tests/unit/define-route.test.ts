import { describe, it, expect } from 'vitest'
import { defineRoute } from 'theokit/server'
import { z } from 'zod'

describe('defineRoute', () => {
  it('should return the route config unchanged (same reference)', () => {
    const config = {
      query: z.object({ search: z.string() }),
      handler: ({ query: _query }: { query: { search: string } }) => ({ results: [] }),
    }
    const result = defineRoute(config)
    expect(result).toBe(config)
  })

  it('should accept handler-only route (no schemas)', () => {
    const config = {
      handler: () => ({ ok: true }),
    }
    const result = defineRoute(config)
    expect(result).toBe(config)
  })

  it('should accept route with body schema', () => {
    const config = {
      body: z.object({ name: z.string() }),
      handler: ({ body }: { body: { name: string } }) => ({ id: '1', name: body.name }),
    }
    const result = defineRoute(config)
    expect(result.body).toBe(config.body)
  })

  it('should accept route with params schema', () => {
    const config = {
      params: z.object({ id: z.string() }),
      handler: ({ params }: { params: { id: string } }) => ({ id: params.id }),
    }
    const result = defineRoute(config)
    expect(result.params).toBe(config.params)
  })

  it('should accept route with all schemas', () => {
    const config = {
      query: z.object({ page: z.number() }),
      body: z.object({ name: z.string() }),
      params: z.object({ id: z.string() }),
      handler: () => ({ ok: true }),
    }
    const result = defineRoute(config)
    expect(result).toBe(config)
  })

  it('should preserve status field', () => {
    const config = {
      status: 201,
      handler: () => ({ ok: true }),
    }
    const result = defineRoute(config)
    expect(result.status).toBe(201)
  })

  it('should have undefined status when not set', () => {
    const config = { handler: () => ({ ok: true }) }
    const result = defineRoute(config)
    expect(result.status).toBeUndefined()
  })
})
