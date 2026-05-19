/**
 * T4.3 — devtools config schema validation.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { describe, expect, it } from 'vitest'
import { theoConfigSchema } from '../../packages/theo/src/config/schema.js'

describe('theoConfigSchema — devtools field', () => {
  it('accepts undefined (default — devtools on in dev)', () => {
    const result = theoConfigSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.devtools).toBeUndefined()
  })

  it('accepts devtools: false (opt-out)', () => {
    const result = theoConfigSchema.safeParse({ devtools: false })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.devtools).toBe(false)
  })

  it('accepts devtools: { position: "top-left" }', () => {
    const result = theoConfigSchema.safeParse({ devtools: { position: 'top-left' } })
    expect(result.success).toBe(true)
  })

  it('accepts devtools: { theme: "dark" }', () => {
    const result = theoConfigSchema.safeParse({ devtools: { theme: 'dark' } })
    expect(result.success).toBe(true)
  })

  it('accepts devtools: { position, theme } both', () => {
    const result = theoConfigSchema.safeParse({
      devtools: { position: 'bottom-right', theme: 'system' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid position', () => {
    const result = theoConfigSchema.safeParse({ devtools: { position: 'middle' } })
    expect(result.success).toBe(false)
  })

  it('rejects invalid theme', () => {
    const result = theoConfigSchema.safeParse({ devtools: { theme: 'neon' } })
    expect(result.success).toBe(false)
  })

  it('rejects devtools: true (literal true not allowed — use undefined or object)', () => {
    const result = theoConfigSchema.safeParse({ devtools: true })
    expect(result.success).toBe(false)
  })
})
