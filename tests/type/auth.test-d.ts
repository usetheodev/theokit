import { describe, it, expectTypeOf } from 'vitest'
import { requireAuth } from 'theo/server'

interface UserSession {
  userId: string
  role: 'admin' | 'user'
}

describe('requireAuth type narrowing', () => {
  it('should narrow T | null to T after passing', () => {
    const session: UserSession | null = { userId: '1', role: 'admin' }
    requireAuth(session)
    // After requireAuth, session is narrowed to UserSession
    expectTypeOf(session).toEqualTypeOf<UserSession>()
  })

  it('should narrow custom type after passing', () => {
    interface CustomSession { id: number; name: string }
    const session: CustomSession | null = { id: 1, name: 'test' }
    requireAuth(session)
    expectTypeOf(session).toEqualTypeOf<CustomSession>()
  })
})
