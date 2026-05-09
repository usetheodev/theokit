import type { IncomingMessage, ServerResponse } from 'node:http'
import { encrypt, decrypt } from './crypto.js'
import { getCookie, setCookie, deleteCookie } from './cookies.js'

export interface SessionConfig {
  secret: string
  cookieName?: string
  maxAge?: number
}

interface SessionEnvelope<T> {
  data: T
  exp: number
}

export interface SessionManager<TSession> {
  getSession(req: IncomingMessage): Promise<TSession | null>
  createSession(res: ServerResponse, data: TSession): Promise<void>
  destroySession(res: ServerResponse): void
}

export function createSessionManager<TSession>(config: SessionConfig): SessionManager<TSession> {
  if (config.secret.length < 32) {
    throw new Error('Session secret must be at least 32 characters for secure encryption')
  }

  const cookieName = config.cookieName ?? 'theo_session'
  const maxAge = config.maxAge ?? 604800 // 7 days

  return {
    async getSession(req: IncomingMessage): Promise<TSession | null> {
      const raw = getCookie(req, cookieName)
      if (!raw) return null

      const envelope = await decrypt<SessionEnvelope<TSession>>(raw, config.secret)
      if (!envelope) return null

      if (envelope.exp < Date.now()) return null

      return envelope.data
    },

    async createSession(res: ServerResponse, data: TSession): Promise<void> {
      const envelope: SessionEnvelope<TSession> = {
        data,
        exp: Date.now() + maxAge * 1000,
      }
      const token = await encrypt(envelope, config.secret)
      setCookie(res, cookieName, token, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge,
        path: '/',
      })
    },

    destroySession(res: ServerResponse): void {
      deleteCookie(res, cookieName)
    },
  }
}
