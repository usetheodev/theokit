# Onda 4 — SOTA Research Consolidado

**Data:** 2026-05-08
**Pesquisador:** Claude (SOTA Research Skill)
**Escopo:** Server Actions — defineAction runtime, CSRF, bundle boundary, wire protocol

---

## 1. Sumário Executivo

Onda 4 transforma `defineAction()` de identity function em runtime handler executável. Decisão-chave: **Actions são REST endpoints sob `/api/__actions/`** — mesmo pattern de routes (Onda 3), mesma infra de body parsing/Zod validation/error handling. Diferença: input é obrigatório, CSRF via origin checking, e actions são descobertas em `server/actions/`. O frontend chama actions via `fetch()` com header custom (evita simple request CSRF).

---

## 2. Decisões Arquiteturais

### D1: Actions como REST endpoints (`/api/__actions/{name}`)

**Decisão:** Cada action file `server/actions/create-user.ts` exporta named functions. Cada export vira endpoint `POST /api/__actions/create-user/{exportName}`.

**Justificativa:** Reutiliza TODA a infra da Onda 3 (body parsing, Zod validation, error handling, `ssrLoadModule`). Sem proxy magic, sem compiler transforms, sem `'use server'`. Explícito > implícito.

**Exemplo:**
```
server/actions/create-user.ts
  export const createUser = defineAction({...})
  
→ POST /api/__actions/create-user/createUser
  Body: { "name": "Paulo", "email": "paulo@test.com" }
  Response: { "id": "user_1", "name": "Paulo", ... }
```

### D2: CSRF via origin checking + custom header

**Decisão:** Actions exigem:
1. `Origin` header matching `Host` (como Next.js)
2. Header custom `X-Theo-Action: 1` (previne simple request CSRF)

**Justificativa:** Double defense. Origin matching bloqueia cross-site. Custom header garante que requests não são "simple" (browser não envia custom headers sem CORS preflight).

**Implementação:**
```typescript
function validateCsrf(req: IncomingMessage): boolean {
  // 1. Custom header must be present
  if (req.headers['x-theo-action'] !== '1') return false
  
  // 2. Origin must match host
  const origin = req.headers['origin']
  const host = req.headers['host']
  if (!origin) return true // same-origin (browser doesn't send Origin)
  const originHost = new URL(origin).host
  return originHost === host
}
```

### D3: Action discovery em `server/actions/`

**Decisão:** Scan `server/actions/` recursivamente. Cada `.ts` file é um módulo de actions. Cada named export que é `ActionConfig` (tem `.input` e `.handler`) é uma action.

```
server/actions/
├── create-user.ts   → exports: { createUser }
├── auth.ts          → exports: { login, logout }
└── posts/
    └── manage.ts    → exports: { createPost, deletePost }
```

**URLs:**
```
POST /api/__actions/create-user/createUser
POST /api/__actions/auth/login
POST /api/__actions/auth/logout
POST /api/__actions/posts/manage/createPost
```

### D4: Bundle boundary — actions são server-only

**Decisão:** O Vite plugin NÃO gera client code para actions. O frontend chama via `fetch()` diretamente. Nenhum import de `server/actions/` chega ao client bundle.

**Justificativa:** Sem compiler transform, sem proxy generation. O dev escreve `fetch('/api/__actions/create-user/createUser', { body, headers })` ou usa um helper `callAction()`.

**Helper opcional (futuro):**
```typescript
// theo/client (futuro — typed client)
const result = await callAction('create-user', 'createUser', { name: 'Paulo' })
```

Na Onda 4, apenas o endpoint REST funciona. Typed client vem depois.

### D5: Zod input obrigatório

**Decisão:** `input` é campo obrigatório em `defineAction`. Actions sem input não fazem sentido (não há mutations sem dados).

### D6: Error format idêntico ao de routes

**Decisão:** `{ error: { code: 'VALIDATION_ERROR', message, issues } }`. Mesmos codes da Onda 3.

---

## 3. Arquitetura

### Request Flow

```
Client fetch() → POST /api/__actions/create-user/createUser
                     │
                     ├── CSRF check (origin + X-Theo-Action header)
                     │   FAIL → 403 Forbidden
                     │   OK ↓
                     │
                     ├── Load module via ssrLoadModule
                     │
                     ├── Find exported action by name
                     │   NOT FOUND → 404
                     │   OK ↓
                     │
                     ├── Parse JSON body
                     │
                     ├── Validate input with Zod safeParse
                     │   FAIL → 400 VALIDATION_ERROR
                     │   OK ↓
                     │
                     ├── Execute handler({ input })
                     │
                     └── Serialize response as JSON 200
```

### Componentes a Construir

| Componente | Arquivo | Responsabilidade |
|-----------|---------|-----------------|
| Action Scanner | `packages/theo/src/server/action-scan.ts` (NEW) | Scan `server/actions/` → action file list |
| Action Executor | `packages/theo/src/server/action-execute.ts` (NEW) | CSRF check, load module, validate input, call handler |
| Action Middleware | `packages/theo/src/vite-plugin/action-middleware.ts` (NEW) | Connect middleware para `/api/__actions/` |
| defineAction (evolve) | `packages/theo/src/server/define-action.ts` (EDIT) | Sem mudança na Onda 4 (identity function, runtime usa em execute) |

### Reutilização da Onda 3

| Da Onda 3 | Usado na Onda 4 |
|-----------|----------------|
| `parseBody()` | Parse JSON body das actions |
| `sendJson()` | Serialize response |
| `sendError()` | Error responses (400, 403, 404, 405, 500) |
| `ssrLoadModule` | Load action modules |
| API middleware pattern | Same `configureServer` approach |

---

## 4. Testes da Onda 4

### Teste 1 — Action com input válido
```typescript
it('POST /api/__actions/create-user/createUser with valid input returns output', async () => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Theo-Action': '1' },
    body: JSON.stringify({ name: 'Paulo', email: 'paulo@test.com' }),
  })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ id: 'user_1', name: 'Paulo', email: 'paulo@test.com' })
})
```

### Teste 2 — Input inválido
```typescript
it('returns 400 VALIDATION_ERROR for invalid input', async () => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Theo-Action': '1' },
    body: JSON.stringify({ name: '', email: 'bad' }),
  })
  expect(res.status).toBe(400)
  const data = await res.json()
  expect(data.error.code).toBe('VALIDATION_ERROR')
})
```

### Teste 3 — CSRF: sem header X-Theo-Action
```typescript
it('returns 403 without X-Theo-Action header', async () => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Paulo', email: 'paulo@test.com' }),
  })
  expect(res.status).toBe(403)
})
```

### Teste 4 — Action não encontrada
```typescript
it('returns 404 for nonexistent action', async () => {
  const res = await fetch('/api/__actions/nonexistent/foo', {
    method: 'POST',
    headers: { 'X-Theo-Action': '1' },
  })
  expect(res.status).toBe(404)
})
```

### Teste 5 — Apenas POST aceito
```typescript
it('returns 405 for GET on action endpoint', async () => {
  const res = await fetch(url, { headers: { 'X-Theo-Action': '1' } })
  expect(res.status).toBe(405)
})
```

---

## 5. Fixtures

```
fixtures/server-actions-basic/
├── server/
│   └── actions/
│       └── create-user.ts    # defineAction com input Zod
├── app/
│   └── page.tsx              # Minimal
├── index.html
├── theo.config.ts
└── package.json
```

---

## 6. Fora de Escopo (Onda 4)

- ❌ Typed client (`callAction()` com inferência) — futuro
- ❌ Progressive enhancement (form actions sem JS) — futuro
- ❌ CSRF token-based (origin checking + custom header é suficiente)
- ❌ Client proxy generation — futuro
- ❌ Streaming responses de actions — futuro
- ❌ Bundle boundary verification via build — Onda 6

---

## 7. Competitive Position

| Dimensão | Theo (target) | Next.js | SvelteKit | tRPC | Best |
|----------|---------------|---------|-----------|------|------|
| Explicitness | 5/5 | 2/5 | 4/5 | 5/5 | Theo/tRPC |
| Type safety | 5/5 | 3/5 | 4/5 | 5/5 | tRPC |
| CSRF | 4/5 | 4/5 | 4/5 | 2/5 | Next.js/SvelteKit |
| Input validation | 5/5 | 1/5 | 2/5 | 5/5 | Theo/tRPC |
| No magic | 5/5 | 1/5 | 3/5 | 4/5 | Theo |
| Bundle safety | 4/5 | 5/5 | 5/5 | 5/5 | Next.js/SvelteKit |

---

## Sources

- [Next.js csrf-protection.ts](referencias/next.js/packages/next/src/server/app-render/csrf-protection.ts)
- [Next.js action-handler.ts](referencias/next.js/packages/next/src/server/app-render/action-handler.ts)
- [Next.js server-action-request-meta.ts](referencias/next.js/packages/next/src/server/lib/server-action-request-meta.ts)
- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [MDN CSRF Prevention](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CSRF_prevention)
