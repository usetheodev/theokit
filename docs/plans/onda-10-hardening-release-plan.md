# Plan: Onda 10 — Hardening, Compatibilidade e Release

> **Version 1.0** — Este plano transforma o Theo de um monorepo de desenvolvimento (exports apontando para `.ts` source, binários dependentes de `tsx`) num pacote npm publicável. Inclui build com tsup, CI com GitHub Actions, versioning com changesets, validação de exports com publint/attw, smoke tests de import, e CHANGELOG.md. O resultado é um `theo@0.1.0-alpha.0` publicável sem vergonha técnica — imports funcionam, CLI funciona, tipos resolvem, e CI protege contra regressões.

## Context

O Theo está em 9 ondas completas com 285 testes (251 unit/integration + 13 E2E + 21 type), dogfood 100/100, e 3 templates funcionais. Porém:

1. **Exports apontam para `.ts` source** — `packages/theo/package.json` exporta `./src/index.ts`. Um consumidor fazendo `npm install theo` recebe TypeScript cru que Node.js não executa.
2. **Binários dependem de `tsx`** — `bin/theo.mjs` usa `#!/usr/bin/env tsx`. Consumidores precisariam de `tsx` global instalado.
3. **Sem CI** — nenhum GitHub Actions workflow. Nada impede push de código quebrado.
4. **Sem build step** — não existe `dist/` com JavaScript compilado.
5. **Sem versioning** — versão hardcoded `0.0.1`, sem CHANGELOG, sem estratégia de release.
6. **Sem validação de package** — nunca rodou publint, attw, nem smoke test de import.

Evidence: `packages/theo/package.json` linhas 8-20 (exports map), `bin/theo.mjs` linha 1 (`#!/usr/bin/env tsx`).

## Objective

**Done =** `pnpm build && npx publint packages/theo && npx @arethetypeswrong/cli --pack packages/theo` passam, `node tests/smoke/import-validation.mjs` valida todos os exports, CI roda em GitHub Actions com matrix Node 20+22, e changesets está configurado para versioning.

Metas:
1. tsup build gera `dist/` com `.js` + `.d.ts` para ambos packages
2. Package.json exports apontam para `dist/` (não `src/`)
3. CLI binários compilados com `#!/usr/bin/env node`
4. publint + attw passam sem erros
5. Smoke test valida todos os imports
6. GitHub Actions CI com typecheck, test, test:types, e2e, package validation
7. Changesets configurado com `0.1.0-alpha.0`
8. CHANGELOG.md gerado
9. Testes existentes continuam passando (zero regressão)

## ADRs

### D1 — tsup como bundler
**Decision:** Usar tsup para compilar TypeScript → JavaScript + `.d.ts`.
**Rationale:** tsup é o bundler mais maduro para TypeScript libraries em 2026. Zero-config, gera ESM + declarations, suporta múltiplos entry points. Alternativas: `tsc` puro (não bundla, output espalhado), unbuild (overkill, ecossistema UnJS), tsdown (promissor mas mais novo).
**Consequences:** Adiciona `tsup` como devDependency. Build step obrigatório antes de publish. Dev workflow não muda (Vitest resolve `.ts` direto).

### D2 — ESM-only (sem CJS)
**Decision:** Publicar apenas ESM (format: `['esm']`), sem CommonJS.
**Rationale:** O Theo usa `"type": "module"`, React 19 é ESM, Vite é ESM. CJS dual-publish adiciona complexidade sem valor — nenhum consumidor do Theo precisa de `require()`.
**Consequences:** Consumidores com `"type": "commonjs"` precisam usar `import()` dinâmico. Aceitável para um framework 2026.

### D3 — Changesets para versioning
**Decision:** Usar `@changesets/cli` para gerenciar versões e CHANGELOG.
**Rationale:** Padrão de facto para monorepos pnpm. Usado pelo próprio pnpm (200+ packages), Vercel, Radix. Alternativas: semantic-release (complex, git-tag-based), manual (error-prone).
**Consequences:** Cada PR pode incluir um changeset file. CI pode automatizar version bump + publish.

### D4 — Linked versioning theo + create-theo
**Decision:** Versionamento linkado: `theo` e `create-theo` bumped juntos.
**Rationale:** `create-theo` gera projetos que dependem de `theo`. Versões desinkadas causariam incompatibilidade. Changesets `"linked"` config resolve isso.
**Consequences:** Um changeset que afeta `theo` também bumpa `create-theo`.

### D5 — publint + attw no CI
**Decision:** Rodar publint e arethetypeswrong como gate no CI.
**Rationale:** publint valida que exports map corresponde a arquivos reais. attw valida que tipos resolvem em node10/node16/bundler modes. Ambos são leves e preventivos.
**Consequences:** Adiciona ~10s ao CI. Previne publish de packages com exports quebrados.

### D6 — Linux-only no CI alpha
**Decision:** CI roda apenas em `ubuntu-latest`, sem Windows/macOS.
**Rationale:** O Theo não tem dependências nativas. Todo I/O usa APIs cross-platform de Node.js (`path.join`, `cpSync`). O risco cross-platform é baixo. Adicionar Windows/macOS triplica tempo de CI sem valor proporcional na fase alpha.
**Consequences:** Bugs Windows-specific (path separators) não seriam capturados. Aceitável para alpha — CI cross-platform adicionado quando houver usuários Windows.

### D7 — 0.1.0-alpha.0 como primeira versão
**Decision:** Primeira versão publicada será `0.1.0-alpha.0`.
**Rationale:** Semver `0.x` indica API instável. Tag `alpha` indica que não é production-ready. Incrementos alpha: `alpha.0` → `alpha.1` → ... → `0.1.0` (stable).
**Consequences:** Consumidores sabem que breaking changes são esperados.

### D8 — Dev workflow não muda
**Decision:** O build com tsup é apenas para publishing. O dev workflow (Vitest, tsx, `pnpm test`) continua resolvendo `.ts` direto via aliases.
**Rationale:** Forçar build antes de cada `pnpm test` adiciona friction sem valor. Vitest e tsx já resolvem TypeScript. O build é um step de CI/publish, não de dev.
**Consequences:** `pnpm test` não depende de `pnpm build`. Mas `pnpm build` deve ser rodado antes de validação de package.

## Dependency Graph

```
Phase 0 (tsup build) ──▶ Phase 1 (exports + bin) ──▶ Phase 2 (validation) ──▶ Phase 4 (CI)
                                                           │
                                                           ▼
                                                     Phase 3 (changesets)
```

- **Phase 0** bloqueia tudo (sem build, nada funciona)
- **Phase 1** depende de Phase 0 (exports apontam para dist/)
- **Phase 2** depende de Phase 1 (valida os exports)
- **Phase 3** paralelo com Phase 2 (changesets é config independente)
- **Phase 4** depende de Phases 1, 2, 3 (CI roda tudo)

---

## Phase 0: Build com tsup

**Objective:** Compilar ambos packages com tsup, gerando `dist/` com `.js` + `.d.ts`.

### T0.1 — tsup config para `theo`

#### Objective
Configurar tsup para compilar o package `theo` com 4 entry points: index, server, vite-plugin, cli.

#### Evidence
`packages/theo/package.json` exports apontam para `./src/*.ts`. Node.js não executa `.ts`. Precisa de `dist/*.js` + `dist/*.d.ts`.

#### Files to edit
```
packages/theo/tsup.config.ts (NEW) — Configuração tsup com entry points
packages/theo/package.json (EDIT) — Adicionar script "build"
package.json (EDIT) — Adicionar script "build" no root
```

#### Deep file dependency analysis
- `tsup.config.ts`: Novo arquivo. Define quais files compilar, formato (ESM), target (node20), externals.
- `packages/theo/package.json`: Hoje tem apenas runtime deps. Precisa de script `"build": "tsup"`.
- Root `package.json`: Precisa de script `"build"` que builda todos os packages. Downstream: CI usa `pnpm build`.

#### Deep Dives
- **Entry points**: 4 entries: `src/index.ts`, `src/server/index.ts`, `src/vite-plugin/index.ts`, `src/cli/index.ts`. Cada um gera um `.js` + `.d.ts` em `dist/`.
- **External deps**: `vite`, `react`, `react-dom`, `react-router`, `zod`, `@vitejs/plugin-react`, `cac` — são peer/deps, não bundlados.
- **CLI banner**: O entry `cli/index.ts` precisa de `#!/usr/bin/env node` no topo do output.
- **import.meta.url**: O vite-plugin usa `import.meta.url` para resolver paths relativos. tsup preserva `import.meta.url` em format ESM.
- **Node built-ins**: `node:fs`, `node:path`, `node:http`, `node:crypto`, `node:url` — tsup externaliza automaticamente.
- **EC-2 MUST FIX — vite-plugin SSR aliases**: O vite-plugin resolve `theoSrcDir = resolve(currentDir, '..')` e cria aliases para `server/index.ts` e `index.ts`. Após build, `currentDir` será `dist/vite-plugin/`, e os aliases apontarão para `.ts` que não existe em `dist/`. Fix: ajustar aliases para usar `.js` quando rodando de `dist/`, usando fallback: `const ext = existsSync(resolve(theoSrcDir, 'index.ts')) ? '.ts' : '.js'`.

#### Tasks
1. Instalar tsup como devDependency: `pnpm add -D tsup -w`
2. Criar `packages/theo/tsup.config.ts` com 4 entry points
3. Adicionar `"build": "tsup"` em `packages/theo/package.json` scripts
4. Adicionar `"build": "pnpm -r run build"` no root `package.json`
5. Rodar `pnpm build` e verificar que `packages/theo/dist/` contém os 4 `.js` + `.d.ts`
6. Verificar que `dist/cli/index.js` tem shebang `#!/usr/bin/env node`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_build_generates_dist() — Given tsup config, When pnpm build runs in packages/theo, Then dist/index.js exists
RED:     test_build_generates_server_dist() — Given tsup config, When build runs, Then dist/server/index.js exists
RED:     test_build_generates_vite_plugin_dist() — Given tsup config, When build runs, Then dist/vite-plugin/index.js exists
RED:     test_build_generates_cli_dist() — Given tsup config, When build runs, Then dist/cli/index.js exists
RED:     test_build_generates_dts() — Given tsup config, When build runs, Then dist/index.d.ts exists
RED:     test_cli_has_shebang() — Given built CLI, When reading first line of dist/cli/index.js, Then starts with "#!/usr/bin/env node"
RED:     test_cli_no_duplicate_shebang() — Given built CLI, When counting shebang lines in dist/cli/index.js, Then exactly 1 occurrence (EC-3 SHOULD TEST)
RED:     test_dist_is_valid_esm() — Given built dist, When importing dist/index.js, Then exports defineConfig function
RED:     test_build_excludes_externals() — Given built dist, When checking dist/index.js content, Then does not contain "from 'zod'" bundled inline (it stays as import)
GREEN:   Create tsup.config.ts and run build
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/build-theo.test.ts
```

BDD scenarios:
- **Happy path**: `pnpm build` gera dist/ com todos os outputs
- **Validation error**: tsup config com entry point inexistente falha com erro claro
- **Edge case**: Build com dist/ já existente faz clean automático
- **Error scenario**: Build sem tsup instalado falha com mensagem clara

#### Acceptance Criteria
- [ ] `packages/theo/dist/index.js` existe e é ESM válido
- [ ] `packages/theo/dist/server/index.js` existe
- [ ] `packages/theo/dist/vite-plugin/index.js` existe
- [ ] `packages/theo/dist/cli/index.js` existe com shebang `#!/usr/bin/env node`
- [ ] `packages/theo/dist/index.d.ts` existe
- [ ] `packages/theo/dist/server/index.d.ts` existe
- [ ] `pnpm build` exit code 0

#### DoD
- [ ] Build gera todos os outputs
- [ ] Shebang presente no CLI
- [ ] Zero erros de build

---

### T0.2 — tsup config para `create-theo`

#### Objective
Configurar tsup para compilar o package `create-theo`.

#### Evidence
`packages/create-theo/bin/create-theo.mjs` usa `#!/usr/bin/env tsx`. Consumidor não teria `tsx` instalado.

#### Files to edit
```
packages/create-theo/tsup.config.ts (NEW) — Configuração tsup
packages/create-theo/package.json (EDIT) — Adicionar script "build", files field
```

#### Deep file dependency analysis
- `tsup.config.ts`: Novo. Compila `src/cli.ts` → `dist/cli.js` (entry point para bin).
- `package.json`: Precisa de `"build": "tsup"`, atualizar `"bin"` para apontar `dist/cli.js`.
- **Complicação**: `create-theo` usa `cpSync(templateDir, ...)` onde `templateDir` é resolvido via `import.meta.url` relativo a `src/`. Após build, o `dist/` está um nível diferente. Templates precisam ser incluídos no package via `files` field.

#### Deep Dives
- **Template copying**: `getTemplateDir()` em `src/index.ts` resolve `resolve(__dirname, '../templates', templateName)`. Após tsup build, `__dirname` é simulado via `import.meta.url` em ESM. O path relativo `../templates` precisa funcionar de `dist/` — ou seja, `templates/` precisa estar no mesmo nível que `dist/`.
- **files field**: `"files": ["dist", "templates"]` garante que templates são incluídos no npm pack.
- **Entry point**: Apenas `src/cli.ts` como entry (os outros módulos são importados internamente).

#### Tasks
1. Criar `packages/create-theo/tsup.config.ts`
2. Atualizar `packages/create-theo/package.json` com build script e files field
3. Verificar que `__dirname` resolve corretamente após build (templates path)
4. Rodar build e verificar que `dist/cli.js` funciona

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_create_theo_build() — Given tsup config, When build runs, Then dist/cli.js exists
RED:     test_create_theo_cli_has_shebang() — Given built CLI, When reading first line, Then starts with "#!/usr/bin/env node"
RED:     test_create_theo_templates_accessible() — Given built package, When checking templates/ dir, Then default/dashboard/api-only exist
RED:     test_create_theo_scaffold_from_dist() — Given built dist, When running dist/cli.js with project name, Then scaffold works (creates project dir)
RED:     test_template_path_from_dist() — Given built dist/cli.js, When resolving template dir via import.meta.url, Then resolve(dirname(url), '../templates/default') exists (EC-1 MUST FIX)
GREEN:   Create tsup.config.ts and build
REFACTOR: Fix template path resolution — adjust getTemplateDir() if relative path from dist/ doesn't reach templates/
VERIFY:  npx vitest run tests/unit/build-create-theo.test.ts
```

BDD scenarios:
- **Happy path**: Build gera dist/cli.js que executa scaffold
- **Validation error**: Build sem entry point falha
- **Edge case**: Template path resolution from dist/ vs src/
- **Error scenario**: Templates dir ausente no package causa scaffold failure

#### Acceptance Criteria
- [ ] `packages/create-theo/dist/cli.js` existe com shebang
- [ ] Templates acessíveis de `dist/` via path relativo
- [ ] `node packages/create-theo/dist/cli.js test-proj` funciona
- [ ] `packages/create-theo/package.json` tem `"files": ["dist", "templates"]`

#### DoD
- [ ] Build funciona
- [ ] Scaffold funciona de `dist/`
- [ ] Templates incluídos

---

## Phase 1: Package Exports e Bin

**Objective:** Atualizar package.json de ambos packages para apontar exports e bin para `dist/`.

### T1.1 — Atualizar exports do `theo`

#### Objective
Apontar exports map e bin entry para `dist/` compilado.

#### Evidence
Exports atuais: `"types": "./src/index.ts", "import": "./src/index.ts"`. Consumidor recebe `.ts` que não executa.

#### Files to edit
```
packages/theo/package.json (EDIT) — Atualizar exports, bin, adicionar files field
```

#### Deep file dependency analysis
- `package.json`: É o contrato do package. Exports map define como `import {} from 'theo'` resolve. Bin define o CLI executable. Files define o que é incluído no tarball npm.
- Downstream: Todos os consumidores (projetos criados por create-theo), CI validation, smoke tests.
- **Atenção**: Vitest usa aliases (`vitest.config.ts`), não exports map. Então mudar exports não quebra `pnpm test`.

#### Deep Dives
- **Exports map pós-build**:
  ```json
  ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
  "./server": { "types": "./dist/server/index.d.ts", "import": "./dist/server/index.js" },
  "./vite-plugin": { "types": "./dist/vite-plugin/index.d.ts", "import": "./dist/vite-plugin/index.js" }
  ```
- **types condition first**: Node.js e TypeScript docs recomendam `types` antes de `import` na exports map.
- **bin**: `"theo": "./dist/cli/index.js"` (não mais `./bin/theo.mjs`).
- **files**: `["dist"]` — exclui `src/`, `tests/`, tudo que não é necessário para consumidores.
- **Backward compat**: `vitest.config.ts` resolve via aliases, não exports map. `pnpm test` não quebra.

#### Tasks
1. Atualizar `exports` map em `packages/theo/package.json`
2. Atualizar `bin` para `"theo": "./dist/cli/index.js"`
3. Adicionar `"files": ["dist"]`
4. Verificar que `pnpm test` ainda passa (aliases em vitest.config.ts)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_exports_map_points_to_dist() — Given updated package.json, When reading exports["."].import, Then equals "./dist/index.js"
RED:     test_exports_server_points_to_dist() — Given updated package.json, When reading exports["./server"].import, Then equals "./dist/server/index.js"
RED:     test_bin_points_to_dist() — Given updated package.json, When reading bin.theo, Then equals "./dist/cli/index.js"
RED:     test_files_includes_dist() — Given updated package.json, When reading files, Then contains "dist"
RED:     test_files_excludes_src() — Given updated package.json, When reading files, Then does NOT contain "src"
RED:     test_existing_tests_still_pass() — Given updated package.json, When running pnpm test, Then all pass (via vitest aliases)
GREEN:   Update package.json exports, bin, files
REFACTOR: Remove bin/theo.mjs if no longer needed
VERIFY:  npx vitest run tests/unit/package-exports.test.ts && pnpm test
```

BDD scenarios:
- **Happy path**: Exports map corretamente aponta para dist/
- **Validation error**: types condition missing gera aviso em publint
- **Edge case**: Vitest aliases override exports map (pnpm test não quebra)
- **Error scenario**: Exports apontam para arquivo que não existe (build não rodou)

#### Acceptance Criteria
- [ ] `exports["."]` aponta para `dist/index.js` e `dist/index.d.ts`
- [ ] `exports["./server"]` aponta para `dist/server/index.js`
- [ ] `exports["./vite-plugin"]` aponta para `dist/vite-plugin/index.js`
- [ ] `bin.theo` aponta para `dist/cli/index.js`
- [ ] `files` contém apenas `["dist"]`
- [ ] `pnpm test` passa (zero regressão)

#### DoD
- [ ] Package.json atualizado
- [ ] Testes existentes passam

---

### T1.2 — Atualizar exports do `create-theo`

#### Objective
Apontar bin e files do create-theo para dist/.

#### Evidence
`bin/create-theo.mjs` usa `#!/usr/bin/env tsx`. Precisa apontar para JS compilado.

#### Files to edit
```
packages/create-theo/package.json (EDIT) — Atualizar bin, files
```

#### Deep file dependency analysis
- `package.json`: Bin define como `npx create-theo` resolve. Files define o tarball.
- Downstream: Usuários finais que fazem `npx create-theo my-app`.

#### Deep Dives
- **bin**: `"create-theo": "./dist/cli.js"`
- **files**: `["dist", "templates"]` — templates devem ser incluídos para scaffold funcionar.

#### Tasks
1. Atualizar `bin` para `"create-theo": "./dist/cli.js"`
2. Atualizar `files` para `["dist", "templates"]`
3. Verificar que scaffold funciona de dist/

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_create_theo_bin_points_to_dist() — Given updated package.json, When reading bin["create-theo"], Then equals "./dist/cli.js"
RED:     test_create_theo_files_includes_templates() — Given updated package.json, When reading files, Then contains "templates"
RED:     test_create_theo_files_includes_dist() — Given updated package.json, When reading files, Then contains "dist"
RED:     test_scaffold_from_compiled_cli() — Given built create-theo, When running dist/cli.js, Then scaffold succeeds
GREEN:   Update package.json
REFACTOR: Remove bin/create-theo.mjs if no longer needed
VERIFY:  npx vitest run tests/unit/package-exports.test.ts
```

BDD scenarios:
- **Happy path**: bin aponta para dist/cli.js
- **Validation error**: Missing templates in files → scaffold falha
- **Edge case**: files com dist + templates (dois dirs)
- **Error scenario**: dist/cli.js não existe (build não rodou)

#### Acceptance Criteria
- [ ] `bin["create-theo"]` aponta para `dist/cli.js`
- [ ] `files` contém `["dist", "templates"]`
- [ ] Scaffold funciona de dist/

#### DoD
- [ ] Package.json atualizado
- [ ] Scaffold funciona

---

## Phase 2: Package Validation

**Objective:** Validar que os packages publicáveis têm exports corretos, tipos resolvem, e imports funcionam.

### T2.1 — publint + attw validation

#### Objective
Rodar publint e arethetypeswrong para validar que os packages estão corretos para publicação.

#### Evidence
Sem validação, exports podem apontar para arquivos inexistentes, tipos podem não resolver em `moduleResolution: node16`, etc.

#### Files to edit
```
package.json (EDIT) — Adicionar scripts validate:publint e validate:attw
tests/smoke/validate-packages.test.ts (NEW) — Testes de validação de package
```

#### Deep file dependency analysis
- Root `package.json`: Adiciona scripts de validação. CI usa esses scripts.
- `tests/smoke/validate-packages.test.ts`: Roda publint/attw programaticamente ou via execSync. Resultado é reportado como teste Vitest.

#### Deep Dives
- **publint**: Valida exports map vs arquivos reais, types condition ordering, files field.
- **attw**: Simula import do package em node10, node16, bundler modes. Reporta problemas de resolução de tipo.
- **Pré-requisito**: `pnpm build` deve ter rodado antes. Tests devem buildar primeiro.

#### Tasks
1. Instalar devDeps: `pnpm add -D publint @arethetypeswrong/cli -w`
2. Adicionar scripts ao root package.json
3. Criar teste que roda validação pós-build
4. Rodar e corrigir qualquer issue encontrado

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_publint_theo_passes() — Given built theo package, When running publint, Then exit code 0 (no errors)
RED:     test_publint_create_theo_passes() — Given built create-theo package, When running publint, Then exit code 0
RED:     test_attw_theo_passes() — Given built theo package, When running attw, Then no "error" entries in output
RED:     test_attw_subpath_server() — Given built theo package, When attw checks theo/server, Then types resolve correctly
GREEN:   Install tools, configure packages correctly, fix any issues
REFACTOR: None expected
VERIFY:  npx vitest run tests/smoke/validate-packages.test.ts
```

BDD scenarios:
- **Happy path**: publint e attw passam sem erros
- **Validation error**: Exports apontando para arquivo inexistente → publint reporta
- **Edge case**: types condition depois de import → publint warning
- **Error scenario**: Build não rodou → dist/ não existe → publint falha

#### Acceptance Criteria
- [ ] `npx publint packages/theo` exit code 0
- [ ] `npx publint packages/create-theo` exit code 0
- [ ] `npx @arethetypeswrong/cli --pack packages/theo` sem errors
- [ ] Scripts de validação no root package.json

#### DoD
- [ ] Ambos packages passam publint
- [ ] Theo passa attw
- [ ] Scripts configurados

---

### T2.2 — Smoke tests de import

#### Objective
Validar que imports de `theo`, `theo/server`, `theo/vite-plugin` funcionam após build.

#### Evidence
Mesmo com publint passando, importar e usar as funções é a validação definitiva.

#### Files to edit
```
tests/smoke/import-validation.test.ts (NEW) — Smoke test de imports reais
```

#### Deep file dependency analysis
- Novo arquivo de teste. Importa de `dist/` diretamente (não via aliases) para simular consumidor real.
- Depende de Phase 0 (build deve ter rodado).

#### Deep Dives
- **Import direto de dist/**: Para simular o que um consumidor veria, importamos `../../packages/theo/dist/index.js` (não `theo` via alias).
- **Verificações**: Cada export público é `typeof === 'function'` ou `typeof === 'object'`.
- **Tipos**: Um segundo teste compila um `.ts` que importa `theo` para verificar que `.d.ts` resolve.

#### Tasks
1. Criar `tests/smoke/import-validation.test.ts`
2. Importar todos os exports de cada subpath
3. Verificar que são funções/objetos válidos
4. Rodar e verificar

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_import_defineConfig() — Given built dist, When importing from dist/index.js, Then defineConfig is a function
RED:     test_import_loadConfig() — Given built dist, When importing from dist/index.js, Then loadConfig is a function
RED:     test_import_theoPlugin() — Given built dist, When importing from dist/index.js, Then theoPlugin is a function
RED:     test_import_defineRoute() — Given built dist, When importing from dist/server/index.js, Then defineRoute is a function
RED:     test_import_defineAction() — Given built dist, When importing from dist/server/index.js, Then defineAction is a function
RED:     test_import_defineMiddleware() — Given built dist, When importing from dist/server/index.js, Then defineMiddleware is a function
RED:     test_import_cookies() — Given built dist, When importing from dist/server/index.js, Then getCookie/setCookie/deleteCookie are functions
RED:     test_import_vite_plugin() — Given built dist, When importing from dist/vite-plugin/index.js, Then theoPlugin is a function
RED:     test_vite_plugin_ssr_aliases_from_dist() — Given theoPlugin loaded from dist/, When plugin.config() returns aliases, Then aliases point to .js files (not .ts) (EC-2 MUST FIX)
RED:     test_cli_executable() — Given built dist, When running dist/cli/index.js --help, Then outputs help text without error
GREEN:   Build must produce correct exports
REFACTOR: None expected
VERIFY:  npx vitest run tests/smoke/import-validation.test.ts
```

BDD scenarios:
- **Happy path**: Todos os imports resolvem para funções válidas
- **Validation error**: Export faltando → teste falha com nome específico
- **Edge case**: Import de tipos (CookieOptions, RouteConfig) — verificado via TypeScript, não runtime
- **Error scenario**: dist/ não existe → import falha com module not found

#### Acceptance Criteria
- [ ] Todas as 8+ funções públicas importam corretamente de dist/
- [ ] CLI executável de dist/ (--help funciona)
- [ ] Cookies helpers exportados de dist/server/

#### DoD
- [ ] Smoke tests GREEN
- [ ] Zero imports quebrados

---

## Phase 3: Changesets e Versioning

**Objective:** Configurar changesets para gerenciar versões e CHANGELOG.

### T3.1 — Setup changesets

#### Objective
Instalar e configurar `@changesets/cli` com linked versioning.

#### Evidence
Versão hardcoded `0.0.1`, sem CHANGELOG, sem estratégia de release.

#### Files to edit
```
.changeset/config.json (NEW) — Configuração changesets
package.json (EDIT) — Adicionar scripts changeset/version/release
packages/theo/package.json (EDIT) — Bumpar versão para 0.1.0-alpha.0
packages/create-theo/package.json (EDIT) — Bumpar versão para 0.1.0-alpha.0
```

#### Deep file dependency analysis
- `.changeset/config.json`: Configuração do changesets. Define linked packages, access, baseBranch.
- Root `package.json`: Adiciona scripts `changeset`, `version-packages`, `release`.
- Package versions: Bump de `0.0.1` → `0.1.0-alpha.0`.

#### Deep Dives
- **linked config**: `"linked": [["theo", "create-theo"]]` — ambos packages bumpad juntos.
- **access**: `"public"` — packages publicados no registry público npm.
- **baseBranch**: `"main"`.
- **Pre-release**: Usar `pnpm changeset pre enter alpha` para entrar em modo alpha.

#### Tasks
1. Instalar: `pnpm add -D @changesets/cli -w`
2. Rodar `pnpm changeset init`
3. Editar `.changeset/config.json` com linked packages e access public
4. Adicionar scripts ao root package.json
5. Bumpar versões para `0.1.0-alpha.0`
6. Criar CHANGELOG.md inicial

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_changeset_config_exists() — Given initialized changesets, When checking .changeset/config.json, Then file exists and is valid JSON
RED:     test_changeset_linked_packages() — Given config, When reading linked field, Then contains ["theo", "create-theo"]
RED:     test_changeset_access_public() — Given config, When reading access, Then equals "public"
RED:     test_version_is_alpha() — Given packages, When reading version in package.json, Then matches /0\.1\.0-alpha/
RED:     test_changeset_scripts_exist() — Given root package.json, When reading scripts, Then has "changeset" and "version-packages"
GREEN:   Install changesets, configure, bump versions
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/changeset-config.test.ts
```

BDD scenarios:
- **Happy path**: Changesets configurado com linked versioning
- **Validation error**: Config com baseBranch errado → changesets warning
- **Edge case**: Package com versão `0.0.1` → bump para `0.1.0-alpha.0`
- **Error scenario**: Changeset sem config.json → cli falha

#### Acceptance Criteria
- [ ] `.changeset/config.json` existe com linked packages
- [ ] Versões são `0.1.0-alpha.0` em ambos packages
- [ ] Scripts `changeset`, `version-packages` no root
- [ ] `pnpm changeset status` funciona sem erros

#### DoD
- [ ] Changesets configurado
- [ ] Versões bumpadas
- [ ] Scripts funcionais

---

### T3.2 — CHANGELOG.md inicial

#### Objective
Criar CHANGELOG.md para ambos packages com o histórico de Ondas 0-9.

#### Evidence
Princípio inquebrável: "Se a mudança não está no changelog, ela não aconteceu." (CLAUDE.md seção 6)

#### Files to edit
```
packages/theo/CHANGELOG.md (NEW) — Changelog do package theo
packages/create-theo/CHANGELOG.md (NEW) — Changelog do create-theo
```

#### Deep file dependency analysis
- Novos arquivos. Changesets os atualiza automaticamente em futuros releases. O conteúdo inicial documenta Ondas 0-9.

#### Deep Dives
- Formato Keep a Changelog com seções Added, Changed, Fixed.
- A seção `[0.1.0-alpha.0]` documenta tudo implementado até agora.
- `[Unreleased]` começa vazio — changeset populará.

#### Tasks
1. Criar `packages/theo/CHANGELOG.md` com histórico de Ondas 0-9
2. Criar `packages/create-theo/CHANGELOG.md`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_theo_changelog_exists() — Given packages/theo, When checking CHANGELOG.md, Then file exists
RED:     test_theo_changelog_has_version() — Given CHANGELOG.md, When reading content, Then contains "0.1.0-alpha.0"
RED:     test_theo_changelog_has_unreleased() — Given CHANGELOG.md, When reading content, Then contains "[Unreleased]"
RED:     test_create_theo_changelog_exists() — Given packages/create-theo, When checking CHANGELOG.md, Then file exists
GREEN:   Create CHANGELOG files
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/changelog.test.ts
```

BDD scenarios:
- **Happy path**: CHANGELOG existe com formato correto
- **Validation error**: CHANGELOG sem [Unreleased] → padrão violado
- **Edge case**: CHANGELOG vazio (apenas headers)
- **Error scenario**: N/A (arquivo estático)

#### Acceptance Criteria
- [ ] `packages/theo/CHANGELOG.md` existe com formato Keep a Changelog
- [ ] `packages/create-theo/CHANGELOG.md` existe
- [ ] Ambos têm `[Unreleased]` e `[0.1.0-alpha.0]`

#### DoD
- [ ] CHANGELOGs criados
- [ ] Formato correto

---

## Phase 4: CI — GitHub Actions

**Objective:** Configurar CI que roda typecheck, tests, e2e, build, e package validation em PRs e pushes para main.

### T4.1 — Workflow CI

#### Objective
Criar GitHub Actions workflow com jobs: lint-typecheck, test (matrix Node 20+22), e2e, package-validation.

#### Evidence
Nenhum CI existe. Código quebrado pode ser pushado para main sem proteção.

#### Files to edit
```
.github/workflows/ci.yml (NEW) — Workflow principal de CI
```

#### Deep file dependency analysis
- Novo arquivo. Não afeta código existente. É triggered por push/PR em main.
- Depende de: `pnpm typecheck`, `pnpm test`, `pnpm test:types`, `pnpm test:e2e`, `pnpm build`, publint, attw, smoke tests.

#### Deep Dives
- **pnpm setup**: `pnpm/action-setup@v4` + `actions/setup-node@v4` com `cache: 'pnpm'`.
- **Matrix**: Node 20 e 22 para test job. Outros jobs rodam apenas Node 22.
- **Playwright**: Precisa de `npx playwright install --with-deps chromium` antes de E2E.
- **Ordem**: typecheck e build primeiro, depois test, depois e2e e validation.
- **frozen-lockfile**: `pnpm install --frozen-lockfile` no CI (obrigatório por pnpm docs).

#### Tasks
1. Criar `.github/workflows/ci.yml`
2. Configurar 4 jobs: lint-typecheck, test, e2e, package-validation
3. Testar localmente com `act` ou push para branch

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_ci_workflow_exists() — Given .github/workflows/, When checking ci.yml, Then file exists
RED:     test_ci_workflow_valid_yaml() — Given ci.yml, When parsing as YAML, Then is valid
RED:     test_ci_has_test_matrix() — Given ci.yml, When reading strategy.matrix, Then includes node-version [20, 22]
RED:     test_ci_has_pnpm_setup() — Given ci.yml, When reading steps, Then includes pnpm/action-setup
RED:     test_ci_has_frozen_lockfile() — Given ci.yml, When reading install step, Then uses --frozen-lockfile
RED:     test_ci_has_build_step() — Given ci.yml, When reading steps, Then includes "pnpm build"
RED:     test_ci_has_publint() — Given ci.yml, When reading steps, Then includes publint
GREEN:   Create ci.yml with all required jobs
REFACTOR: Extract composite action for pnpm setup if repeated
VERIFY:  npx vitest run tests/unit/ci-workflow.test.ts
```

BDD scenarios:
- **Happy path**: CI workflow com 4 jobs, matrix Node 20+22
- **Validation error**: YAML inválido → GitHub rejeita
- **Edge case**: E2E job precisa de playwright install
- **Error scenario**: frozen-lockfile falta → CI pode ter deps desinkadas

#### Acceptance Criteria
- [ ] `.github/workflows/ci.yml` existe e é YAML válido
- [ ] 4 jobs configurados: lint-typecheck, test, e2e, package-validation
- [ ] Test job roda em matrix Node [20, 22]
- [ ] Package validation roda publint, attw, smoke tests
- [ ] Todos os jobs usam `pnpm install --frozen-lockfile`

#### DoD
- [ ] Workflow criado
- [ ] YAML válido
- [ ] Todos os scripts referenciados existem

---

### T4.2 — Workflow Release (changesets)

#### Objective
Criar GitHub Actions workflow para automated releases via changesets.

#### Evidence
Changesets pode automatizar: versão bump → CHANGELOG → npm publish via GitHub Action.

#### Files to edit
```
.github/workflows/release.yml (NEW) — Workflow de release
```

#### Deep file dependency analysis
- Novo arquivo. Triggered por push para main (após merge de PR de changeset).
- Usa `changesets/action@v1` para version bump e publish.
- Depende de: `NPM_TOKEN` secret no GitHub repo.

#### Deep Dives
- **changesets/action**: Detecta se há changesets pendentes. Se sim, cria PR com version bump. Se PR mergeado, publica no npm.
- **Secrets**: `GITHUB_TOKEN` (automático), `NPM_TOKEN` (manual — configurado pelo user no GitHub).
- **Nota**: Este workflow não funcionará até o user configurar `NPM_TOKEN`. O workflow é criado como template.

#### Tasks
1. Criar `.github/workflows/release.yml`
2. Documentar que `NPM_TOKEN` precisa ser configurado como secret

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_release_workflow_exists() — Given .github/workflows/, When checking release.yml, Then file exists
RED:     test_release_workflow_valid_yaml() — Given release.yml, When parsing as YAML, Then is valid
RED:     test_release_has_changesets_action() — Given release.yml, When reading steps, Then includes changesets/action@v1
RED:     test_release_has_npm_token() — Given release.yml, When reading env, Then references NPM_TOKEN secret
GREEN:   Create release.yml
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/ci-workflow.test.ts
```

BDD scenarios:
- **Happy path**: Workflow com changesets action configurado
- **Validation error**: YAML inválido
- **Edge case**: NPM_TOKEN não configurado → publish falha com erro claro
- **Error scenario**: Build falha antes de publish → npm publish não executa

#### Acceptance Criteria
- [ ] `.github/workflows/release.yml` existe e é YAML válido
- [ ] Usa `changesets/action@v1`
- [ ] Referencia `NPM_TOKEN` e `GITHUB_TOKEN`
- [ ] Roda build antes de publish

#### DoD
- [ ] Workflow criado
- [ ] YAML válido

---

## Phase 5: Limpeza e Compatibilidade

**Objective:** Remover arquivos obsoletos, garantir que `.gitignore` ignora `dist/`, e que testes existentes passam.

### T5.1 — Limpeza e .gitignore

#### Objective
Adicionar `dist/` ao .gitignore, remover `bin/` obsoleto, verificar que tudo está limpo.

#### Evidence
Após build, `dist/` é gerado. Não deve ser commitado. `bin/theo.mjs` e `bin/create-theo.mjs` são obsoletos (substituídos por dist/cli/).

#### Files to edit
```
.gitignore (EDIT) — Adicionar dist/
packages/theo/bin/theo.mjs (DELETE) — Substituído por dist/cli/index.js
packages/create-theo/bin/create-theo.mjs (DELETE) — Substituído por dist/cli.js
```

#### Deep file dependency analysis
- `.gitignore`: Previne que `dist/` seja commitado.
- `bin/` dirs: Obsoletos. O package.json `bin` field agora aponta para `dist/`.

#### Deep Dives
- **Verificar** que nenhum teste importa de `bin/`.
- **Verificar** que `pnpm test` passa após remoção.

#### Tasks
1. Adicionar `dist/` ao `.gitignore` root
2. Remover `packages/theo/bin/` directory
3. Remover `packages/create-theo/bin/` directory
4. Verificar que `pnpm test` passa

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_gitignore_has_dist() — Given .gitignore, When reading content, Then contains "dist/"
RED:     test_old_bin_removed_theo() — Given packages/theo, When checking bin/theo.mjs, Then file does NOT exist
RED:     test_old_bin_removed_create_theo() — Given packages/create-theo, When checking bin/create-theo.mjs, Then file does NOT exist
RED:     test_all_tests_pass() — Given cleanup complete, When pnpm test, Then all pass
GREEN:   Update .gitignore, remove old bin files
REFACTOR: None expected
VERIFY:  pnpm test && pnpm test:types
```

BDD scenarios:
- **Happy path**: dist/ ignorado, old bins removidos, tests pass
- **Validation error**: Teste importa de bin/ → falha (catch)
- **Edge case**: dist/ já existe no repo → precisa `git rm --cached`
- **Error scenario**: Remoção de bin/ quebra algo → tests catch

#### Acceptance Criteria
- [ ] `dist/` no .gitignore
- [ ] `packages/theo/bin/` removido
- [ ] `packages/create-theo/bin/` removido
- [ ] `pnpm test` passa
- [ ] `pnpm test:types` passa

#### DoD
- [ ] Limpeza completa
- [ ] Zero regressão

---

### T5.2 — Teste de regressão completo

#### Objective
Garantir que todas as 285+ testes passam após todas as mudanças da Onda 10.

#### Evidence
Onda 10 modifica package.json, adiciona build step, remove bin/ — tudo pode causar regressão.

#### Files to edit
```
Nenhum — apenas execução de testes
```

#### Deep file dependency analysis
- Roda `pnpm test`, `pnpm test:types`, `pnpm typecheck`, `pnpm test:e2e`.
- Verifica que zero `any` em production code.

#### Deep Dives
Nenhum — é verificação, não implementação.

#### Tasks
1. Rodar `pnpm typecheck`
2. Rodar `pnpm test`
3. Rodar `pnpm test:types`
4. Rodar `grep -rn '\bany\b' packages/theo/src/ --include="*.ts"`
5. Rodar `pnpm test:e2e` (se Playwright instalado)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_typecheck_passes() — Given all changes, When pnpm typecheck, Then exit code 0
RED:     test_unit_tests_pass() — Given all changes, When pnpm test, Then all pass (251+ tests)
RED:     test_type_tests_pass() — Given all changes, When pnpm test:types, Then all pass (21+ tests)
RED:     test_zero_any() — Given production code, When grep for 'any', Then zero matches
RED:     test_e2e_passes() — Given all changes, When pnpm test:e2e, Then all pass (13+ tests)
GREEN:   All changes already made — this verifies them
REFACTOR: Fix any regressions found
VERIFY:  pnpm typecheck && pnpm test && pnpm test:types
```

BDD scenarios:
- **Happy path**: Todas as 285 testes passam
- **Validation error**: Regressão em test específico → fix antes de continuar
- **Edge case**: Novo teste adicionado pela Onda 10 → contagem total aumenta
- **Error scenario**: Build quebra type inference → type tests falham

#### Acceptance Criteria
- [ ] `pnpm typecheck` exit code 0
- [ ] `pnpm test` — 251+ testes green
- [ ] `pnpm test:types` — 21+ type tests green
- [ ] Zero `any` em production code
- [ ] `pnpm test:e2e` — 13+ E2E green

#### DoD
- [ ] Zero regressão
- [ ] Todas as contagens iguais ou superiores ao baseline

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Build para npm (dist/) | T0.1, T0.2 | tsup compila TS → JS + .d.ts |
| 2 | Package exports apontam para dist/ | T1.1, T1.2 | Exports map atualizado |
| 3 | CLI binários sem tsx | T0.1, T0.2, T1.1, T1.2 | Shebang node, não tsx |
| 4 | publint validation | T2.1 | publint roda no CI |
| 5 | attw validation | T2.1 | attw valida tipos em todos os modes |
| 6 | Smoke tests de import | T2.2 | Testa imports reais de dist/ |
| 7 | CI GitHub Actions | T4.1 | Workflow com 4 jobs, matrix Node 20+22 |
| 8 | Versioning semântico | T3.1 | Changesets com linked versioning |
| 9 | CHANGELOG.md | T3.2 | Formato Keep a Changelog |
| 10 | Release pipeline | T4.2 | Changesets GitHub Action |
| 11 | .gitignore dist/ | T5.1 | dist/ não commitado |
| 12 | Backward compat (testes passam) | T5.2 | Regressão completa 285+ tests |
| 13 | Limpeza bin/ obsoleto | T5.1 | Old shebang tsx removido |
| 14 | Cross-platform (Linux CI) | T4.1 | ubuntu-latest no CI (D6) |
| 15 | Package export validation | T2.1, T2.2 | publint + attw + smoke |

**Coverage: 15/15 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-5)
- [ ] All unit/integration tests passing (`pnpm test` — 251+)
- [ ] All type tests passing (`pnpm test:types` — 21+)
- [ ] All E2E tests passing (`pnpm test:e2e` — 13+)
- [ ] Zero TypeScript errors (`pnpm typecheck`)
- [ ] Zero `any` in production code
- [ ] `pnpm build` exit code 0 (both packages)
- [ ] `npx publint packages/theo` exit code 0
- [ ] `npx publint packages/create-theo` exit code 0
- [ ] `npx @arethetypeswrong/cli --pack packages/theo` sem errors
- [ ] Smoke tests de import passam
- [ ] `.github/workflows/ci.yml` existe e é válido
- [ ] `.github/workflows/release.yml` existe e é válido
- [ ] Changesets configurado com linked versioning
- [ ] Versões são `0.1.0-alpha.0`
- [ ] CHANGELOG.md existe para ambos packages
- [ ] `dist/` no .gitignore
- [ ] Old `bin/` dirs removidos
- [ ] **Dogfood QA PASS** — `/dogfood full` health score >= 70, zero CRITICAL issues

## Final Phase: Dogfood QA (MANDATORY)

> This phase runs AFTER all implementation phases are complete. The plan is NOT done until dogfood passes.

**Objective:** Validate that the implemented changes work as a real user would experience them, not just as unit tests assert.

### Execution

Run `/dogfood full`. Always full. No shortcuts.

### Acceptance Criteria

- [ ] Health score >= 70/100
- [ ] Zero CRITICAL issues introduced by this plan's changes
- [ ] Zero HIGH issues in commands/features modified by this plan
- [ ] Any pre-existing issues documented (not caused by this plan)

### If Dogfood Fails

1. Identify which issues are caused by this plan's changes vs pre-existing
2. Fix all plan-caused CRITICAL and HIGH issues before declaring the plan complete
3. Re-run `/dogfood full` to confirm fixes
4. Pre-existing issues are logged but do NOT block plan completion
