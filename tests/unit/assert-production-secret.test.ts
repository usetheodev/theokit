import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { assertProductionSecret } from '../../packages/theo/src/server/auth/session.js'

const REAL_SECRET = 'a-real-32-char-or-more-secret-value-for-tests'

describe('assertProductionSecret (EC-2)', () => {
  let envBefore: string | undefined
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    envBefore = process.env.NODE_ENV
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    if (envBefore === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = envBefore
    warnSpy.mockRestore()
  })

  it('passes silently for a real secret in production', () => {
    process.env.NODE_ENV = 'production'
    expect(() => assertProductionSecret(REAL_SECRET)).not.toThrow()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('passes silently for a real secret in dev', () => {
    process.env.NODE_ENV = 'development'
    expect(() => assertProductionSecret(REAL_SECRET)).not.toThrow()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('throws in production when secret contains CHANGE_ME placeholder (even at 32+ chars)', () => {
    process.env.NODE_ENV = 'production'
    expect(() => assertProductionSecret('CHANGE_ME_TO_RANDOM_32_PLUS_CHARS_FOR_REAL')).toThrow(
      /placeholder|CHANGE_ME/i,
    )
  })

  it('throws in production when secret contains "demo-"', () => {
    process.env.NODE_ENV = 'production'
    expect(() => assertProductionSecret('demo-only-do-not-use-secret-32-chars')).toThrow(
      /placeholder|demo/i,
    )
  })

  it('throws in production when secret is shorter than 32 chars', () => {
    process.env.NODE_ENV = 'production'
    expect(() => assertProductionSecret('short-secret-16c')).toThrow(/32|length|short/i)
  })

  it('warns (but does not throw) in dev with placeholder', () => {
    process.env.NODE_ENV = 'development'
    expect(() => assertProductionSecret('CHANGE_ME_DEMO_PLACEHOLDER_32_CHARS')).not.toThrow()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('treats undefined NODE_ENV as non-production (warns, does not throw)', () => {
    delete process.env.NODE_ENV
    expect(() => assertProductionSecret('CHANGE_ME_PLACEHOLDER_VALUE_32_X')).not.toThrow()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('handles empty secret in production (throws)', () => {
    process.env.NODE_ENV = 'production'
    expect(() => assertProductionSecret('')).toThrow()
  })
})
