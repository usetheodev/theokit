import {
  assertProductionSecret,
  createSessionManager,
  type SessionManager,
} from 'theokit/server'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { db } from '../db/index.js'

export interface UserSession {
  userId: string
  email: string
  name: string
}

const SECRET = process.env.SECRET ?? 'CHANGE_ME_TO_RANDOM_32_PLUS_CHARS_FOR_REAL'

// EC-2 — production refuses to boot with placeholder; dev only warns.
assertProductionSecret(SECRET)

const sessionManager: SessionManager<UserSession> = createSessionManager({
  secret: SECRET,
  cookieName: 'agent_saas_session',
  maxAge: 60 * 60 * 24 * 7, // 7 days
})

export interface RequestContext {
  sessions: SessionManager<UserSession>
  session: UserSession | null
  db: typeof db
  res: ServerResponse
  requestId: string
}

let counter = 0
function requestId(): string {
  counter = (counter + 1) % 1_000_000
  return `r-${Date.now().toString(36)}-${counter.toString(36)}`
}

export async function createContext({
  request,
  response,
}: {
  request: IncomingMessage
  response: ServerResponse
}): Promise<RequestContext> {
  const session = await sessionManager.getSession(request)
  const id = requestId()
  response.setHeader('x-request-id', id)
  return {
    sessions: sessionManager,
    session,
    db,
    res: response,
    requestId: id,
  }
}
