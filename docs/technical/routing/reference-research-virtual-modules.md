# Reference Research: Virtual Modules

**Data:** 2026-05-08
**Implementações pesquisadas:** Next.js (webpack loaders), Vite (plugin API), generouted, vite-plugin-pages
**Tópico:** Virtual modules — como frameworks geram código em runtime/build sem arquivos em disco

## Resumo Executivo

Next.js usa **webpack loaders como code generators** — loaders recebem um path, geram JavaScript como string, e retornam (sem null prefix). Vite usa o padrão **Rollup `\0` prefix** — `resolveId` retorna `\0module-id`, `load` gera o código. O padrão Vite é mais simples e direto. O Theo já usa este padrão no `theoPlugin()` (Onda 1). Para Onda 2, precisa evoluir para gerar route manifest dinâmico + invalidar on file changes.

## Comparação

| Framework | Approach | Key Pattern | HMR Strategy | Notes |
|---|---|---|---|---|
| Next.js | Webpack loaders geram JS strings | `createTreeCodeFromPath()` → template literals → eager imports | `addMissingDependency()` — webpack observa e recompila | Complexo: SWC template injection, Flight markers |
| Vite (core) | Plugin `resolveId` + `load` hooks | `\0` prefix convention, `virtual:` namespace | `moduleGraph.invalidateModule()` + `ws.send('full-reload')` | Simples, documentado, ecossistema Rollup |
| generouted | Vite `import.meta.glob` em runtime | `glob('./pages/**/*.tsx')` no entry file | Vite glob HMR nativo | Mais simples, mas menos controle |
| vite-plugin-pages | Virtual module `~pages` | `resolveId('~pages')` → `\0~pages` → scan FS → generate routes | `configureServer` + watcher + `invalidateModule` | Referência madura, padrão a seguir |

## Padrões Encontrados

### Padrão 1: Vite `\0` Prefix Virtual Module

**Usado por:** Vite ecosystem (vite-plugin-pages, generouted, Theo Onda 1)

**Como funciona:**
```typescript
const VIRTUAL_ID = 'virtual:my-routes'
const RESOLVED_ID = '\0virtual:my-routes'

export function myPlugin(): Plugin {
  return {
    name: 'my-plugin',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id) {
      if (id === RESOLVED_ID) {
        // Generate JS code as string
        return `export const routes = [...]`
      }
    },
  }
}
```

**Trade-offs:**
- Pro: Simples, 10 linhas de código
- Pro: Funciona com qualquer content (JS, CSS, JSON)
- Pro: `\0` prefix impede que outros plugins/FS tentem resolver
- Con: HMR requer invalidação manual (não automática)
- Con: Código gerado não tem sourcemaps nativos (precisa adicionar manualmente)

### Padrão 2: Webpack Loader Code Generation (Next.js)

**Usado por:** Next.js

**Como funciona:**
```typescript
// next-app-loader/index.ts:1111-1119
const header = collectedDeclarations
  .map(([varName, modulePath]) => {
    return `const ${varName} = () => import(/* webpackMode: "eager" */ ${JSON.stringify(modulePath)});\n`
  })
  .join('')

return header + code  // Returns generated JS as loader output
```

**Trade-offs:**
- Pro: Integrado ao dependency graph do webpack (HMR automático via `addMissingDependency`)
- Pro: Sourcemaps gerados pelo webpack
- Con: Acoplado ao webpack — não funciona com Vite/Rollup
- Con: Mais complexo (loaders, templates, SWC injection)
- Con: `addMissingDependency` para cada file check = muitas watchers

### Padrão 3: HMR Invalidation para Virtual Modules (Vite)

**Usado por:** vite-plugin-pages, frameworks Vite

**Como funciona:**
```typescript
export function myPlugin(): Plugin {
  return {
    name: 'my-plugin',
    configureServer(server) {
      // Watch app/ directory for new/deleted files
      server.watcher.add(resolve(root, 'app'))
      
      server.watcher.on('add', (file) => {
        if (isRouteFile(file)) {
          // Invalidate virtual module when routes change
          const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
          if (mod) {
            server.moduleGraph.invalidateModule(mod)
            server.ws.send({ type: 'full-reload' })
          }
        }
      })
      
      server.watcher.on('unlink', (file) => {
        // Same for file deletion
      })
    },
  }
}
```

**Trade-offs:**
- Pro: Routes auto-update quando dev cria/deleta page.tsx
- Pro: Vite watcher já existe, zero overhead
- Con: `full-reload` vs granular HMR — full reload é mais simples mas perde state
- Con: Precisa filtrar quais file changes afetam rotas (não todo arquivo)

### Padrão 4: `import.meta.glob` (generouted)

**Usado por:** generouted

**Como funciona:**
```typescript
// No entry file do app (runtime, não plugin):
const pages = import.meta.glob('./pages/**/page.tsx')
// Vite transforma em:
// { './pages/index/page.tsx': () => import(...), './pages/about/page.tsx': () => import(...) }
```

**Trade-offs:**
- Pro: Zero plugin necessário — Vite resolve nativamente
- Pro: HMR funciona automaticamente (Vite sabe quais files o glob matched)
- Pro: Lazy imports automáticos (cada glob entry é um `() => import(...)`)
- Con: Dev precisa escrever o glob no entry file (não é "zero config")
- Con: Menos controle sobre a tree structure (layout nesting não é óbvio)
- Con: Não funciona para gerar React Router config (precisa transformar glob→routes)

## O Que Cada Framework Faz Melhor

| Aspecto | Melhor em | Por quê |
|---------|-----------|---------|
| Simplicidade | Vite `\0` prefix | 10 linhas, sem acoplamento a bundler |
| HMR automático | Next.js `addMissingDependency` | Webpack rebuilds automaticamente |
| Zero config | generouted `import.meta.glob` | Dev não precisa de plugin |
| Controle sobre output | Next.js loaders | Template injection, fine-grained control |
| HMR para virtual modules | vite-plugin-pages `invalidateModule` | Pattern documentado e testado |

## O Que Cada Framework Faz Pior

| Anti-pattern | Framework | Por quê evitar |
|---|---|---|
| SWC template injection markers | Next.js | Over-engineered para Theo — string concatenation é suficiente |
| Eager imports everywhere | Next.js | `webpackMode: "eager"` previne code splitting. Theo quer lazy. |
| `import.meta.glob` as routing engine | generouted | Não gera tree structure para nested layouts. Dev escreve routing logic. |
| Full reload on any route change | vite-plugin-pages | Perde React state. Aceitável para add/delete page, não para edit. |

## Recomendação para o Theo

### 1. Adotar: Vite `\0` prefix + `configureServer` watcher

O Theo já usa `\0` prefix (Onda 1). Para Onda 2, evoluir:

```typescript
export function theoPlugin(root: string): Plugin {
  let routeTree: RouteNode   // Cached tree
  
  return {
    name: 'theo',
    
    // Virtual: route manifest
    resolveId(id) {
      if (id === '/@theo/route-manifest') return '\0@theo/route-manifest'
      if (id === '/@theo/entry-client') return '\0@theo/entry-client'
    },
    
    load(id) {
      if (id === '\0@theo/route-manifest') {
        routeTree = scanRoutes(resolve(root, 'app'))  // Scan FS
        return generateRouteManifest(routeTree)         // Generate JS
      }
      if (id === '\0@theo/entry-client') {
        return generateEntryClient()
      }
    },
    
    // HMR: invalidate on route file changes
    configureServer(server) {
      const appDir = resolve(root, 'app')
      
      function handleRouteChange(file: string) {
        if (!isRouteFile(file)) return
        const mod = server.moduleGraph.getModuleById('\0@theo/route-manifest')
        if (mod) {
          server.moduleGraph.invalidateModule(mod)
          server.ws.send({ type: 'full-reload' })
        }
      }
      
      server.watcher.on('add', handleRouteChange)
      server.watcher.on('unlink', handleRouteChange)
    },
  }
}

function isRouteFile(file: string): boolean {
  const name = path.basename(file)
  return /^(page|layout|error|loading|not-found)\.(tsx|ts|jsx|js)$/.test(name)
}
```

### 2. Evitar: import.meta.glob como routing engine

O generouted approach é elegante mas não dá controle suficiente para:
- Nested layout composition
- Error boundary per segment
- Not-found handling

### 3. Inovar em: Two virtual modules com separation of concerns

```
/@theo/route-manifest  → Data: route tree structure (pure data)
/@theo/entry-client    → Code: React Router setup + render
```

O manifest é dados. O entry é código. Se o manifest invalida, o entry re-importa. Clean separation.

## Impacto em ADRs

| ADR | Status | Impacto |
|-----|--------|---------|
| D2 (Virtual module `/@theo/entry-client`) | **EVOLUI** | Agora são DOIS virtual modules: `entry-client` + `route-manifest` |
| NOVO: HMR para route changes | **PROPOSTO** | `configureServer` + watcher + `invalidateModule` + `full-reload` para add/delete page.tsx |
| NOVO: Route file detection regex | **PROPOSTO** | `/^(page\|layout\|error\|loading\|not-found)\.(tsx\|ts\|jsx\|js)$/` — extensível |

## Sources

- [Vite Plugin API — Virtual Modules](https://vite.dev/guide/api-plugin) — `\0` prefix convention
- [vite-plugin-pages](https://github.com/hannoeru/vite-plugin-pages) — `~pages` virtual module pattern
- [Vite HMR invalidation discussion](https://github.com/vitejs/vite/discussions/15504) — `moduleGraph.invalidateModule`
- [generouted](https://github.com/oedotme/generouted) — `import.meta.glob` approach
- Next.js `next-app-loader/index.ts` — webpack loader code generation
- Next.js `load-entrypoint.ts` — SWC template injection
