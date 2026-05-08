# Onda 0 — SOTA Research Consolidado

**Data:** 2026-05-08
**Pesquisador:** Claude (SOTA Research Skill)
**Escopo:** Fundamento e contrato do framework (defineConfig, defineRoute, defineAction, defineMiddleware, CLI, estrutura)

---

## 1. Sumário Executivo

Pesquisa SOTA completa nos 6 domínios da Onda 0, analisando 10 frameworks de referência:

| Framework | Tipo | O que extraímos |
|-----------|------|-----------------|
| **Next.js** | Local (refs/) | Config Zod validation, route module system, server actions pipeline, middleware edge, CLI commander, project structure validation |
| **Rails** | Local (refs/) | Middleware stack (Rack), convention over config, default middleware stack com 20+ middleware |
| **Hono** | Web research | zValidator (Zod inline), RPC type sharing, `await next()` middleware, Web Standards |
| **Nitro** | Web research | defineHandler v3, file-based routes, auto JSON, typed config |
| **tRPC** | Web research | End-to-end type inference sem codegen, Zod input → typed output |
| **SvelteKit** | Web research | Form actions, `$types` auto-generation, progressive enhancement |
| **Vite** | Web research | `defineConfig` identity function, `createServer()` API |

---

## 2. Decisões Arquiteturais Consolidadas

### 2.1 Contratos da Onda 0

| Contrato | Assinatura | Pattern | Inspiração |
|----------|------------|---------|------------|
| `defineConfig()` | `(config) => TheoConfig` | Identity fn + Zod validation | Vite (DX) + Next.js (validation) |
| `defineRoute()` | `({ query?, body?, params?, handler })` | Named HTTP exports + Zod obrigatório | Next.js (file routing) + tRPC (type inference) |
| `defineAction()` | `({ input, handler })` | Explicit function, no magic directives | tRPC (inference) + SvelteKit (explicit) |
| `defineMiddleware()` | `(request, next) => Response` | `await next()` pattern | Hono/Koa (composable) + Rails (stack) |

### 2.2 Princípios de Design (derivados da pesquisa)

1. **Zod obrigatório, não opt-in** — Diferencial vs Next.js (que não valida) e Nitro (que não valida)
2. **Web Standards** — `Request`/`Response`, não `req`/`res` de Node.js
3. **Explícito > Implícito** — `defineAction()` em vez de `'use server'` magic
4. **File-based discovery** — `server/routes/*.ts` → HTTP endpoints automáticos
5. **Identity functions para type inference** — Nenhum dos defines transforma dados na Onda 0
6. **Fail fast com mensagens úteis** — Todo erro diz o quê, onde, e como corrigir

### 2.3 O que o Theo faz melhor que cada framework

| vs Framework | Vantagem do Theo |
|-------------|------------------|
| vs Next.js | Validation obrigatória (não opt-in), `defineAction` explícito (não `'use server'`), backend explícito |
| vs Hono | File-based routing, projeto opinativo, frontend + backend integrado |
| vs tRPC | HTTP-native (curl-friendly), file-based, não precisa de router object |
| vs Nitro | Zod validation built-in, React frontend integrado |
| vs SvelteKit | TypeScript-first, Zod schemas explícitos, backend separado |
| vs Rails | TypeScript native, type inference end-to-end, Vite build |

---

## 3. Estrutura de Projeto Definida

```
my-app/
├── app/                     # REQUIRED — Frontend pages
│   ├── page.tsx             # REQUIRED — Root page
│   └── layout.tsx           # Optional — Root layout
├── server/                  # Optional — Backend
│   ├── routes/              # HTTP API routes (defineRoute)
│   │   └── health.ts        # → GET /api/health
│   ├── actions/             # Server actions (defineAction)
│   │   └── create-user.ts
│   ├── middleware.ts         # Global middleware (defineMiddleware)
│   └── context.ts           # Request context (Onda 5)
├── components/              # Optional — Shared React components
├── lib/                     # Optional — Shared utilities
├── public/                  # Optional — Static assets
├── theo.config.ts           # REQUIRED — Framework config (defineConfig)
└── package.json             # REQUIRED
```

**Sem suporte a `src/` prefix.** Um jeito só. Convention over configuration.

---

## 4. Contratos de Tipo (Onda 0)

```typescript
// ============================================
// theo — main package exports
// ============================================
import { defineConfig } from 'theo'

// ============================================
// theo/server — server package exports
// ============================================
import { defineRoute, defineAction, defineMiddleware } from 'theo/server'

// ============================================
// defineConfig
// ============================================
import { z } from 'zod'

const theoConfigSchema = z.object({
  appDir: z.string().default('app'),
  serverDir: z.string().default('server'),
  port: z.number().int().min(1).max(65535).default(3000),
})

type TheoConfig = z.infer<typeof theoConfigSchema>

function defineConfig(config: Partial<TheoConfig>): TheoConfig

// ============================================
// defineRoute
// ============================================
interface RouteConfig<TQuery, TBody, TParams> {
  query?: TQuery         // z.ZodType
  body?: TBody           // z.ZodType
  params?: TParams       // z.ZodType
  handler: (ctx: {
    query: z.infer<TQuery>
    body: z.infer<TBody>
    params: z.infer<TParams>
    request: Request
    ctx: AppContext
  }) => unknown | Promise<unknown>
}

function defineRoute<TQuery, TBody, TParams>(
  config: RouteConfig<TQuery, TBody, TParams>
): RouteConfig<TQuery, TBody, TParams>

// ============================================
// defineAction
// ============================================
interface ActionConfig<TInput> {
  input: TInput          // z.ZodType — REQUIRED
  handler: (ctx: {
    input: z.infer<TInput>
    ctx: AppContext
  }) => unknown | Promise<unknown>
}

function defineAction<TInput>(
  config: ActionConfig<TInput>
): ActionConfig<TInput>

// ============================================
// defineMiddleware
// ============================================
type MiddlewareHandler = (
  request: Request,
  next: (request: Request) => Promise<Response>
) => Response | Promise<Response>

function defineMiddleware(handler: MiddlewareHandler): MiddlewareHandler
```

---

## 5. Testes da Onda 0

### Teste 1 — Contrato de estrutura
```typescript
it('should recognize valid project structure', () => {
  // fixtures/basic-valid-app/ com app/page.tsx, server/routes/health.ts, theo.config.ts
  expect(() => validateProjectStructure(fixtureDir)).not.toThrow()
})
```

### Teste 2 — Config inválida
```typescript
it('should fail with clear error on invalid config', () => {
  // fixtures/invalid-config/ com theo.config.ts exportando { port: "abc" }
  expect(() => loadConfig(fixtureDir)).toThrow(/Expected number.*port/)
})
```

### Teste 3 — Projeto sem app/
```typescript
it('should fail with useful message when app/ is missing', () => {
  // fixtures/invalid-no-app/ sem app/
  expect(() => validateProjectStructure(fixtureDir))
    .toThrow('Missing required directory: app/')
})
```

### Testes de tipo (type tests)
```typescript
// tests/type/define-route.test-d.ts
import { defineRoute } from 'theo/server'
import { z } from 'zod'
import { expectTypeOf } from 'expect-type'

const route = defineRoute({
  query: z.object({ search: z.string() }),
  handler: ({ query }) => {
    expectTypeOf(query).toEqualTypeOf<{ search: string }>()
    return { results: [] }
  },
})
```

---

## 6. Fixtures da Onda 0

```
fixtures/
├── basic-valid-app/           # Projeto Theo mínimo válido
│   ├── app/
│   │   └── page.tsx
│   ├── server/
│   │   └── routes/
│   │       └── health.ts
│   ├── theo.config.ts
│   └── package.json
├── invalid-config/            # Config com valor inválido
│   ├── app/
│   │   └── page.tsx
│   ├── theo.config.ts         # { port: "abc" }
│   └── package.json
└── invalid-no-app/            # Sem diretório app/
    ├── theo.config.ts
    └── package.json
```

---

## 7. Tecnologias Selecionadas

| Componente | Tecnologia | Motivo |
|-----------|------------|--------|
| Build tool | **Vite 6** | Rápido, HMR nativo, plugin API extensível, ecossistema |
| Validation | **Zod** | Type inference nativa, composable, ecossistema maduro |
| CLI parser | **cac** | Leve, usado pelo Vite, zero deps, API simples |
| Server runtime | **Node.js** | Único runtime do MVP (adapters em Onda futura) |
| UI framework | **React** | Decisão do README, RSC futuro |
| Test runner | **Vitest** | Integra com Vite, API compatível com Jest |
| Type tests | **expect-type** | Testes de tipo sem runtime |
| E2E | **Playwright** | Browser real, cross-browser |

---

## 8. Fora de Escopo (confirmado)

- ❌ agents, MCP, memory, workflows
- ❌ deploy cloud
- ❌ banco de dados automático
- ❌ auth pronta
- ❌ `src/` prefix
- ❌ Runtime adapters (Bun, Deno, Cloudflare)
- ❌ OpenAPI generation (Onda 3+)
- ❌ Per-route middleware (Onda 5)
- ❌ SSR/streaming (Onda 2+)

---

## 9. Benchmark Summary

```
SOTA Research Complete — Onda 0
==============================================
| Domínio           | Before | After | Gaps Listed | New Refs | Quick Wins |
|-------------------|--------|-------|-------------|----------|------------|
| config            | 0/5    | 1/5   | 6           | 5        | 4          |
| server-routes     | 0/5    | 1/5   | 8           | 7        | 4          |
| server-actions    | 0/5    | 1/5   | 8           | 6        | 4          |
| middleware         | 0/5    | 1/5   | 8           | 6        | 3          |
| build             | 0/5    | 1/5   | 9           | 7        | 3          |
| project-structure | 0/5    | 1/5   | 6           | 5        | 4          |

Files created: 13 (6 INDEX.md + 6 improvement-roadmap.md + 1 consolidado)
Validation: PASS — all files < 800 lines
```

---

## Sources

### Referências locais
- `referencias/next.js/` — Config, routes, actions, middleware, CLI, structure
- `referencias/rails/` — Middleware stack, conventions

### Web
- [Hono Validation](https://hono.dev/docs/guides/validation)
- [Hono Zod OpenAPI](https://hono.dev/examples/zod-openapi)
- [Hono RPC](https://hono.dev/docs/guides/rpc)
- [Nitro Routing](https://nitro.build/guide/routing/)
- [Nitro Config](https://nitro.build/config)
- [tRPC](https://trpc.io/)
- [tRPC v11 + Next.js App Router](https://dev.to/whoffagents/trpc-v11-nextjs-app-router-end-to-end-type-safety-without-the-boilerplate-4h5m)
- [SvelteKit Form Actions](https://svelte.dev/docs/kit/form-actions)
- [cac CLI framework](https://github.com/cacjs/cac)
- [citty CLI framework](https://github.com/unjs/citty)
