import { describe, it, expect, expectTypeOf } from 'vitest'
import { theoConfigSchema } from 'theokit'
import type { ServiceDefinition, ServicesConfig } from 'theokit/server'

const VALID_PYTHON_SERVICE = {
  runtime: 'python' as const,
  port: 8001,
  proxy: '/api/agent',
  dev: 'uvicorn main:app --reload --port 8001',
  start: 'uvicorn main:app --port 8001 --workers 4',
} satisfies Omit<ServiceDefinition, 'healthcheck' | 'cors' | 'passSetCookie'>

const VALID_NODE_SERVICE = {
  runtime: 'node' as const,
  port: 8002,
  proxy: '/api/worker',
  dev: 'tsx watch src/index.ts',
  start: 'node dist/index.js',
} satisfies Omit<ServiceDefinition, 'healthcheck' | 'cors' | 'passSetCookie'>

describe('T1.1 — services schema', () => {
  // Happy path
  it('accepts empty services (Wave 1 BC)', () => {
    const result = theoConfigSchema.safeParse({ services: {} })
    expect(result.success).toBe(true)
  })

  it('accepts services field absent (Wave 1 BC)', () => {
    const result = theoConfigSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.services).toEqual({})
    }
  })

  it('accepts minimal python service', () => {
    const result = theoConfigSchema.safeParse({
      services: { agent: VALID_PYTHON_SERVICE },
    })
    expect(result.success).toBe(true)
  })

  it('accepts minimal node service', () => {
    const result = theoConfigSchema.safeParse({
      services: { worker: VALID_NODE_SERVICE },
    })
    expect(result.success).toBe(true)
  })

  it('applies default healthcheck=/health', () => {
    const result = theoConfigSchema.parse({
      services: { agent: VALID_PYTHON_SERVICE },
    })
    expect(result.services.agent.healthcheck).toBe('/health')
  })

  it('applies default cors=false', () => {
    const result = theoConfigSchema.parse({
      services: { agent: VALID_PYTHON_SERVICE },
    })
    expect(result.services.agent.cors).toBe(false)
  })

  it('applies default passSetCookie=false', () => {
    const result = theoConfigSchema.parse({
      services: { agent: VALID_PYTHON_SERVICE },
    })
    expect(result.services.agent.passSetCookie).toBe(false)
  })

  // Validation errors
  it('rejects invalid runtime (go)', () => {
    const result = theoConfigSchema.safeParse({
      services: { agent: { ...VALID_PYTHON_SERVICE, runtime: 'go' as 'python' } },
    })
    expect(result.success).toBe(false)
  })

  it('rejects proxy without leading slash', () => {
    const result = theoConfigSchema.safeParse({
      services: { agent: { ...VALID_PYTHON_SERVICE, proxy: 'api/agent' } },
    })
    expect(result.success).toBe(false)
  })

  it('rejects port=0', () => {
    const result = theoConfigSchema.safeParse({
      services: { agent: { ...VALID_PYTHON_SERVICE, port: 0 } },
    })
    expect(result.success).toBe(false)
  })

  it('rejects port>65535', () => {
    const result = theoConfigSchema.safeParse({
      services: { agent: { ...VALID_PYTHON_SERVICE, port: 70000 } },
    })
    expect(result.success).toBe(false)
  })

  it('rejects self-dependency', () => {
    const result = theoConfigSchema.safeParse({
      services: { agent: { ...VALID_PYTHON_SERVICE, dependsOn: ['agent'] } },
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing dependency reference', () => {
    const result = theoConfigSchema.safeParse({
      services: { agent: { ...VALID_PYTHON_SERVICE, dependsOn: ['nonexistent'] } },
    })
    expect(result.success).toBe(false)
  })

  it('rejects dependency cycle', () => {
    const result = theoConfigSchema.safeParse({
      services: {
        a: { ...VALID_PYTHON_SERVICE, port: 8001, proxy: '/api/a', dependsOn: ['b'] },
        b: { ...VALID_NODE_SERVICE, port: 8002, proxy: '/api/b', dependsOn: ['a'] },
      },
    })
    expect(result.success).toBe(false)
  })

  // EC hardening from plan v1.1
  it('rejects duplicate port across services (EC-1)', () => {
    const result = theoConfigSchema.safeParse({
      services: {
        a: { ...VALID_PYTHON_SERVICE, port: 8001, proxy: '/api/a' },
        b: { ...VALID_NODE_SERVICE, port: 8001, proxy: '/api/b' },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.message).toMatch(/duplicate port/i)
    }
  })

  it('rejects service.port == config.port (EC-2)', () => {
    const result = theoConfigSchema.safeParse({
      port: 3000,
      services: { agent: { ...VALID_PYTHON_SERVICE, port: 3000 } },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.message).toMatch(/collides with TheoKit web port/i)
    }
  })

  it('rejects reserved service name "web" (EC-3)', () => {
    const result = theoConfigSchema.safeParse({
      services: { web: VALID_PYTHON_SERVICE },
    })
    expect(result.success).toBe(false)
  })

  it('rejects reserved service name "caddy" (EC-3)', () => {
    const result = theoConfigSchema.safeParse({
      services: { caddy: VALID_PYTHON_SERVICE },
    })
    expect(result.success).toBe(false)
  })

  it('rejects reserved service name "postgres" (EC-3)', () => {
    const result = theoConfigSchema.safeParse({
      services: { postgres: VALID_PYTHON_SERVICE },
    })
    expect(result.success).toBe(false)
  })

  it('rejects reserved service name "redis" (EC-3)', () => {
    const result = theoConfigSchema.safeParse({
      services: { redis: VALID_PYTHON_SERVICE },
    })
    expect(result.success).toBe(false)
  })

  it('rejects root proxy "/" (EC-4)', () => {
    const result = theoConfigSchema.safeParse({
      services: { agent: { ...VALID_PYTHON_SERVICE, proxy: '/' } },
    })
    expect(result.success).toBe(false)
  })

  it('rejects duplicate proxy prefix across services', () => {
    const result = theoConfigSchema.safeParse({
      services: {
        a: { ...VALID_PYTHON_SERVICE, port: 8001, proxy: '/api/x' },
        b: { ...VALID_NODE_SERVICE, port: 8002, proxy: '/api/x' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('accepts dependsOn: [] (EC-13)', () => {
    const result = theoConfigSchema.safeParse({
      services: { agent: { ...VALID_PYTHON_SERVICE, dependsOn: [] } },
    })
    expect(result.success).toBe(true)
  })

  it('rejects service name with period (EC-12)', () => {
    const result = theoConfigSchema.safeParse({
      services: { 'agent.v2': VALID_PYTHON_SERVICE },
    })
    expect(result.success).toBe(false)
  })

  it('rejects service name starting with digit (EC-12)', () => {
    const result = theoConfigSchema.safeParse({
      services: { '1agent': VALID_PYTHON_SERVICE },
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid kebab-case name (EC-12)', () => {
    const result = theoConfigSchema.safeParse({
      services: { 'agent-prod': VALID_PYTHON_SERVICE },
    })
    expect(result.success).toBe(true)
  })

  // Type inference
  it('infers runtime as discriminated union', () => {
    expectTypeOf<ServiceDefinition['runtime']>().toEqualTypeOf<'python' | 'node'>()
  })

  it('infers ServicesConfig as record', () => {
    expectTypeOf<ServicesConfig>().toExtend<Record<string, ServiceDefinition>>()
  })
})
