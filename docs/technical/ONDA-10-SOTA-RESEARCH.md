# Onda 10 — SOTA Research: Hardening, Compatibilidade e Release

**Data:** 2026-05-08
**Pesquisador:** Claude (SOTA Research Skill)
**Escopo:** CI, build para npm, semver, changelog, package exports, cross-platform, backward compat

---

## 1. Estado Atual do Theo

### O que existe

| Aspecto | Estado | Gap |
|---------|--------|-----|
| Package exports | Apontam para `.ts` source direto | Consumidores precisam de `.js` + `.d.ts` |
| Build step | Não existe | Precisa de bundler (tsup/tsdown/unbuild) |
| CLI binários | `#!/usr/bin/env tsx` | Consumidor precisaria de `tsx` global |
| CI | Nenhum | Precisa de GitHub Actions |
| Versioning | `0.0.1` hardcoded | Precisa de semver + changesets |
| Changelog | Não existe | Precisa de CHANGELOG.md |
| npm publish | Nunca feito | Precisa de pipeline |
| publint/attw | Não existe | Precisa de validação pré-publish |
| Cross-platform | Testado apenas Linux | Precisa de matrix CI |
| Package validation | Manual | Precisa de smoke tests |

### Packages a publicar

| Package | Nome npm | Bin? | Subpath exports |
|---------|----------|------|-----------------|
| `packages/theo` | `theo` | `theo` | `.`, `./server`, `./vite-plugin` |
| `packages/create-theo` | `create-theo` | `create-theo` | `.` apenas |

---

## 2. Build para npm Publishing

### Problema Central

O Theo hoje exporta TypeScript cru:

```json
"exports": {
  ".": { "types": "./src/index.ts", "import": "./src/index.ts" }
}
```

Isso funciona em dev (Vitest resolve `.ts`), mas um consumidor fazendo `npm install theo` recebe `.ts` que Node.js não executa.

### Solução: tsup

**Decisão: tsup** — é o bundler mais maduro para TypeScript libraries em 2026.

- Zero-config: `tsup src/index.ts --format esm --dts`
- Gera `.js` (ESM) + `.d.ts` (declarations)
- Suporta múltiplos entry points (perfeito para subpath exports)
- 5.2k+ stars, usado por milhares de packages no npm
- tsdown é o sucessor (Rolldown-based, mais rápido), mas tsup é mais estável hoje

**Alternativas descartadas:**
- `tsc` puro: não faz bundling, output espalhado, não resolve paths
- `unbuild`: bom para UnJS ecosystem, overkill para Theo
- `tsdown`: promissor mas mais novo, menos battle-tested

### Configuração tsup recomendada

```typescript
// packages/theo/tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'server/index': 'src/server/index.ts',
    'vite-plugin/index': 'src/vite-plugin/index.ts',
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  external: ['vite', 'react', 'react-dom', 'react-router', 'zod', '@vitejs/plugin-react'],
})
```

### Package.json exports (pós-build)

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./server": {
      "types": "./dist/server/index.d.ts",
      "import": "./dist/server/index.js"
    },
    "./vite-plugin": {
      "types": "./dist/vite-plugin/index.d.ts",
      "import": "./dist/vite-plugin/index.js"
    }
  },
  "bin": {
    "theo": "./dist/cli/index.js"
  },
  "files": ["dist", "bin"]
}
```

### CLI Binary

Hoje: `bin/theo.mjs` usa `#!/usr/bin/env tsx` → depende de `tsx` no consumidor.
Solução: tsup compila `cli/index.ts` → `dist/cli/index.js`, bin aponta para o JS compilado.

O shebang `#!/usr/bin/env node` é adicionado via tsup banner:

```typescript
// No tsup.config.ts, para o entry de CLI:
banner: { js: '#!/usr/bin/env node' }
```

### create-theo

Mesmo padrão: tsup compila, bin aponta para `dist/cli.js`.

---

## 3. Package Exports Validation

### publint

Valida que o `package.json` exports map é consistente com os arquivos reais:
- Entry points existem no disco
- `types` condition vem antes de `import`
- Sem conflitos ESM/CJS

**Integração:** `npx publint` no CI após build.

### arethetypeswrong (attw)

Valida que os tipos `.d.ts` resolvem corretamente em todos os modos de `moduleResolution`:
- `node10` (legacy)
- `node16` (ESM-aware)
- `bundler` (Vite/Webpack)

**Integração:** `npx @arethetypeswrong/cli --pack .` no CI após build.

### Smoke Test de Import

Script que valida imports após `npm pack`:

```bash
# Pack local
npm pack --pack-destination /tmp/
cd /tmp && mkdir test-import && cd test-import
npm init -y
npm install /tmp/theo-0.1.0-alpha.0.tgz

# Validar imports
node -e "import('theo').then(m => { if(!m.defineConfig) throw new Error('missing defineConfig') })"
node -e "import('theo/server').then(m => { if(!m.defineRoute) throw new Error('missing defineRoute') })"
```

---

## 4. Versioning e Changelog

### Changesets

**Decisão: @changesets/cli** — padrão de facto para monorepos pnpm.

Usado por: pnpm (200+ packages), Vercel, Turborepo, Radix UI.

**Fluxo:**

1. Dev cria changeset: `pnpm changeset` → arquivo `.changeset/some-name.md`
2. PR inclui o changeset (reviewável)
3. CI roda `changeset version` → bumpa versões + gera CHANGELOG.md
4. `changeset publish` → publica no npm

**Configuração:**

```json
// .changeset/config.json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [["theo", "create-theo"]],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch"
}
```

`"linked"` garante que `theo` e `create-theo` são versionados juntos.

### Versão Alpha

Primeira publicação: `0.1.0-alpha.0`

Padrão semver para alpha:
- `0.x.y` = API instável (major 0)
- `-alpha.N` = pre-release tag
- Bumps alpha: `0.1.0-alpha.0` → `0.1.0-alpha.1` → ... → `0.1.0`

### CHANGELOG.md

Gerado automaticamente por changesets no formato Keep a Changelog:

```markdown
# theo

## 0.1.0-alpha.0

### Added
- defineConfig, defineRoute, defineAction, defineMiddleware
- File-based routing with React Router v7
- Vite dev server with HMR
- Production build and server
- Cookie helpers (getCookie, setCookie, deleteCookie)
- 3 templates (default, dashboard, api-only)
- Structured JSON logging with requestId
```

---

## 5. CI — GitHub Actions

### Workflow: ci.yml

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm build  # tsup build
      - run: npx publint packages/theo
      - run: npx publint packages/create-theo

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm test:types

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: npx playwright install --with-deps chromium
      - run: pnpm test:e2e

  package-validation:
    runs-on: ubuntu-latest
    needs: [lint-and-typecheck, test]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: npx @arethetypeswrong/cli --pack packages/theo
      - run: node tests/smoke/import-validation.mjs
```

### Node Versions

- **Node 20**: LTS até Abril 2026 (maintenance mode)
- **Node 22**: LTS atual (active até Outubro 2027)
- Matrix: `[20, 22]` — cobre os dois LTS ativos

### Workflow: release.yml

```yaml
name: Release
on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
          registry-url: 'https://registry.npmjs.org'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: changesets/action@v1
        with:
          publish: pnpm changeset publish
          version: pnpm changeset version
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## 6. Cross-Platform

### Estado Atual

O Theo usa:
- `node:fs`, `node:path`, `node:http`, `node:crypto` — cross-platform
- `cpSync` com `recursive: true` — Node 16.7+ (OK)
- `path.sep` / `path.join` — cross-platform
- Nenhum uso de `/bin/sh`, `exec`, ou shell scripts no runtime

**Risco baixo**: o framework é puro Node.js sem dependências nativas.

### CI Matrix para Cross-Platform

Para a primeira release alpha, testar apenas Linux no CI é suficiente. Windows e macOS podem ser adicionados depois:

```yaml
# Futuro (não alpha):
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
    node-version: [20, 22]
```

**Justificativa:** O Theo não tem dependências nativas (Rust, C++). O risco cross-platform é baixo. Adicionar Windows/macOS ao CI na alpha triplica o tempo de CI sem valor proporcional.

---

## 7. Package Export Smoke Tests

### O que validar

| Teste | Comando | Verifica |
|-------|---------|----------|
| Import `theo` | `import { defineConfig } from 'theo'` | Barrel export resolve |
| Import `theo/server` | `import { defineRoute } from 'theo/server'` | Subpath export resolve |
| Import `theo/vite-plugin` | `import { theoPlugin } from 'theo/vite-plugin'` | Subpath export resolve |
| CLI `theo --help` | `npx theo --help` | Bin entry funciona |
| CLI `create-theo --help` | `npx create-theo --help` | Bin entry funciona |
| TypeScript types | `tsc --noEmit test.ts` | `.d.ts` resolve |

### Implementação

```javascript
// tests/smoke/import-validation.mjs
import { defineConfig, loadConfig } from '../../packages/theo/dist/index.js'
import { defineRoute, defineAction, defineMiddleware } from '../../packages/theo/dist/server/index.js'
import { theoPlugin } from '../../packages/theo/dist/vite-plugin/index.js'

const checks = [
  ['defineConfig', typeof defineConfig === 'function'],
  ['loadConfig', typeof loadConfig === 'function'],
  ['defineRoute', typeof defineRoute === 'function'],
  ['defineAction', typeof defineAction === 'function'],
  ['defineMiddleware', typeof defineMiddleware === 'function'],
  ['theoPlugin', typeof theoPlugin === 'function'],
]

let failed = false
for (const [name, ok] of checks) {
  if (!ok) {
    console.error(`FAIL: ${name} not exported correctly`)
    failed = true
  } else {
    console.log(`PASS: ${name}`)
  }
}

if (failed) process.exit(1)
console.log('\nAll smoke tests passed!')
```

---

## 8. Backward Compatibility

### Estratégia para Alpha

Na fase alpha (`0.x.y`), breaking changes são esperados. Não há backward compat guarantee.

**Porém:**
- Cada breaking change documenta migration path no CHANGELOG
- Fixtures existentes continuam funcionando (são testes de regressão)
- Se `defineRoute` ou `defineAction` mudar API, fixture tests falham → CI bloqueia

### Fixture Matrix

As 10+ fixtures existentes são o contrato de backward compat:

| Fixture | Testa |
|---------|-------|
| `basic-valid-app` | Estrutura mínima |
| `onda1-hello-theo` | Scaffold + dev |
| `app-router-*` | Routing, layouts, errors |
| `server-routes-basic` | API routes |
| `server-actions-basic` | Actions + CSRF |
| `middleware-context` | Middleware + context |
| `production-build` | Build + start |
| `observability` | Logging + requestId |

---

## 9. Competitive Analysis: Release Pipeline

| Aspecto | Next.js | Vite | Hono | Theo (alvo) |
|---------|---------|------|------|-------------|
| Bundler | SWC custom | Rollup | tsup | tsup |
| Versioning | Custom + canary | Changesets | Changesets | Changesets |
| CI | GitHub Actions (massive) | GitHub Actions | GitHub Actions | GitHub Actions |
| Package validation | Custom scripts | publint | publint | publint + attw |
| Node versions | 20+ | 18+ | 18+ | 20+ |
| Cross-platform CI | Linux + Windows | Linux | Linux | Linux (alpha) |
| Pre-release | canary channel | alpha/beta | - | alpha tag |

---

## 10. Resumo de Decisões

| # | Decisão | Justificativa |
|---|---------|---------------|
| D1 | **tsup** para build | Mais maduro, zero-config, ESM + .d.ts |
| D2 | **Changesets** para versioning | Padrão de facto para monorepos pnpm |
| D3 | **publint + attw** para validação | Catches exports issues antes de publish |
| D4 | **Node 20 + 22** no CI matrix | Dois LTS ativos |
| D5 | **Linux-only** no CI alpha | Sem deps nativas, risco cross-platform baixo |
| D6 | **0.1.0-alpha.0** primeira versão | Semver alpha pre-release |
| D7 | **Smoke tests de import** no CI | Valida que consumidor final recebe exports corretos |
| D8 | **CHANGELOG.md** via changesets | Gerado automaticamente, formato Keep a Changelog |
| D9 | **files field** no package.json | Só publica `dist/` (não source) |

---

## Sources

- [tsup vs tsdown vs unbuild (2026)](https://www.pkgpulse.com/guides/tsup-vs-tsdown-vs-unbuild-typescript-library-bundling-2026)
- [Complete Monorepo Guide pnpm + Changesets (2025)](https://jsdev.space/complete-monorepo-guide/)
- [GitHub Actions Monorepo CI/CD Guide (2026)](https://dev.to/pockit_tools/github-actions-in-2026-the-complete-guide-to-monorepo-cicd-and-self-hosted-runners-1jop)
- [pnpm CI Docs](https://pnpm.io/continuous-integration)
- [publint](https://publint.dev/)
- [arethetypeswrong](https://github.com/arethetypeswrong/arethetypeswrong.github.io)
- [Publishing ESM npm packages with TypeScript (2025)](https://2ality.com/2025/02/typescript-esm-packages.html)
- [Node.js Package Exports Docs](https://nodejs.org/api/packages.html)
- [Changesets GitHub](https://github.com/changesets/changesets)
- [publint LogRocket Guide (Feb 2026)](https://blog.logrocket.com/publint-package-validation/)
- [Vercel Academy Changesets](https://vercel.com/academy/production-monorepos/changesets-versioning)
- [WarpBuild GitHub Actions Monorepo Guide (2026)](https://www.warpbuild.com/blog/github-actions-monorepo-guide)
