import { assertProductionSecret, createSessionManager, type SessionManager } from 'theokit/server'
import type { IncomingMessage, ServerResponse } from 'node:http'

export interface UserSession {
  userId: string
  username: string
}

// Demo placeholder — production server will REFUSE TO BOOT with this value.
// In a real app, read from process.env.SECRET (32+ random chars).
//   openssl rand -hex 32
const SECRET = process.env.SECRET ?? 'CHANGE_ME_TO_RANDOM_32_PLUS_CHARS_FOR_REAL'

// EC-2 — fails fast in production if the placeholder slipped through.
assertProductionSecret(SECRET)

const sessions: SessionManager<UserSession> = createSessionManager({
  secret: SECRET,
  cookieName: 'theo_session',
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
