import { describe, it, expect } from 'vitest'
import { checkThrottle, recordAttempt } from '../../packages/theo/src/server/auth/auth-throttle.js'
import { InMemoryStore } from '../../packages/theo/src/server/rate-limit/rate-limit-store.js'

/**
 * T6.1 — Login throttling primitive (OWASP A07:2021 mitigation).
 *
 * Per-credential failure counter backed by any RateLimitStore. Successful
 * login resets the counter. After maxAttempts failures, the identifier
 * is locked for lockoutMs.
 *
 * User wires this in their login handler:
 *   const state = await checkThrottle({ store, identifier: hash(email) })
 *   if (!state.allowed) return 429
 *   const valid = await verifyPassword(...)
 *   await recordAttempt({ store, identifier: hash(email) }, valid)
 */

const HASH_OF_ALICE = 'h-alice-' + 'a'.repeat(32)
const HASH_OF_BOB = 'h-bob-' + 'b'.repeat(32)

describe('T6.1 — checkThrottle / recordAttempt', () => {
  it('first attempt is allowed with full remainingAttempts', async () => {
    const store = new InMemoryStore()
    const state = await checkThrottle({ store, identifier: HASH_OF_ALICE })
    expect(state.allowed).toBe(true)
    expect(state.remainingAttempts).toBe(5)
  })

  it('after 5 failures, identifier is locked', async () => {
    const store = new InMemoryStore()
    for (let i = 0; i < 5; i++) {
      await recordAttempt({ store, identifier: HASH_OF_ALICE }, false)
    }
    const state = await checkThrottle({ store, identifier: HASH_OF_ALICE })
    expect(state.allowed).toBe(false)
    expect(state.lockedUntil).toBeInstanceOf(Date)
  })

  it('successful recordAttempt resets the counter', async () => {
    const store = new InMemoryStore()
    await recordAttempt({ store, identifier: HASH_OF_ALICE }, false)
    await recordAttempt({ store, identifier: HASH_OF_ALICE }, false)
    await recordAttempt({ store, identifier: HASH_OF_ALICE }, false)
    await recordAttempt({ store, identifier: HASH_OF_ALICE }, true) // success
    const state = await checkThrottle({ store, identifier: HASH_OF_ALICE })
    expect(state.allowed).toBe(true)
    expect(state.remainingAttempts).toBe(5)
  })

  it('lockout expires after lockoutMs', async () => {
    const store = new InMemoryStore()
    for (let i = 0; i < 5; i++) {
      await recordAttempt({ store, identifier: HASH_OF_ALICE, lockoutMs: 5 }, false)
    }
    await new Promise((r) => setTimeout(r, 10))
    const state = await checkThrottle({ store, identifier: HASH_OF_ALICE, lockoutMs: 5 })
    expect(state.allowed).toBe(true)
    expect(state.remainingAttempts).toBe(5)
  })

  it('remainingAttempts decrements with each failure', async () => {
    const store = new InMemoryStore()
    await recordAttempt({ store, identifier: HASH_OF_ALICE }, false)
    let state = await checkThrottle({ store, identifier: HASH_OF_ALICE })
    expect(state.remainingAttempts).toBe(4)
    await recordAttempt({ store, identifier: HASH_OF_ALICE }, false)
    state = await checkThrottle({ store, identifier: HASH_OF_ALICE })
    expect(state.remainingAttempts).toBe(3)
  })

  it('custom maxAttempts respected', async () => {
    const store = new InMemoryStore()
    for (let i = 0; i < 3; i++) {
      await recordAttempt({ store, identifier: HASH_OF_ALICE, maxAttempts: 3 }, false)
    }
    const state = await checkThrottle({ store, identifier: HASH_OF_ALICE, maxAttempts: 3 })
    expect(state.allowed).toBe(false)
  })

  it('identifier isolation: alice locked does not affect bob', async () => {
    const store = new InMemoryStore()
    for (let i = 0; i < 5; i++) {
      await recordAttempt({ store, identifier: HASH_OF_ALICE }, false)
    }
    const bob = await checkThrottle({ store, identifier: HASH_OF_BOB })
    const alice = await checkThrottle({ store, identifier: HASH_OF_ALICE })
    expect(bob.allowed).toBe(true)
    expect(alice.allowed).toBe(false)
  })

  it('EC: concurrent failures overshoot maxAttempts safely (no crash)', async () => {
    const store = new InMemoryStore()
    const promises = []
    for (let i = 0; i < 10; i++) {
      promises.push(recordAttempt({ store, identifier: HASH_OF_ALICE }, false))
    }
    await Promise.all(promises)
    const state = await checkThrottle({ store, identifier: HASH_OF_ALICE })
    expect(state.allowed).toBe(false)
  })
})
