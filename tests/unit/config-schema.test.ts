import { describe, it, expect } from 'vitest'
import { theoConfigSchema } from 'theokit'

describe('theoConfigSchema', () => {
  it('should accept valid config with all fields', () => {
    const result = theoConfigSchema.safeParse({
      appDir: 'app',
      serverDir: 'server',
      port: 3000,
    })
    expect(result.success).toBe(true)
  })

  it('should apply defaults for missing fields', () => {
    const result = theoConfigSchema.parse({})
    expect(result.appDir).toBe('app')
    expect(result.serverDir).toBe('server')
    expect(result.port).toBe(3000)
  })

  it('should reject non-integer port', () => {
    const result = theoConfigSchema.safeParse({ port: 3.14 })
    expect(result.success).toBe(false)
  })

  it('should reject port out of range (0)', () => {
    expect(theoConfigSchema.safeParse({ port: 0 }).success).toBe(false)
  })

  it('should reject port out of range (70000)', () => {
    expect(theoConfigSchema.safeParse({ port: 70000 }).success).toBe(false)
  })

  it('should reject port as string', () => {
    const result = theoConfigSchema.safeParse({ port: 'abc' })
    expect(result.success).toBe(false)
  })

  it('should fill defaults for partial config', () => {
    const result = theoConfigSchema.parse({ port: 8080 })
    expect(result.appDir).toBe('app')
    expect(result.port).toBe(8080)
  })

  it('should strip unknown keys (EC-4)', () => {
    const result = theoConfigSchema.parse({ port: 3000, database: 'postgres' } as any)
    expect(result).not.toHaveProperty('database')
  })
})
