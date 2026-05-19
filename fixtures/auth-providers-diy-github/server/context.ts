import {
  assertProductionSecret,
  createSessionManager,
  type SessionManager,
} from 'theokit/server'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * The DIY GitHub OAuth fixture re-uses the standard session shape but
 * piggybacks on it during the OAuth round-trip: the temporary PKCE
 * verifier + state are stored under `pending` before the redirect and
 * cleared on successful callback.
 */
export interface UserSession {
  userId?: string
  login?: string
  pending?: {
    codeVerifier: string
    state: string
  }
}

const SECRET = process.env.SECRET ?? 'CHANGE_ME_TO_RANDOM_32_PLUS_CHARS_FOR_REAL'
assertProductionSecret(SECRET)

const sessions: SessionManager<UserSession> = createSessionManager({
  secret: SECRET,
  cookieName: 'diy_github_session',
})

export interface RequestContext {
  sessions: SessionManager<UserSession>
  session: UserSession | null
  res: ServerResponse
}

export async function createContext({
  request,
  response,
}: {
  request: IncomingMessage
  response: ServerResponse
}): Promise<RequestContext> {
  const session = await sessions.getSession(request)
  return { sessions, session, res: response }
}
