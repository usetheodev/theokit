# Cross-Validation: Theo vs Referências (Next.js + Rails)

**Data:** 2026-05-10
**Escopo:** Comparar o Theo framework (18 ondas, 523 testes) contra as implementações de referência em `referencias/`.

---

## Theo vs Next.js

| Dimensão | Theo | Next.js | Gap do Theo | Vantagem do Theo |
|----------|------|---------|-------------|------------------|
| **Routing** | File-based (page, layout, error, loading, not-found) | File-based + parallel routes (@slot), generateStaticParams, optional catch-all | Parallel routes, static params | Mais simples, menos magic |
| **API Routes** | defineRoute + Zod validation central | Web API Request/Response, sem validação built-in | Web Standards (Request/Response) | Zod validation ergonômico, type-safe |
| **Middleware** | Callback-based (req, res, next) Node.js | Edge Runtime, pattern matching, Request/Response | Edge Runtime, pattern matching | Mais simples, previsível |
| **Build** | Explicit --target (node, vercel, cloudflare) | Auto-detect platform, ISR, pre-rendering | ISR, generateStaticParams, auto-detect | Explícito e transparente |
| **Auth** | Built-in (encrypted sessions, requireAuth) | Nenhum built-in (third-party: next-auth) | Flexibilidade (qualquer provider) | Batteries-included |
| **SSR** | renderToPipeableStream + React Router static | Server Components + true streaming + PPR | RSC, PPR, component caching | Mais simples (React padrão) |
| **Deploy** | 3 adapters (Node, Vercel, CF) | .next/ + Vercel native | Mais adapters, auto-detect | Explícito e transparente |

### Gaps Críticos vs Next.js
1. **Sem React Server Components** — Next.js tem RSC como primitiva central. Theo usa React tradicional.
2. **Sem ISR/SSG** — Next.js pré-renderiza em build. Theo só faz SSR ou CSR.
3. **IncomingMessage vs Request** — Theo usa Node.js API. Next.js usa Web Standards.
4. **Sem parallel routes** — Feature de composição avançada do Next.js.

### Vantagens do Theo vs Next.js
1. **Zod validation built-in** — Next.js não tem validação central.
2. **Auth built-in** — Encrypted sessions + requireAuth vs third-party.
3. **Typed client (theoFetch)** — Type-safe API consumption sem codegen.
4. **Simplicidade** — ~1,300 LoC vs ~100,000+ do Next.js.
5. **Deploy explícito** — 3 adapters claros vs Vercel lock-in implícito.
6. **WebSocket built-in** — defineWebSocket + file-based ws routing.
7. **Rate limiting built-in** — Opt-in via config.

---

## Theo vs Rails

| Dimensão | Rails | Theo | Gap do Theo | Philosophy Match |
|----------|-------|------|-------------|------------------|
| **Conventions** | Forte (controllers, models, views, migrations) | Forte (app/, server/routes/, server/actions/, server/ws/) | Menos conventions (sem models/, sem controllers/) | ✅ Convention-over-config |
| **Generators** | `rails generate scaffold` (full CRUD) | 4 templates (default, dashboard, api-only, postgres) | Sem `theo generate route/action/page` | ⚠️ Parcial |
| **Database** | ActiveRecord built-in (migrations, associations) | Template-based (Drizzle no postgres template) | DB não é built-in | ❌ Gap significativo |
| **Auth** | has_secure_password + Devise | createSessionManager + requireAuth | Menos completo (sem OAuth, MFA) | ⚠️ Básico mas funcional |
| **Testing** | Minitest built-in, fixtures, factories | Vitest + Playwright, 523 testes, fixtures | Sem test generators | ✅ Cobertura forte |
| **Middleware** | Rack middleware stack, before_action | defineMiddleware, await next() pattern | Sem before_action per-controller | ⚠️ Diferente mas funcional |
| **CLI** | rails server/console/db:migrate/routes/test | theo dev/build/start/docker | Sem console, sem routes list | ⚠️ Menos comandos |

### Gaps Críticos vs Rails
1. **Sem generators** — Rails gera scaffold CRUD completo. Theo tem templates mas não `theo generate route users`.
2. **Sem database no core** — Rails tem ActiveRecord integrado. Theo delega para template.
3. **Sem console** — `rails console` é IRB para o app. Theo não tem equivalente.
4. **Sem routes list** — `rails routes` mostra todas as rotas. Theo não tem.

### Onde Theo ≥ Rails
1. **Type safety end-to-end** — TypeScript + Zod + InferResponse. Rails não tem equivalente.
2. **Frontend integrado** — React file-based routing. Rails precisa de Turbo/Stimulus separado.
3. **Typed client** — theoFetch com inferência. Rails usa fetch genérico.
4. **Deploy multi-platform** — Docker + Vercel + Cloudflare. Rails é self-hosted primarily.
5. **Streaming/SSE** — ReadableStream built-in. Rails precisa de ActionCable.
6. **WebSocket file-based** — defineWebSocket. Rails tem ActionCable (mais pesado).

---

## Resumo Geral

### Onde o Theo é FORTE (vantagem competitiva)

| Feature | Status |
|---------|--------|
| Type safety end-to-end | ✅ Melhor que Next.js e Rails |
| Zod validation built-in | ✅ Único entre os 3 |
| Typed client (theoFetch) | ✅ Zero codegen, inferência pura |
| Encrypted sessions built-in | ✅ Melhor que Next.js (que não tem) |
| Simplicidade (~1,300 LoC) | ✅ 100x menor que Next.js |
| WebSocket file-based | ✅ Melhor que Next.js (não tem) |
| Deploy explícito (3 adapters) | ✅ Transparente |

### Onde o Theo tem GAPS (precisa melhorar)

| Gap | Referência | Prioridade | Esforço |
|-----|-----------|------------|---------|
| `theo generate` CLI | Rails generators | ALTA | Médio |
| ISR / Static Generation | Next.js | MÉDIA | Grande |
| React Server Components | Next.js | BAIXA | Enorme |
| `theo routes` (list routes) | Rails `rails routes` | MÉDIA | Pequeno |
| `theo console` (REPL) | Rails `rails console` | BAIXA | Médio |
| Database no core | Rails ActiveRecord | BAIXA | Decisão filosófica |
| Web Standards (Request/Response) | Next.js/Hono | MÉDIA | Grande (refactor) |

### Veredicto

O Theo cumpre a promessa de "Rails for the AI era" em espírito — é opinativo, convention-over-configuration, batteries-included. Onde **supera** Rails é em type safety e frontend integrado. Onde fica **atrás** é em generators e database integration.

Comparado ao Next.js, o Theo é **mais simples e mais opinativo** — sem React Server Components, sem ISR, sem parallel routes. Em troca, tem **auth built-in, Zod validation, typed client, rate limiting, e WebSocket** — tudo que Next.js delega para third-party.

**Próximo passo mais valioso**: `theo generate route/action/page` — fecha o gap com Rails generators e melhora DX significativamente.
