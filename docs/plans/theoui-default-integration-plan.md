# Plan: TheoUI Default Integration

> **Version 1.0** — Faz `@usetheo/ui` ser o padrão visual do TheoKit. `npm create theokit my-app` produz um projeto com TheoUI já instalado, CSS auto-importado, `<ThemeProvider />` wrappado no entry-client e um scaffold que mostra uma agent surface real (timeline + composer + stream), não um "Hello Theo" cru. Quem não quer TheoUI passa `--bare`. Os dois projetos foram criados juntos para AI agents — esta integração formaliza a relação. Resultado: time-to-agent-UI cai de "horas de wiring" para "30 segundos do `create`".

## Context

TheoKit e `@usetheo/ui` são irmãos no monorepo `usetheo/` (referência em `../../CLAUDE.md`):

- **TheoKit** (`packages/theo/`, `packages/create-theo/`) — meta-framework Vite + React 19 para "build the app your agent lives in".
- **`@usetheo/ui`** (`/home/paulo/Projetos/usetheo/theo-ui/`) — React component library, 102 componentes com foco em AI-agent surfaces e PaaS dashboards. Peer-dep React only. Framework-agnostic.

Hoje a integração é zero: `create-theokit` instala apenas `theokit` + `react`. User que quer TheoUI faz `pnpm add @usetheo/ui`, importa CSS manual, wrap `<ThemeProvider />` manual, escreve scaffold do zero. Atrito desnecessário dado que os dois foram **criados para trabalhar juntos**.

Evidência:
- TheoUI README: *"Built for AI agents. Primitives for skills, cron jobs, permission matrices, MCP servers, memory editing, hook config, audit logs, model cards, token usage charts, sub-agent dispatch."*
- TheoKit PITCH/CLAUDE.md: *"Build the app your agent lives in."*
- Monorepo CLAUDE.md cross-rule 4: *"PaaS is the product. OSS is the funnel."* — funil completo precisa fluir do `create` ao deploy sem decisões de UI.

## Objective

**Done = `npm create theokit my-app && cd my-app && theokit dev` mostra uma agent UI funcional sem qualquer decisão do usuário; `--bare` flag faz scaffold sem TheoUI.**

Metas mensuráveis:

- [ ] Template `default` lista `@usetheo/ui` em `dependencies`
- [ ] `<ThemeProvider />` envolve `<RouterProvider />` no entry-client gerado pelo TheoKit Vite plugin
- [ ] CSS imports (`styles.css`, `fonts.css`) auto-injetados pelo vite-plugin (consumer não escreve)
- [ ] Default `app/page.tsx` mostra `<AgentTimeline />` + `<AgentComposer />` + `<AgentStream />` num layout funcional
- [ ] `create-theokit --bare my-app` produz scaffold sem TheoUI (mesmo Hello Theo de hoje)
- [ ] `theo.config.ts` aceita opcional `ui: false` (default = on) para apps existentes opt-out
- [ ] `defineAgentEndpoint` helper em `theokit/server` casa com `<AgentStream>` do TheoUI via tipos compartilhados
- [ ] `useAgentStream` hook em `theokit/client` consome o endpoint e expõe eventos
- [ ] Type `AgentEvent` é re-exportado de `@usetheo/ui/types` pelo TheoKit — single source of truth
- [ ] Dogfood QA ≥ 85 com 4 checks novos (TheoUI instalado, CSS injetado, ThemeProvider presente, agent scaffold renderiza)

## ADRs

### D1 — TheoUI é dep DIRETA do template default, não peer-dep do `theokit`

**Decisão:** `@usetheo/ui` entra como `dependencies` no `package.json.tmpl` do template `default`. Não é peer-dep do `theokit` core. Apps gerados com `--bare` não recebem.

**Racional:** Peer-dep no core obrigaria TODO usuário a instalar TheoUI, mesmo quando indesejado (e.g., user que vai usar UI custom ou Tremor). Dep no template é opt-in por escolha de template, não obrigatório. Mantém `theokit` package leve e framework-agnostic no que toca o lado UI.

**Consequências:**
- Apps gerados com template default têm TheoUI; apps `--bare` não
- Atualizações de `@usetheo/ui` são responsabilidade do app gerado (não auto-sync com versão de `theokit`)
- Documentar versionamento: TheoKit `0.2.x` testado contra `@usetheo/ui 0.1.x`

### D2 — Vite plugin auto-injeta CSS e ThemeProvider quando detecta TheoUI instalado

**Decisão:** `theoPlugin` ao boot do `configResolved` checa `node_modules/@usetheo/ui` existence. Quando presente E `config.ui !== false`, gera `entry-client` com:
1. `import '@usetheo/ui/styles.css'`
2. `import '@usetheo/ui/fonts.css'` (ou `fonts-cdn.css` conforme `config.ui.fonts`)
3. Wrap `RouterProvider` em `<ThemeProvider theme={config.ui.theme ?? 'violet-forge'}>`

**Racional:** Detection-based ao invés de flag explicit é a versão mais "magic" — user não precisa setar nada. Combinado com `config.ui = false` opt-out, atende dev/prod parity sem inflar o config.

**Consequências:**
- Apps com TheoUI instalado mas que NÃO querem auto-wrap setam `ui: false`
- Apps sem TheoUI instalado (e.g., `--bare` ou removido depois) não pagam custo — detection retorna false
- O entry-client gerado tem 3 linhas a mais quando TheoUI presente; backward-compatible

### D3 — `AgentEvent` type mora em `@usetheo/ui/types`, TheoKit re-exporta

**Decisão:** O shape `AgentEvent` (e variantes: tool_call, tool_result, message, handoff, error) é definido no `@usetheo/ui/types` (já existe lá). TheoKit `defineAgentEndpoint` e `useAgentStream` consomem via re-export: `export type { AgentEvent } from '@usetheo/ui/types'`.

**Racional:** O shape é primariamente visual — quem desenha define. Single source of truth. Evita dois lugares atualizando o mesmo enum. Permite TheoUI evoluir variantes sem mudar TheoKit.

**Consequências:**
- TheoKit ganha dep transitiva sobre `@usetheo/ui/types` em `theokit/server` e `theokit/client`
- Tipo `AgentEvent` é leve (~50 LOC) — não inflará bundle
- Quem usa `theokit/server` sem TheoUI install ainda tem tipo disponível via type-only import (não vai pra runtime)

### D4 — `defineAgentEndpoint` é açúcar sobre `defineRoute`, não substitui

**Decisão:** `defineAgentEndpoint({ input, handler })` é um wrapper que retorna um `RouteConfig` válido. O handler é um async generator que produz `AgentEvent`s. Wrapper traduz para SSE ou WS conforme `config.agent.transport ?? 'sse'`.

**Racional:** Não inventar nova primitive. `defineRoute` já existe, é testado, integrado com plugin system, transformer, etc. Wrapper só adapta async generator → stream response.

**Consequências:**
- Apps existentes não migram; `defineRoute` continua funcionando
- Agent endpoints opt-in via `defineAgentEndpoint`
- Pode evoluir para WS depois sem breaking change (transport interno)

### D5 — `--bare` flag remove TheoUI dep mas mantém todo o resto do template default

**Decisão:** `--bare` é uma transformação no template default que: (a) remove `@usetheo/ui` de `dependencies`, (b) substitui `app/page.tsx` por um Hello Theo cru, (c) substitui `app/layout.tsx` por wrapper neutro. Outros templates (`dashboard`, `postgres`, etc.) ignoram `--bare` (são templates separados).

**Racional:** Manter `default` como single source of truth. `--bare` é variação programática, não template duplicado.

**Consequências:**
- `templates/default/` cresce com 2-3 variantes (default agent surface; --bare hello)
- `cli.ts` ganha branch `--bare` que aplica transformação pós-scaffold

### D7 — `useAgentStream` usa `fetch + ReadableStream`, não `EventSource` (EC-3)

**Decisão:** O hook usa `fetch(path, { method: 'POST', body, signal })` + `response.body.getReader()` para ler SSE chunks manualmente. NÃO usa a Web API `EventSource`.

**Racional:** `EventSource` browser API é GET-only — não envia body. Agent endpoints recebem `{ message }` (e outros payloads); POST + body é obrigatório. `fetch` + `ReadableStream` é Web Standard, suporta POST, body, signal cancelation. ~30 LOC custo em vez de tentar workaround com EventSource (impossível).

**Consequências:**
- Hook precisa parsear SSE format manualmente (chunks separados por `\n\n`, prefix `data:`)
- Browser support: `ReadableStream` em `fetch.body` disponível em todos browsers modernos (Chrome 105+, Firefox 102+, Safari 14.1+); fine para target moderno do React 19
- Test mocking: mockar `fetch` retornando `Response` com `ReadableStream` body é mais verbose que mockar `EventSource` — aceitar overhead

### D6 — Versão pin: TheoKit `0.2.x` instala `@usetheo/ui ^0.2.x`

**Decisão:** `package.json.tmpl` lista `@usetheo/ui` com range major-locked: `"@usetheo/ui": "^0.2.0"`. Quando TheoKit bump para 0.3.0, atualizamos o range. Documentar matriz de compat em `docs/`.

**Racional:** Two-package coordination requer pin. TheoUI 0.1.0-next.0 é a versão atual; vamos esperar 0.2.0 estável antes de pinar a template. Por enquanto template lista `^0.2.0-next` ou `latest` durante o período pre-stable.

**Consequências:**
- Release coordenado obrigatório
- Documentar compat matrix em CHANGELOG raiz

## Dependency Graph

```
Phase 0 (Architecture snapshot)
    │
    ▼
Phase 1 (Type bridge — AgentEvent re-export)
    │
    ▼
Phase 2 (Vite plugin auto-wire — CSS + ThemeProvider)
    │
    ▼
Phase 3 (Template default agent surface)
    │
    ▼
Phase 4 (CLI --bare flag)
    │
    ├──▶ Phase 5 (defineAgentEndpoint + useAgentStream)
    │
    ▼
Phase 6 (Dogfood QA)
```

Phase 5 pode rodar em paralelo com Phase 3-4 se houver bandwidth. Phase 6 bloqueia em tudo.

---

## Phase 0: Architecture snapshot

**Objective:** Capturar baseline antes de mudanças.

### T0.1 — Snapshot dos domínios afetados

#### Objective
Salvar baseline atual de `create-theo`, `vite-plugin`, `router/entry` antes das modificações.

#### Evidence
Nenhum baseline atual para `create-theo`. Para `vite-plugin` e `router` existem em `docs/architecture/{cli,vite-plugin,router}/` mas estão pre-gap-closure.

#### Files to edit
```
docs/architecture/create-theo/system-context.md — (NEW) baseline templates + scaffold flow
docs/architecture/vite-plugin/system-context.md — atualizar com pluginRunner + transformer wiring atual
docs/architecture/router/system-context.md — atualizar com streaming SSR wiring atual
```

#### Deep file dependency analysis
Documentação only — nenhum código de produção tocado.

#### Deep Dives
N/A.

#### Tasks
1. Rodar `/architecture-docs create-theo` (skill local)
2. Re-rodar `/architecture-docs vite-plugin` para refletir gap-closure
3. Re-rodar `/architecture-docs router` idem
4. Commit `docs(architecture): baseline before theoui integration`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_arch_baseline_create_theo_exists() — Given /architecture-docs ran, When listing docs/architecture/create-theo/, Then system-context.md exists with > 200 bytes (MUST fail before T0.1)
RED:     test_arch_updated_vite_plugin_mentions_configResolved() — Given updated baseline, Then system-context.md mentions configResolved
RED:     test_arch_updated_router_mentions_streaming() — Given updated baseline, Then system-context.md mentions renderStreamingWeb
RED:     test_arch_no_code_touched() — Given Phase 0 complete, When git status, Then only docs/architecture/ changed
GREEN:   Rodar architecture-docs skill 3 vezes
REFACTOR: None expected
VERIFY:  ls docs/architecture/{create-theo,vite-plugin,router}/system-context.md
```

BDD scenarios:
- Happy: 3 baselines presentes
- Validation: arquivo vazio → re-run
- Edge: domínio sem código → seção "minimal"
- Error: skill falha → instalar/configurar antes

#### Acceptance Criteria
- [ ] 3 baselines em `docs/architecture/`
- [ ] Cada > 200 bytes
- [ ] Commit registrado

#### DoD
- [ ] Tasks 1-4 completos
- [ ] Sem mudança em `packages/`

---

## Phase 1: Type bridge — `AgentEvent` re-export

**Objective:** Estabelecer `@usetheo/ui/types` como source of truth para `AgentEvent`. TheoKit re-exporta.

### T1.1 — Re-export type AgentEvent via `theokit/server` e `theokit/client`

#### Objective
TheoKit consome o tipo `AgentEvent` definido em TheoUI. Single source of truth visual.

#### Evidence
TheoUI já tem `AgentEvent` type em `src/components/composites/agent-stream/` e similar. TheoKit `defineAgentEndpoint` (Phase 5) precisa do mesmo tipo. Re-export em vez de duplicar.

#### Files to edit
```
packages/theo/package.json — adicionar @usetheo/ui como devDependency (types-only para build)
packages/theo/src/server/index.ts — re-export type AgentEvent from '@usetheo/ui/types'
packages/theo/src/client/index.ts — same re-export
tests/unit/agent-event-type.test-d.ts — (NEW) type test
```

#### Deep file dependency analysis
- `@usetheo/ui` como `devDependency` no `theokit` package (types só) — não infla bundle runtime
- Re-export usa `export type` para garantir erasure em runtime
- Downstream: apps que importam `AgentEvent` from `theokit/server` ganham acesso sem precisar de `@usetheo/ui/types` install explícito

#### Deep Dives
- **Type-only re-export:** `export type { AgentEvent } from '@usetheo/ui/types'`. TypeScript erasure garante que nenhum require/import runtime acontece.
- **Resolução em `--bare` apps:** `--bare` projects sem `@usetheo/ui` instalado importam `AgentEvent` via TheoKit. Como é type-only, funciona — bundler tree-shakes.
- **Edge case:** Se TheoUI muda shape em breaking way, TheoKit precisa bumpar `peerDependenciesMeta` matrix. Coordenar via CHANGELOG.

#### Tasks
1. Adicionar `@usetheo/ui` como `devDependency` em `packages/theo/package.json`
2. Adicionar `export type { AgentEvent } from '@usetheo/ui/types'` em `server/index.ts` e `client/index.ts`
3. Criar `tests/unit/agent-event-type.test-d.ts` com expectTypeOf
4. CHANGELOG entry

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_agent_event_type_importable_from_server() — Given import { AgentEvent } from 'theokit/server', When tsc, Then no error
RED:     test_agent_event_type_importable_from_client() — same for theokit/client
RED:     test_agent_event_has_expected_shape() — Given AgentEvent, Then variants include 'tool_call' | 'tool_result' | 'message' | 'error'
RED:     test_agent_event_erased_at_runtime() — Given build, When inspect dist, Then no runtime import of @usetheo/ui (type-only)
GREEN:   Add devDep + re-export + type test
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/agent-event-type.test-d.ts
```

BDD scenarios:
- Happy: tipo importável e correto
- Validation: tipo malformado fonte → tsc error claro
- Edge: --bare project sem TheoUI mas import type — funciona via erasure
- Error: TheoUI ausente em devDep → build de `theokit` falha com mensagem clara

#### Acceptance Criteria
- [ ] `import type { AgentEvent } from 'theokit/server'` compila
- [ ] Runtime dist não importa `@usetheo/ui`
- [ ] Pass: tsc, lint, vitest
- [ ] CHANGELOG entry

#### DoD
- [ ] Tasks 1-4 completos
- [ ] `tsup build` produz dist sem inflar

---

## Phase 2: Vite plugin auto-wire (CSS + ThemeProvider)

**Objective:** Quando `@usetheo/ui` está instalado E `config.ui !== false`, vite-plugin injeta CSS imports e wrap em ThemeProvider no entry-client.

### T2.1 — Detect TheoUI presence em `configResolved`

#### Objective
`vite-plugin/index.ts` no `configResolved` checa `node_modules/@usetheo/ui` existence + `config.ui !== false`. Resultado cacheado em closure.

#### Evidence
ADR D2 requer detection-based auto-wire. Sem detection, falhas silenciosas quando user desinstala TheoUI mas mantém config default.

#### Files to edit
```
packages/theo/src/vite-plugin/index.ts — adicionar detect + flag em configResolved
packages/theo/src/config/schema.ts — adicionar campo opcional `ui: false | { theme?, fonts? }`
tests/unit/vite-plugin-theoui-detect.test.ts — (NEW)
```

#### Deep file dependency analysis
- `vite-plugin/index.ts` `configResolved` async hook (já existe desde gap-closure T1.1) ganha mais um detect.
- `config/schema.ts` adiciona Zod schema para `ui`. Default = on quando TheoUI presente.

#### Deep Dives
- **Detection (EC-1, MUST FIX):** usar `require.resolve('@usetheo/ui/package.json', { paths: [projectRoot] })` em vez de `existsSync(node_modules/...)`. Razão: em monorepos pnpm com hoist, TheoUI fica em `<workspace-root>/node_modules/`, não em `<projectRoot>/node_modules/`. `existsSync` falha silenciosamente; `require.resolve` respeita Node resolution algorithm e encontra. Wrappar em try/catch — `MODULE_NOT_FOUND` significa disabled.
- **Corrupted install (EC-5):** detection precisa também verificar que `package.json` resolve E tem `main` field válido. Se TheoUI dir existe mas package.json corrompido/faltando, `require.resolve` já trata.
- **`ui: false` opt-out:** apps que querem UI custom (Tremor, MUI) setam `false` no config.
- **Flag closure:** mesmo padrão do `pluginRunner` / `transformer` / `resolvedBatching`.

#### Tasks
1. Schema: adicionar `ui: z.union([z.literal(false), z.object({ theme: z.enum(['violet-forge', 'noir', 'paper']).optional(), fonts: z.enum(['bundled', 'cdn']).optional() })]).optional()` — **EC-9** valida enum de themes
2. Vite plugin: detect via `require.resolve('@usetheo/ui/package.json', { paths: [projectRoot] })` (EC-1)
3. Test unit verifica que detect retorna true/false corretamente
4. Test verifica que `ui: false` força disabled mesmo com TheoUI presente
5. Test verifica que pnpm hoist scenario (TheoUI em workspace root) ainda detecta (EC-1)
6. Test verifica corrupted install caso (EC-5)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_detect_enabled_when_theoui_installed() — Given node_modules/@usetheo/ui exists, When plugin boot, Then theoUiEnabled === true
RED:     test_detect_disabled_when_theoui_missing() — Given no theoui in node_modules, When plugin boot, Then theoUiEnabled === false
RED:     test_force_disabled_via_config_ui_false() — Given config.ui = false + theoui installed, When plugin boot, Then theoUiEnabled === false
RED:     test_schema_rejects_invalid_ui_shape() — Given config.ui = 'string', When loadConfig, Then Zod error
RED:     test_detect_works_in_pnpm_hoist_layout() — Given TheoUI at workspace-root/node_modules, project at workspace-root/apps/<x>, When plugin boot from app, Then theoUiEnabled === true via require.resolve (EC-1)
RED:     test_detect_handles_corrupted_install() — Given node_modules/@usetheo/ui/ exists but package.json missing, When detect runs, Then theoUiEnabled === false without crash (EC-5)
RED:     test_schema_validates_theme_against_known_list() — Given config.ui.theme = 'invalid-name', When loadConfig, Then Zod error listing valid themes (EC-9)
GREEN:   Implement schema + detect via require.resolve
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/vite-plugin-theoui-detect.test.ts
```

BDD scenarios:
- Happy: TheoUI presente + default config → enabled
- Validation: schema invalid → Zod error claro
- Edge: TheoUI presente mas config.ui = false → disabled (escolha do user wins)
- Error: detect throws (perm) → log warning + assume disabled

#### Acceptance Criteria
- [ ] Detect funcional
- [ ] `ui: false` opt-out funcional
- [ ] Schema validado
- [ ] Pass: tsc, lint, vitest

#### DoD
- [ ] Tasks 1-4
- [ ] CHANGELOG entry

---

### T2.2 — Inject CSS imports no entry-client

#### Objective
Quando `theoUiEnabled`, `generateEntryClient` emite `import '@usetheo/ui/styles.css'` + `import '@usetheo/ui/fonts.css'` (ou cdn variant).

#### Evidence
TheoUI requer CSS imports manuais. Auto-inject elimina passo manual do user.

#### Files to edit
```
packages/theo/src/router/entry.ts — generateEntryClient aceita opts.theoUi para emitir CSS imports
packages/theo/src/vite-plugin/index.ts — passa theoUi opts para generateEntryClient
tests/unit/entry-client-theoui-css.test.ts — (NEW)
```

#### Deep file dependency analysis
- `entry.ts` `generateEntryClient(ssrEnabled)` ganha segundo arg `opts: { theoUi?: { fonts?: 'bundled' | 'cdn' } }`
- Quando opts.theoUi, gera imports CSS antes do React root render
- Backward compat: sem opts.theoUi, comportamento atual preservado

#### Deep Dives
- **Side-effect imports:** CSS imports são side-effect — `import '@usetheo/ui/styles.css'`. Vite trata automaticamente como CSS injection.
- **Order:** CSS imports antes de qualquer outro import para evitar FOUC.
- **fonts variant:** default `bundled` (mais reliable em offline). `cdn` opcional para apps que querem network-loaded fonts.
- **EC-2 (MUST FIX) — Client-only emission:** CSS imports são side-effect Browser-only. `import '@usetheo/ui/styles.css'` em `entry-server.ts` (rodando em Node SSR) quebra build — Node não resolve `.css` natively. Por design, T2.2 toca APENAS `generateEntryClient`. `generateEntryServer` JAMAIS recebe CSS imports. Adicionar test explícito verificando que entry-server NÃO contém `@usetheo/ui/styles.css` mesmo com theoUi enabled + ssr: true.

#### Tasks
1. Modificar `generateEntryClient` signature
2. Atualizar `vite-plugin` para passar opts
3. Tests
4. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_entry_client_imports_styles_css_when_enabled() — Given theoUi enabled, When generateEntryClient, Then output contains "import '@usetheo/ui/styles.css'"
RED:     test_entry_client_imports_fonts_bundled_by_default() — Given theoUi enabled, Then "import '@usetheo/ui/fonts.css'"
RED:     test_entry_client_imports_fonts_cdn_when_configured() — Given theoUi.fonts = 'cdn', Then "import '@usetheo/ui/fonts-cdn.css'"
RED:     test_entry_client_no_css_when_disabled() — Given theoUi disabled, Then no @usetheo/ui imports
RED:     test_entry_server_NEVER_imports_css_even_with_theoui_enabled() — Given theoUi enabled AND ssr: true, When generateEntryServer, Then output does NOT contain ".css" (EC-2)
GREEN:   Implement emit logic — client-only CSS
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/entry-client-theoui-css.test.ts
```

BDD scenarios:
- Happy: CSS injected
- Validation: invalid fonts value → schema error (caught em T2.1)
- Edge: ssr + theoUi — CSS imports compat com hydrateRoot
- Error: css file missing em node_modules (Vite resolve) — error já tratado por Vite

#### Acceptance Criteria
- [ ] CSS imports presentes quando enabled
- [ ] CSS imports ausentes quando disabled
- [ ] fonts variant respected
- [ ] **Entry-server NUNCA recebe CSS imports (EC-2)**
- [ ] Pass: tests

#### DoD
- [ ] Tasks 1-4

---

### T2.3 — Wrap RouterProvider em ThemeProvider

#### Objective
Quando `theoUiEnabled`, entry-client gerado envolve `<RouterProvider>` em `<ThemeProvider theme={config.ui.theme ?? 'violet-forge'}>`.

#### Evidence
TheoUI ThemeProvider gerencia 3 themes runtime-swappable. Sem wrap, componentes não pegam tokens.

#### Files to edit
```
packages/theo/src/router/entry.ts — quando opts.theoUi, wrap RouterProvider em ThemeProvider
tests/unit/entry-client-theoui-provider.test.ts — (NEW)
```

#### Deep file dependency analysis
- `entry.ts` template ganha branch: se `theoUi`, emite import ThemeProvider + wrap.
- Backward compat: sem theoUi, RouterProvider direto.

#### Deep Dives
- **Theme prop:** `config.ui.theme` default `'violet-forge'`. Outros validos: `'noir'`, `'paper'`.
- **Server vs client:** ThemeProvider funciona em SSR e CSR (TheoUI suporta ambos).
- **Suspense boundary:** ThemeProvider já existente do TheoUI lida com fallback.

#### Tasks
1. Modificar template `entry.ts` para emitir ThemeProvider wrap quando theoUi
2. Tests
3. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_entry_client_imports_ThemeProvider_when_enabled() — Given theoUi enabled, Then template contains "import { ThemeProvider } from '@usetheo/ui'"
RED:     test_entry_client_wraps_RouterProvider_in_ThemeProvider() — Given theoUi enabled, Then template wraps RouterProvider in ThemeProvider
RED:     test_entry_client_uses_default_theme_violet_forge() — Given no config.ui.theme, Then template uses theme="violet-forge"
RED:     test_entry_client_respects_custom_theme() — Given config.ui.theme = 'noir', Then template uses theme="noir"
RED:     test_warn_on_double_themeprovider() — Given auto-wrap on + user also wraps in app/layout.tsx, When dev server runs, Then console.warn "double ThemeProvider detected; remove manual wrap or set ui: false" (EC-6)
GREEN:   Implement wrap logic
REFACTOR: Maybe extract render-tree builder
VERIFY:  npx vitest run tests/unit/entry-client-theoui-provider.test.ts
```

BDD scenarios:
- Happy: wrap correto, theme default
- Validation: invalid theme → schema rejected (caught em T2.1)
- Edge: SSR mode + theoUi — wrap funciona em hydrateRoot
- Error: ThemeProvider não exportado por @usetheo/ui (versão errada) — error em runtime no app, não no template

#### Acceptance Criteria
- [ ] Wrap correto
- [ ] Theme respected
- [ ] Pass: tests

#### DoD
- [ ] Tasks 1-3

---

## Phase 3: Template default agent surface

**Objective:** `templates/default/app/page.tsx` mostra uma agent UI funcional (timeline + composer + stream), não Hello Theo.

### T3.1 — Atualizar template default com agent surface

#### Objective
Scaffolded project boota `theokit dev` e mostra: header com brand, sidebar com `AgentTimeline`, main com `AgentComposer` + `AgentStream`. Mocked events para o primeiro render (sem precisar agent real funcionando).

#### Evidence
Hoje template default é `<h1>Hello Theo</h1>`. Atende zero ao pitch "AI agents".

#### Files to edit
```
packages/create-theo/templates/default/package.json.tmpl — adicionar @usetheo/ui
packages/create-theo/templates/default/app/layout.tsx — minimal wrapper (ThemeProvider vem do entry-client)
packages/create-theo/templates/default/app/page.tsx — agent surface
packages/create-theo/templates/default/server/routes/chat.ts — (NEW) mock agent endpoint retornando events estáticos
fixtures/create-theokit-default/ — (NEW) snapshot do scaffold gerado
```

#### Deep file dependency analysis
- `package.json.tmpl` ganha `"@usetheo/ui": "^0.2.0-next.0"` (range pin)
- `app/page.tsx` usa Client Components — adicionar `"use client"` directive (React 19)
- `server/routes/chat.ts` retorna SSE com 3 events estáticos para demo

#### Deep Dives
- **Mock chat endpoint:** retorna SSE stream com 3 events: `{ type: 'message', content: 'Olá! Sou o agent default.' }`, depois `{ type: 'tool_call', name: 'search' }`, depois `{ type: 'message', content: 'Pronto.' }`. Permite scaffold funcionar sem LLM real configurado.
- **Layout:** `app/layout.tsx` mantém-se neutro (ThemeProvider vem do entry-client wrapping). Layout é semântico HTML wrapper.
- **Edge case:** apps com `--bare` recebem o `app/page.tsx` Hello Theo via transformação (T4.1).

#### Tasks
1. Atualizar `package.json.tmpl` com `@usetheo/ui`
2. Reescrever `app/page.tsx` com agent surface
3. Criar mock `server/routes/chat.ts`
4. Snapshot fixture do scaffold gerado
5. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_scaffold_default_includes_usetheo_ui_dep() — Given scaffold default, When read package.json, Then "@usetheo/ui" in dependencies
RED:     test_scaffold_default_page_uses_agent_components() — Given scaffold default, When read app/page.tsx, Then content includes "AgentComposer" + "AgentTimeline"
RED:     test_scaffold_default_chat_route_exists() — Given scaffold, When read server/routes/chat.ts, Then file exports POST defineRoute
RED:     test_scaffold_default_chat_returns_sse_with_3_events() — Given chat route, When POST mock, Then SSE response with 3 chunks
GREEN:   Update template files + write mock chat
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/scaffold-default-agent.test.ts
```

BDD scenarios:
- Happy: scaffold tem agent surface + mock chat funcional
- Validation: schema do mock chat returns valid SSE
- Edge: scaffold com nome com espaço → escape correto no package.json
- Error: TheoUI not yet published → mensagem clara

#### Acceptance Criteria
- [ ] Template default tem `@usetheo/ui` dep
- [ ] Agent surface no `app/page.tsx`
- [ ] Mock chat route funcional
- [ ] Fixture snapshot persistente
- [ ] Pass: tests

#### DoD
- [ ] Tasks 1-5
- [ ] Manual smoke: `npx create-theokit demo-app && cd demo-app && theokit dev` → agent UI renderiza

---

## Phase 4: CLI `--bare` flag

**Objective:** `npx create-theokit my-app --bare` produz scaffold sem TheoUI (Hello Theo cru).

### T4.1 — `--bare` flag em create-theokit

#### Objective
CLI detecta `--bare`, pós-scaffold remove `@usetheo/ui` de deps, substitui `app/page.tsx` por Hello Theo.

#### Evidence
ADR D5: `--bare` é transformação no default template, não duplicação.

#### Files to edit
```
packages/create-theo/src/cli.ts — parse --bare flag
packages/create-theo/src/index.ts — scaffold ganha opção bareMode; quando true aplica transformações
packages/create-theo/src/bare-transform.ts — (NEW) remove TheoUI dep + substitui page.tsx
tests/unit/create-theokit-bare.test.ts — (NEW)
```

#### Deep file dependency analysis
- `cli.ts` parseia `--bare`, passa para `scaffold(targetDir, projectName, templateName, { bare })`
- `scaffold` chama `applyBareTransform(targetDir)` quando bare=true
- `bare-transform.ts` lê + edita arquivos do scaffold pós-cópia

#### Deep Dives
- **Idempotência:** transform roda uma vez no scaffold. Ré-run não causa drift porque o scaffold original já foi descartado.
- **Atomic rollback (EC-4, MUST FIX):** se qualquer write durante `applyBareTransform` falhar (perm error, disk full, race), scaffold fica em estado quebrado — `package.json` SEM TheoUI dep mas `app/page.tsx` ainda usando `AgentComposer`. **Solução:** envolver `applyBareTransform` em try/catch externo no `scaffold()`; em falha → `rmSync(targetDir, { recursive: true, force: true })` + re-throw com mensagem clara `"scaffold rolled back; check filesystem perms: <original error>"`. 3 linhas.
- **Edge case:** `--bare` + `--template=dashboard` → erro claro ("--bare aplica apenas ao template default")
- **Help text:** atualizar `usage` no cli.ts

#### Tasks
1. Adicionar parse de `--bare`
2. Criar `bare-transform.ts`
3. Wire em `scaffold` com try/catch externo que faz `rmSync` em falha (EC-4)
4. Test unit + integration (inclui simulação de write failure)
5. Help text update
6. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_bare_flag_removes_theoui_dep() — Given --bare, When scaffolded, Then package.json has no @usetheo/ui
RED:     test_bare_flag_replaces_page_with_hello() — Given --bare, When scaffolded, Then app/page.tsx contains "Hello Theo"
RED:     test_bare_flag_keeps_chat_route_or_removes_it() — Document choice: --bare also removes server/routes/chat.ts (mock chat dependent on TheoUI events)
RED:     test_bare_with_other_template_errors() — Given --bare --template=dashboard, Then error "incompatible"
RED:     test_bare_transform_failure_rolls_back_targetDir() — Given write fails mid-transform, When scaffold runs with --bare, Then targetDir removed and error re-thrown with clear message (EC-4)
GREEN:   Implement --bare path + atomic rollback try/catch
REFACTOR: Extract transform helper
VERIFY:  npx vitest run tests/unit/create-theokit-bare.test.ts
```

BDD scenarios:
- Happy: --bare produz Hello scaffold
- Validation: --bare + outro template → erro
- Edge: --bare sem `<project-name>` → mesmo erro de usage
- Error: transform fail → cleanup parcial documentado

#### Acceptance Criteria
- [ ] `--bare` funciona
- [ ] Incompat com outros templates
- [ ] **Atomic rollback em transform failure (EC-4)**
- [ ] Help text atualizado
- [ ] Pass: tests

#### DoD
- [ ] Tasks 1-6

---

## Phase 5: `defineAgentEndpoint` + `useAgentStream`

**Objective:** Tipos cruzam server↔UI sem mapeamento manual. Endpoint declarado como agent retorna SSE de `AgentEvent`s; hook React consome.

### T5.1 — `defineAgentEndpoint` em `theokit/server`

#### Objective
Helper que aceita async generator producing `AgentEvent`s e retorna `RouteConfig` válido. Internamente vira SSE response.

#### Evidence
ADR D4: açúcar sobre `defineRoute`. Apps existentes não migram.

#### Files to edit
```
packages/theo/src/server/define-agent-endpoint.ts — (NEW)
packages/theo/src/server/index.ts — re-export
tests/unit/define-agent-endpoint.test.ts — (NEW)
```

#### Deep file dependency analysis
- `define-agent-endpoint.ts` envolve `defineRoute`, retornando handler que serializa generator → SSE
- Tipo `AgentEvent` importado via re-export (Phase 1)

#### Deep Dives
- **SSE format:** `data: <JSON>\n\n` per event. Standards-compliant.
- **Headers:** `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- **Abort:** respeita `request.signal` (já vem de execute.ts) — generator é cancelado.
- **Error:** generator throws → SSE emit `{ type: 'error', message }` + close.

#### Tasks
1. Implementar `defineAgentEndpoint`
2. Tests
3. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_define_agent_endpoint_returns_RouteConfig() — Given defineAgentEndpoint, Then result has .handler function
RED:     test_agent_endpoint_emits_sse_per_event() — Given generator yielding 3 events, When invoked, Then SSE response with 3 chunks
RED:     test_agent_endpoint_sets_text_event_stream_header() — Given invoked, Then response Content-Type === 'text/event-stream'
RED:     test_agent_endpoint_emits_error_event_on_throw() — Given generator throws, Then last event has type 'error'
RED:     test_agent_endpoint_aborts_on_request_signal() — Given infinite generator + request.signal aborts, When abort fires, Then generator stops and stream closes within 100ms (EC-7)
GREEN:   Implement defineAgentEndpoint
REFACTOR: Extract SSE serializer if reused
VERIFY:  npx vitest run tests/unit/define-agent-endpoint.test.ts
```

BDD scenarios:
- Happy: 3 events → 3 SSE chunks
- Validation: input zod fail → 422 antes do generator rodar
- Edge: empty generator → no chunks, status 200 + close
- Error: throw mid-stream → error event emitted

#### Acceptance Criteria
- [ ] Helper funciona
- [ ] SSE format correto
- [ ] Pass: tests

#### DoD
- [ ] Tasks 1-3

---

### T5.2 — `useAgentStream` em `theokit/client`

#### Objective
Hook React que consome um agent endpoint (POST + body) e expõe `{ events, send, status }`. Casa com `<AgentStream events={...} />` do TheoUI.

#### Evidence
ADR D4 + D3. Tipos compartilhados.

#### Files to edit
```
packages/theo/src/client/use-agent-stream.ts — (NEW)
packages/theo/src/client/index.ts — re-export
tests/unit/use-agent-stream.test.ts — (NEW)
```

#### Deep file dependency analysis
- Hook usa `EventSource` (Web Standards) para consumir SSE
- Estado React via useState — events array, status enum

#### Deep Dives
- **Type inference:** `useAgentStream<typeof POST>(path)` — TypeScript infere shape do input/output via type import direto (mesmo pattern do theoFetch).
- **Transport (EC-3, MUST FIX) — fetch + ReadableStream, NÃO EventSource:** EventSource é GET-only e não envia body. Como agent endpoints recebem `{ message }`, hook usa `fetch(path, { method: 'POST', body: JSON.stringify(payload), signal })` + `response.body.getReader()` para ler SSE chunks. SSE parser inline: split em `\n\n`, strip `data: ` prefix, JSON.parse. ~30 LOC. ADR D7 cobre a decisão.
- **send method:** body do agent (e.g., user message) — abre nova fetch+ReadableStream connection com POST. Fecha qualquer connection ativa antes.
- **Cleanup:** `useEffect` retorna fn que chama `controller.abort()` (AbortController do fetch). Em React StrictMode (double mount), cleanup roda entre mounts — primeira connection abortada (EC-8).
- **Multiple sends:** `send(payload)` chamado durante stream ativo cancela current e abre new. Documentar comportamento.

#### Tasks
1. Implementar hook
2. Tests com mock EventSource/fetch
3. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_useAgentStream_accumulates_events() — Given mock fetch returning ReadableStream with 3 SSE chunks, When hook runs, Then state.events has length 3
RED:     test_useAgentStream_send_uses_POST_with_body() — Given hook + send({ message: 'hi' }), When invoked, Then fetch called with method=POST and body containing 'hi' (EC-3)
RED:     test_useAgentStream_NOT_using_EventSource() — Given hook source, Then implementation references fetch + ReadableStream, NOT EventSource (EC-3 architectural check)
RED:     test_useAgentStream_cleanup_aborts_on_unmount() — Given hook unmounts mid-stream, Then AbortController.abort() called
RED:     test_useAgentStream_handles_error_event() — Given SSE error event, Then state.status === 'error'
RED:     test_useAgentStream_cleans_up_in_strict_mode() — Given hook in <StrictMode> (mount → unmount → re-mount), When run, Then fetch abort called between mounts; final state has events only from second connection (EC-8)
RED:     test_useAgentStream_send_during_active_stream_cancels_first() — Given stream active, When send() called, Then first stream aborts before second opens
GREEN:   Implement hook with fetch + ReadableStream + SSE parser inline
REFACTOR: Extract SSE chunk parser if reused elsewhere
VERIFY:  npx vitest run tests/unit/use-agent-stream.test.ts
```

BDD scenarios:
- Happy: events accumulam
- Validation: send sem path → erro
- Edge: SSE close clean (server ends) → status === 'done'
- Error: network → status === 'error'

#### Acceptance Criteria
- [ ] Hook funcional
- [ ] Type inference
- [ ] Pass: tests

#### DoD
- [ ] Tasks 1-3

---

## Phase 6: Dogfood QA (MANDATORY)

> Roda AFTER de tudo. Plano NOT done até passar.

**Objective:** Validar end-to-end que `npx create-theokit my-app` produz uma agent UI funcional.

### Execution

Rodar `scripts/dogfood-smoke.sh` (proxy `/dogfood full`). Adicionar 4 checks novos:

1. Template default tem `@usetheo/ui` em deps
2. Entry-client gerado importa CSS + wrap ThemeProvider quando theoUi enabled
3. Scaffold gerado tem `AgentComposer` em `app/page.tsx`
4. `--bare` produz scaffold sem TheoUI

### Acceptance Criteria

- [ ] Health score ≥ 85/100 (bar default — atende DoD do plano)
- [ ] Zero CRITICAL introduzidos
- [ ] Zero HIGH em features modificadas (create-theokit, vite-plugin, router/entry)
- [ ] Pre-existing issues documentados

### If Dogfood Fails

1. Identificar gaps causados por este plano
2. Corrigir CRITICAL/HIGH
3. Re-rodar

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Template default tem TheoUI dep | T3.1 | `package.json.tmpl` lista `@usetheo/ui` |
| 2 | CSS auto-importado | T2.2 | `generateEntryClient` emite `import '@usetheo/ui/styles.css'` |
| 3 | ThemeProvider wrap default | T2.3 | `generateEntryClient` envolve RouterProvider |
| 4 | Default scaffold = agent surface | T3.1 | `app/page.tsx` usa `AgentComposer` + `AgentTimeline` + `AgentStream` |
| 5 | `--bare` opt-out | T4.1 | CLI flag + transform pós-scaffold |
| 6 | `config.ui: false` opt-out runtime | T2.1 | Schema field + vite-plugin respect |
| 7 | `defineAgentEndpoint` server-side | T5.1 | Helper que produz SSE de generator |
| 8 | `useAgentStream` client-side | T5.2 | Hook React consumindo SSE |
| 9 | Type `AgentEvent` compartilhado | T1.1 | Re-export from `@usetheo/ui/types` |
| 10 | Dogfood QA passa | Phase 6 | Health ≥ 85 |

**Coverage: 10/10 = 100%.**

## Global Definition of Done

- [ ] All phases (0-6) completed
- [ ] All tests passing (Vitest unit + integration + type + Playwright)
- [ ] Zero TypeScript errors (`tsc --noEmit`)
- [ ] Zero lint warnings
- [ ] Backward compatibility preserved (apps 0.2.x continuam funcionando; `ui: false` para opt-out runtime)
- [ ] Code-audit checks passing
- [ ] **Plan-specific:**
  - [ ] `npm create theokit my-app` produz scaffold com agent surface funcional
  - [ ] `npm create theokit my-app --bare` produz Hello scaffold sem TheoUI
  - [ ] `theokit dev` no scaffold default mostra agent UI sem erros
  - [ ] CSS injetado automaticamente quando TheoUI presente
  - [ ] `ThemeProvider` wrappa o app automaticamente
  - [ ] `AgentEvent` type compartilhado entre server e client
  - [ ] `defineAgentEndpoint` + `useAgentStream` integrados
  - [ ] Mock chat endpoint funciona out-of-the-box (sem precisar LLM real)
- [ ] **Dogfood QA PASS** — health ≥ 85
- [ ] **Fixture proof** — `fixtures/create-theokit-default/` snapshot persistente
- [ ] **Cross-validation PASS** antes do dogfood
- [ ] CHANGELOG `[Unreleased]` consolidado

---

## Post-Implementation Hooks

1. `/edge-case-plan theoui-default-integration` (automático após salvar este plano)
2. `/cross-validation theoui-default-integration` antes do dogfood
3. `/dogfood full` (ou smoke proxy)
4. `/architecture-docs` AFTER para `vite-plugin`, `router`, `create-theo`

---

## Edge cases incorporados (revisão 2026-05-17)

Tabela rastreando os 12 ECs do `edge-case-plan` review:

| EC | Severidade | Task | Como foi tratado |
|---|---|---|---|
| EC-1 | MUST FIX | T2.1 | `require.resolve` em vez de `existsSync` — Deep Dive + BDD scenario `detect_works_in_pnpm_hoist_layout` |
| EC-2 | MUST FIX | T2.2 | AC explícita "T2.2 só toca entry-CLIENT" + Deep Dive + BDD scenario `entry_server_NEVER_imports_css` |
| EC-3 | MUST FIX | T5.2 | Novo ADR D7 (fetch + ReadableStream, não EventSource) + Deep Dive reescrito + 3 BDD scenarios |
| EC-4 | MUST FIX | T4.1 | Subtask 3 com try/catch rollback + Deep Dive + 1 BDD scenario + AC |
| EC-5 | SHOULD TEST | T2.1 | BDD scenario `detect_handles_corrupted_install` |
| EC-6 | SHOULD TEST | T2.3 | BDD scenario `warn_on_double_themeprovider` |
| EC-7 | SHOULD TEST | T5.1 | BDD scenario `agent_endpoint_aborts_on_request_signal` |
| EC-8 | SHOULD TEST | T5.2 | BDD scenario `cleans_up_in_strict_mode` (coberto no set de tests EC-3) |
| EC-9 | SHOULD TEST | T2.1 | Schema enum + BDD scenario `schema_validates_theme_against_known_list` |
| EC-10 | DOCUMENT | cross | Já no Out of Scope: TheoUI version sync manual via CHANGELOG |
| EC-11 | DOCUMENT | T3.1 | Mock chat tem comentário gigante "substitua pelo seu LLM" — Out of Scope nota |
| EC-12 | DOCUMENT | T5.1 | SSE backpressure: documentar pattern token streaming em comment — Out of Scope nota |

## Out of Scope

- **TheoUI version sync automation** — release-coordenado manual via CHANGELOG por enquanto. Automation (e.g., bot que bump TheoKit quando TheoUI lança) fica para outra iteração.
- **Custom agent components em TheoKit** — TheoKit não duplica componentes. Sempre delega para TheoUI.
- **Server-only agent surfaces (RSC)** — TheoKit não usa RSC hoje. TheoUI components são `"use client"`. Quando RSC entrar no roadmap, revisitar.
- **`theokit add @usetheo/ui` external command** — não necessário porque TheoUI já vem default. Caminho `external` do `theokit add` permanece para futuros plugins de terceiros.
- **Mock chat → real LLM upgrade path (EC-11):** Mock retorna 3 events estáticos para o scaffold funcionar. `server/routes/chat.ts` ganha comentário grande explicando substituição: "// Substitua este mock pelo seu LLM provider (OpenAI/Anthropic/local). O shape de AgentEvent é o contrato — qualquer provider que produza events compatíveis funciona." Quickstart no README do scaffold também menciona.
- **SSE backpressure / token streaming (EC-12):** Generator que produz 1000+ events em rápida sucessão (e.g., agent streaming tokens) pode saturar conexão. Pattern recomendado: para token streaming, usar chunked text content em um único event de tipo `message` em vez de event-per-token. Documentar em comment no exemplo do scaffold.
