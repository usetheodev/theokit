import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { calculator, evaluate } from '../../examples/full-stack-agent/server/tools/calculator.js'
import { currentTime } from '../../examples/full-stack-agent/server/tools/current-time.js'
import { randomNumber } from '../../examples/full-stack-agent/server/tools/random-number.js'

/**
 * T2.1 — Pure tools (current_time + calculator + random_number).
 *
 * Includes EC-1 (Infinity/NaN guard) + EC-2 (source-grep no-eval) from the
 * edge-case review.
 */

describe('current_time', () => {
  it('returns ISO 8601 timestamp', async () => {
    const r = await currentTime.handler({})
    expect(typeof r).toBe('string')
    expect(r).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})

describe('calculator', () => {
  it('evaluates basic arithmetic', () => {
    expect(evaluate('2 + 3')).toBe(5)
    expect(evaluate('2 + 3 * 4')).toBe(14)
    expect(evaluate('(2 + 3) * 4')).toBe(20)
    expect(evaluate('10 / 4')).toBe(2.5)
    expect(evaluate('-5 + 3')).toBe(-2)
  })

  it('handler returns string', async () => {
    const r = await calculator.handler({ expression: '2 + 3 * 4' })
    expect(r).toBe('14')
  })

  it('rejects empty string via Zod', async () => {
    await expect(calculator.handler({ expression: '' })).rejects.toThrow()
  })

  it('rejects non-arithmetic chars', () => {
    expect(() => evaluate('1 + a')).toThrow(/invalid characters/)
    expect(() => evaluate('process.exit()')).toThrow(/invalid characters/)
    expect(() => evaluate('__proto__')).toThrow(/invalid characters/)
  })

  it('EC-1 — rejects Infinity (division by zero)', () => {
    expect(() => evaluate('1/0')).toThrow(/not finite|division by zero/i)
  })

  it('EC-1 — rejects 0/0 (NaN)', () => {
    expect(() => evaluate('0/0')).toThrow(/not finite|division by zero/i)
  })

  it('EC-2 — source does not use eval / new Function / vm', () => {
    const src = readFileSync(
      resolve(__dirname, '../../examples/full-stack-agent/server/tools/calculator.ts'),
      'utf-8',
    )
    expect(src).not.toMatch(/\beval\s*\(/)
    expect(src).not.toMatch(/new\s+Function\s*\(/)
    expect(src).not.toMatch(/require\s*\(\s*['"]vm['"]\s*\)/)
    expect(src).not.toMatch(/from\s+['"]vm['"]/)
  })
})

describe('random_number', () => {
  it('returns integer in [min, max] inclusive', async () => {
    for (let i = 0; i < 100; i++) {
      const r = Number(await randomNumber.handler({ min: 1, max: 10 }))
      expect(Number.isInteger(r)).toBe(true)
      expect(r).toBeGreaterThanOrEqual(1)
      expect(r).toBeLessThanOrEqual(10)
    }
  })

  it('rejects max <= min via Zod refine', async () => {
    await expect(randomNumber.handler({ min: 5, max: 3 })).rejects.toThrow(/max must be greater/)
    await expect(randomNumber.handler({ min: 5, max: 5 })).rejects.toThrow(/max must be greater/)
  })

  it('rejects non-integer via Zod', async () => {
    await expect(randomNumber.handler({ min: 1.5, max: 10 })).rejects.toThrow()
  })

  it('handles negative ranges', async () => {
    const r = Number(await randomNumber.handler({ min: -10, max: -1 }))
    expect(r).toBeGreaterThanOrEqual(-10)
    expect(r).toBeLessThanOrEqual(-1)
  })
})
