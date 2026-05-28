import { describe, it, expect } from 'vitest'

import { timingSafeEqual } from '../../packages/theo/src/server/webhook/timing-safe-equal.js'

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)

describe('timingSafeEqual (T0.1)', () => {
  it('returns true for two identical 32-byte arrays', () => {
    const a = new Uint8Array(32).fill(7)
    const b = new Uint8Array(32).fill(7)
    expect(timingSafeEqual(a, b)).toBe(true)
  })

  it('returns false for two different 32-byte arrays', () => {
    const a = new Uint8Array(32).fill(7)
    const b = new Uint8Array(32).fill(8)
    expect(timingSafeEqual(a, b)).toBe(false)
  })

  it('returns false when lengths differ (32 vs 31)', () => {
    const a = new Uint8Array(32).fill(7)
    const b = new Uint8Array(31).fill(7)
    expect(timingSafeEqual(a, b)).toBe(false)
  })

  it('returns true for two empty arrays', () => {
    expect(timingSafeEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true)
  })

  it('returns true for two single-byte equal arrays', () => {
    expect(timingSafeEqual(utf8('a'), utf8('a'))).toBe(true)
  })

  it('returns false for two single-byte different arrays', () => {
    expect(timingSafeEqual(utf8('a'), utf8('b'))).toBe(false)
  })

  // EC-1 — constant-time invariant: the wall-clock delta between
  // mismatch-at-byte-0 vs mismatch-at-byte-last MUST be small.
  // This is a statistical assertion — flaky in theory, robust in practice.
  // We use a tight tolerance (< 50%) because tight CI environments can be noisy;
  // the goal is to catch obvious early-return bugs, not to assert nanosecond timing.
  it('completes in roughly constant time regardless of mismatch position', () => {
    const size = 1024
    const a = new Uint8Array(size).fill(0)
    const earlyMismatch = new Uint8Array(size).fill(0)
    earlyMismatch[0] = 1
    const lateMismatch = new Uint8Array(size).fill(0)
    lateMismatch[size - 1] = 1

    const iters = 5000
    const time = (other: Uint8Array): number => {
      const start = performance.now()
      for (let i = 0; i < iters; i++) {
        timingSafeEqual(a, other)
      }
      return performance.now() - start
    }

    // Warm up to populate any JIT optimization
    time(earlyMismatch)
    time(lateMismatch)

    const earlyTime = time(earlyMismatch)
    const lateTime = time(lateMismatch)
    const delta = Math.abs(earlyTime - lateTime) / Math.max(earlyTime, lateTime)
    // Tolerance is generous (50%) — we're catching `if (a[i] !== b[i]) return false` early-return bugs,
    // which would produce delta > 10x.
    expect(delta).toBeLessThan(0.5)
  })

  it('throws TypeError when passed a non-Uint8Array', () => {
    // @ts-expect-error -- testing runtime guard
    expect(() => timingSafeEqual([1, 2, 3], new Uint8Array([1, 2, 3]))).toThrow(TypeError)
  })
})
