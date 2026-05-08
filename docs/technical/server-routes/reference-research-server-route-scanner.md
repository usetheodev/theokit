# Reference Research: Server Route Scanner

**Data:** 2026-05-08
**Implementações pesquisadas:** Next.js, Rails
**Tópico:** Como frameworks escaneiam, compilam, e matcham server-side API routes com dynamic segments

## Resumo Executivo

Next.js usa regex patterns para distinguir `route.ts` de `page.tsx`, normaliza paths stripando groups/slots/leaf filenames, e extrai dynamic segments via `getSegmentParam('[id]')` → `{ paramName: 'id', paramType: 'dynamic' }`. Rails compila route patterns em regex com capture groups (`/users/([^/]+)`) e usa GTG automaton para pre-filtering. O Theo deve adotar: (1) regex simples do Next.js para scan, (2) regex do Rails para matching com params, (3) sem GTG — simples é suficiente para <100 routes.

## Comparação

| Framework | Approach | Key File | Pattern | Notes |
|---|---|---|---|---|
| Next.js | Regex scan `route.ts` + `normalizeAppPath()` | `find-page-file.ts:138`, `app-paths.ts:23` | Regex match file type, strip leaf filename | Sem auto `/api/` — dir = path |
| Next.js | `getSegmentParam('[id]')` → param object | `get-segment-param.tsx:12` | Bracket parse: `[id]`, `[...rest]`, `[[...opt]]` | Supports 3 param types |
| Next.js | Module loading via webpack require | `app-route.ts:48`, `create-app-route-code.ts:15` | Lazy require factory, injected paths | Webpack-coupled |
| Rails | Pattern → AST → compiled regex | `journey/path/pattern.rb` | `/users/:id` → `/users/([^/]+)/` via visitor | Cached, constraint support |
| Rails | GTG automaton pre-filter | `journey/gtg/simulator.rb` | Byte-by-byte state machine | Over-engineered for <100 routes |
| Rails | Regex capture → `path_parameters` | `journey/router.rb:66-83` | `match_data.names` → `{ id: '123' }` | Clean extraction |

## Padrões Encontrados

### Padrão 1: Bracket-based dynamic segments (Next.js)

**Usado por:** Next.js, SvelteKit, Nuxt
**Como funciona:**
```typescript
function getSegmentParam(segment: string) {
  if (segment.startsWith('[[...') && segment.endsWith(']]'))
    return { paramName: segment.slice(5, -2), paramType: 'optional-catchall' }
  if (segment.startsWith('[...') && segment.endsWith(']'))
    return { paramName: segment.slice(4, -1), paramType: 'catchall' }
  if (segment.startsWith('[') && segment.endsWith(']'))
    return { paramName: segment.slice(1, -1), paramType: 'dynamic' }
  return null
}
```

**Trade-offs:**
- Pro: Filesystem-friendly (brackets are valid in dir names)
- Pro: Visual — dev sees `[id]` and knows it's dynamic
- Con: Can't use `[` in route names (edge case)

### Padrão 2: Pattern compilation to regex (Rails)

**Usado por:** Rails, Express
**Como funciona:**
```
/users/:id → /^\/users\/([^\/]+)$/
/users/:id/posts → /^\/users\/([^\/]+)\/posts$/
```

Each `:param` → capture group `([^/]+)`. Match extracts named groups.

**Trade-offs:**
- Pro: Fast matching via compiled regex
- Pro: Constraint support (`:id => /\d+/`)
- Con: Regex compilation cost (mitigated by caching)

### Padrão 3: File-to-URL normalization (Next.js)

**Usado por:** Next.js, Nitro
**Como funciona:**
```typescript
'server/routes/users/[id].ts'
  .split('/')
  → strip 'server/routes' prefix
  → add '/api' prefix
  → strip '.ts' extension
  → replace '[id]' with ':id'
  → result: '/api/users/:id'
```

**Trade-offs:**
- Pro: Zero config — file path IS the route
- Pro: Predictable — dev knows URL from file location
- Con: Limited — route names tied to filesystem rules

## O Que Cada Framework Faz Melhor

| Aspecto | Melhor em | Por quê |
|---------|-----------|---------|
| File scanning regex | Next.js | Simple, clear regex per file type |
| Dynamic param parsing | Next.js | `getSegmentParam` handles all 3 types |
| URL pattern matching | Rails | Compiled regex with named captures |
| Path normalization | Next.js | `split.reduce` clean and testable |
| Constraint validation | Rails | `:id => /\d+/` per-param |
| Runtime module loading | Next.js | Lazy factory, HMR compatible |

## O Que Cada Framework Faz Pior

| Anti-pattern | Framework | Por quê evitar |
|---|---|---|
| Webpack-coupled loading | Next.js | Theo usa Vite `ssrLoadModule` |
| GTG automaton | Rails | Massive complexity for <100 routes |
| No auto prefix | Next.js | User must create `api/` dir — Theo should auto-prefix |

## Recomendação para o Theo

1. **Adotar de Next.js:**
   - `getSegmentParam('[id]')` para parse de dynamic segments
   - File scan regex: match `.ts`/`.tsx`/`.js`/`.jsx` in `server/routes/`
   - `normalizeAppPath` adapted: strip prefix + extension, add `/api/`

2. **Adotar de Rails:**
   - Pattern compilation to regex com capture groups para matching
   - `([^/]+)` para dynamic params — simples, eficiente
   - Named captures para extração: `{ id: '123' }`

3. **Evitar de ambos:**
   - Webpack require factory (Next.js) — usar Vite `ssrLoadModule`
   - GTG automaton (Rails) — linear scan com regex suficiente
   - Sem auto-prefix (Next.js) — Theo auto-prefix `/api/`

4. **Inovar em:**
   - **Route loading via `ssrLoadModule`** — Vite carrega `.ts` files com HMR automático, sem build step
   - **Zod validation integrada** — nem Next.js nem Rails validam automaticamente

## Implementação recomendada para Theo

```typescript
// 1. Scan: server/routes/ → ServerRouteNode[]
interface ServerRouteNode {
  filePath: string       // '/abs/path/server/routes/users/[id].ts'
  routePath: string      // '/api/users/:id'
  paramNames: string[]   // ['id']
  pattern: RegExp        // /^\/api\/users\/([^/]+)$/
}

// 2. File → URL conversion
function fileToRoute(filePath: string, serverDir: string): string {
  return filePath
    .replace(serverDir + '/routes', '/api')    // prefix
    .replace(/\.(ts|tsx|js|jsx)$/, '')          // strip ext
    .replace(/\/index$/, '')                    // index → /
    .replace(/\[([^\]]+)\]/g, ':$1')            // [id] → :id
}

// 3. Pattern compilation
function compilePattern(routePath: string): { pattern: RegExp, paramNames: string[] } {
  const paramNames: string[] = []
  const regexStr = routePath.replace(/:([^/]+)/g, (_, name) => {
    paramNames.push(name)
    return '([^/]+)'
  })
  return { pattern: new RegExp(`^${regexStr}$`), paramNames }
}

// 4. Matching
function matchRoute(url: string, routes: ServerRouteNode[]) {
  for (const route of routes) {
    const match = route.pattern.exec(url)
    if (match) {
      const params: Record<string, string> = {}
      route.paramNames.forEach((name, i) => { params[name] = match[i + 1] })
      return { route, params }
    }
  }
  return null
}

// 5. Loading via Vite
const mod = await vite.ssrLoadModule(route.filePath)
const handler = mod[method]  // mod.GET, mod.POST, etc.
```

## Impacto em ADRs

| ADR | Status | Impacto |
|-----|--------|---------|
| D2 (File-based discovery) | **CONFIRMADO** | Scan `server/routes/`, `[id]` → `:id` |
| D4 (Return object = JSON) | **CONFIRMADO** | Rails + Next.js ambos serializam response |
| NOVO: Auto-prefix `/api/` | **PROPOSTO** | Next.js não faz; Theo deve — convention over config |
| NOVO: Vite `ssrLoadModule` | **PROPOSTO** | Carregar route modules com HMR automático no dev |
| NOVO: Regex pattern matching | **PROPOSTO** | Compilar `[id]` → `/([^/]+)/`, cache regex |
