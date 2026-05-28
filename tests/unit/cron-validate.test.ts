import { describe, it, expect } from 'vitest'

import { validateCronSchedule } from '../../packages/theo/src/server/cron/cron-validate.js'

describe('validateCronSchedule (T1.1) — 5-field UTC strict (ADR-0004)', () => {
  it('accepts a standard 5-field schedule', () => {
    expect(() => validateCronSchedule('0 9 * * *')).not.toThrow()
  })

  it('accepts step, range, and list syntax', () => {
    expect(() => validateCronSchedule('*/15 1-5 * * MON,TUE,FRI')).not.toThrow()
  })

  it('accepts every-minute schedule', () => {
    expect(() => validateCronSchedule('* * * * *')).not.toThrow()
  })

  it('rejects 6-field schedule with actionable error', () => {
    expect(() => validateCronSchedule('* * * * * *')).toThrow(/5 fields/)
  })

  it('rejects shorthand @daily', () => {
    expect(() => validateCronSchedule('@daily')).toThrow(/shorthand not supported/)
  })

  it('rejects shorthand @hourly', () => {
    expect(() => validateCronSchedule('@hourly')).toThrow(/shorthand not supported/)
  })

  it('rejects malformed input', () => {
    expect(() => validateCronSchedule('bad bad bad bad bad')).toThrow()
  })

  it('rejects empty string', () => {
    expect(() => validateCronSchedule('')).toThrow()
  })

  it('rejects whitespace-only input', () => {
    expect(() => validateCronSchedule('   ')).toThrow()
  })

  it('error messages include the input schedule for actionability', () => {
    expect(() => validateCronSchedule('* * * * * *')).toThrow(/\* \* \* \* \* \*/)
  })
})
