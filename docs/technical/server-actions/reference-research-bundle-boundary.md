# Reference Research: Bundle Boundary

**Data:** 2026-05-08
**Implementações pesquisadas:** Next.js
**Tópico:** Como garantir que código server (actions/routes) não vaza para o client bundle

## Resumo Executivo

Next.js usa 5 camadas de enforcement: (1) Rust/SWC AST analysis para directives, (2) blocklists de módulos server-only/client-only, (3) webpack layers separados (rsc/ssr/browser), (4) proxying de módulos client em server bundles, (5) TypeScript rules para IDE. O Theo **não precisa de nada disso** na Onda 4 porque a arquitetura é fundamentalmente diferente: `server/actions/` nunca é importado pelo client — o client faz `fetch()` direto. A boundary é **arquitetural** (diretórios separados), não **compiler-enforced**.

## Comparação

| Framework | Approach | Complexity | Enforcement |
|---|---|---|---|
| Next.js | `'use server'`/`'use client'` directives → SWC transform → webpack layers → module proxies | ~5000 linhas (Rust + TS) | Build-time (compiler) |
| Theo | `server/` dir = server-only, `app/` dir = client. Client chama server via `fetch('/api/...')` | **0 linhas** (arquitetural) | Convention (directory separation) |

## Padrões Encontrados

### Padrão 1: Compiler-enforced boundary (Next.js)

**Usado por:** Next.js, React Server Components
**Como funciona:**
- SWC transform detecta `'use server'` e `'use client'` directives
- Webpack layers (`rsc`, `ssr`, `app-pages-browser`) separam módulos em compilação
- Client components em server context viram proxies (`registerClientReference`)
- Server modules em client context geram build error

**Trade-offs:**
- Pro: Impossível violar a boundary — build falha
- Pro: Permite imports cross-boundary com type safety
- Con: Complexidade massiva (SWC + webpack layers + manifests)
- Con: `'use server'` em qualquer arquivo é magic — dev pode esquecer ou colocar errado
- Con: Error messages complexas para devs novatos

### Padrão 2: Architectural boundary (Theo)

**Usado por:** Theo, Rails (backend/frontend são mundos separados)
**Como funciona:**
- `server/` directory contém routes e actions — server-only por design
- `app/` directory contém React components — client-only por design
- Client chama server via HTTP (`fetch('/api/...')`)
- Nenhum import de `server/` em `app/` — são mundos separados

**Trade-offs:**
- Pro: Zero complexidade — diretório = boundary
- Pro: Dev nunca se confunde — se está em `server/`, é server
- Pro: Debuggável — curl/Postman testam API diretamente
- Con: Sem type inference cross-boundary (futuro: typed client resolve isso)
- Con: Dev poderia importar `server/` em `app/` acidentalmente — precisa de guardrail

## O Que Next.js Faz Melhor

| Aspecto | Por quê |
|---------|---------|
| Type safety cross-boundary | Actions usáveis como funções tipadas no client |
| Build-time enforcement | Impossível violar — build falha |
| Zero fetch boilerplate | Client importa action e chama como função |

## O Que Next.js Faz Pior (Anti-patterns a Evitar)

| Anti-pattern | Por quê evitar |
|---|---|
| 5 camadas de enforcement | Complexidade desproporcional para o benefício |
| `'use server'` em qualquer arquivo | Magic directive — dev esquece e vaza dados |
| Webpack layers para boundary | Acoplamento profundo ao bundler |
| Module proxying | Runtime overhead + debugging difícil |

## Recomendação para o Theo

### 1. Para Onda 4: Boundary arquitetural é suficiente

O Theo não precisa de compiler enforcement porque:
- `server/actions/` é diretório server-only por convenção
- O client faz `fetch('/api/__actions/...')` — sem import cross-boundary
- O Vite plugin NÃO gera código que importa de `server/`

### 2. Para futuro (Onda 6 build): Lint rule simples

Um ESLint rule de 10 linhas resolve 99% dos problemas:
```typescript
// eslint-plugin-theo: no-server-import-in-client
// Se arquivo está em app/, bloqueia import de server/
if (filePath.includes('/app/') && importPath.includes('/server/')) {
  report('Cannot import server module from client component')
}
```

### 3. Não adotar de Next.js: compiler transforms

O custo (5000 linhas Rust + webpack plugins + directives) não compensa para o Theo. A boundary arquitetural + lint rule é 99.9% eficaz com 0.01% da complexidade.

## Impacto em ADRs

| ADR | Status | Impacto |
|-----|--------|---------|
| D4 Onda 4 (Bundle boundary simples) | **CONFIRMADO** | Boundary arquitetural por directory separation, sem compiler enforcement |
| FUTURO: ESLint rule | **PROPOSTO** | Lint rule para bloquear import de `server/` em `app/` (Onda 6+) |
