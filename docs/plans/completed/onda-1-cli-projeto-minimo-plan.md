# Plan: Onda 1 — CLI + Projeto Mínimo Executável

> **Version 1.0** — Este plano implementa a Onda 1 do Theo: o primeiro momento mágico onde `npx create-theo my-app && cd my-app && theo dev` abre "Hello Theo" no browser. Dois deliverables: `create-theo` (scaffolding non-interactive) e `theo dev` (Vite dev server CSR). Sem SSR, sem Express, sem prompts. O resultado é um framework executável que o dev pode usar desde o primeiro comando.

## Context

Onda 0 está completa: 72 unit tests + 11 type tests GREEN, zero TS errors. Existem: `defineConfig`, `loadConfig`, `validateProjectStructure`, `defineRoute`, `defineAction`, `defineMiddleware` — todos como identity functions ou validação. O pacote `create-theo` é um stub vazio. Não existe CLI, dev server, nem template.

Evidência: `pnpm test && pnpm test:types && pnpm typecheck` passam. Mas `npx theo dev` e `npx create-theo my-app` não funcionam — não há bin entry nem implementação.

## Objective

**Done =** `npx create-theo my-app && cd my-app && npx theo dev` abre "Hello Theo" no browser, com 3 testes obrigatórios passando (scaffold, HTTP 200, Playwright "Hello Theo").

Metas:
1. `create-theo` scaffolda projeto com template mínimo
2. `theo dev` sobe Vite dev server com React na porta configurada
3. Vite plugin gera virtual entry-client (dev não toca em entry files)
4. 3 testes obrigatórios Onda 1 GREEN
5. Fixture `onda1-hello-theo/` funcional

## ADRs

### D1 — Sem SSR na Onda 1, CSR only
**Decision:** `theo dev` usa `vite.createServer()` nativo para CSR. Sem Express, sem renderToString, sem hydration.
**Rationale:** SSR adiciona entry-server.tsx, Express middleware mode, hydration mismatch handling — complexidade que não agrega valor para "Hello Theo". CSR via Vite nativo é instantâneo e dá HMR grátis.
**Consequences:** A página é renderizada no client. SEO não funciona (aceitável — SSR vem na Onda 2). A stack é simples: Vite + React plugin + virtual module.

### D2 — Virtual module `/@theo/entry-client`
**Decision:** O bootstrap React é um virtual module resolvido pelo Vite plugin, não um arquivo no template do usuário.
**Rationale:** O dev não precisa saber como o React é inicializado. O `index.html` referencia `/@theo/entry-client`, e o plugin gera o código que importa `app/page.tsx` e monta no `#root`. Padrão usado por Astro e SvelteKit.
**Consequences:** O dev nunca toca no entry file. O plugin precisa usar `React.createElement()` (não JSX) porque virtual modules com prefix `\0` podem não passar pelo transform do `@vitejs/plugin-react`.

### D3 — `create-theo` non-interactive, template copy
**Decision:** Scaffolding copia template directory, renomeia `_gitignore` → `.gitignore`, substitui `{{name}}` em `package.json.tmpl`, e roda install. Sem prompts.
**Rationale:** Theo é opinativo como Rails. TypeScript always, um template, zero perguntas. create-next-app pergunta 8 coisas — Theo decide por você.
**Consequences:** Sem opção JS/TS, sem Tailwind toggle, sem router choice. Templates opcionais vêm na Onda 9.

### D4 — CLI via `cac`, bin via `tsx` shim
**Decision:** O CLI usa `cac` para parsing. O bin entry é um shim `.mjs` que usa `tsx` para executar TypeScript sem build step.
**Rationale:** `cac` é usado pelo Vite (dependency natural, zero deps, 4 APIs). `tsx` permite executar `.ts` direto — sem build step no monorepo (build real vem na Onda 6).
**Consequences:** `tsx` é devDependency do root workspace. O bin shim é `#!/usr/bin/env tsx` + import.

### D5 — Package manager detection via `npm_config_user_agent`
**Decision:** Detectar package manager via `process.env.npm_config_user_agent` (pattern Next.js/create-vite).
**Rationale:** Confiável, zero deps, funciona com npm/pnpm/yarn/bun. Default: npm.
**Consequences:** Funciona quando invocado via `npx`/`pnpm dlx`/`yarn dlx`/`bunx`. Se executado diretamente sem pkg manager, defaulta para npm.

## Dependency Graph

```
Phase 0 (deps + bin + config)
    |
    +----------+-----------+
    |                      |
Phase 1                 Phase 3
(template files)        (Vite plugin)
    |                      |
Phase 2                 Phase 4
(create-theo CLI)       (theo dev CLI)
    |                      |
    +----------+-----------+
               |
           Phase 5
    (integration + E2E tests)
```

- **Phase 0** bloqueia tudo
- **Phase 1** e **Phase 3** paralelos
- **Phase 2** depende de Phase 1
- **Phase 4** depende de Phase 3
- **Phase 5** depende de tudo

---

## Phase 0: Dependencies + Bin Setup

**Objective:** Instalar dependências, configurar bin entries, e preparar Playwright.

### T0.1 — Update package.json files + install

#### Objective
Adicionar cac, vite, @vitejs/plugin-react ao `theo`; cross-spawn ao `create-theo`; tsx e playwright ao root.

#### Evidence
Sem essas deps, nenhum código da Onda 1 pode ser escrito ou executado.

#### Files to edit
```
packages/theo/package.json (EDIT) — Add dependencies, bin, peer deps, exports
packages/create-theo/package.json (EDIT) — Add dependencies, bin, src entry
package.json (EDIT) — Add tsx, @playwright/test devDeps
```

#### Deep file dependency analysis
- `packages/theo/package.json`: Todo import de `cac`, `vite`, `@vitejs/plugin-react` depende deste arquivo. O campo `bin` habilita `npx theo dev`.
- `packages/create-theo/package.json`: O campo `bin` habilita `npx create-theo my-app`. Import de `cross-spawn` depende daqui.
- `package.json` root: `tsx` é usado pelos bin shims para executar TypeScript. Playwright é usado pelos E2E tests.

#### Deep Dives
- **bin shim pattern**: `#!/usr/bin/env tsx` + `import '../src/cli.ts'`. tsx registra o TypeScript loader automaticamente.
- **Vite como dependency (não devDependency)**: O `theo` package precisa de vite em runtime para `theo dev`.
- **React como peerDependency**: O usuário instala React no seu projeto. Theo não embute React.

#### Tasks
1. Editar `packages/theo/package.json`: add deps, bin, peerDeps (react, react-dom), exports `./vite-plugin`
2. Editar `packages/create-theo/package.json`: add deps (cross-spawn), bin, types dep
3. Editar root `package.json`: add tsx, @playwright/test, cross-spawn types
4. Criar `packages/theo/bin/theo.mjs` (NEW)
5. Criar `packages/create-theo/bin/create-theo.mjs` (NEW)
6. Rodar `pnpm install`
7. Criar `playwright.config.ts` (NEW)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     verify_pnpm_install_succeeds() — Given updated package.json files, When pnpm install, Then exit code 0
RED:     verify_theo_bin_exists() — Given bin/theo.mjs, When checking file, Then file exists and is executable
RED:     verify_create_theo_bin_exists() — Given bin/create-theo.mjs, When checking file, Then file exists
RED:     verify_tsx_available() — Given tsx in devDeps, When npx tsx --version, Then prints version
GREEN:   Create all files, run pnpm install
REFACTOR: None expected
VERIFY:  pnpm install && ls packages/theo/bin/theo.mjs
```

BDD scenarios:
- **Happy path**: `pnpm install` resolve todas as deps sem erros
- **Validation error**: Se package.json tem JSON inválido, pnpm falha
- **Edge case**: Workspace com novo bin entry não conflita com existentes
- **Error scenario**: Se tsx não instala, bin shim não executa

#### Acceptance Criteria
- [ ] `pnpm install` exit code 0
- [ ] `packages/theo/bin/theo.mjs` existe
- [ ] `packages/create-theo/bin/create-theo.mjs` existe
- [ ] `npx tsx --version` funciona

#### DoD
- [ ] Todas as deps instaladas
- [ ] Bin shims criados
- [ ] Playwright config existe

---

## Phase 1: Template Files

**Objective:** Criar o template default que `create-theo` copiará para novos projetos.

### T1.1 — Default template

#### Objective
Criar todos os arquivos do template em `packages/create-theo/templates/default/`.

#### Evidence
SOTA research (D2) definiu a estrutura mínima. Sem template, scaffolding não tem o que copiar.

#### Files to edit
```
packages/create-theo/templates/default/app/page.tsx (NEW) — Hello Theo page
packages/create-theo/templates/default/app/layout.tsx (NEW) — Root layout
packages/create-theo/templates/default/server/routes/health.ts (NEW) — Health check route
packages/create-theo/templates/default/public/.gitkeep (NEW) — Empty dir placeholder
packages/create-theo/templates/default/index.html (NEW) — Vite HTML shell with virtual module
packages/create-theo/templates/default/theo.config.ts (NEW) — defineConfig({})
packages/create-theo/templates/default/tsconfig.json (NEW) — TypeScript config
packages/create-theo/templates/default/_gitignore (NEW) — Renamed to .gitignore during copy
packages/create-theo/templates/default/package.json.tmpl (NEW) — Template with {{name}}
```

#### Deep file dependency analysis
- `index.html`: Referencia `/@theo/entry-client` — virtual module que Phase 3 resolve. Sem o plugin, essa tag `<script>` dá 404.
- `app/page.tsx`: Importado pelo virtual module em runtime. É o componente que aparece no browser.
- `package.json.tmpl`: Tem `{{name}}` placeholder. Phase 2 faz a substituição.

#### Deep Dives
- **`index.html`** usa `<script type="module" src="/@theo/entry-client"></script>`. Vite intercepta requests para `/` e serve este HTML. O script tag carrega o virtual module.
- **`layout.tsx`** NÃO renderiza `<html>/<body>` — CSR mode, o HTML shell está em `index.html`. Layout é apenas wrapper React.
- **`package.json.tmpl`** tem `"theo": "workspace:*"` para dev local, mas no publish será `"theo": "^0.0.1"`. Para Onda 1 (monorepo dev only), `workspace:*` funciona.

#### Tasks
1. Criar diretórios de template
2. Criar todos os 9 arquivos

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     verify_template_files_exist() — Given template dir, When listing files, Then all 9 files exist
RED:     verify_page_has_hello_theo() — Given app/page.tsx, When reading content, Then contains 'Hello Theo'
RED:     verify_index_html_has_virtual_module() — Given index.html, When reading content, Then contains '/@theo/entry-client'
RED:     verify_package_tmpl_has_placeholder() — Given package.json.tmpl, When reading content, Then contains '{{name}}'
GREEN:   Create all template files
REFACTOR: None expected
VERIFY:  ls packages/create-theo/templates/default/ && grep 'Hello Theo' packages/create-theo/templates/default/app/page.tsx
```

BDD scenarios:
- **Happy path**: Todos os 9 arquivos existem com conteúdo correto
- **Validation error**: N/A (static files)
- **Edge case**: `_gitignore` tem underscore prefix (not `.gitignore`)
- **Error scenario**: Se template dir não existe, scaffolding falha (testado na Phase 2)

#### Acceptance Criteria
- [ ] 9 arquivos criados em `packages/create-theo/templates/default/`
- [ ] `page.tsx` contém "Hello Theo"
- [ ] `index.html` referencia `/@theo/entry-client`
- [ ] `package.json.tmpl` tem `{{name}}`

#### DoD
- [ ] Todos os arquivos criados
- [ ] Verificação manual do conteúdo

---

## Phase 2: create-theo CLI

**Objective:** `npx create-theo my-app` scaffolda projeto completo.

### T2.1 — Scaffold function + pkg-manager detection

#### Objective
Implementar `scaffold()`, `detectPkgManager()`, e `runInstall()`.

#### Evidence
Teste obrigatório 1: "create-theo my-app deve gerar my-app/package.json, my-app/app/page.tsx, my-app/theo.config.ts".

#### Files to edit
```
packages/create-theo/src/index.ts (NEW) — scaffold() function
packages/create-theo/src/pkg-manager.ts (NEW) — detectPkgManager()
packages/create-theo/src/install.ts (NEW) — runInstall() via cross-spawn
packages/create-theo/src/cli.ts (NEW) — main() CLI entry
tests/unit/create-theo-scaffold.test.ts (NEW) — Scaffold tests
tests/unit/create-theo-pkg-manager.test.ts (NEW) — Pkg manager tests
```

#### Deep file dependency analysis
- `index.ts`: Exporta `scaffold()`. Usa `node:fs` (`cpSync`, `readFileSync`, `writeFileSync`, `renameSync`, `unlinkSync`).
- `pkg-manager.ts`: Exporta `detectPkgManager()`. Lê `process.env.npm_config_user_agent`.
- `install.ts`: Exporta `runInstall()`. Usa `cross-spawn` para spawn child process.
- `cli.ts`: Orquestra: parse args → scaffold → detect pkg manager → install → print success.

#### Deep Dives
- **`cpSync` com `recursive: true`**: Disponível desde Node 16.7. Copia todo o template directory de uma vez. Mais simples que glob-based copy.
- **Rename strategy**: Após copy, `renameSync('_gitignore', '.gitignore')`. Depois `readFileSync('package.json.tmpl')` → replace `{{name}}` → `writeFileSync('package.json')` → `unlinkSync('package.json.tmpl')`.
- **Validation**: Se target dir existe e não está vazio, throw error. Usa `readdirSync` para checar.
- **Install**: `cross-spawn.sync(pkgManager, ['install'], { cwd: targetDir, stdio: 'inherit' })`. Retorna exit code.

#### Tasks
1. Escrever testes RED para scaffold
2. Escrever testes RED para detectPkgManager
3. Implementar `pkg-manager.ts` (GREEN)
4. Implementar `index.ts` com `scaffold()` (GREEN)
5. Implementar `install.ts` (GREEN)
6. Implementar `cli.ts` (GREEN)
7. Verificar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

**Scaffold tests:**
```
RED:     test_scaffold_creates_all_files() — Given empty temp dir, When scaffold(dir, 'my-app'), Then app/page.tsx, theo.config.ts, package.json, index.html all exist
RED:     test_scaffold_renames_gitignore() — Given scaffold completes, When checking target, Then .gitignore exists and _gitignore does not
RED:     test_scaffold_replaces_name() — Given scaffold(dir, 'my-cool-app'), When reading package.json, Then name is 'my-cool-app' and no '{{name}}' remains
RED:     test_scaffold_rejects_nonempty_dir() — Given dir with existing files, When scaffold, Then throws error about directory not being empty
RED:     test_scaffold_validates_project_name() — Given name 'My App!', When scaffold, Then throws error about invalid project name (EC-1)
RED:     test_scaffold_throws_on_missing_template() — Given template dir does not exist, When scaffold, Then throws clear error about missing template (EC-5)
GREEN:   Implement scaffold() with cpSync + rename + template replace + name validation
REFACTOR: Extract file operations helpers if >20 lines
VERIFY:  npx vitest run tests/unit/create-theo-scaffold.test.ts
```

**Pkg manager tests:**
```
RED:     test_detects_pnpm() — Given npm_config_user_agent='pnpm/9.15.0', When detectPkgManager, Then 'pnpm'
RED:     test_detects_yarn() — Given npm_config_user_agent='yarn/4.0', When detectPkgManager, Then 'yarn'
RED:     test_detects_bun() — Given npm_config_user_agent='bun/1.0', When detectPkgManager, Then 'bun'
RED:     test_defaults_to_npm() — Given no npm_config_user_agent, When detectPkgManager, Then 'npm'
GREEN:   Implement detectPkgManager
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/create-theo-pkg-manager.test.ts
```

BDD scenarios:
- **Happy path**: Scaffold cria estrutura completa com nome correto
- **Validation error**: Dir não-vazio rejeitado com mensagem clara
- **Edge case**: Nome com hífens e pontos (`my-cool.app`) funciona
- **Error scenario**: Template dir não encontrado lança erro claro; nome inválido rejeitado (EC-1); sem argumento mostra usage (EC-2)

#### Acceptance Criteria
- [ ] `scaffold()` cria todos os arquivos esperados
- [ ] `_gitignore` renomeado para `.gitignore`
- [ ] `{{name}}` substituído em package.json
- [ ] Dir não-vazio rejeitado
- [ ] `detectPkgManager()` detecta 4 package managers
- [ ] 8 testes unit GREEN

#### DoD
- [ ] Testes GREEN
- [ ] `pnpm typecheck` passa

---

## Phase 3: Vite Plugin (theoPlugin)

**Objective:** Plugin Vite que resolve virtual module `/@theo/entry-client` gerando bootstrap React.

### T3.1 — theoPlugin implementation

#### Objective
Criar `theoPlugin()` que resolve e carrega o virtual module.

#### Evidence
SOTA research D2 e D6: entry-client é virtual module, usa `React.createElement` (não JSX) para evitar transform issues.

#### Files to edit
```
packages/theo/src/vite-plugin/index.ts (NEW) — theoPlugin function
packages/theo/src/index.ts (EDIT) — Add theoPlugin export
tests/unit/vite-plugin.test.ts (NEW) — Plugin unit tests
```

#### Deep file dependency analysis
- `vite-plugin/index.ts`: Exporta `theoPlugin()`. Retorna Vite `Plugin` object com `resolveId` e `load` hooks.
- `index.ts`: Re-exporta `theoPlugin`. Usado pelo `theo dev` command.
- Downstream: `cli/commands/dev.ts` (Phase 4) importa `theoPlugin`.

#### Deep Dives
- **Virtual module convention**: ID `/@theo/entry-client` → resolved ID `\0@theo/entry-client`. O prefix `\0` indica para Vite/Rollup que é virtual (não tenta ler do filesystem).
- **Código gerado**: Usa `React.createElement(Page)` em vez de `<Page />` porque virtual modules com `\0` prefix podem não passar pelo JSX transform.
- **Path resolution**: `resolve(projectRoot, 'app/page.tsx')` gera absolute path. Vite resolve corretamente.

#### Tasks
1. Escrever testes RED
2. Criar `packages/theo/src/vite-plugin/index.ts`
3. Adicionar export em `packages/theo/src/index.ts`
4. Verificar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_resolves_virtual_module() — Given theoPlugin(), When resolveId('/@theo/entry-client'), Then returns '\0@theo/entry-client'
RED:     test_loads_virtual_module() — Given theoPlugin('/tmp/project'), When load('\0@theo/entry-client'), Then code contains 'createRoot' and 'app/page.tsx'
RED:     test_ignores_non_virtual_resolve() — Given theoPlugin(), When resolveId('./some-file.ts'), Then returns undefined
RED:     test_ignores_non_virtual_load() — Given theoPlugin(), When load('./some-file.ts'), Then returns undefined
RED:     test_load_uses_forward_slashes() — Given theoPlugin on any OS, When load virtual module, Then import path uses forward slashes only (EC-3)
GREEN:   Implement theoPlugin with normalizePath for cross-platform
REFACTOR: Extract constants (VIRTUAL_ENTRY_ID, RESOLVED_VIRTUAL_ID)
VERIFY:  npx vitest run tests/unit/vite-plugin.test.ts
```

BDD scenarios:
- **Happy path**: Virtual module resolvido e carregado com código React correto
- **Validation error**: N/A (plugin não valida, Vite faz)
- **Edge case**: Módulos não-virtuais retornam undefined (passthrough)
- **Error scenario**: N/A (plugin é passivo)

#### Acceptance Criteria
- [ ] `resolveId` resolve `/@theo/entry-client`
- [ ] `load` retorna código com `createRoot` e path para `app/page.tsx`
- [ ] Módulos não-virtuais passam transparente
- [ ] 4 testes GREEN

#### DoD
- [ ] Testes GREEN
- [ ] Exportado em `packages/theo/src/index.ts`
- [ ] `pnpm typecheck` passa

---

## Phase 4: theo dev Command

**Objective:** `theo dev` carrega config, valida estrutura, sobe Vite dev server com React + theoPlugin.

### T4.1 — Dev command + CLI entry

#### Objective
Implementar `devCommand()`, `startDevServer()`, e CLI entry com `cac`.

#### Evidence
Teste obrigatório 2: "theo dev deve responder HTTP 200 em /".

#### Files to edit
```
packages/theo/src/cli/index.ts (NEW) — cac CLI entry point
packages/theo/src/cli/commands/dev.ts (NEW) — devCommand + startDevServer
fixtures/onda1-hello-theo/ (NEW) — Fixture com index.html + page.tsx para testes
tests/unit/cli-dev.test.ts (NEW) — Dev server unit tests
```

#### Deep file dependency analysis
- `cli/index.ts`: Entry point do bin shim. Importa `cac`, registra commands. `main()` exportada e chamada pelo shim.
- `cli/commands/dev.ts`: Importa `loadConfig`, `validateProjectStructure`, `theoPlugin`, `createServer` do vite, `react` plugin. Orquestra o startup.
- `fixtures/onda1-hello-theo/`: Fixture completa para testes de dev server. Tem `index.html` (que referencia `/@theo/entry-client`) e `app/page.tsx`.

#### Deep Dives
- **`startDevServer()` separado de `devCommand()`**: `devCommand` é a action do CLI (parse options do cac). `startDevServer(cwd, options)` é a lógica testável que retorna `ViteDevServer`. Os testes chamam `startDevServer` diretamente.
- **Cleanup em testes**: Cada teste que starta server DEVE chamar `server.close()` no afterEach. Senão, porta fica aberta e test runner não termina.
- **Port 0 para testes**: Usar `port: 0` nos testes para auto-assign port e evitar conflitos. Ler porta real via `server.httpServer.address()`.

#### Tasks
1. Criar fixture `fixtures/onda1-hello-theo/` com todos os arquivos
2. Escrever testes RED
3. Criar `packages/theo/src/cli/commands/dev.ts`
4. Criar `packages/theo/src/cli/index.ts`
5. Verificar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_dev_server_responds_200() — Given onda1-hello-theo fixture, When startDevServer and fetch /, Then status 200
RED:     test_dev_server_custom_port() — Given port 0, When startDevServer, Then server listens on auto-assigned port
RED:     test_dev_server_rejects_invalid_structure() — Given dir without app/, When startDevServer, Then throws TheoProjectError
RED:     test_dev_server_serves_html() — Given running server, When fetch /, Then Content-Type includes text/html
GREEN:   Implement devCommand and startDevServer
REFACTOR: Extract server creation to helper if complex
VERIFY:  npx vitest run tests/unit/cli-dev.test.ts
```

BDD scenarios:
- **Happy path**: Dev server sobe e responde 200 com HTML
- **Validation error**: Projeto inválido (sem app/) rejeitado com TheoProjectError
- **Edge case**: Port 0 auto-assigns e server reports correct port
- **Error scenario**: Config inválida lança TheoConfigError

#### Acceptance Criteria
- [ ] `startDevServer(fixtureDir)` retorna ViteDevServer funcional
- [ ] `fetch('/')` retorna status 200 com Content-Type text/html
- [ ] Projeto inválido lança TheoProjectError
- [ ] 4 testes GREEN

#### DoD
- [ ] Testes GREEN
- [ ] `pnpm typecheck` passa
- [ ] Fixture `onda1-hello-theo/` criada

---

## Phase 5: Integration + E2E Tests

**Objective:** Os 3 testes obrigatórios da Onda 1 e E2E com Playwright.

### T5.1 — Integration tests

#### Objective
Testes de integração para scaffold e dev server.

#### Evidence
ONDAS.md define 3 testes obrigatórios para Onda 1.

#### Files to edit
```
tests/integration/onda1-mandatory.test.ts (NEW) — 3 testes obrigatórios
tests/integration/dev-server.test.ts (NEW) — Dev server integration
```

#### Deep file dependency analysis
- `onda1-mandatory.test.ts`: Importa `scaffold` de `create-theo`, `startDevServer` de `theo`. Usa fixtures e temp dirs.
- `dev-server.test.ts`: Starta server na fixture, faz HTTP requests, valida respostas.

#### Deep Dives
- **Timeout**: Dev server integration tests precisam de timeout maior (10s) porque Vite startup pode levar alguns segundos.
- **Cleanup**: `afterAll` DEVE fechar o server para liberar porta.
- **Teste 3 (Playwright)**: O teste de "Hello Theo" no browser precisa de React rendering — como é CSR, o HTML initial é `<div id="root"></div>`. O conteúdo "Hello Theo" aparece APÓS JavaScript executar. Playwright espera automaticamente (locator assertion), mas um fetch simples no HTML não vai ter o conteúdo. Por isso Teste 3 é E2E-only.

#### Tasks
1. Escrever `tests/integration/onda1-mandatory.test.ts` com Testes 1 e 2
2. Escrever `tests/integration/dev-server.test.ts` com testes HTTP
3. Verificar testes

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

**Testes obrigatórios:**
```
RED:     test_scaffold_generates_structure() — Given temp dir, When scaffold, Then package.json + app/page.tsx + theo.config.ts exist
RED:     test_dev_server_responds_200() — Given onda1-hello-theo fixture, When startDevServer + fetch /, Then status 200
RED:     test_scaffolded_project_validates() — Given scaffolded project, When validateProjectStructure, Then no throw
RED:     test_virtual_module_serves_js() — Given running server, When fetch /@theo/entry-client, Then response is JavaScript
GREEN:   All tests should pass if Phases 1-4 are complete
REFACTOR: None expected
VERIFY:  npx vitest run tests/integration/
```

BDD scenarios:
- **Happy path**: Scaffold cria projeto que dev server pode servir
- **Validation error**: N/A (integration validates happy path)
- **Edge case**: Virtual module serve como JavaScript (não 404)
- **Error scenario**: N/A (coberto em unit tests)

#### Acceptance Criteria
- [ ] Teste 1 (scaffold) GREEN
- [ ] Teste 2 (dev server 200) GREEN
- [ ] Virtual module serve JavaScript
- [ ] Scaffolded project passa `validateProjectStructure`

#### DoD
- [ ] Integration tests GREEN
- [ ] Timeout configurado para server tests

---

### T5.2 — Playwright E2E test

#### Objective
Teste 3: Playwright acessa `/` e encontra "Hello Theo".

#### Evidence
ONDAS.md Teste 3: "Playwright deve acessar / e encontrar Hello Theo".

#### Files to edit
```
tests/e2e/hello-theo.spec.ts (NEW) — Playwright E2E test
playwright.config.ts (NEW se não criado em Phase 0)
```

#### Deep file dependency analysis
- `hello-theo.spec.ts`: Usa `@playwright/test`. Navega para localhost, busca `h1` com texto "Hello Theo".
- `playwright.config.ts`: Define `webServer` que starta `theo dev` na fixture antes dos testes.

#### Deep Dives
- **`webServer` no Playwright**: Starta o dev server automaticamente antes dos E2E tests. Usa `command: 'npx tsx packages/theo/src/cli/index.ts dev'` com `cwd: 'fixtures/onda1-hello-theo'`.
- **CSR rendering**: O HTML servido tem `<div id="root"></div>` vazio. O conteúdo "Hello Theo" aparece após JavaScript executar. Playwright `locator('h1').toHaveText('Hello Theo')` espera automaticamente.

#### Tasks
1. Configurar `playwright.config.ts`
2. Escrever `tests/e2e/hello-theo.spec.ts`
3. Instalar Playwright browsers: `npx playwright install chromium`
4. Verificar teste

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_renders_hello_theo() — Given dev server running, When navigate to /, Then h1 contains 'Hello Theo'
RED:     test_page_title() — Given dev server running, When navigate to /, Then page title is 'Theo App'
RED:     test_root_element_exists() — Given dev server running, When navigate to /, Then #root exists
RED:     test_no_console_errors() — Given dev server running + console listener, When navigate to /, Then zero console errors
GREEN:   All tests pass if virtual module + React render correctly
REFACTOR: None expected
VERIFY:  npx playwright test
```

BDD scenarios:
- **Happy path**: h1 "Hello Theo" renderizado
- **Validation error**: N/A
- **Edge case**: Título da página é "Theo App"
- **Error scenario**: Zero console errors (React hydration OK)

#### Acceptance Criteria
- [ ] Playwright test GREEN
- [ ] h1 contém "Hello Theo"
- [ ] Zero console errors
- [ ] Playwright browsers instalados

#### DoD
- [ ] E2E test GREEN
- [ ] `npx playwright test` exit code 0

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | create-theo scaffolding | T1.1, T2.1 | Template + scaffold function |
| 2 | Package manager detection | T2.1 | detectPkgManager via user_agent |
| 3 | Dependency install | T2.1 | runInstall via cross-spawn |
| 4 | theo dev command | T4.1 | cac CLI + Vite createServer |
| 5 | Vite plugin (entry-client) | T3.1 | Virtual module com React.createElement |
| 6 | Template default | T1.1 | 9 arquivos em templates/default/ |
| 7 | Teste 1 — Scaffold | T5.1 | Integration test |
| 8 | Teste 2 — Dev server 200 | T5.1 | Integration test |
| 9 | Teste 3 — Hello Theo | T5.2 | Playwright E2E |
| 10 | Fixture onda1-hello-theo | T4.1 | Fixture com index.html + page.tsx |
| 11 | Bin entries | T0.1 | tsx shims |

**Coverage: 11/11 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (0-5)
- [ ] All unit tests passing (`pnpm test`)
- [ ] All integration tests passing
- [ ] Playwright E2E test passing (`npx playwright test`)
- [ ] Zero TypeScript errors (`pnpm typecheck`)
- [ ] Zero `any` in production code
- [ ] 3 testes obrigatórios Onda 1 GREEN
- [ ] `create-theo my-app` gera projeto válido
- [ ] `theo dev` sobe server que responde 200
- [ ] Playwright vê "Hello Theo"
- [ ] Onda 0 testes continuam passando (backward compat)

## Final Phase: Dogfood QA (MANDATORY)

> Onda 1 é a primeira onda com dogfood real.

### Execution

Validação manual (dev):
1. `cd /tmp && npx create-theo test-app` — scaffolda projeto
2. `cd test-app && npx theo dev` — sobe dev server
3. Abrir `http://localhost:3000` — ver "Hello Theo"
4. Editar `app/page.tsx` — HMR atualiza browser
5. `pnpm test` — todos os testes GREEN
6. `npx playwright test` — E2E GREEN

### Acceptance Criteria

- [ ] Projeto scaffoldado sem erros
- [ ] Dev server sobe e responde
- [ ] "Hello Theo" visível no browser
- [ ] HMR funciona (editar page.tsx atualiza browser)
- [ ] Todos os testes passam
- [ ] Zero CRITICAL issues
