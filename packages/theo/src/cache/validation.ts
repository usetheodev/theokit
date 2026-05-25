import {
  CACHE_TAG_MAX_ITEMS,
  CACHE_TAG_MAX_LENGTH,
  DEFAULT_MAX_AGE,
  THEO_T_PREFIX,
} from './constants.js'

export interface ValidationResult<T> {
  valid: T[]
  dropped: { value: unknown; reason: string }[]
}

/**
 * Validate an array of cache tags.
 * Drops invalid entries (type / length / reserved-prefix / overflow) with warn log.
 * NEVER throws on runtime input — caller-facing safety.
 *
 * EC-1: defensive guard for non-array input (e.g., undefined from optional chain).
 */
export function validateTags(tags: unknown, description: string): ValidationResult<string> {
  // EC-1 guard
  if (!Array.isArray(tags)) {
    const result: ValidationResult<string> = {
      valid: [],
      dropped: [{ value: tags, reason: `expected array, got ${typeof tags}` }],
    }
    warnDropped(result, description)
    return result
  }

  // Array.isArray narrows to `any[]` (TS limitation). Re-type as unknown[]
  // so each element flows through explicit type guards below.
  const tagArr: unknown[] = tags as unknown[]
  const valid: string[] = []
  const dropped: { value: unknown; reason: string }[] = []

  for (let i = 0; i < tagArr.length; i++) {
    if (valid.length >= CACHE_TAG_MAX_ITEMS) {
      for (let j = i; j < tagArr.length; j++) {
        dropped.push({ value: tagArr[j], reason: 'overflow (max 128 tags)' })
      }
      break
    }
    const tag: unknown = tagArr[i]
    if (typeof tag !== 'string') {
      dropped.push({ value: tag, reason: 'invalid type, must be a string' })
      continue
    }
    if (tag.length > CACHE_TAG_MAX_LENGTH) {
      dropped.push({
        value: tag,
        reason: `exceeded max length of ${CACHE_TAG_MAX_LENGTH}`,
      })
      continue
    }
    if (tag.startsWith(THEO_T_PREFIX)) {
      dropped.push({
        value: tag,
        reason: `reserved prefix "${THEO_T_PREFIX}"`,
      })
      continue
    }
    valid.push(tag)
  }

  warnDropped({ valid, dropped }, description)
  return { valid, dropped }
}

/**
 * Validate a `maxAge` value in seconds.
 * Throws on invalid input (config-time validation).
 * Returns DEFAULT_MAX_AGE when undefined.
 */
export function validateMaxAge(maxAge: unknown, description: string): number {
  if (maxAge === undefined) return DEFAULT_MAX_AGE
  if (typeof maxAge === 'number' && Number.isFinite(maxAge) && maxAge >= 0) {
    return maxAge
  }
  throw new Error(
    `Invalid maxAge "${JSON.stringify(maxAge)}" in ${description}, must be a non-negative finite number`,
  )
}

/**
 * Validate an `expire` value in seconds, optionally cross-checked against `revalidate`.
 * Throws on invalid input (config-time validation).
 */
export function validateExpire(
  expire: unknown,
  revalidate: number | undefined,
  description: string,
): number | undefined {
  if (expire === undefined) return undefined
  if (typeof expire !== 'number' || !Number.isFinite(expire) || expire < 0) {
    throw new Error(
      `Invalid expire "${JSON.stringify(expire)}" in ${description}, must be a non-negative finite number`,
    )
  }
  if (revalidate !== undefined && expire < revalidate) {
    throw new Error(
      `Invalid expire ${expire} in ${description}, must be greater than or equal to revalidate ${revalidate}`,
    )
  }
  return expire
}

function warnDropped(result: ValidationResult<string>, description: string): void {
  if (result.dropped.length === 0) return
  console.warn(`[theokit:cache] ${description}: dropped ${result.dropped.length} invalid tag(s):`)
  for (const { value, reason } of result.dropped) {
    console.warn(`  - ${JSON.stringify(value)}: ${reason}`)
  }
}
