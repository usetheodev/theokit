/**
 * Single source of truth for cache subsystem constants.
 * Limits mirror Next.js (NEXT_CACHE_TAG_MAX_LENGTH / NEXT_CACHE_TAG_MAX_ITEMS)
 * — see reference doc §3.2 and ADR D6 of caching-and-revalidation-plan.md.
 */

export const CACHE_TAG_MAX_LENGTH = 256
export const CACHE_TAG_MAX_ITEMS = 128
export const THEO_T_PREFIX = '_THEO_T_'

export const DEFAULT_MAX_AGE = 1
export const DEFAULT_SWR_MULTIPLIER = 60
