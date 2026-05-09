# Onda 7 — SOTA Research Consolidado

**Data:** 2026-05-09
**Pesquisador:** Claude (SOTA Research Skill)
**Escopo:** Type Safety end-to-end — inferência de tipos para routes, actions, params, query, body

---

## 1. Sumário Executivo

A Onda 7 é **verificação e hardening** — não implementação nova. O Theo já tem type inference funcional (Zod generics em defineRoute/defineAction). O que falta: (1) type tests mais rigorosos cobrindo os 5 testes obrigatórios, (2) audit que APIs públicas não expõem `any`, (3) handler return type inference. A implementação é 100% testes — zero código de produção novo.

---

## 2. Estado Atual

### O que já funciona (verificado via type tests existentes):
- ✅ `defineRoute({ query: z.object({...}), handler })` — query type inferred
- ✅ `defineRoute({ body: z.object({...}), handler })` — body type inferred
- ✅ `defineRoute({ params: z.object({...}), handler })` — params type inferred
- ✅ `defineAction({ input: z.object({...}), handler })` — input type inferred
- ✅ `defineAction` sem `input` → compile error (`@ts-expect-error` test)
- ✅ `defineConfig({ port: 'abc' })` → compile error
- ✅ Zero `any` em production code (`packages/theo/src/`)

### O que falta (5 testes obrigatórios da Onda 7):

| Teste | Status | O que falta |
|-------|--------|-------------|
| 1. Input inválido falha em compile-time | PARTIAL | Route body com tipo errado não testado |
| 2. Output inferido corretamente | ❌ | Handler return type não é testado |
| 3. Params inferidos | ✅ | Já testado |
| 4. Query inferida via Zod | ✅ | Já testado |
| 5. Nenhum `any` público | ❌ | Falta test automatizado que grep por `any` em exports |

### Gaps específicos:

1. **Handler return type não é inferido** — `handler` retorna `unknown | Promise<unknown>`. O tipo de retorno não flui para o consumer. Isso é por design (identity function), mas precisamos testar que pelo menos o Zod schema garante type safety no input.

2. **`ctx` é `unknown`** — Handlers recebem `ctx: unknown` (Onda 5). Não é type-safe. Para Onda 7, documentar como risco aceito e adicionar type test mostrando que user pode fazer type assertion.

3. **Route handler `ctx` param não está na interface** — `RouteConfig.handler` aceita `{ query, body, params, request }` mas na Onda 5 passamos `ctx` também. O tipo não reflete isso. Precisa atualizar.

---

## 3. Plano de Ação

A Onda 7 é **testes + minor type fixes**:

### Fix 1: Adicionar `ctx` à interface RouteConfig.handler
```typescript
handler: (ctx: {
  query: z.infer<TQuery>
  body: z.infer<TBody>
  params: z.infer<TParams>
  request: Request
  ctx: unknown  // ADD THIS
}) => unknown | Promise<unknown>
```

### Fix 2: Adicionar `ctx` à interface ActionConfig.handler
```typescript
handler: (ctx: { input: z.infer<TInput>; ctx: unknown }) => unknown | Promise<unknown>
```

### Type Tests a adicionar:

1. **Route: wrong body type → compile error**
   ```typescript
   defineRoute({
     body: z.object({ name: z.string() }),
     handler: ({ body }) => {
       // @ts-expect-error — body.name is string, not number
       const x: number = body.name
     },
   })
   ```

2. **Action: wrong input type → compile error**
   ```typescript
   defineAction({
     input: z.object({ email: z.string() }),
     handler: ({ input }) => {
       // @ts-expect-error — input.email is string, not number
       const x: number = input.email
     },
   })
   ```

3. **No `any` in public API audit**
   ```bash
   # Script test: grep for 'any' in type positions of public exports
   grep -rn ': any' packages/theo/src/index.ts packages/theo/src/server/index.ts
   ```

4. **ctx is available in handler type**
   ```typescript
   defineRoute({
     handler: ({ ctx }) => {
       expectTypeOf(ctx).toBeUnknown()
     },
   })
   ```

---

## 4. Fora de Escopo

- ❌ Typed client (callAction com inferência) — futuro
- ❌ Output type inference (handler return → consumer) — futuro (requer codegen ou typed client)
- ❌ Typed ctx (generics para context) — futuro
- ❌ OpenAPI type generation — futuro
