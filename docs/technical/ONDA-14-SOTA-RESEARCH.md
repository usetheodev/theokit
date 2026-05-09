# Onda 14 — SOTA Research: Auth Hooks

**Data:** 2026-05-09
**Pesquisador:** Claude (SOTA Research Skill)
**Escopo:** Auth system para Theo: session management, requireAuth guard, login/logout, ctx.user tipado.

---

## 1. Abordagens na Indústria

| Framework/Lib | Abordagem | Session Storage | Deps | Complexidade |
|---------------|-----------|----------------|------|--------------|
| **Better Auth** | Full auth framework, DB-backed sessions | Database + cookie cache | Pesada | Alta |
| **iron-session** | Encrypted stateless cookies | Cookie only (signed+encrypted) | `iron-webcrypto` | Baixa |
| **Lucia Auth v3** | Session lib, DB-backed | Database | Leve | Média |
| **Remix** | `createCookieSessionStorage` | Cookie (plain signed) | Built-in | Baixa |
| **Hono** | Middleware pattern, BYOA | Varies | None built-in | Média |
| **Next.js** | Auth.js/NextAuth integration | Database/JWT | Pesada | Alta |

### Insight: O Theo Precisa de Quanto Auth?

O Theo é um **framework**, não uma **auth library**. Ele deve fornecer:
1. **Primitivas** para session management (baseado nos cookies que já existem)
2. **Padrão** para `requireAuth()` guard
3. **Integração** com o context system (ctx.user tipado)

Ele NÃO deve fornecer:
- OAuth providers (isso é Better Auth, Auth.js)
- Password hashing (isso é bcrypt/argon2)
- Email verification, MFA, passkeys
- Database session storage

### Decisão: Stateless Sessions via Encrypted Cookies (iron-session style)

**Por quê:**
1. O Theo já tem `getCookie`/`setCookie`/`deleteCookie` (Onda 9)
2. Stateless = sem database para sessions = zero infra requirement
3. Encrypted cookies = secure by default
4. ~50 linhas de implementação com `iron-webcrypto` (Web Crypto API)
5. Serverless-friendly

**Alternativas descartadas:**
- Better Auth: Overkill — é um framework completo, não uma primitiva
- Database sessions: Requer DB setup (Onda 15), circular dependency
- JWT: Sem invalidação server-side, problemas conhecidos de segurança
- Plain signed cookies: Dados visíveis (mesmo assinados), leaking user info

---

## 2. Arquitetura Proposta

### Componentes

```
server/auth.ts (user-created)
├── createSession(res, data)    — encrypta data → cookie
├── getSession(req)             — cookie → decrypta → data
├── destroySession(res)         — deleta cookie
└── requireAuth(req, res)       — getSession + validate → throw se inválido
```

### Fluxo

```
1. Login:
   POST /api/auth/login → validate credentials → createSession(res, { userId, role })

2. Protected route:
   GET /api/dashboard → middleware/handler calls requireAuth(req) → ctx.user = session data

3. Logout:
   POST /api/auth/logout → destroySession(res) → redirect
```

### O que o framework provê vs o que o user faz

| Responsabilidade | Quem |
|-----------------|------|
| `createSessionHelper(secret)` factory | **Framework** (`theo/server`) |
| `requireAuth()` guard function | **Framework** (`theo/server`) |
| Auth route handlers (login, logout, register) | **User** (`server/routes/auth/`) |
| Password hashing, email validation | **User** (bcrypt, etc.) |
| OAuth providers | **User** (Better Auth, Auth.js) |
| Session data shape | **User** (generic `TSession`) |

---

## 3. API Design

### `createSessionManager<TSession>(config)`

```typescript
import { createSessionManager } from 'theo/server'

// User defines session shape
interface UserSession {
  userId: string
  role: 'admin' | 'user'
}

const auth = createSessionManager<UserSession>({
  secret: process.env.SESSION_SECRET!,
  cookieName: 'theo_session',  // default
  maxAge: 7 * 24 * 60 * 60,     // 7 days default
})

// In a route handler:
export const POST = defineRoute({
  body: z.object({ email: z.string(), password: z.string() }),
  handler: async ({ body, request }) => {
    const user = await verifyCredentials(body.email, body.password)
    // Creates encrypted session cookie
    auth.createSession(request, { userId: user.id, role: user.role })
    return { ok: true }
  }
})
```

Wait — the handler receives `request: Request` (Web API), but `createSession` needs to set a cookie on the **response**. In the current Theo architecture, the handler doesn't have direct access to the response object.

### Problem: Response Access

The handler signature is:
```typescript
handler: ({ query, body, params, request, ctx }) => result
```

No `response` object. The response is created from the handler's return value by `executeRoute`. To set cookies, the handler would need response access.

### Solution Options

**Option A — Return headers from handler**: Handler returns `{ data, headers }` — complex, breaks existing API.

**Option B — Use Web API Response**: Handler already can return `new Response()` — set cookies via `Set-Cookie` header.

**Option C — Inject response into ctx**: `createContext()` returns `{ req, res }` — handler accesses `ctx.res`.

**Option D — Session via middleware**: Middleware sets session cookie, handler just reads from ctx.

### Decision: Option B + D combined

- **Reading session**: `auth.getSession(request)` — reads from cookie header (Request is available)
- **Writing session**: Return `new Response()` with `Set-Cookie` header (handler can already do this)
- **requireAuth**: Middleware pattern — sets `ctx.user` if session valid, or returns 401

Actually, looking at the existing code more carefully — `executeRoute` passes `request: req` which is `IncomingMessage`, not Web API `Request`. And `setCookie` takes `ServerResponse`. The handler has access to `request` (IncomingMessage). 

**Simplest approach**: `getSession(req)` reads from IncomingMessage cookies (already works with getCookie). For creating/destroying sessions, the handler returns the session data and the framework's execution pipeline handles setting cookies. OR the user uses middleware.

**Even simpler**: Provide the session functions that work with `IncomingMessage`/`ServerResponse`. The user wires them in `server/context.ts` (which has access to both req and res):

```typescript
// server/context.ts
import { createSessionManager } from 'theo/server'

interface UserSession { userId: string; role: string }

const sessionManager = createSessionManager<UserSession>({
  secret: process.env.SESSION_SECRET!,
})

export async function createContext({ request, response }) {
  const session = await sessionManager.getSession(request)
  return {
    user: session,
    session: sessionManager, // expose for login/logout in routes
    response, // expose for setCookie in routes
  }
}
```

This works because `createContext` receives both `request` and `response`.

---

## 4. Encryption: Web Crypto vs iron

### Option A — `iron-webcrypto` (npm package)
- Encrypted + signed cookies using iron protocol
- Well-tested (used by iron-session, 3k+ stars)
- ~15KB dependency
- Works in all runtimes (Web Crypto API)

### Option B — Built-in Web Crypto
- `crypto.subtle.encrypt` + `crypto.subtle.sign`
- Zero dependency
- ~30 lines of code
- AES-256-GCM for encryption, HMAC-SHA256 for signing

### Decision: Option B — Built-in Web Crypto

**Justificativa:** 
- Não reinventar a roda? Neste caso, a roda é ~30 linhas de AES-GCM. `iron-webcrypto` é 15KB para fazer a mesma coisa.
- `crypto.subtle` é disponível em Node 18+, Deno, Bun, browsers
- KISS: encrypt(data, key) → base64 string. decrypt(base64, key) → data.
- Sem protocol overhead de iron (que tem versioning, nonces extras, etc.)

**Formato do cookie:**
```
iv.ciphertext.tag (base64url encoded, separated by dots)
```

---

## 5. Implementação Mínima

### Arquivos novos

| Arquivo | Propósito |
|---------|-----------|
| `packages/theo/src/server/session.ts` | `createSessionManager<T>(config)` — getSession, createSession, destroySession |
| `packages/theo/src/server/crypto.ts` | `encrypt(data, secret)`, `decrypt(token, secret)` — AES-256-GCM via Web Crypto |

### Exports de `theo/server`

```typescript
export { createSessionManager } from './session.js'
export type { SessionManager, SessionConfig } from './session.js'
```

### `requireAuth()` — helper function

```typescript
// packages/theo/src/server/auth.ts
export function requireAuth<TSession>(
  session: TSession | null,
): asserts session is TSession {
  if (!session) {
    throw new AuthRequiredError()
  }
}

export class AuthRequiredError extends Error {
  code = 'AUTH_REQUIRED' as const
  status = 401
  constructor() {
    super('Authentication required')
    this.name = 'AuthRequiredError'
  }
}
```

O handler usa assim:
```typescript
export const GET = defineRoute({
  handler: ({ ctx }) => {
    requireAuth(ctx.user) // throws 401 if null
    // ctx.user is now typed as TSession (type narrowing via asserts)
    return { userId: ctx.user.userId }
  }
})
```

E `executeRoute` precisa catch `AuthRequiredError` e retornar 401 JSON.

---

## 6. Impacto

| Item | Mudança |
|------|---------|
| Arquivos novos | 3 (`session.ts`, `crypto.ts`, `auth.ts`) |
| Arquivos modificados | 2 (`server/index.ts` exports, `execute.ts` error handling) |
| Testes novos | ~15 (crypto, session, requireAuth, integration) |
| Deps novas | Zero (Web Crypto built-in) |
| Breaking changes | Zero |

---

## 7. Benchmark

| Dimensão | Theo (proposto) | Remix | Hono | Better Auth |
|----------|-----------------|-------|------|-------------|
| Session storage | Encrypted cookie | Signed cookie | BYOA | DB + cookie cache |
| Dependencies | Zero | Zero (built-in) | None built-in | Heavy |
| Type-safe session | ✅ Generic | ✅ Session type | ✅ Variables | ✅ |
| requireAuth guard | ✅ asserts function | ❌ Manual | ✅ Middleware | ✅ Middleware |
| Login/logout | User responsibility | User responsibility | User responsibility | Built-in |
| Encryption | AES-256-GCM | Signed only | N/A | iron/JWE |
| Stateless | ✅ | ✅ | Depends | Optional |

---

## Sources

- [Better Auth Session Management](https://better-auth.com/docs/concepts/session-management)
- [iron-session GitHub](https://github.com/vvo/iron-session)
- [Lucia Auth v3 — Hono Guide](https://v3.lucia-auth.com/guides/validate-session-cookies/hono)
- [Remix Sessions](https://remix.run/docs/en/main/utils/sessions)
- [Hono JWT Middleware](https://hono.dev/docs/middleware/builtin/jwt)
- [Hono Cookie Helper](https://hono.dev/docs/helpers/cookie)
- [WorkOS Node.js Auth Guide 2026](https://workos.com/blog/nodejs-authentication-guide-2026)
- [Cookie-based Auth in Remix](https://tigerabrodi.blog/cookie-based-authentication-in-remix)
