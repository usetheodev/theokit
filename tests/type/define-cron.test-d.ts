import { describe, it, expectTypeOf } from 'vitest'

import { defineCron } from '../../packages/theo/src/server/cron/define-cron.js'
import type { CronContext, CronDefinition } from '../../packages/theo/src/server/cron/cron-types.js'

describe('defineCron type inference (T1.2)', () => {
  it('inferred handler argument is CronContext', () => {
    defineCron('foo', {
      schedule: '* * * * *',
      handler: (ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<CronContext>()
      },
    })
  })

  it('CronContext exposes traceId, scheduledAt, signal', () => {
    expectTypeOf<CronContext>().toExtend<{
      readonly traceId: string
      readonly scheduledAt: Date
      readonly signal: AbortSignal
    }>()
  })

  it('CronDefinition exposes name + schedule + handler + concurrency', () => {
    expectTypeOf<CronDefinition>().toExtend<{
      readonly name: string
      readonly schedule: string
      readonly concurrency: 'forbid' | 'allow'
    }>()
  })

  it('defineCron returns CronDefinition', () => {
    const result = defineCron('foo', {
      schedule: '* * * * *',
      handler: () => {},
    })
    expectTypeOf(result).toEqualTypeOf<CronDefinition>()
  })
})
