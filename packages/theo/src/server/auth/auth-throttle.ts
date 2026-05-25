import type { RateLimitStore } from '../rate-limit/rate-limit-store.js'

/**
 * T6.1 — Login throttling primitive.
 *
 * Per-credential failure counter backed by any `RateLimitStore`. After
 * `maxAttempts` failures within `windowMs`, the identifier is locked
 * for `lockoutMs`. Successful login resets the counter.
 *
 * Usage in a login handler:
 *
 *   const state = await checkThrottle({ store, identifier: hash(email) })
 *   if (!state.allowed) return 429
 *   const valid = await verifyPassword(creds)
 *   await recordAttempt({ store, identifier: hash(email) }, valid)
 *   if (!valid) return 401
 *
 * SECURITY:
 *   - NEVER pass raw email/username as `identifier`. Hash or normalize
 *     first (e.g. SHA-256 of the lowercased email). This prevents PII
 *     from landing in the rate-limit store or audit logs.
 *   - Combine with the per-route IP rate limit (T2.2) for layered defense:
 *     IP-level limits stop scripted floods; credential-level limits stop
 *     distributed brute force.
 */

export interface ThrottleOptions {
  store: RateLimitStore
  /**
   * Stable identifier per credential. Hash raw emails/usernames before
   * passing in — never leak PII to the rate-limit key space.
   */
  identifier: string
  /** Failures before lockout. Default 5. */
  maxAttempts?: number
  /** Sliding window for counting failures. Default 15 minutes. */
  windowMs?: number
  /** Lockout duration after maxAttempts hit. Default 1 hour. */
  lockoutMs?: number
}

export interface ThrottleState {
  allowed: boolean
  remainingAttempts: number
  /** Set when `allowed === false`. Absolute timestamp when the lockout expires. */
  lockedUntil?: Date
}

const DEFAULT_MAX_ATTEMPTS = 5
const DEFAULT_LOCKOUT_MS = 60 * 60_000

/**
 * Read the current throttle state for an identifier WITHOUT modifying
 * the counter. Call before validating credentials so locked attempts
 * are rejected fast.
 */
export async function checkThrottle(opts: ThrottleOptions): Promise<ThrottleState> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const state = await opts.store.get(opts.identifier)
  if (!state) {
    return { allowed: true, remainingAttempts: maxAttempts }
  }
  if (state.count >= maxAttempts) {
    return {
      allowed: false,
      remainingAttempts: 0,
      // Lockout expires when the store TTL fires.
      lockedUntil: new Date(state.resetAt),
    }
  }
  return {
    allowed: true,
    remainingAttempts: Math.max(0, maxAttempts - state.count),
  }
}

/**
 * Record an attempt outcome. On success → reset the counter. On failure
 * → increment within the sliding window. Returns the new throttle state.
 *
 * Storage model: the store entry's TTL is `lockoutMs` (which doubles as
 * the failure-accumulation window). When `lockoutMs` is short — common
 * in tests or for soft lockouts — the entry auto-expires and the next
 * attempt starts fresh.
 */
export async function recordAttempt(
  opts: ThrottleOptions,
  success: boolean,
): Promise<ThrottleState> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  if (success) {
    await opts.store.reset(opts.identifier)
    return {
      allowed: true,
      remainingAttempts: maxAttempts,
    }
  }
  const lockoutMs = opts.lockoutMs ?? DEFAULT_LOCKOUT_MS
  const state = await opts.store.incr(opts.identifier, lockoutMs)

  if (state.count >= maxAttempts) {
    return {
      allowed: false,
      remainingAttempts: 0,
      lockedUntil: new Date(state.resetAt),
    }
  }
  return {
    allowed: true,
    remainingAttempts: Math.max(0, maxAttempts - state.count),
  }
}
