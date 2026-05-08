# Server Actions — Improvement Roadmap

**Research date:** 2026-05-08
**Researcher:** Claude (SOTA Research Skill)
**Current SOTA score:** 1/5
**Target SOTA score:** 2/5 (após Onda 0, 4/5 após Onda 4)
**Gaps filled this session:** 0 of 8 (pesquisa inicial)

## Executive Summary

Server Actions do Theo usam `defineAction()` explícito — não `'use server'` magic. Isso é uma decisão arquitetural deliberada: explícito > implícito, seguindo o princípio "no magic" do framework. O contrato é: Zod input → typed output, com CSRF built-in e garantia de que handler code nunca vaza para o client bundle.

## Reference Evolution

| Reference | Status | Update |
|-----------|--------|--------|
| Next.js action-handler.ts | NEW | Execution pipeline, CSRF origin check, body size limit (1MB default) |
| Next.js server_actions.rs | NEW | SHA1 action ID generation com arg metadata bits |
| Next.js server-reference-proxy-loader.ts | NEW | Client proxy: `createServerReference(id, callServer)` |
| Next.js csrf-protection.ts | NEW | Origin matching, wildcard subdomains |
| SvelteKit form actions | NEW | `+page.server.ts`, progressive enhancement, `ActionData` typing |
| tRPC mutations | NEW | `useMutation`, Zod input, typed output, optimistic updates |

## Competitive Position

| Dimensão | Theo (target) | Next.js | SvelteKit | tRPC | Best-in-class |
|----------|---------------|---------|-----------|------|---------------|
| Explicitness | 5/5 | 2/5 | 4/5 | 5/5 | Theo/tRPC |
| Type safety | 5/5 | 3/5 | 4/5 | 5/5 | tRPC |
| CSRF protection | 4/5 | 4/5 | 4/5 | 2/5 | Next.js/SvelteKit |
| Progressive enhancement | 3/5 | 4/5 | 5/5 | 1/5 | SvelteKit |
| Bundle safety | 5/5 | 5/5 | 5/5 | 5/5 | All |
| Input validation | 5/5 | 1/5 | 2/5 | 5/5 | Theo/tRPC |

## Decisões Arquiteturais para Onda 0

### D1: `defineAction()` explícito, sem `'use server'`

```typescript
// server/actions/create-user.ts
import { defineAction } from 'theo/server'
import { z } from 'zod'

export const createUser = defineAction({
  input: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  handler: async ({ input, ctx }) => {
    // input é tipado: { name: string; email: string }
    return { id: 'user_1', ...input }
    // output é inferido
  },
})
```

**Por que não `'use server'`:**
- `'use server'` é uma diretiva de compilador — requer transform complexo no bundler
- `defineAction()` é uma função TypeScript normal — funciona com qualquer bundler
- Explícito > implícito: dev sabe exatamente o que é uma action
- Validation é obrigatória, não opt-in

### D2: Wire protocol simples (Onda 4)

```
POST /api/__actions/create-user
Content-Type: application/json
X-CSRF-Token: <token>

{ "name": "Paulo", "email": "paulo@example.com" }

→ 200 OK
{ "id": "user_1", "name": "Paulo", "email": "paulo@example.com" }
```

**Decisão:** REST endpoint por action (não multiplexed como Next.js Flight). Razões:
- Debuggável com curl/Postman
- Cacheable se necessário
- Compatível com qualquer client HTTP
- OpenAPI-friendly

### D3: Contrato na Onda 0

```typescript
// packages/theo/src/server/define-action.ts
import { z } from 'zod'

interface ActionConfig<
  TInput extends z.ZodType,
> {
  input: TInput
  handler: (ctx: {
    input: z.infer<TInput>
    ctx: any // expandido na Onda 5
  }) => unknown | Promise<unknown>
}

export function defineAction<TInput extends z.ZodType>(
  config: ActionConfig<TInput>
) {
  return config // identity + type inference na Onda 0
}
```

## Quick Wins (1-2 sessões cada)

1. **Criar tipo `ActionConfig`** — generics Zod para input → `packages/theo/src/server/types.ts`
2. **Criar `defineAction()` function** — identity function → `packages/theo/src/server/define-action.ts`
3. **Criar type test** — input inference funciona → `tests/type/define-action.test-d.ts`
4. **Criar fixture** — action mínima → `fixtures/basic-valid-app/server/actions/create-user.ts`

## Anti-Patterns to Eliminate

1. **`'use server'` como magic** — Theo usa `defineAction()` explícito, nunca diretivas
2. **Action sem validation** — `input` é obrigatório, não optional
3. **Handler code no client** — build deve garantir tree-shaking completo

## Sources

- [Next.js action-handler.ts](referencias/next.js/packages/next/src/server/app-render/action-handler.ts)
- [Next.js server_actions.rs](referencias/next.js/crates/next-custom-transforms/src/transforms/server_actions.rs)
- [Next.js csrf-protection.ts](referencias/next.js/packages/next/src/server/app-render/csrf-protection.ts)
- [SvelteKit Form Actions](https://svelte.dev/docs/kit/form-actions)
- [tRPC](https://trpc.io/) — mutation pattern
