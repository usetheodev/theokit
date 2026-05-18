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

/**
 * EC-2 — Production secret guard.
 *
 * Refuses to boot when `NODE_ENV === 'production'` AND the secret is either:
 *   - too short (< 32 chars), or
 *   - a known placeholder (matches /CHANGE_ME|demo[-_]|placeholder/i)
 *
 * In non-production (`development`, `test`, or unset), emits a console.warn
 * for placeholder secrets but does not throw. This lets dev/test environments
 * use obvious dummy values while production refuses to boot with them.
 *
 * Call this in the same module that constructs `createSessionManager` so the
 * guard fires at startup, not on the first request.
 */
const PLACEHOLDER_PATTERN = /CHANGE_ME|demo[-_]|placeholder/i

export function assertProductionSecret(secret: string): void {
  const isProd = process.env.NODE_ENV === 'production'
  const isPlaceholder = PLACEHOLDER_PATTERN.test(secret)
  const isTooShort = secret.length < 32

  if (isProd) {
    if (isTooShort) {
      throw new Error(
        `Session secret too short for production (${secret.length} chars; minimum 32). ` +
          `Set a 32+ random char secret in your env (e.g., \`openssl rand -hex 32\`).`,
      )
    }
    if (isPlaceholder) {
      throw new Error(
        `Session secret looks like a placeholder ("${secret.slice(0, 16)}…") and NODE_ENV is "production". ` +
          `Replace it with a 32+ random char secret (e.g., \`openssl rand -hex 32\`) before deploying.`,
      )
    }
    return
  }

  if (isPlaceholder || isTooShort) {
    console.warn(
      `[theokit] WARNING: session secret is a placeholder or too short. ` +
        `This is OK for dev, but the production server will REFUSE to boot until you replace it.`,
    )
  }
}
