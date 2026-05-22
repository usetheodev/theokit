import { describe, expect, it } from 'vitest'

import { theoConfigSchema } from '../../packages/theo/src/config/schema.js'

/**
 * T2.2 / EC-4 — Zod refine on distDir rejects absolute + parent-relative.
 * Plus default `.theo`.
 */

describe('T2.2 — distDir Zod refine (EC-4)', () => {
  it('defaults to .theo when omitted', () => {
    const result = theoConfigSchema.parse({})
    expect(result.distDir).toBe('.theo')
  })

  it('accepts relative inside cwd', () => {
    expect(() => theoConfigSchema.parse({ distDir: '.theo' })).not.toThrow()
    expect(() => theoConfigSchema.parse({ distDir: 'build/output' })).not.toThrow()
  })

  it('EC-4: rejects absolute POSIX path', () => {
    const r = theoConfigSchema.safeParse({ distDir: '/etc' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/relative path/)
    }
  })

  it('EC-4: rejects absolute Windows path', () => {
    const r = theoConfigSchema.safeParse({ distDir: 'C:\\Windows' })
    expect(r.success).toBe(false)
  })

  it('EC-4: rejects parent-relative path', () => {
    const r = theoConfigSchema.safeParse({ distDir: '../outside' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/relative path/)
    }
  })
})

describe('T2.3 — agents.maxRegistries schema', () => {
  it('omitted: agents is undefined', () => {
    const result = theoConfigSchema.parse({})
    expect(result.agents).toBeUndefined()
  })

  it('explicit: agents.maxRegistries accepted', () => {
    const result = theoConfigSchema.parse({ agents: { maxRegistries: 50 } })
    expect(result.agents?.maxRegistries).toBe(50)
  })

  it('default: applied when partial agents block given', () => {
    const result = theoConfigSchema.parse({ agents: {} })
    expect(result.agents?.maxRegistries).toBe(100)
  })

  it('rejects non-positive', () => {
    const r = theoConfigSchema.safeParse({ agents: { maxRegistries: -1 } })
    expect(r.success).toBe(false)
  })
})
