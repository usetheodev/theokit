import type { IncomingMessage, ServerResponse } from 'node:http'

import { getCookie, setCookie, deleteCookie } from './cookies.js'
import { encrypt, decrypt } from './crypto.js'

export interface SessionConfig {
  /**
   * Session secret. Either a single string (legacy) or an array of strings
   * where index 0 is the newest. The array form enables dual-key rotation
   * (T3.1 / ADR D5): encrypt always uses `secrets[0]`, decrypt walks the
   * array, transparent re-encrypt on legacy hits (T3.2).
   *
   * EC-1: array length capped at 5 — enforced via throw at construction.
   */
  secret: string | string[]
  cookieName?: string
  maxAge?: number
}

interface SessionEnvelope<T> {
  data: T
  exp: number
}

export interface SessionMeta {
  /** Index of the secret that decrypted the session. 0 = newest; > 0 = legacy. */
  secretIndex: number
  /** True when the decrypt used a legacy secret and the cookie should be re-encrypted. */
  needsReencrypt: boolean
}

export interface SessionManager<TSession> {
  getSession(req: IncomingMessage): Promise<TSession | null>
  /**
   * T3.2 — Variant of `getSession` that surfaces decrypt metadata.
   * Used by `api-middleware.ts` to wire transparent re-encrypt BEFORE
   * the handler runs (so streaming SSR routes don't miss the Set-Cookie
   * window — EC-4).
   */
  getSessionWithMeta(req: IncomingMessage): Promise<{ data: TSession | null; meta: SessionMeta }>
  createSession(res: ServerResponse, data: TSession): Promise<void>
  destroySession(res: ServerResponse): void
  /**
   * T3.3 — OWASP A07:2021 session fixation mitigation. Re-encrypts the
   * current session with a fresh IV and refreshed expiry. No-op when no
   * session is present.
   */
  rotateSession(req: IncomingMessage, res: ServerResponse): Promise<TSession | null>
}

/**
 * EC-1 — array length cap. Enforced via throw at construction. Silent
 * truncation would create false sense of rotation; silent acceptance
 * would create unbounded CPU on legacy decrypt walks.
 */
const MAX_SECRETS = 5

/**
 * Validate + normalize the secret config into a non-empty array of
 * strings ≥ 32 chars each.
 */
function normalizeSecrets(input: string | string[]): string[] {
  const arr = Array.isArray(input) ? input.slice() : [input]
  if (arr.length === 0) {
    throw new Error('Session secret must be non-empty (received an empty array)')
  }
  if (arr.length > MAX_SECRETS) {
    throw new Error(
      `Session secret array exceeds maximum of ${MAX_SECRETS} entries — drop the oldest before adding a new one (received ${arr.length})`,
    )
  }
  const wasArray = Array.isArray(input)
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i]
    if (typeof s !== 'string' || s.length < 32) {
      const where = wasArray ? ` at index ${i}` : ''
      throw new Error(`Session secret${where} must be at least 32 characters for secure encryption`)
    }
  }
  return arr
}

export function createSessionManager<TSession>(config: SessionConfig): SessionManager<TSession> {
  const secrets = normalizeSecrets(config.secret)
  const cookieName = config.cookieName ?? 'theo_session'
  const maxAge = config.maxAge ?? 604800 // 7 days

  async function encryptEnvelope(data: TSession): Promise<string> {
    const envelope: SessionEnvelope<TSession> = {
      data,
      exp: Date.now() + maxAge * 1000,
    }
    return encrypt(envelope, secrets[0]) // newest
  }

  function writeCookie(res: ServerResponse, token: string): void {
    setCookie(res, cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge,
      path: '/',
    })
  }

  async function decryptWithFallback(
    raw: string,
  ): Promise<{ envelope: SessionEnvelope<TSession>; index: number } | null> {
    // CR-002 constant-time: try EVERY rotation entry, then pick the newest
    // match. Sequential early-exit leaked rotation position via timing
    // (success on entry 0 returned in ~3 ms; success on entry 4 in ~15 ms).
    // Running in parallel binds wall-clock to the slowest single attempt,
    // independent of which entry actually matched. With derived-key cache
    // (CR-002 in crypto.ts), the CPU multiplier per request is ~0 after
    // the first request per secret.
    const results = await Promise.all(
      secrets.map(async (secret, i) => {
        const env = await decrypt<SessionEnvelope<TSession>>(raw, secret)
        return env ? { envelope: env, index: i } : null
      }),
    )
    for (const result of results) {
      if (result) return result
    }
    return null
  }

  return {
    async getSession(req) {
      const { data } = await this.getSessionWithMeta(req)
      return data
    },

    async getSessionWithMeta(req) {
      const raw = getCookie(req, cookieName)
      if (!raw) return { data: null, meta: { secretIndex: -1, needsReencrypt: false } }
      const decoded = await decryptWithFallback(raw)
      if (!decoded) return { data: null, meta: { secretIndex: -1, needsReencrypt: false } }
      if (decoded.envelope.exp < Date.now()) {
        return { data: null, meta: { secretIndex: decoded.index, needsReencrypt: false } }
      }
      return {
        data: decoded.envelope.data,
        meta: { secretIndex: decoded.index, needsReencrypt: decoded.index > 0 },
      }
    },

    async createSession(res, data) {
      const token = await encryptEnvelope(data)
      writeCookie(res, token)
    },

    destroySession(res) {
      deleteCookie(res, cookieName)
    },

    async rotateSession(req, res) {
      const { data } = await this.getSessionWithMeta(req)
      if (data === null) return null
      // Fresh IV per encrypt call (Web Crypto guarantee — see crypto.ts)
      // + refreshed expiry. Last write wins for the cookie value.
      const token = await encryptEnvelope(data)
      writeCookie(res, token)
      return data
    },
  }
}

/**
 * T3.2 — Transparent re-encrypt helper (EC-4 timing-safe wrapper).
 *
 * Call this in your `createContext` (before any rendering / streaming
 * starts). It:
 *   1. Reads the session via `getSessionWithMeta`.
 *   2. If the cookie was decrypted with a legacy secret (index > 0), it
 *      immediately re-issues the cookie with `secrets[0]` so the next
 *      request lands on the newest key.
 *   3. Returns the session data (or null) for use downstream.
 *
 * EC-4: this MUST run before `renderToPipeableStream` / `res.writeHead`
 * fires. Calling it inside an SSR component or handler body that has
 * already streamed bytes makes the re-encrypt a silent no-op (Set-Cookie
 * is locked once headers commit), trapping users on the legacy secret
 * forever once it's removed from the array.
 */
export async function rotateIfNeeded<TSession>(
  sm: SessionManager<TSession>,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<TSession | null> {
  const { data, meta } = await sm.getSessionWithMeta(req)
  if (data !== null && meta.needsReencrypt) {
    await sm.createSession(res, data)
  }
  return data
}

/**
 * EC-2 — Production secret guard. Refuses to boot when `NODE_ENV === 'production'`
 * AND the secret is too short (< 32 chars) OR matches a known placeholder.
 *
 * Accepts a single secret OR an array. In array form, each entry is validated
 * independently — a single bad entry refuses boot with an index-qualified message.
 */
const PLACEHOLDER_PATTERN = /CHANGE_ME|demo[-_]|placeholder/i

export function assertProductionSecret(secret: string | string[]): void {
  const arr = Array.isArray(secret) ? secret : [secret]
  const isProd = process.env.NODE_ENV === 'production'

  for (let i = 0; i < arr.length; i++) {
    const s = arr[i]
    const isPlaceholder = PLACEHOLDER_PATTERN.test(s)
    const isTooShort = s.length < 32
    const prefix = arr.length > 1 ? `Session secret at index ${i}` : 'Session secret'

    if (isProd) {
      if (isTooShort) {
        throw new Error(
          `${prefix} too short for production (${s.length} chars; minimum 32). ` +
            `Set a 32+ random char secret in your env (e.g., \`openssl rand -hex 32\`).`,
        )
      }
      if (isPlaceholder) {
        throw new Error(
          `${prefix} looks like a placeholder ("${s.slice(0, 16)}…") and NODE_ENV is "production". ` +
            `Replace it with a 32+ random char secret (e.g., \`openssl rand -hex 32\`) before deploying.`,
        )
      }
      continue
    }
    if (isPlaceholder || isTooShort) {
      console.warn(
        `[theokit] WARNING: ${prefix.toLowerCase()} is a placeholder or too short. ` +
          `This is OK for dev, but the production server will REFUSE to boot until you replace it.`,
      )
    }
  }
}
