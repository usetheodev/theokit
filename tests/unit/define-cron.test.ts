import { describe, it, expect } from 'vitest'

import { defineCron } from '../../packages/theo/src/server/cron/define-cron.js'

describe('defineCron (T1.2)', () => {
  it('returns a CronDefinition with name + schedule + handler + concurrency default', () => {
    const handler = (): void => {}
    const result = defineCron('morning-summary', {
      schedule: '0 9 * * *',
      handler,
    })
    expect(result.name).toBe('morning-summary')
    expect(result.schedule).toBe('0 9 * * *')
    expect(result.handler).toBe(handler)
    expect(result.concurrency).toBe('forbid')
  })

  it('respects an explicit concurrency: allow', () => {
    const result = defineCron('foo', {
      schedule: '* * * * *',
      handler: () => {},
      concurrency: 'allow',
    })
    expect(result.concurrency).toBe('allow')
  })

  it('rejects an invalid name (whitespace)', () => {
    expect(() =>
      defineCron('bad name', {
        schedule: '* * * * *',
        handler: () => {},
      }),
    ).toThrow(/invalid name/i)
  })

  it('rejects an empty name', () => {
    expect(() =>
      defineCron('', {
        schedule: '* * * * *',
        handler: () => {},
      }),
    ).toThrow(/invalid name/i)
  })

  it('rejects an over-long name (> 64 chars)', () => {
    const longName = 'a'.repeat(65)
    expect(() =>
      defineCron(longName, {
        schedule: '* * * * *',
        handler: () => {},
      }),
    ).toThrow(/invalid name/i)
  })

  it('propagates schedule validation errors from T1.1', () => {
    expect(() =>
      defineCron('foo', {
        schedule: '@daily',
        handler: () => {},
      }),
    ).toThrow(/shorthand not supported/)
  })

  it('preserves handler reference identity (pure identity helper)', () => {
    const h = (): void => {}
    expect(defineCron('foo', { schedule: '* * * * *', handler: h }).handler).toBe(h)
  })
})
