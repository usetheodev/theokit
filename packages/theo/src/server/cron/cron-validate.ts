import { CronExpressionParser } from 'cron-parser'

/**
 * Validate a cron schedule string per ADR-0004 — 5-field UTC strict.
 *
 * Accepts:
 *   - Standard 5-field expressions: `minute hour dayOfMonth month dayOfWeek`
 *   - Step (`*\/15`), range (`1-5`), list (`MON,TUE,FRI`), wildcards
 *
 * Rejects:
 *   - 6-field with seconds (`* * * * * *`)
 *   - 7-field with year
 *   - Shorthand (`@daily`, `@hourly`, `@yearly`, `@reboot`)
 *   - Timezone suffix
 *   - Empty / whitespace-only
 *   - Malformed grammar
 *
 * Throws on every invalid input. Every error message includes the
 * original input and the fix.
 *
 * @see docs/adr/0004-cron-schedule-5-field-utc-strict.md
 */
export function validateCronSchedule(schedule: string): void {
  if (typeof schedule !== 'string') {
    throw new TypeError(`Invalid cron schedule: expected string, got ${typeof schedule}.`)
  }
  const trimmed = schedule.trim()
  if (trimmed.length === 0) {
    throw new Error(
      'Invalid cron schedule: empty string. TheoKit cron uses 5-field UTC strict format, e.g. "0 9 * * *".',
    )
  }

  // Shorthand check BEFORE field counting — `@daily` is one "field" but
  // semantically not in the 5-field grammar.
  if (trimmed.startsWith('@')) {
    throw new Error(
      `Invalid cron schedule "${schedule}": shorthand not supported. ` +
        'Use the equivalent 5-field form, e.g. "@daily" → "0 0 * * *", "@hourly" → "0 * * * *".',
    )
  }

  const parts = trimmed.split(/\s+/)
  if (parts.length !== 5) {
    throw new Error(
      `Invalid cron schedule "${schedule}": expected 5 fields ` +
        '("minute hour dayOfMonth month dayOfWeek"), ' +
        `got ${parts.length}. TheoKit treats all schedules as UTC; ` +
        'for second-precision or timezone, see docs/concepts/crons.md.',
    )
  }

  // Final grammar validation via cron-parser. We pass `tz: 'UTC'`
  // explicitly so any embedded timezone hint surfaces as an error.
  try {
    CronExpressionParser.parse(trimmed, { tz: 'UTC' })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid cron schedule "${schedule}": ${reason}`)
  }
}
