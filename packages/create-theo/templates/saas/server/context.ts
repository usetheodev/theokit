import { assertProductionSecret, createSessionManager, type SessionManager } from 'theokit/server'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { db } from '../db/index.js'

export interface UserSession {
  userId: string
  email: string
}

const SECRET = process.env.SECRET ?? 'CHANGE_ME_TO_RANDOM_32_PLUS_CHARS_FOR_REAL'

// EC-2: dev warns + prod refuses to boot if SECRET is a placeholder.
// Replace .env.example secret with `openssl rand -hex 32` before deploying.
assertProductionSecret(SECRET)

const sessions: SessionManager<UserSession> = createSessionManager({
  secret: SECRET,
  cookieName: 'theo_session',
})

export interface RequestContext {
  sessions: SessionManager<UserSession>
  session: UserSession | null
  res: ServerResponse
  db: typeof db
}

export async function createContext({
  request,
  response,
}: {
  request: IncomingMessage
  response: ServerResponse
}): Promise<RequestContext> {
  const session = await sessions.getSession(request)
  return { sessions, session, res: response, db }
}
