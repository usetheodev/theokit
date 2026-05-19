import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  warnOnce,
  _resetWarnOnceForTests,
} from '../../packages/theo/src/server/logger.js'

/**
 * T2.1 — `warnOnce` helper.
 *
 * Per docs/plans/theokit-0.3.0-cutover-execution-plan.md Phase 2 + EC-2.
 *
 * Dedupes warnings by structured key (event:method:path) so logs don't
 * flood under load. Key shape is caller-provided string — convention
 * documented in csrf.ts.
 *
 * EC-2: payload with circular references MUST NOT crash via
 * JSON.stringify TypeError — try/catch with String() fallback.
 */

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  _resetWarnOnceForTests()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
})

describe('warnOnce — basic dedup', () => {
  it('Given new key, When warnOnce called, Then console.warn invoked once', () => {
    warnOnce('csrf.warn:POST:/api/login', { reason: 'missing header' })
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('Given same key called 5x, Then console.warn invoked exactly once', () => {
    for (let i = 0; i < 5; i++) {
      warnOnce('csrf.warn:POST:/api/login', { reason: 'missing header', i })
    }
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('Given keys "a" and "b", Then console.warn invoked twice (distinct keys emit separately)', () => {
    warnOnce('a', { x: 1 })
    warnOnce('b', { x: 2 })
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })

  it('Given empty string key called 3x, Then console.warn invoked once (anonymous dedupes globally)', () => {
    warnOnce('', { x: 1 })
    warnOnce('', { x: 2 })
    warnOnce('', { x: 3 })
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})

describe('warnOnce — payload serialization', () => {
  it('Given simple payload, When emit, Then console.warn receives JSON with warnOnce:true marker', () => {
    warnOnce('k1', { event: 'csrf.warn', path: '/x' })
    const arg = warnSpy.mock.calls[0]?.[0] as string
    expect(arg).toBeTypeOf('string')
    const parsed = JSON.parse(arg) as Record<string, unknown>
    expect(parsed.event).toBe('csrf.warn')
    expect(parsed.path).toBe('/x')
    expect(parsed.warnOnce).toBe(true)
  })

  it('EC-2: Given payload with circular reference, When emit, Then console.warn still called with fallback string (no throw)', () => {
    type Circ = { name: string; self?: Circ }
    const circular: Circ = { name: 'loop' }
    circular.self = circular

    expect(() => warnOnce('k2', { circular })).not.toThrow()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const arg = warnSpy.mock.calls[0]?.[0] as string
    // Fallback string contains the key so it's grep-able
    expect(arg).toContain('k2')
  })
})

describe('warnOnce — sanity bound (EC-9)', () => {
  it('Given 1000 unique keys, When all called, Then console.warn invoked 1000 times AND no memory error', () => {
    for (let i = 0; i < 1000; i++) {
      warnOnce(`unique-${i}`, { i })
    }
    expect(warnSpy).toHaveBeenCalledTimes(1000)
    // No crash, no leak in this synchronous block.
  })
})
