import {
  assertProductionSecret,
  createSessionManager,
  type SessionManager,
} from 'theokit/server'
import type { IncomingMessage, ServerResponse } from 'node:http'

export interface UserSession {
  userId: string
  email: string
  name?: string
}

const SECRET = process.env.SECRET ?? 'CHANGE_ME_TO_RANDOM_32_PLUS_CHARS_FOR_REAL'
assertProductionSecret(SECRET)

export const sessions: SessionManager<UserSession> = createSessionManager({
  secret: SECRET,
  cookieName: 'authjs_bridge_session',
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
