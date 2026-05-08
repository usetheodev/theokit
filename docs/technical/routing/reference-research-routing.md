# Reference Research: Routing

**Data:** 2026-05-08
**Implementações pesquisadas:** Next.js, Rails
**Tópico:** File-based routing, route discovery, matching, layouts, error handling

## Resumo Executivo

Next.js usa **file-system scanning** (regex match em `app/`) para construir uma **tree de segmentos** com parallel routes, propagada via React Server Components (Flight protocol). Rails usa uma **DSL declarativa** (`resources`, `get`, `post`) compilada em um **Guarded Transition Graph (GTG)** para matching O(n) rápido. O padrão comum: **convenção → manifest → runtime matching**. O Theo deve adotar o scan de Next.js (file-based) com a simplicidade de matching de React Router (sem GTG, sem Flight).

## Comparação

| Framework | Approach | Key File | Pattern | Notes |
|---|---|---|---|---|
| Next.js | File scan → segment tree → Flight RSC | `build/webpack/loaders/next-app-loader/index.ts:81-220` | Regex match por file type, recursão por dirs, parallel routes via `@` | Complexo: RSC, Flight, parallel routes, `<Activity>` for persistence |
| Next.js | Path normalization | `shared/lib/router/utils/app-paths.ts:23-52` | `split('/').reduce()` strip groups, slots, leaf `page` | Simples e elegante |
| Next.js | Layout persistence | `client/components/layout-router.tsx:599-860` | `OuterLayoutRouter` → `<Activity mode=visible/hidden>` | React 19 feature, complexo |
| Rails | Route DSL → compiled patterns | `action_dispatch/routing/mapper.rb:738-834` | HTTP verb methods delegate to `map_match`, resources auto-CRUD | Declarativo, poderoso, maduro |
| Rails | GTG matching engine | `action_dispatch/journey/gtg/simulator.rb:16-67` | Byte-by-byte tokenization, transition table, O(n) | Over-engineered para Theo's use case |
| Rails | 404 handling | `action_dispatch/journey/router.rb:30-40` | Cascade: try routes → 404 if none match | Simples, `X-Cascade: pass` |

## Padrões Encontrados

### Padrão 1: File Type Registry (Next.js)

**Usado por:** Next.js
**Como funciona:**
```typescript
const FILE_TYPES = {
  layout: 'layout',
  error: 'error',
  loading: 'loading',
  'not-found': 'not-found',
} as const

// Scan each dir, check if file matches any registered type
```

**Trade-offs:**
- Pro: Extensível — adicionar novo file type é 1 linha
- Pro: Regex-based, rápido
- Con: Acoplado ao build system (webpack loader)

**Para Theo:** Adotar. Registry de special files simples, desacoplado do bundler.

### Padrão 2: Path Normalization via reduce (Next.js)

**Usado por:** Next.js
**Como funciona:**
```typescript
route.split('/').reduce((pathname, segment, index, segments) => {
  if (!segment) return pathname           // empty
  if (isGroupSegment(segment)) return pathname  // (group)
  if (segment[0] === '@') return pathname       // @slot
  if (segment === 'page' && index === segments.length - 1) return pathname  // leaf
  return `${pathname}/${segment}`
}, '')
```

**Trade-offs:**
- Pro: Simples, declarativo, fácil de testar
- Con: Não valida segmentos (aceita qualquer string)

**Para Theo:** Adotar diretamente. Na Onda 2, sem groups/slots, simplificar para: strip `page` suffix only.

### Padrão 3: Convention-based CRUD (Rails)

**Usado por:** Rails
**Como funciona:**
```ruby
resources :users  # Gera 7 routes: index, show, new, create, edit, update, destroy
```

**Trade-offs:**
- Pro: Zero boilerplate para CRUD padrão
- Pro: Naming conventions enforced (controller/action)
- Con: Magic — dev precisa saber quais routes são geradas

**Para Theo:** Não adotar na Onda 2 (é backend pattern). Mas inspiração para `defineRoute` auto-discovery na Onda 3.

### Padrão 4: Boundary Composition Stack (Next.js)

**Usado por:** Next.js
**Como funciona:**
```
OuterLayoutRouter wraps each segment:
  ErrorBoundary (error.tsx)
    → LoadingBoundary (Suspense + loading.tsx)
      → NotFoundBoundary
        → RedirectBoundary
          → InnerLayoutRouter (actual content)
```

**Trade-offs:**
- Pro: Cada segmento tem isolamento completo de erros
- Pro: Loading granular por segmento
- Con: Muitos wrappers → performance concern (Next.js mitiga com RSC)

**Para Theo:** Adotar simplificado. Na Onda 2: Error → Loading → Content. Sem Redirect/NotFound boundaries per-segment.

### Padrão 5: Cascade Matching (Rails)

**Usado por:** Rails
**Como funciona:**
```ruby
def serve(req)
  recognize(req) do |route, parameters|
    _, headers, _ = response = route.app.serve(req)
    return response unless headers[X_CASCADE] == "pass"
  end
  [404, {}, ["Not Found"]]  # No match
end
```

**Trade-offs:**
- Pro: Fallback natural — primeiro match ganha
- Pro: `X-Cascade: pass` permite route delegation
- Con: Linear scan (mitigado pelo GTG pre-filter)

**Para Theo:** React Router já faz isso internamente. Não reimplementar.

## O Que Cada Framework Faz Melhor

| Aspecto | Melhor em | Por quê |
|---------|-----------|---------|
| File discovery & scan | Next.js | Regex matchers, recursive dir walk, parallel route support |
| Path normalization | Next.js | Clean reduce pattern, handles groups/slots/dynamic |
| Route matching perf | Rails | GTG simulator, O(n) byte-by-byte matching |
| Convention enforcement | Rails | `resources` enforces naming, auto-CRUD |
| Layout persistence | Next.js | `<Activity mode>` keeps layouts mounted between navigations |
| Error isolation per segment | Next.js | Each segment has its own ErrorBoundary stack |
| Simplicity of definition | Rails | 1 line `resources :users` vs 7 file directories |

## O Que Cada Framework Faz Pior (Anti-patterns a Evitar)

| Anti-pattern | Framework | Por quê evitar |
|---|---|---|
| RSC + Flight protocol for routing | Next.js | Massive complexity for CSR-only framework. Theo não precisa de server-rendered route trees. |
| `<Activity>` component for persistence | Next.js | React 19 experimental API. Theo usa React Router que já persiste layouts via `<Outlet />`. |
| Parallel routes (`@slot`) | Next.js | Over-engineering para MVP. Nenhum app Theo vai precisar disso na Onda 2. |
| GTG matching engine | Rails | Compila regex em autômato. React Router's matching é suficiente para Theo. |
| Magic route generation | Rails | `resources :users` gera 7 routes invisíveis. Theo é explícito. |

## Recomendação para o Theo

1. **Adotar de Next.js:**
   - File type registry (`FILE_TYPES` map) para scan de special files
   - Path normalization via `split('/').reduce()` — strip leaf `page` suffix
   - Recursive dir scan com `fs.readdirSync` (Sync ok no plugin init)
   - Boundary composition: Error → Loading → Content per segment

2. **Evitar de Next.js:**
   - RSC/Flight (desnecessário para CSR)
   - `<Activity>` component (React Router já faz persistence)
   - Parallel routes `@slot` (YAGNI)
   - Webpack loader coupling (Theo usa Vite virtual modules)

3. **Adotar de Rails:**
   - Convention naming enforcement (page.tsx, layout.tsx são convenções fixas)
   - 404 como fallback natural (wildcard route)

4. **Evitar de Rails:**
   - DSL-based routing (Theo é file-based, não config-based)
   - GTG engine (React Router matching é suficiente)

5. **Inovar em:**
   - **Simplicidade radical** — scan + virtual module + React Router. Sem build step separado, sem manifest file em disco, sem code generation.
   - **Zero config routing** — criar `app/about/page.tsx` = rota `/about` existe. Sem registrar em nenhum lugar.

## Impacto em ADRs

| ADR | Status | Impacto |
|-----|--------|---------|
| D1 (React Router v7) | **CONFIRMADO** | React Router resolve matching, layouts, error boundaries. Não precisa de engine custom. |
| D2 (Virtual module route manifest) | **CONFIRMADO** | Scan no plugin → virtual module com `createBrowserRouter` config. |
| D3 (Pathless route for error inside layout) | **CONFIRMADO** | Padrão documentado pelo React Router, confirmado na pesquisa Next.js. |
| NOVO | **PROPOSTO** | Usar `React.lazy()` para code splitting por rota (Next.js faz via RSC, Theo faz via lazy). |
