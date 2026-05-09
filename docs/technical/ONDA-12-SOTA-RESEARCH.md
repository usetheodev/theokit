# Onda 12 — SOTA Research: Quick Wins (Env Vars + Error Pages + Rate Limiting)

**Data:** 2026-05-09
**Pesquisador:** Claude (SOTA Research Skill)
**Escopo:** 3 quick wins agrupados numa onda: env vars seguros, error pages customizáveis, rate limiting de API.

---

## 1. Env Vars: THEO_PUBLIC_*

### Como Vite já faz (VITE_*)

O Theo roda sobre Vite, que já tem suporte nativo a env vars:

- Variáveis com prefixo `VITE_` são expostas ao client via `import.meta.env.VITE_*`
- Variáveis sem prefixo NÃO vazam para o client bundle
- `.env`, `.env.local`, `.env.[mode]`, `.env.[mode].local` são carregados automaticamente
- Em build, valores são **statically replaced** (não há acesso dinâmico)

### O que o Theo precisa fazer

**Opção A — Usar `VITE_` diretamente**: Zero trabalho. O user usa `VITE_API_URL` e funciona.

**Opção B — Criar `THEO_PUBLIC_*` como alias**: Configurar `envPrefix: 'THEO_PUBLIC_'` no Vite config. O user usa `import.meta.env.THEO_PUBLIC_API_URL`.

**Opção C — Ambos**: Aceitar tanto `VITE_` quanto `THEO_PUBLIC_*`.

### Decisão: Opção B — `THEO_PUBLIC_*`

**Justificativa:**
- Branding — `THEO_PUBLIC_` é identidade do framework, como `NEXT_PUBLIC_` é do Next.js
- Segurança — o prefixo explícito `PUBLIC` lembra o dev que o valor será exposto
- Implementação — 1 linha: `envPrefix: 'THEO_PUBLIC_'` no theoPlugin config()

**Implementação:**

```typescript
// No theoPlugin config()
config() {
  return {
    envPrefix: 'THEO_PUBLIC_',
    // ... aliases existentes
  }
}
```

**Server-side env vars**: Acessíveis via `process.env.DATABASE_URL` como sempre. Só `THEO_PUBLIC_*` vai para o client.

### Benchmark

| Framework | Prefixo | Configurável? |
|-----------|---------|---------------|
| Next.js | `NEXT_PUBLIC_` | Não |
| Vite | `VITE_` | Sim (`envPrefix`) |
| Remix | Sem prefixo (manual) | N/A |
| Astro | `PUBLIC_` | Não |
| **Theo** | `THEO_PUBLIC_` | Via envPrefix |

### Testes necessários

1. `THEO_PUBLIC_API_URL=https://api.example.com` → acessível via `import.meta.env.THEO_PUBLIC_API_URL`
2. `DATABASE_URL=postgres://...` → `import.meta.env.DATABASE_URL` é `undefined` no client
3. `VITE_LEGACY=true` → NÃO é exposto (só THEO_PUBLIC_* funciona)
4. TypeScript IntelliSense para `ImportMetaEnv`

---

## 2. Error Pages Customizáveis em Produção

### Estado atual

`start.ts:84-86` — SPA fallback retorna `index.html` com status 200 para QUALQUER rota não-API e não-estática. Não há:
- Custom 404 page para rotas inexistentes
- Custom 500 page para erros de server
- Diferenciação entre SPA route e rota inexistente

### Como Next.js faz

- `not-found.tsx` — componente React para 404
- `error.tsx` — componente React para erros runtime (client component)
- `global-error.tsx` — fallback global

### O que o Theo pode fazer (simplicidade > complexidade)

O Theo é CSR (Client-Side Rendering). Não há SSR para renderizar React no server. Então error pages customizáveis são **HTML estático** no production server, não componentes React.

**Abordagem:**

1. **Em dev**: React error boundaries já funcionam (Onda 2 — `app/error.tsx`, `app/not-found.tsx` são componentes React renderizados no client)

2. **Em produção**: O server HTTP precisa de fallback HTML para erros server-side:
   - `public/404.html` → servido com status 404 quando rota não existe
   - `public/500.html` → servido com status 500 quando server crash
   - Se não existem, usar defaults inline

**Lógica no production server:**

```typescript
// SPA fallback
if (isApiRoute) {
  // API 404 → JSON error (já funciona)
} else if (exists404Html) {
  res.writeHead(404, { 'Content-Type': 'text/html' })
  res.end(custom404Html)
} else {
  // SPA fallback — client-side router decide
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(indexHtml)
}
```

**Problema**: Em CSR, TODA rota não-API é SPA fallback (React Router decide no client). Não é possível diferenciar "/about" (rota válida) de "/xyz" (rota inválida) no server — isso é responsabilidade do client-side router.

**Decisão pragmática:**
- **API 404** → já funciona (`sendError` com JSON)
- **API 500** → já funciona (`sendError` com stack suppression)
- **SPA 404** → já funciona via `app/not-found.tsx` no client
- **Server crash (500)** → adicionar `public/500.html` como fallback HTML quando o server tem erro não-capturado
- **Custom fallback HTML** → se `public/404.html` existe, o build copia para `.theo/client/404.html`. O production server verifica se existe antes do SPA fallback.

### Testes necessários

1. API route inexistente → 404 JSON (já funciona)
2. Server error → 500 com stack suppression (já funciona)
3. `public/500.html` existe → servido com status 500 em crash
4. `public/404.html` existe → servido com status 404 em rota estática inexistente
5. Default behavior sem custom pages → SPA fallback (backward compat)

---

## 3. Rate Limiting

### Estado da Indústria

| Lib | Stars | Approach | Runtime |
|-----|-------|----------|---------|
| `express-rate-limit` | 3k+ | Fixed window, memory store | Node.js |
| `hono-rate-limiter` | 200+ | Configurable store | Multi-runtime |
| `@upstash/ratelimit` | 1.5k+ | Sliding window, Redis | Serverless |
| Custom middleware | N/A | In-memory Map | Any |

### Decisão: Rate limiter como middleware built-in

**Não adotar lib externa** — o rate limiter do Theo é simples o bastante para ser built-in (~40 linhas):

```typescript
// packages/theo/src/server/rate-limit.ts
interface RateLimitConfig {
  windowMs: number    // default: 60_000 (1 min)
  max: number         // default: 100 requests per window
  message?: string    // default: "Too many requests"
}

const store = new Map<string, { count: number; resetAt: number }>()

export function createRateLimiter(config: RateLimitConfig) {
  return (req: IncomingMessage, res: ServerResponse): boolean => {
    const key = req.socket.remoteAddress ?? 'unknown'
    const now = Date.now()
    const entry = store.get(key)
    
    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + config.windowMs })
      return false // not limited
    }
    
    entry.count++
    if (entry.count > config.max) {
      // Set rate limit headers
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000))
      res.setHeader('X-RateLimit-Limit', config.max)
      res.setHeader('X-RateLimit-Remaining', 0)
      return true // limited
    }
    
    res.setHeader('X-RateLimit-Limit', config.max)
    res.setHeader('X-RateLimit-Remaining', config.max - entry.count)
    return false
  }
}
```

**Não Reinventar a Roda?** Neste caso, construir é justificado: são ~40 linhas, sem dependência externa, fixed-window é suficiente para MVP, e o user pode usar `express-rate-limit` ou `@upstash/ratelimit` se precisar de algo mais avançado.

### Integração

O rate limiter é aplicado ANTES de middleware de API:

```typescript
// No vite-plugin api-middleware (dev)
// E no cli/commands/start.ts (prod)
if (rateLimiter(req, res)) {
  sendError(res, 'RATE_LIMITED', 'Too many requests', 429, undefined, requestId)
  return
}
```

### Configuração via theo.config.ts

```typescript
// theo.config.ts
export default defineConfig({
  rateLimit: {
    windowMs: 60_000,
    max: 100,
  }
})
```

Se `rateLimit` não é configurado, rate limiting é desabilitado (opt-in).

### Testes necessários

1. Sem config → rate limiting desabilitado
2. Com config `{ windowMs: 1000, max: 3 }` → 4° request retorna 429
3. Após window expirar → requests liberados novamente
4. Headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` presentes
5. Rate limit por IP (default key)

---

## 4. Resumo de Decisões

| # | Feature | Decisão | Esforço |
|---|---------|---------|---------|
| D1 | Env vars | `envPrefix: 'THEO_PUBLIC_'` no Vite config | 1 linha |
| D2 | Error pages | `public/404.html` e `public/500.html` opcionais, copiados no build | ~20 linhas |
| D3 | Rate limiting | Built-in middleware, in-memory Map, opt-in via config | ~50 linhas |
| D4 | Config schema | Adicionar `rateLimit` opcional ao `theoConfigSchema` | ~5 linhas |
| D5 | Server 500 | Try/catch global com fallback para `500.html` ou JSON | ~10 linhas |

---

## Sources

- [Vite Env Variables & Modes](https://vite.dev/guide/env-and-mode)
- [Next.js Error Handling](https://nextjs.org/docs/app/getting-started/error-handling)
- [Next.js not-found.js](https://nextjs.org/docs/app/api-reference/file-conventions/not-found)
- [hono-rate-limiter](https://github.com/rhinobase/hono-rate-limiter)
- [Fiberplane: Rate Limiting Hono Apps](https://fiberplane.com/blog/rate-limiting-intro/)
- [Building Custom Rate Limiter for Hono](https://schof.co/building-a-custom-rate-limiter-for-hono/)
- [Node.js Rate Limiting Guide](https://reintech.io/blog/nodejs-rate-limiting-protecting-apis-from-abuse)
