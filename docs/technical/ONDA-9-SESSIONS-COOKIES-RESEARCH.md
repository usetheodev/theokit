# Onda 9 (Pre-req) — Sessions & Cookies Research

**Data:** 2026-05-09
**Pesquisador:** Claude (SOTA Research Skill)
**Escopo:** Session management e cookie helpers para habilitar templates auth-basic e superiores

---

## 1. Sumário Executivo

Para templates como `auth-basic`, `postgres-basic`, e `stripe-saas`, o Theo precisa de **cookie helpers** no server (read/set/delete) com atributos seguros (`httpOnly`, `secure`, `sameSite`). **NÃO precisa de session management built-in** — isso é responsabilidade do user (como Next.js). O Theo fornece a API de cookies; o user implementa session logic (JWT, database sessions, etc).

---

## 2. Estado Atual

O Theo já tem os building blocks:
- **`req.headers.cookie`** — cookies raw do request (IncomingMessage)
- **`res.setHeader('Set-Cookie', ...)`** — setar cookies na response (ServerResponse)
- **`ctx`** — request context onde session data pode ser armazenada
- **Middleware** — onde auth checks e cookie parsing acontecem

O que **falta**: helpers tipados para cookie operations (`getCookie`, `setCookie`, `deleteCookie`) com opções seguras.

---

## 3. Decisões Arquiteturais

### D1: Cookie helpers, não session management

**Decisão:** O Theo fornece helpers `getCookie(req, name)` e `setCookie(res, name, value, options)`. Session management é user-land (como Next.js).

**Justificativa:** Next.js não tem session built-in (usa next-auth). Hono não tem session built-in (usa hono-sessions third-party). Session é opinião do user (JWT vs database vs cookie-only). Framework fornece a primitiva.

### D2: API inspirada no Hono cookie helper

```typescript
import { getCookie, setCookie, deleteCookie } from 'theo/server'

// In route handler or middleware:
const token = getCookie(req, 'session')
setCookie(res, 'session', newToken, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 60 * 60 * 24, // 24h
  path: '/',
})
deleteCookie(res, 'session')
```

### D3: Signed cookies via HMAC (opcional)

```typescript
import { getSignedCookie, setSignedCookie } from 'theo/server'

// Uses HMAC-SHA256 with a secret from theo.config.ts or env
const value = await getSignedCookie(req, 'session', SECRET)
await setSignedCookie(res, 'session', value, SECRET, options)
```

**Para MVP:** Signed cookies são nice-to-have. Unsigned cookies com `httpOnly + secure + sameSite` cobrem 90% dos use cases. Signed cookies vêm depois se necessário.

### D4: Defaults seguros

| Opção | Default | Motivo |
|-------|---------|--------|
| `httpOnly` | `true` | Previne XSS access |
| `secure` | `process.env.NODE_ENV === 'production'` | HTTPS-only em prod |
| `sameSite` | `'lax'` | CSRF protection parcial |
| `path` | `'/'` | Cookie disponível em todo o site |

---

## 4. Implementação

### Parsing cookies do request

```typescript
export function getCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie ?? ''
  const cookies = header.split(';').reduce((acc, pair) => {
    const [k, ...v] = pair.trim().split('=')
    acc[k] = decodeURIComponent(v.join('='))
    return acc
  }, {} as Record<string, string>)
  return cookies[name]
}

export function getAllCookies(req: IncomingMessage): Record<string, string> {
  // Same parsing, returns all
}
```

### Setting cookies na response

```typescript
interface CookieOptions {
  httpOnly?: boolean   // default: true
  secure?: boolean     // default: NODE_ENV === 'production'
  sameSite?: 'strict' | 'lax' | 'none'  // default: 'lax'
  maxAge?: number      // seconds
  path?: string        // default: '/'
  domain?: string
}

export function setCookie(
  res: ServerResponse,
  name: string,
  value: string,
  options?: CookieOptions,
): void {
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    ...options,
  }
  
  const parts = [`${name}=${encodeURIComponent(value)}`]
  if (opts.httpOnly) parts.push('HttpOnly')
  if (opts.secure) parts.push('Secure')
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`)
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`)
  if (opts.path) parts.push(`Path=${opts.path}`)
  if (opts.domain) parts.push(`Domain=${opts.domain}`)
  
  // Append to existing Set-Cookie headers (don't overwrite)
  const existing = res.getHeader('Set-Cookie')
  const cookies = existing ? (Array.isArray(existing) ? existing : [String(existing)]) : []
  cookies.push(parts.join('; '))
  res.setHeader('Set-Cookie', cookies)
}

export function deleteCookie(res: ServerResponse, name: string, options?: { path?: string }): void {
  setCookie(res, name, '', { maxAge: 0, path: options?.path ?? '/' })
}
```

---

## 5. Onde os Cookie Helpers Vivem

**Arquivo:** `packages/theo/src/server/cookies.ts` (NEW)
**Export:** Via `theo/server` subpath

```typescript
import { getCookie, setCookie, deleteCookie } from 'theo/server'
```

---

## 6. Uso no Template auth-basic

```typescript
// server/middleware.ts
import { getCookie } from 'theo/server'

export default async function middleware(req, res, next) {
  const token = getCookie(req, 'session')
  if (!token && req.url?.startsWith('/api/protected')) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }))
    return
  }
  await next()
}

// server/actions/login.ts
import { defineAction } from 'theo/server'
import { setCookie } from 'theo/server'
import { z } from 'zod'

export const login = defineAction({
  input: z.object({ email: z.string().email(), password: z.string() }),
  handler: async ({ input, ctx }) => {
    // Validate credentials (user implements this)
    const token = generateSessionToken(input.email)
    // Set session cookie on response
    // Note: ctx needs access to res — this is the gap
    return { success: true }
  },
})
```

**Gap identificado:** O handler de action recebe `{ input, ctx }` mas NÃO tem acesso ao `res` (ServerResponse) para setar cookies. Precisamos adicionar `res` ao handler context, ou fornecer `setCookie` via `ctx`.

**Solução proposta:** Adicionar `setCookie` e `getCookie` ao context:

```typescript
// server/context.ts (user)
export async function createContext({ request, response }) {
  return {
    requestId: crypto.randomUUID(),
    setCookie: (name, value, opts) => setCookie(response, name, value, opts),
    getCookie: (name) => getCookie(request, name),
  }
}
```

Ou o framework pode injetar automaticamente.

---

## 7. Competitivo

| Dimensão | Theo (target) | Next.js | Hono | Rails | Best |
|----------|---------------|---------|------|-------|------|
| Cookie helpers | 4/5 | 4/5 | 5/5 | 5/5 | Hono |
| Secure defaults | 5/5 | 3/5 | 4/5 | 5/5 | Rails/Theo |
| Session built-in | 1/5 | 1/5 | 1/5 | 5/5 | Rails |
| Cookie signing | 2/5 | 3/5 | 4/5 | 5/5 | Rails |

---

## 8. Escopo Mínimo para Habilitar Templates

Para desbloquear `auth-basic` template:
1. ✅ `getCookie(req, name)` — parse cookie header
2. ✅ `setCookie(res, name, value, options)` — set with secure defaults
3. ✅ `deleteCookie(res, name)` — expire cookie
4. ✅ Cookie helpers exportados via `theo/server`
5. ⚠️ Response acessível no handler context (para actions setarem cookies)

Para desbloquear `postgres-basic`: precisa de database — fora de escopo do framework (user usa Prisma/Drizzle).

Para desbloquear `stripe-saas`: precisa de auth + database + Stripe — muito fora de escopo.

---

## Sources

- [Hono Cookie Helper](https://hono.dev/docs/helpers/cookie)
- [hono-sessions](https://github.com/jcs224/hono_sessions)
- [MDN Cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)
- [MDN Secure Cookie Config](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies)
- [typescript-session](https://github.com/wristband-dev/typescript-session)
- Next.js `/server/request/cookies.ts` — Phase-based cookie mutability
- Next.js `/server/web/spec-extension/cookies.ts` — RequestCookies/ResponseCookies
