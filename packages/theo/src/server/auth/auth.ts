export class AuthRequiredError extends Error {
  code = 'AUTH_REQUIRED' as const
  status = 401

  constructor(message = 'Authentication required') {
    super(message)
    this.name = 'AuthRequiredError'
  }
}

export function requireAuth<T>(session: T | null | undefined): asserts session is T {
  if (session === null || session === undefined) {
    throw new AuthRequiredError()
  }
}
