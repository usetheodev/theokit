# Onda 15 — SOTA Research: Database Integration

**Data:** 2026-05-09
**Pesquisador:** Claude (SOTA Research Skill)
**Escopo:** Integração com banco de dados — connection helpers, migrations, context integration.

---

## 1. Análise Honesta: O Que o Framework Deve Fazer?

### O que frameworks fazem (benchmark)

| Framework | DB Integration | Level |
|-----------|---------------|-------|
| **Next.js** | NENHUMA built-in. User escolhe ORM. | Nenhum |
| **Remix** | NENHUMA built-in. User escolhe ORM. | Nenhum |
| **Hono** | NENHUMA built-in. User escolhe ORM. | Nenhum |
| **Rails** | ActiveRecord built-in, opinativo. | Total |
| **Laravel** | Eloquent built-in, opinativo. | Total |
| **Astro** | NENHUMA built-in. | Nenhum |
| **SvelteKit** | NENHUMA built-in. | Nenhum |

### Padrão claro

Frameworks fullstack de JavaScript/TypeScript **NÃO integram DB no core**. Rails e Laravel fazem (são monolitos opinativos). O Theo é opinativo como Rails, mas no ecossistema TypeScript onde ORMs são libs separadas.

### Decisão Pragmática: Guias, Não Código

O Theo NÃO deve:
- Criar um ORM próprio (reinventar a roda — Drizzle já é excelente)
- Embedar Drizzle como dependency (lock-in, peso desnecessário)
- Criar abstração sobre ORMs (leaky abstraction, YAGNI)

O Theo DEVE:
1. **Documentar o pattern** de como usar Drizzle com o Theo
2. **Criar template `postgres`** com Drizzle pré-configurado
3. **Garantir que DATABASE_URL não vaza** para client (já feito — envPrefix `THEO_PUBLIC_*`)
4. **Prover `createDatabaseContext()` helper** mínimo para wiring no context

---

## 2. O Que Realmente Precisa Ser Implementado

### A. Template `postgres` para create-theo

```
packages/create-theo/templates/postgres/
├── app/
│   ├── page.tsx
│   └── layout.tsx
├── server/
│   ├── routes/
│   │   ├── health.ts
│   │   └── users.ts          # CRUD com Drizzle
│   ├── context.ts             # ctx.db wiring
│   └── middleware.ts
├── db/
│   ├── schema.ts              # Drizzle schema
│   ├── index.ts               # Connection + export db
│   └── migrate.ts             # Migration runner
├── drizzle.config.ts
├── theo.config.ts
├── package.json.tmpl          # Com drizzle-orm, postgres deps
├── .env.example               # DATABASE_URL example
└── _gitignore
```

### B. Helper `createDrizzleContext()` (Optional, ~10 linhas)

NÃO no core do framework. No template, como pattern de referência:

```typescript
// server/context.ts (no template postgres)
import { db } from '../db/index.ts'
import { createSessionManager } from 'theo/server'

const auth = createSessionManager<{ userId: string }>({
  secret: process.env.SESSION_SECRET!,
})

export async function createContext({ request, response }) {
  return {
    db,                           // Drizzle instance
    user: await auth.getSession(request),
    auth,
    response,
  }
}
```

### C. CLI command `theo db:push` e `theo db:migrate` (Shortcut para drizzle-kit)

São apenas aliases para `drizzle-kit push` e `drizzle-kit migrate`. Úteis para DX mas não essenciais. **Podem ser adicionados depois** — o user pode usar `npx drizzle-kit push` diretamente.

**Decisão: NÃO adicionar CLI commands para DB na Onda 15.** O template documenta os comandos drizzle-kit. CLI shortcuts são escopo futuro.

---

## 3. Drizzle ORM: Por Que Essa Escolha

| Critério | Drizzle | Prisma |
|----------|---------|--------|
| Bundle size | ~7.4 KB | ~1.6 MB |
| Code generation step | Nenhum | Obrigatório (`prisma generate`) |
| Type inference | Nativa do TypeScript | Gerada de PSL |
| SQL control | Total | Abstracted |
| Edge/serverless | Nativo | Melhorou em v7, mas maior |
| Filosofia | "If you know SQL, you know Drizzle" | Schema-first abstraction |
| Licensing | Apache 2.0 | Apache 2.0 |

**Drizzle é a escolha natural para o Theo** porque ambos compartilham a mesma filosofia: TypeScript-native, zero codegen, close-to-the-metal, type inference.

### Mas o Theo NÃO força Drizzle

O template `postgres` usa Drizzle. Mas o user pode trocar por Prisma, Kysely, ou SQL raw. O framework não tem nenhuma opinião sobre ORM no core — a opinião está no template.

---

## 4. O Que o Template `postgres` Inclui

### Schema (db/schema.ts)

```typescript
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

### Connection (db/index.ts)

```typescript
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

const client = postgres(process.env.DATABASE_URL!)
export const db = drizzle(client, { schema })
```

### Route with DB (server/routes/users.ts)

```typescript
import { defineRoute } from 'theo/server'
import { z } from 'zod'
import { users } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

export const GET = defineRoute({
  handler: async ({ ctx }) => {
    const allUsers = await ctx.db.select().from(users)
    return { users: allUsers }
  }
})

export const POST = defineRoute({
  body: z.object({ name: z.string(), email: z.string().email() }),
  status: 201,
  handler: async ({ body, ctx }) => {
    const [user] = await ctx.db.insert(users).values(body).returning()
    return user
  }
})
```

### Package.json dependencies

```json
{
  "dependencies": {
    "theo": "workspace:*",
    "drizzle-orm": "^0.45.0",
    "postgres": "^3.4.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31.0"
  }
}
```

---

## 5. O Que NÃO Fazer

| Tentação | Por que NÃO |
|----------|-----------|
| Adicionar `drizzle-orm` como dep do `theo` | Lock-in. User pode não usar Drizzle. |
| Criar `theo db:push` CLI command | YAGNI. `npx drizzle-kit push` funciona. |
| Criar abstração sobre ORMs | Leaky abstraction. Cada ORM tem API diferente. |
| Adicionar migration runner no framework | Responsabilidade do ORM, não do framework. |
| Criar `defineModel()` ou `defineSchema()` | Reinventa Drizzle. Sem valor adicional. |

---

## 6. Impacto Real

| Item | Mudança |
|------|---------|
| Arquivos novos no template | ~10 (db/, server/routes/users.ts, drizzle.config.ts, .env.example) |
| Arquivos modificados no core | 0 — ZERO mudança no core |
| Testes novos | ~5 (template scaffold, env var protection, structure validation) |
| Deps novas no theo package | 0 |
| Breaking changes | 0 |

### A Onda 15 é PRINCIPALMENTE um template, não uma feature do core.

O framework já tem tudo que precisa:
- ✅ `ctx` extensível (Onda 11) — user coloca `db` no context
- ✅ `THEO_PUBLIC_*` env prefix (Onda 12) — `DATABASE_URL` não vaza
- ✅ `createSessionManager` (Onda 14) — auth + DB juntos no context
- ✅ `defineRoute` com TCtx (Onda 11) — routes tipados com db

A Onda 15 entrega o **template de referência** que mostra como usar tudo isso junto.

---

## Sources

- [Drizzle ORM Official](https://orm.drizzle.team/)
- [Drizzle ORM Migrations](https://orm.drizzle.team/docs/migrations)
- [Drizzle Kit Overview](https://orm.drizzle.team/docs/kit-overview)
- [Drizzle vs Prisma 2026 (Makerkit)](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma)
- [Drizzle vs Prisma 2026 (DEV.to)](https://dev.to/pockit_tools/drizzle-orm-vs-prisma-in-2026-the-honest-comparison-nobody-is-making-3n6g)
- [Drizzle vs Prisma 2026 (Bytebase)](https://www.bytebase.com/blog/drizzle-vs-prisma/)
- [Drizzle PostgreSQL Best Practices (2025)](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717)
- [Drizzle ORM Tutorial 2026](https://tech-insider.org/drizzle-orm-tutorial-typescript-postgres-2026/)
