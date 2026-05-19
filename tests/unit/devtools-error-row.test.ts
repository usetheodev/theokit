/**
 * T2.2 EC-27 — stack truncation pure helper.
 *
 * Tests the truncateStackForDisplay pure function. Component rendering
 * is covered via Playwright spec (T4.4) — DOM-level assertions there.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { describe, expect, it } from 'vitest'
import {
  STACK_DISPLAY_LIMIT,
  truncateStackForDisplay,
} from '../../packages/theo/src/devtools/components/ErrorRow.js'

describe('EC-27 — truncateStackForDisplay', () => {
  it('returns null for undefined input', () => {
    expect(truncateStackForDisplay(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(truncateStackForDisplay('')).toBeNull()
  })

  it('returns stack unchanged when under limit', () => {
    const stack = 'Error: x\n    at foo (file:1:1)'
    expect(truncateStackForDisplay(stack)).toBe(stack)
  })

  it('truncates over-limit stacks with annotation', () => {
    const long = 'a'.repeat(STACK_DISPLAY_LIMIT + 500)
    const result = truncateStackForDisplay(long)
    expect(result).not.toBeNull()
    expect(result!.startsWith('a'.repeat(STACK_DISPLAY_LIMIT))).toBe(true)
    expect(result!.includes('truncated 500 chars')).toBe(true)
  })

  it('1MB+ stack truncates AND remains O(1) for the display limit', () => {
    const huge = 'x'.repeat(1_000_000)
    const before = Date.now()
    const result = truncateStackForDisplay(huge)
    const after = Date.now()
    expect(result).not.toBeNull()
    expect(result!.length).toBeLessThanOrEqual(STACK_DISPLAY_LIMIT + 100) // limit + annotation
    // Synchronous slice — should be well under 50ms for any reasonable JS engine
    expect(after - before).toBeLessThan(50)
  })

  it('STACK_DISPLAY_LIMIT is exactly 4096 (4KB)', () => {
    expect(STACK_DISPLAY_LIMIT).toBe(4096)
  })
})
