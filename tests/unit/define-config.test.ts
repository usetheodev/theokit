import { describe, it, expect } from 'vitest'
import { defineConfig } from 'theo'

describe('defineConfig', () => {
  it('should return the config object unchanged', () => {
    const input = { appDir: 'src/app', port: 4000 }
    const result = defineConfig(input)
    expect(result).toEqual(input)
  })

  it('should return same reference (identity)', () => {
    const input = { port: 8080 }
    const result = defineConfig(input)
    expect(result).toBe(input)
  })

  it('should accept empty config', () => {
    const result = defineConfig({})
    expect(result).toEqual({})
  })

  it('should accept partial config', () => {
    const result = defineConfig({ port: 8080 })
    expect(result).toEqual({ port: 8080 })
  })

  it('should not validate at call time (identity only)', () => {
    const result = defineConfig({ port: -1 } as any)
    expect(result.port).toBe(-1)
  })
})
