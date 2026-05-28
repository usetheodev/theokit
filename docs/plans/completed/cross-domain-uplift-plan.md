# Plan: Cross-Domain Uplift — TheoKit 0.2.x

> **Version 1.0** — Eleva a nota de maturidade de cada domínio do TheoKit (server, router, client, cli, vite-plugin, adapters) em +1 ponto na escala 0–5, comparada com o benchmark cruzado contra `referencias/` (astro, fastify, hono, next.js, nitro). Entrega: plugin system de server com hooks tipados (Fastify-style), streaming SSR no router, batching + React Query adapter + transformer plugável no client, comandos `check`/`add`/`info` no CLI, API pública de extensão para o Vite plugin (`defineTheoIntegration`), e 5 novos adapters (Bun, Deno Deploy, Netlify, AWS Lambda, Static). Resultado esperado: TheoKit sai de média ponderada ~2.3/5 para ~3.3/5 contra o benchmark cruzado, com superfície de extensibilidade comparável a Hono/Nitro num pacote vertical.

## Context

### Estado atual (medido 2026-05-17)

Snapshot dos domínios:

| Domínio | Arquivos | LOC | Nota cross-domain |
|---|---|---|---|
| `server` (28 files) | routes, actions, ws, auth, middleware, sessions, channels, rate-limit | 1.632 | 2/5 |
| `cli` (7 files) | dev/build/start/generate/routes/docker | 726 | 2/5 |
| `router` (6 files) | wrapper sobre React Router v7 | 314 | 1/5 |
| `vite-plugin` (3 files) | virtual modules + middleware injection | 291 | 2/5 |
| `adapters` (4 files) | node, cloudflare, vercel (+ types) | 226 | 2/5 |
| `config` (4 files) | defineConfig + schema + env merge | 178 | 3/5 |
| `client` (2 files) | theoFetch typed RPC | 105 | 3/5 |
| `core` (2 files) | errors + validate-structure | 71 | 3/5 |

### Lacunas identificadas no benchmark cruzado

Evidência registrada na conversa de 2026-05-17 ("Análise cruzada por domínio") e nas referências disponíveis em `referencias/` (astro, fastify, hono, next.js, nitro):

1. **Server sem plugin system.** Hono, Fastify e Nitro têm extensibilidade tipada por hooks. TheoKit hoje só permite estender pelo `defineMiddleware`, sem hooks de ciclo de vida (`onRequest`, `preHandler`, `onResponse`, `onError`) nem registro nomeado de plugins.
2. **Adapters limitados.** TheoKit tem 3 targets reais (Node, CloudFlare Workers, Vercel). Nitro tem ~15 presets. Faltam: Bun, Deno Deploy, Netlify, AWS Lambda, Static export.
3. **CLI básico.** Falta `check` (typecheck + lint + manifest verify num comando), `add` (auto-install de adapters/plugins) e `info` (diagnóstico do ambiente, ecoado a issues e telemetry de bugs).
4. **Vite plugin sem extensão pública.** Não há `defineTheoIntegration` — terceiros não conseguem registrar hooks no pipeline de build/dev sem fork.
5. **Router sem streaming SSR.** O wrapper sobre React Router v7 entrega o básico (layouts, error, not-found, loading) mas não habilita streaming SSR — feature alta-prioridade para o pitch "agentes em tempo real".
6. **Client sem batching nem React Query adapter.** `theoFetch` é uma chamada-por-vez. tRPC tem batching por padrão e adapters oficiais para React Query/SWR.

### Por que agora

- Phase 1 do monorepo (lançar a narrativa do funil em 30 dias) está sustentada por **engenharia interna sólida** (`docs/audit/dogfood-2026-05-11-100.md` → 109/109). A próxima alavanca é **fechar gaps competitivos visíveis** que impedem um dev de escolher TheoKit sobre Hono/Next/Nitro num projeto novo.
- Cross-Project Rule 8 do `CLAUDE.md` raiz exige "honest claims only" — hoje o README diz "deploys anywhere" mas só tem 3 targets. Esse plano fecha esse gap honestamente.
- Antes de bater 1.0, é o momento certo para cravar plugin system: depois de 1.0 toda mudança de hook é breaking change.

## Objective

**Done = TheoKit 0.2.0 publicado no npm com plugin system, streaming SSR, batching no client, 5 novos adapters, CLI maduro (check/add/info), API pública de Vite integration e dogfood ≥85/100 verde.**

Metas mensuráveis:

- [ ] Plugin system com 4 hooks tipados (`onRequest`, `preHandler`, `onResponse`, `onError`) + registro nomeado
- [ ] Streaming SSR opt-in via `theo.config.ts` com Suspense boundaries
- [ ] `theoFetch` com batching automático (request collapsing dentro de 1 tick) + transformer plugável (superjson, devalue, custom)
- [ ] `@theokit/react-query` package publicado com 1 hook (`useTheoQuery`)
- [ ] 5 novos adapters: Bun, Deno Deploy, Netlify, AWS Lambda, Static (total 8 targets, +166%)
- [ ] 3 novos comandos CLI: `theokit check`, `theokit add <plugin|adapter>`, `theokit info`
- [ ] `defineTheoIntegration` documentado, com 1 integration de exemplo em fixtures
- [ ] CHANGELOG `0.2.0` consolidando todas as mudanças, com seção `BREAKING CHANGES` se houver
- [ ] Dogfood QA ≥85/100 sem CRITICAL nem HIGH em features novas

## ADRs

### D1 — Plugin system inspirado em Fastify, não em Express middleware chain

**Decisão:** O server vai expor 4 hooks tipados (`onRequest`, `preHandler`, `onResponse`, `onError`) chamados em pontos específicos do request lifecycle. Plugins se registram via `defineTheoPlugin({ name, register })` e o register recebe um `TheoApp` com `addHook` e `decorateRequest`.

**Racional:** Express-style middleware chain (req, res, next) é o padrão mais difundido mas perdeu a guerra de tipagem — `next()` não-tipado, contrato implícito. Fastify provou que hooks por ponto-de-vida com tipos rigorosos escalam melhor: cada hook tem assinatura previsível, é tipável end-to-end, e o ordering é determinístico por hook (não por ordem de registro global). Hono também adota algo similar via `onError`. Para TheoKit a escolha alinha com a regra "type-safety end-to-end" do voice operacional.

**Consequências:**
- Habilita ecossistema de plugins de terceiros (`@theokit/plugin-sentry`, `@theokit/plugin-otel`, etc.)
- Cria superfície API que precisa ser estável a partir do 0.2.0 — mudanças futuras de assinatura de hook são breaking change
- Plugin pode decorar `ctx` com novas propriedades tipadas via `decorateRequest<T>()` — exige cuidado com namespace clashing
- Não duplica `defineMiddleware` — o middleware existente continua sendo a forma de transformar `Response` por rota; hooks são para concerns transversais (auth global, logging, tracing)

### D2 — Streaming SSR via `renderToPipeableStream`, opt-in por config

**Decisão:** Streaming SSR fica desabilitado por padrão. O usuário liga via `ssr.streaming: true` no `theo.config.ts`. Quando ligado, o router usa `renderToPipeableStream` (Node) ou `renderToReadableStream` (Workers/Bun) com `Suspense` boundaries do React 19. Quando desligado, mantém o comportamento atual (SPA com client hydration).

**Racional:** Streaming SSR é a feature mais valiosa do router para o pitch ("agentes em tempo real, output progressivo"). Mas ligar por padrão quebra apps existentes que não desenham com Suspense em mente. Opt-in protege backward compatibility e dá tempo de evangelizar.

**Consequências:**
- Apps que ligam streaming precisam adotar Suspense boundaries explícitas — documentação obrigatória no README
- Adapter precisa saber se streaming está ligado para escolher API correta (`pipeableStream` vs `readableStream`)
- Não fazemos route groups nem middleware matcher por arquivo — escolha explícita de manter delegação ao React Router v7 para roteamento (ADR registrado, sem tarefa associada)

### D3 — Batching no client via microtask-collapsing, sem mudar `theoFetch` API

**Decisão:** `theoFetch` continua com a mesma assinatura. Internamente, chamadas para o mesmo endpoint dentro do mesmo microtask são agrupadas e enviadas num único POST `/api/__theo_batch__` quando o server suporta batching. Quando o server não suporta (env var `THEO_BATCH=false` ou client em modo isolado), comportamento atual mantido.

**Racional:** Mudar a assinatura para um `client.query.users.list()` estilo tRPC quebra a inovação principal do TheoKit (import direto do tipo). Batching transparente preserva a API e entrega o ganho de latência sem custo cognitivo para o consumidor.

**Consequências:**
- Novo endpoint reservado: `/api/__theo_batch__` (proibido sobrescrever)
- Server precisa de runtime detection — handler de batch só é registrado se `batching: true` na config
- Erros parciais em batch precisam de protocolo claro (cada item retorna `{ data, error }`)

### D4 — Transformer plugável via `defineConfig({ serialization: { transformer } })`

**Decisão:** O transformer atual (superjson) vira o default. Usuários podem injetar custom via config: `serialization: { transformer: devaluetransformer }`. Interface fica `interface TheoTransformer { serialize, deserialize }`.

**Racional:** Superjson é overhead para apps simples (~2.6KB). Devalue é menor mas tem semântica diferente. Algumas equipes querem JSON puro. Plugável é mais KISS no caller (escolha explícita) e mais YAGNI no framework (não decidimos por todos).

**Consequências:**
- Server e client precisam usar o mesmo transformer — config compartilhada via `theo.config.ts`
- Adapter de fixtures precisa testar com 3 transformers (superjson, devalue, json) para regression

### D5 — Adapters viram um pacote-único interno com 8 targets, sem extrair `@theokit/adapter-*`

**Decisão:** Mantemos `packages/theo/src/adapters/` como diretório interno. Não extraímos `@theokit/adapter-bun` etc. como pacotes separados.

**Racional:** Bundling todos no core mantém o `theokit deploy <target>` simples (`import { bunAdapter } from 'theokit/adapters/bun'`). Extrair vira complexidade de monorepo prematura (YAGNI até termos 3+ contributors externos pedindo). Tamanho extra do dist é trivial (cada adapter < 5KB).

**Consequências:**
- `theokit/adapters/*` exports precisam ser declarados no `package.json#exports`
- Adapters dependem só de `theokit/server` — nada de dependências runtime-specific no core
- Se um adapter precisar de runtime exclusivo (e.g., `cloudflare:workers`), fica em `peerDependenciesMeta.optional`

### D6 — CLI `theokit add` instala via `npm`/`pnpm`/`bun` do package manager detectado, sem manifest próprio

**Decisão:** `theokit add bun` resolve para `pnpm add theokit-adapter-bun` (ou npm/bun conforme detectado). Não criamos `theokit.json` com registry próprio — usamos npm direto.

**Racional:** Reinventar registry é o oposto da seção 9 do CLAUDE.md global ("não reinvente a roda"). NPM já resolve discovery, versioning, deprecation. `theokit add <x>` é açúcar sobre `pnpm add @theokit/<x>`.

**Consequências:**
- `theokit add` precisa detectar package manager (`pnpm-lock.yaml`, `package-lock.json`, `bun.lockb`)
- Resolução vai para uma lista hardcoded no CLI no início (`['adapter-bun', 'adapter-deno', 'plugin-sentry', ...]`) — pode evoluir para fetch de `usetheo.dev/registry.json` depois (YAGNI)

### D7 — `defineTheoIntegration` é uma API de **build/dev time**, não de runtime

**Decisão:** Integrations são plugins do Vite — recebem hooks `theo:config:setup`, `theo:build:start`, `theo:build:done`, `theo:dev:start`. Não confunde com plugin system de runtime (D1).

**Racional:** Astro provou que separar build-time integrations de runtime middleware é o modelo certo. Build-time tem acesso ao module graph, virtual modules, manifest; runtime não precisa disso e paga overhead se misturado. Dois conceitos com nomes distintos.

**Consequências:**
- API surface dupla: `defineTheoPlugin` (runtime) vs `defineTheoIntegration` (build-time)
- Documentação precisa explicar a diferença explicitamente (uma página em `docs/`)
- Pode haver demanda futura de cross-talk (integration registra plugin) — resolver via `addPlugin()` no hook setup

## Dependency Graph

```
Phase 0 (Architecture Snapshot)
    │
    ▼
Phase 1 (Adapters)  ◀──── pode rodar em paralelo com Phase 2
    │
    ▼
Phase 2 (CLI)       ◀──── depende parcialmente de Phase 1 (theokit add precisa de lista de adapters)
    │
    ▼
Phase 3 (Vite Integration API)
    │
    ▼
Phase 4 (Server Plugin System)  ◀── bloqueia Phase 5 (client batching usa hook onRequest)
    │
    ▼
Phase 5 (Client Enhancements)
    │
    ▼
Phase 6 (Router Streaming SSR)
    │
    ▼
Phase 7 (Dogfood QA — MANDATORY)
```

**Paralelismo possível:**
- Phase 1 e Phase 2 podem rodar em paralelo se um único dev focar primeiro nos adapters e outro no CLI; ou sequencial se um único dev.
- Phase 6 (router) pode começar logo após Phase 0 — não depende de plugin system. Coloca-se depois apenas para dar prioridade aos ganhos mais visíveis.

---

## Phase 0: Architecture Snapshot (BEFORE)

**Objective:** Capturar a arquitetura atual de cada domínio antes de qualquer mudança, para diff posterior.

### T0.1 — Rodar `/architecture-docs` para cada domínio impactado

#### Objective
Gerar a baseline C4 (System Context, Container, Component) para `server`, `router`, `client`, `cli`, `vite-plugin`, `adapters` em `docs/architecture/{domain}/`.

#### Evidence
A pasta `docs/architecture/` existe mas não tem subpastas por domínio. Sem baseline não conseguimos provar que a mudança preservou o que devia.

#### Files to edit
```
docs/architecture/server/ — (NEW) C4 docs do server
docs/architecture/router/ — (NEW) C4 docs do router
docs/architecture/client/ — (NEW) C4 docs do client
docs/architecture/cli/ — (NEW) C4 docs do cli
docs/architecture/vite-plugin/ — (NEW) C4 docs do vite-plugin
docs/architecture/adapters/ — (NEW) C4 docs do adapters
```

#### Deep file dependency analysis
- Cada subpasta vai conter `system-context.md`, `container-diagram.md`, `component-*.md`, `deep-dive.md` conforme convenção do `architecture-docs` skill.
- Nenhum código de produção é tocado nesta fase.

#### Deep Dives
N/A — fase de documentação.

#### Tasks
1. Rodar `/architecture-docs server`
2. Rodar `/architecture-docs router`
3. Rodar `/architecture-docs client`
4. Rodar `/architecture-docs cli`
5. Rodar `/architecture-docs vite-plugin`
6. Rodar `/architecture-docs adapters`
7. Commitar com mensagem `docs(architecture): baseline before cross-domain uplift`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

> Tarefa documental sem código de produção — TDD/BDD aplicados ao **artefato gerado** (presença e integridade dos arquivos).

```
RED:     test_architecture_baseline_files_exist() — Given /architecture-docs ran, When listing docs/architecture/, Then 6 subdirs exist with system-context.md (MUST fail before T0.1 runs)
RED:     test_architecture_baseline_content_non_empty() — Given baseline generated, When reading each system-context.md, Then file size > 200 bytes
GREEN:   Rodar `/architecture-docs` para cada domínio
REFACTOR: None expected
VERIFY:  ls docs/architecture/{server,router,client,cli,vite-plugin,adapters}/system-context.md
```

BDD scenarios:
- **Happy path:** todos os 6 docs gerados, cada um com diagrama Mermaid válido
- **Validation error:** arquivo gerado vazio → re-run /architecture-docs com flag de força
- **Edge case:** domínio com 1 só arquivo (core) → docs gerado mesmo assim, marcado como "minimal"
- **Error scenario:** /architecture-docs falha por falta de skill instalado → abortar T0.1 e instalar antes

#### Acceptance Criteria
- [ ] 6 subdirs em `docs/architecture/`
- [ ] Cada um com `system-context.md` e `container-diagram.md`
- [ ] Cada arquivo > 200 bytes
- [ ] Commit registrado no histórico antes de qualquer Phase 1+

#### DoD
- [ ] T0.1 tasks 1-7 completos
- [ ] `ls docs/architecture/` mostra 6 subdirs novos
- [ ] Sem mudança em `packages/theo/src/`

---

## Phase 1: Adapters Expansion

**Objective:** Levar TheoKit de 3 deploy targets reais para 8 (Bun, Deno Deploy, Netlify, AWS Lambda, Static além dos existentes Node/Vercel/Cloudflare).

### T1.1 — Adapter para Bun

#### Objective
Implementar `bunAdapter` que recebe o `TheoApp` (saída de `theo build`) e devolve um handler para `Bun.serve`.

#### Evidence
Nitro tem preset `bun`. Hono tem suporte first-class. Bun é o runtime de crescimento mais agressivo do ecossistema TypeScript em 2026 — ausência é gap visível.

#### Files to edit
```
packages/theo/src/adapters/bun.ts — (NEW) implementação do adapter
packages/theo/src/adapters/index.ts — (NEW se não existir) re-export de todos os adapters
packages/theo/package.json — adicionar export "./adapters/bun"
tests/unit/adapters/bun.test.ts — (NEW) testes unitários
tests/fixtures/adapter-bun/ — (NEW) fixture de app que builda para Bun
```

#### Deep file dependency analysis
- `packages/theo/src/adapters/bun.ts` — novo arquivo, depende de `packages/theo/src/server/execute.ts` (request handler unificado) e de `packages/theo/src/adapters/types.ts` (interface `TheoAdapter`).
- `packages/theo/package.json` — adicionar entrada em `exports`; downstream: qualquer projeto que importa `theokit/adapters/bun`.
- `tests/fixtures/adapter-bun/` — diretório novo com `theo.config.ts`, `server/routes/health.ts`, `package.json`. Usado por testes de integração e dogfood.

#### Deep Dives
- **Contract correction (iter 1 discovery, resolves OD-1):** `DeployAdapter` em `packages/theo/src/adapters/types.ts` é `{ name, build(config, cwd): Promise<void> }` — **build-only**, sem método `serve`. Adapters existentes (`vercel.ts`, `cloudflare.ts`) emitem o runtime entry como artefato do build (template string escrita no disco). Bun adapter segue o mesmo padrão: `build()` faz client Vite build, depois escreve `.theo/bun/server.mjs` com o código que o user roda via `bun run .theo/bun/server.mjs`.
- **Entry emitido (`.theo/bun/server.mjs`):** usa `Bun.serve({ fetch, websocket })` para receber `Request` Web Standard, lazy-importa `theokit/server` modules, faz bridge para o handler unificado (`execute.ts`).
- **Static assets** — `.theo/bun/server.mjs` serve `.theo/client/` via `Bun.file(path)` para paths não-API.
- **WebSocket** — Bun tem WS nativo via `Bun.serve({ websocket })`. Entry emitido faz bridge com `defineWebSocket` do TheoKit.
- **Version check em runtime emitido:** entry inclui `if (typeof Bun === 'undefined' || compareSemver(Bun.version, '1.1.0') < 0) throw new Error('TheoBunAdapter requires Bun >= 1.1; got ' + Bun.version)`.
- **Dev mode guard (EC-1):** o entry emitido checa `process.env.NODE_ENV !== 'production'` no boot e lança `TheoBunAdapter is production-only. Use 'theokit dev' (Node) for development.` Razão: dev usa Vite middleware Node-only; misturar com Bun.serve gera tela branca com erro críptico.

#### Tasks
1. Criar `packages/theo/src/adapters/bun.ts` com `bunAdapter: DeployAdapter` cujo `build()` invoca `nodeAdapter.build()` primeiro e depois escreve o entry Bun
2. Emitir `.theo/bun/server.mjs` (template string) com `Bun.serve({ fetch, websocket })`, bridge para `theokit/server`, e static handler via `Bun.file`
3. **Embutir no entry: version check Bun >= 1.1 + dev mode guard (EC-1)**
4. Bridge de WebSocket via `Bun.serve({ websocket })` para `defineWebSocket`
5. Adicionar `"./adapters/bun"` em `packages/theo/package.json#exports`
6. Atualizar `types.ts` para incluir `'bun'` em `BuildTarget` e `VALID_TARGETS`
7. Criar fixture `tests/fixtures/adapter-bun/`
8. Escrever testes unitários (validam artefatos gerados, não runtime — runtime requer Bun instalado)
9. Atualizar CHANGELOG sob `[Unreleased]` > `Added`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_bun_adapter_handles_get_request() — Given route /health, When GET via fetch, Then 200 with JSON body (MUST fail before T1.1 implementation)
RED:     test_bun_adapter_serves_static_file() — Given .theo/client/index.html, When GET /, Then 200 with HTML
RED:     test_bun_adapter_rejects_unsupported_method() — Given route GET-only, When POST, Then 405
RED:     test_bun_adapter_fails_fast_on_old_bun() — Given Bun < 1.1, When adapter loads, Then throws with clear message
RED:     test_bun_adapter_rejects_dev_mode() — Given NODE_ENV=development, When adapter boots, Then throws "TheoBunAdapter is production-only" (EC-1)
GREEN:   Implementar bun.ts com Bun.serve bridge + static + version check + dev guard
REFACTOR: Extrair helper de version-check se Node adapter precisar de algo similar
VERIFY:  npx vitest run tests/unit/adapters/bun.test.ts
```

BDD scenarios:
- **Happy path:** GET `/health` → 200 + JSON serializado em prod
- **Validation error:** POST com body inválido → 422 com lista de erros Zod
- **Edge case:** request sem body para POST → 400 (não 500); dev mode boot → erro claro (EC-1)
- **Error scenario:** Bun versão < 1.1 → adapter aborta no boot com mensagem `TheoBunAdapter requires Bun >= 1.1; got X.Y`

#### Acceptance Criteria
- [ ] `import { bunAdapter } from 'theokit/adapters/bun'` funciona
- [ ] Fixture `tests/fixtures/adapter-bun/` builda e responde a `curl /health`
- [ ] **Dev mode guard ativo: NODE_ENV !== 'production' → erro claro (EC-1)**
- [ ] Pass: TypeScript strict (`tsc --noEmit`)
- [ ] Pass: Lint check
- [ ] Pass: Vitest unit tests
- [ ] CHANGELOG `[Unreleased]` > `Added` entry com `(#PR)`

#### DoD
- [ ] Todas as tasks 1-8 completas
- [ ] Testes verdes
- [ ] Build do package limpo
- [ ] Fixture rodando manualmente via `bun run` no diretório

---

### T1.2 — Adapter para Deno Deploy

#### Objective
Implementar `denoDeployAdapter` que produz um bundle compatível com Deno Deploy edge runtime.

#### Evidence
Nitro tem preset `deno-deploy`. SvelteKit tem adapter oficial. Deno é runtime relevante para edge.

#### Files to edit
```
packages/theo/src/adapters/deno-deploy.ts — (NEW)
packages/theo/package.json — adicionar export "./adapters/deno-deploy"
tests/unit/adapters/deno-deploy.test.ts — (NEW)
tests/fixtures/adapter-deno-deploy/ — (NEW)
```

#### Deep file dependency analysis
- `packages/theo/src/adapters/deno-deploy.ts` — segue contrato `DeployAdapter` build-only (mesmo padrão de vercel/cloudflare).
- `build()` invoca `nodeAdapter.build()` para client, depois emite `.theo/deno/server.ts` como entry-point que o usuário deploya via `deployctl deploy` ou via integração GitHub.
- Deno Deploy roda em V8 isolates com APIs Web Standards. Sem `node:fs`, sem `node:http`. Adapter precisa garantir que o entry final não traz nenhum import Node-only.
- `tests/fixtures/adapter-deno-deploy/` — fixture testa que o entry gerado não vaza `require()` nem `node:*` imports não permitidos pelo Deno Deploy.

#### Deep Dives
- **Bundling:** Deno Deploy aceita um único entry `.ts`. Adapter usa esbuild (já em deps?) para produzir bundle único. Verificar `packages/theo/package.json` — pode precisar adicionar `esbuild` como dep ou reusar do Vite.
- **WebSocket:** Deno Deploy suporta WS via `Deno.upgradeWebSocket(request)`. Bridge similar ao Bun.
- **Sem `process.env`** — Deno usa `Deno.env`. Helper de env do TheoKit precisa detectar runtime.
- **Tamanho de bundle:** Deno Deploy tem limite ~10MB. Test precisa medir bundle final.

#### Tasks
1. Criar `deno-deploy.ts` com adapter
2. Detectar runtime via `typeof Deno !== 'undefined'` no helper de env
3. Implementar bridge WS via `Deno.upgradeWebSocket`
4. Criar fixture
5. Testes unitários incluindo medição de bundle size
6. Atualizar CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_deno_adapter_produces_single_bundle() — Given fixture, When adapter builds, Then dist/ has 1 .js file
RED:     test_deno_adapter_bundle_no_node_imports() — Given built bundle, When scanned, Then no node:* imports
RED:     test_deno_adapter_bundle_under_10mb() — Given built bundle, When measured, Then size < 10MB
RED:     test_deno_adapter_env_uses_deno_env() — Given Deno runtime, When THEO_SECRET read, Then via Deno.env.get
GREEN:   Implementar deno-deploy.ts
REFACTOR: Extrair env-helper compartilhado entre runtimes
VERIFY:  npx vitest run tests/unit/adapters/deno-deploy.test.ts
```

BDD scenarios:
- **Happy path:** fixture builda, gera bundle único válido
- **Validation error:** import de `node:fs` detectado no bundle → erro de build claro
- **Edge case:** bundle > 10MB → warning não-bloqueante com sugestões
- **Error scenario:** runtime Deno < 1.40 → falha cedo com mensagem clara

#### Acceptance Criteria
- [ ] Bundle único produzido
- [ ] Zero imports `node:*` no bundle final
- [ ] Bundle < 10MB para a fixture
- [ ] Pass: TS, lint, tests
- [ ] CHANGELOG entry

#### DoD
- [ ] Tasks 1-6 completas
- [ ] Bundle validado por scan
- [ ] Documentado em README seção Deploy

---

### T1.3 — Adapter para Netlify Functions

#### Objective
Implementar `netlifyAdapter` que produz Netlify Functions (formato `.netlify/functions/<name>.js`).

#### Evidence
Nitro tem preset `netlify`. Astro tem adapter oficial. Mercado Netlify ainda é relevante para teams que vêm do Jamstack.

#### Files to edit
```
packages/theo/src/adapters/netlify.ts — (NEW)
packages/theo/package.json — exports
tests/unit/adapters/netlify.test.ts — (NEW)
tests/fixtures/adapter-netlify/ — (NEW) com netlify.toml
```

#### Deep file dependency analysis
- Netlify Functions usa CommonJS por padrão; adapter precisa produzir ESM no `.netlify/functions/<name>.mjs` (Netlify suporta ESM via extensão).
- `netlify.toml` precisa redirecionar todas as rotas `/api/*` para `/.netlify/functions/theo` e `/*` para SPA.
- Adapter gera `netlify.toml` se não existir. **Se existir (EC-2), faz merge TOML-aware preservando campos do user.**

#### Deep Dives
- **Cold start:** Netlify Functions tem cold start ~1-2s. Adapter precisa fazer lazy-load de manifest para reduzir.
- **WebSocket:** Netlify Functions **NÃO** suportam WS — adapter detecta `defineWebSocket` no scan e emite warning não-fatal ("WS routes ignoradas — Netlify Functions não suporta").
- **TOML merge não-destrutivo (EC-2):** Usar parser TOML (`@iarna/toml` ou `smol-toml`, ambos maduros — não reinventar). Adapter só toca em `[[redirects]]` entries cujo `from` casa com `/api/*` ou `/*`. Demais campos (`[build]`, `[functions]`, `[[headers]]`, `[[edge_functions]]`) ficam intactos. Se há `[[redirects]]` com `from = "/api/*"` mas `to` apontando para outro lugar → **abortar build** com `netlify.toml has conflicting /api/* redirect. Remove it or edit manually.` (não auto-resolver).

#### Tasks
1. Criar `netlify.ts` com adapter
2. Gerar `.netlify/functions/theo.mjs` no build
3. **Implementar TOML merge não-destrutivo (EC-2):** parsear `netlify.toml` existente, adicionar/atualizar só `[[redirects]]` próprios, preservar resto; abortar em conflito
4. Adicionar dep `smol-toml` (ou `@iarna/toml`) ao `packages/theo/package.json`
5. Detectar WS routes e emitir warning
6. Fixture com `netlify.toml` pré-existente customizado (testar preservação)
7. Testes
8. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_netlify_adapter_emits_function_entry() — Given fixture, When built, Then .netlify/functions/theo.mjs exists
RED:     test_netlify_adapter_writes_toml_rewrites() — Given no toml, When complete, Then netlify.toml has /api/* rewrite
RED:     test_netlify_adapter_preserves_existing_toml() — Given netlify.toml com [[headers]] customizado, When built, Then headers preservados (EC-2)
RED:     test_netlify_adapter_aborts_on_conflicting_redirect() — Given netlify.toml com /api/* apontando alhures, When built, Then build aborta com mensagem clara (EC-2)
RED:     test_netlify_adapter_warns_on_ws() — Given fixture with WS, When built, Then console.warn called with WS message
RED:     test_netlify_adapter_handler_returns_fetch_response() — Given function invoked, When request mocked, Then Response returned
GREEN:   Implementar netlify.ts + TOML merge
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/adapters/netlify.test.ts
```

BDD scenarios:
- **Happy path:** API route 200 via function; `netlify.toml` pré-existente preservado
- **Validation error:** body inválido → 422 corretamente serializado pelo handler
- **Edge case:** WS routes presentes → warning, build prossegue; `netlify.toml` com `[[headers]]` customizado mantém headers (EC-2)
- **Error scenario:** falha ao escrever `netlify.toml` (perms) → erro de build claro; conflito de redirect /api/* → abortar (EC-2)

#### Acceptance Criteria
- [ ] Function ESM gerada
- [ ] `netlify.toml` com rewrites corretos
- [ ] **TOML merge não-destrutivo: campos do user preservados (EC-2)**
- [ ] **Conflito de redirect detectado e abortado (EC-2)**
- [ ] WS warning emitido quando aplicável
- [ ] Pass: TS, lint, tests
- [ ] CHANGELOG entry

#### DoD
- [ ] Tasks 1-7 completas
- [ ] Fixture testada localmente com `netlify dev`

---

### T1.4 — Adapter para AWS Lambda

#### Objective
Implementar `awsLambdaAdapter` que produz handler compatível com AWS Lambda + API Gateway v2.

#### Evidence
Mercado enterprise pesado em AWS. Hono tem `hono/aws-lambda`. Nitro tem preset `aws-lambda`. Sem isso, TheoKit perde toda venda enterprise.

#### Files to edit
```
packages/theo/src/adapters/aws-lambda.ts — (NEW)
packages/theo/package.json — exports
tests/unit/adapters/aws-lambda.test.ts — (NEW)
tests/fixtures/adapter-aws-lambda/ — (NEW) com sam.yaml ou cdk stub
```

#### Deep file dependency analysis
- AWS Lambda recebe `event` (APIGatewayProxyEventV2) e devolve `APIGatewayProxyStructuredResultV2`.
- Adapter segue contrato `DeployAdapter` build-only — emite `.theo/aws/handler.mjs` como entry-point que o user empacota via SAM/CDK/Serverless Framework.
- Entry emitido converte event → `Request` Web Standard, roda handler do `theokit/server`, converte `Response` → result.
- Cold start é crítico — bundle deve ficar < 5MB. Adapter usa esbuild (já dep transitiva via Vite) com tree-shaking agressivo durante o `build()`.

#### Deep Dives
- **Event format v1 vs v2:** v2 (HTTP API) é padrão hoje, mas alguns clientes legados usam v1 (REST API). Adapter detecta via `event.version` e converte ambos.
- **Binary responses:** API Gateway v2 precisa `isBase64Encoded: true` para binários. Adapter detecta content-type e codifica.
- **WebSocket:** Lambda WS é via WebSocket API Gateway separado, com event model totalmente diferente. **Fora de escopo da Phase 1** — emitir warning como em Netlify.

#### Tasks
1. Criar `aws-lambda.ts`
2. Converter event v2 → Request
3. Suporte legacy v1 com flag `legacyEventFormat: true`
4. Detectar binary e codificar base64
5. Warning para WS routes
6. Fixture
7. Testes
8. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_aws_lambda_converts_v2_event_to_request() — Given v2 event, When adapter handler called, Then Request created with correct method/url/body
RED:     test_aws_lambda_converts_v1_event_with_flag() — Given v1 event + flag, When called, Then Request created
RED:     test_aws_lambda_returns_v2_result() — Given handler Response, When done, Then result has statusCode, headers, body
RED:     test_aws_lambda_base64_encodes_binary() — Given Response application/octet-stream, When converted, Then isBase64Encoded: true
GREEN:   Implementar aws-lambda.ts
REFACTOR: Extrair event-conversion helpers para arquivo separado
VERIFY:  npx vitest run tests/unit/adapters/aws-lambda.test.ts
```

BDD scenarios:
- **Happy path:** GET → 200 JSON
- **Validation error:** Zod fail → 422
- **Edge case:** request com body binário multipart → handled corretamente
- **Error scenario:** event malformado (missing version) → 500 com mensagem clara

#### Acceptance Criteria
- [ ] Suporte v2 (default)
- [ ] Suporte v1 via flag
- [ ] Binary base64 encoding
- [ ] Pass: TS, lint, tests
- [ ] Bundle fixture < 5MB
- [ ] CHANGELOG

#### DoD
- [ ] Tasks 1-8
- [ ] Fixture deployável via SAM local (`sam local invoke`)

---

### T1.5 — Adapter Static (HTML export)

#### Objective
Implementar `staticAdapter` que pré-renderiza todas as rotas para HTML estático em `.theo/static/`.

#### Evidence
Astro construiu seu mercado em static-first. Nitro tem preset `static`. Apps de marketing/landing dentro do TheoKit beneficiam.

#### Files to edit
```
packages/theo/src/adapters/static.ts — (NEW)
packages/theo/package.json — exports
tests/unit/adapters/static.test.ts — (NEW)
tests/fixtures/adapter-static/ — (NEW)
```

#### Deep file dependency analysis
- Adapter precisa rodar SSR de cada rota detectada no manifest e escrever o HTML resultante em `.theo/static/<route>.html`.
- Rotas dinâmicas (`[id]`) precisam de `getStaticPaths` — adicionar campo opcional em `defineRoute` ou em uma nova convenção.
- WS routes são puladas — static não suporta runtime.

#### Deep Dives
- **getStaticPaths:** novo helper exportado. Convenção: arquivo `app/posts/[id]/static-paths.ts` exporta default function → array de params.
- **Catch-all routes (EC-3):** rotas `[...slug]` precisam do mesmo tratamento. Sem `static-paths.ts`, build falha com `Catch-all route /blog/[...slug] requires app/blog/[...slug]/static-paths.ts in static adapter`. Sem auto-enumeração — usuário declara explicitamente todos os paths como array de string[] (segmentos).
- **API routes:** static adapter **falha** se houver `server/routes/` com handler dinâmico (não é static). Emite erro claro listando rotas problemáticas, sugere usar outro adapter.

#### Tasks
1. Criar `static.ts`
2. Iterar manifest e pré-renderizar
3. Adicionar suporte a `getStaticPaths` para `[id]` e `[...slug]` (novo helper em `theokit/server`)
4. **Detectar `[...x]` sem `static-paths.ts` e abortar com mensagem específica (EC-3)**
5. Detectar API routes dinâmicas e abortar com erro claro
6. Fixture com rota `[id]` e rota catch-all `[...slug]` ambas com `static-paths.ts`
7. Testes
8. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_static_adapter_emits_html_per_route() — Given 3 routes, When built, Then 3 .html files in .theo/static/
RED:     test_static_adapter_resolves_dynamic_paths() — Given [id] + static-paths returning [1,2,3], Then 3 html files
RED:     test_static_adapter_resolves_catch_all_paths() — Given [...slug] + static-paths returning [["a"],["b","c"]], Then 2 html files (EC-3)
RED:     test_static_adapter_fails_on_catch_all_without_paths() — Given [...slug] sem static-paths.ts, Then build fails com mensagem específica (EC-3)
RED:     test_static_adapter_fails_on_api_routes() — Given server/routes/users.ts, When built, Then build fails with clear error
RED:     test_static_adapter_handles_layouts() — Given page with layout, When rendered, Then layout wraps content
GREEN:   Implementar static.ts
REFACTOR: Reusar render-server do router
VERIFY:  npx vitest run tests/unit/adapters/static.test.ts
```

BDD scenarios:
- **Happy path:** 3 páginas estáticas → 3 HTML files
- **Validation error:** `getStaticPaths` retorna shape errado → erro Zod claro
- **Edge case:** página sem `getStaticPaths` mas com `[id]` → erro com sugestão
- **Error scenario:** API route dinâmica detectada → build falha listando arquivos

#### Acceptance Criteria
- [ ] HTML por rota estática
- [ ] `getStaticPaths` funcional
- [ ] Erro claro para API routes
- [ ] Pass: TS, lint, tests
- [ ] CHANGELOG

#### DoD
- [ ] Tasks 1-7
- [ ] Fixture serve via `npx serve .theo/static`

---

## Phase 2: CLI Maturity

**Objective:** Adicionar 3 comandos novos (`check`, `add`, `info`) ao CLI para fechar gap de DX vs Next/Astro.

### T2.1 — Comando `theokit check`

#### Objective
Comando único que roda typecheck, lint, manifest verify e route scan, devolvendo report unificado.

#### Evidence
Astro tem `astro check`. Next tem `next lint`. Devs hoje precisam rodar `tsc`, `eslint`, `theokit build` separadamente para validar saúde do projeto.

#### Files to edit
```
packages/theo/src/cli/commands/check.ts — (NEW)
packages/theo/src/cli/index.ts — registrar comando
tests/unit/cli/check.test.ts — (NEW)
```

#### Deep file dependency analysis
- `check.ts` invoca em sequência: (1) `tsc --noEmit` no projeto user; (2) scan de routes via `scanRoutes`; (3) validate config; (4) opcional ESLint se `.eslintrc` existir.
- Output: tabela ASCII com status por step + exit code 0/1.

#### Deep Dives
- **TS subprocess:** invocar `tsc` via `child_process.spawn` resolvendo o `typescript` do user project (não do TheoKit), respeitando o `tsconfig.json` deles.
- **Performance:** check completo deve rodar em < 30s para projeto de 50 routes. Cache hashes em `.theo/check-cache.json`.

#### Tasks
1. Criar `check.ts` com função `runCheck()`
2. Spawn `tsc --noEmit` resolvendo o TS do user
3. Rodar `scanRoutes` e validar manifest
4. Detectar `.eslintrc` e rodar lint se existir
5. Output tabela + exit code
6. Registrar comando em `cli/index.ts`
7. Testes
8. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_check_exits_zero_on_clean_project() — Given fixture sem erros, When check runs, Then exit 0
RED:     test_check_exits_one_on_ts_error() — Given fixture com TS error, When check runs, Then exit 1 with TS section red
RED:     test_check_detects_invalid_route() — Given route com export nome errado, When check runs, Then exit 1
RED:     test_check_skips_eslint_when_no_config() — Given project sem .eslintrc, When check runs, Then ESLint step shown as "skipped"
GREEN:   Implementar check.ts
REFACTOR: Extrair runner-abstraction se usado em outros comandos
VERIFY:  npx vitest run tests/unit/cli/check.test.ts
```

BDD scenarios:
- **Happy path:** projeto limpo → exit 0 com 4 ✓ verdes
- **Validation error:** TS error → exit 1, seção destacada
- **Edge case:** sem `tsconfig.json` → erro claro com sugestão de `tsc --init`
- **Error scenario:** `tsc` não instalado → erro com sugestão de `pnpm add -D typescript`

#### Acceptance Criteria
- [ ] Comando `theokit check` registrado
- [ ] Exit code correto (0/1)
- [ ] Tabela ASCII com status
- [ ] Pass: TS, lint, tests
- [ ] CHANGELOG entry

#### DoD
- [ ] Tasks 1-8
- [ ] Rodado manualmente em 2 fixtures (clean + dirty)

---

### T2.2 — Comando `theokit add <package>`

#### Objective
Comando que detecta package manager e instala adapter/plugin do registry hardcoded (D6).

#### Evidence
Astro tem `astro add @astrojs/react`. Nuxt tem `nuxi add`. TheoKit hoje força user a saber o nome npm exato.

#### Files to edit
```
packages/theo/src/cli/commands/add.ts — (NEW)
packages/theo/src/cli/registry.ts — (NEW) lista hardcoded de packages conhecidos
packages/theo/src/cli/index.ts — registrar comando
tests/unit/cli/add.test.ts — (NEW)
```

#### Deep file dependency analysis
- `registry.ts` exporta `KNOWN_PACKAGES: Record<string, { npm: string, postInstall?: string }>`. Inicialmente: `bun → theokit-adapter-bun`, `deno-deploy → theokit-adapter-deno-deploy`, etc.
- `add.ts` detecta PM via lockfile e roda `pm add <npm>`.
- `postInstall` hook (opcional) imprime mensagem com snippet para colar em `theo.config.ts`.

#### Deep Dives
- **PM detection:** ordem `pnpm-lock.yaml` > `bun.lockb` > `yarn.lock` > `package-lock.json`. Fallback `npm`.
- **Não modifica `theo.config.ts` automaticamente** — imprime o snippet e pede para user colar. Razão: parsing/AST-rewrite de TS é frágil; copy-paste é honesto.
- **Segurança (EC-4):** entrada do user é argumento de CLI livre (`theokit add <x>`). Vetores: command injection (`; rm -rf`), path traversal (`../../etc/passwd`), URL malicioso. **Defesa em camadas:** (1) validar `<x>` contra regex `^[a-z0-9][a-z0-9-]*$` (só ASCII lowercase, hífens, sem `@` nem `/`), rejeitar resto antes de qualquer lookup; (2) `<x>` válido vira chave no registry hardcoded — só nomes em `KNOWN_PACKAGES` são aceitos, resto erro `Unknown package`; (3) `npm-name` resolvido do registry vai para `spawn(pm, ['add', npmName], { shell: false })` — nunca string concat, nunca `shell: true`.

#### Tasks
1. Criar `registry.ts` com lista inicial
2. Criar `add.ts` com detecção de PM
3. **Validar entrada do user contra regex (EC-4)**
4. **Usar `spawn` com array de args e `shell: false` (EC-4)**
5. Imprimir snippet de uso
6. Registrar comando
7. Testes (inclui security tests para inputs maliciosos)
8. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_add_detects_pnpm() — Given pnpm-lock.yaml exists, When `theokit add bun`, Then spawns `pnpm add theokit-adapter-bun`
RED:     test_add_unknown_package_errors() — Given unknown name, When add, Then exits 1 with "Unknown package: bunzzz. Did you mean: bun?"
RED:     test_add_rejects_shell_metachars() — Given input `bun; rm -rf /`, When add, Then exits 1 com validation error, sem spawn (EC-4)
RED:     test_add_rejects_path_traversal() — Given input `../../etc/passwd`, When add, Then exits 1 com validation error (EC-4)
RED:     test_add_spawn_uses_array_not_shell() — Given valid input, When spawn called, Then args is array AND shell option is false (EC-4)
RED:     test_add_prints_usage_snippet() — Given successful add, When done, Then stdout contains import statement
RED:     test_add_fallback_to_npm() — Given no lockfile, When add, Then spawns `npm install <npm>`
GREEN:   Implementar add.ts + registry.ts + input validation
REFACTOR: Extrair PM-detection para helper compartilhado com check
VERIFY:  npx vitest run tests/unit/cli/add.test.ts
```

BDD scenarios:
- **Happy path:** `theokit add bun` em pnpm → spawn correto + snippet
- **Validation error:** nome desconhecido com close match → "Did you mean: X?"; input com caracteres ilegais → rejeitado antes do registry lookup (EC-4)
- **Edge case:** sem lockfile → fallback npm
- **Error scenario:** PM subprocess fail → propaga exit code; input malicioso nunca chega no spawn (EC-4)

#### Acceptance Criteria
- [ ] Comando registrado
- [ ] PM detectado corretamente
- [ ] **Input validado contra regex antes de qualquer outra coisa (EC-4)**
- [ ] **Spawn usa array de args + shell: false (EC-4)**
- [ ] Snippet impresso
- [ ] Pass: TS, lint, tests
- [ ] CHANGELOG

#### DoD
- [ ] Tasks 1-7
- [ ] Rodado manualmente com pnpm/npm/bun fixtures

---

### T2.3 — Comando `theokit info`

#### Objective
Comando diagnóstico que imprime versões, runtime detected, config válido, scan summary.

#### Evidence
Next tem `next info`. Bug reports sem isso são opacos.

#### Files to edit
```
packages/theo/src/cli/commands/info.ts — (NEW)
packages/theo/src/cli/index.ts — registrar
tests/unit/cli/info.test.ts — (NEW)
```

#### Deep file dependency analysis
- `info.ts` lê `package.json` user, detecta runtime (`process.versions.node`, `Bun`, `Deno`), valida config via `loadConfig`, conta routes via `scanRoutes`.

#### Deep Dives
- Output em formato Markdown — pode ser colado direto num issue GitHub.

#### Tasks
1. Criar `info.ts`
2. Coletar versões + runtime
3. Validar config (sem falhar — só reportar)
4. Imprimir Markdown
5. Registrar comando
6. Testes
7. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_info_prints_node_version() — Given Node 22, When info runs, Then stdout has "Node: 22.x.x"
RED:     test_info_prints_route_count() — Given 5 routes in fixture, When info runs, Then "Routes: 5"
RED:     test_info_reports_invalid_config_without_failing() — Given invalid theo.config.ts, When info runs, Then exit 0 + section "Config: INVALID (reason)"
RED:     test_info_output_is_markdown() — Given any run, When output captured, Then matches markdown header pattern
GREEN:   Implementar info.ts
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/cli/info.test.ts
```

BDD scenarios:
- **Happy path:** info válido → Markdown completo
- **Validation error:** config inválido → seção "INVALID" sem crash
- **Edge case:** projeto sem `package.json` → seção "(missing)" sem crash
- **Error scenario:** scanRoutes lança → captura e reporta seção "Scan failed: <message>"

#### Acceptance Criteria
- [ ] Comando registrado
- [ ] Output Markdown válido
- [ ] Não crasha em projetos quebrados
- [ ] Pass: TS, lint, tests
- [ ] CHANGELOG

#### DoD
- [ ] Tasks 1-7
- [ ] Output validado manualmente em projeto real

---

## Phase 3: Vite-Plugin Public Extension API

**Objective:** Expor `defineTheoIntegration` para terceiros estenderem o pipeline de build/dev sem fork.

### T3.1 — `defineTheoIntegration` + hooks de build-time

#### Objective
Adicionar uma API tipada `defineTheoIntegration({ name, hooks })` onde `hooks` é `{ 'theo:config:setup', 'theo:build:start', 'theo:build:done', 'theo:dev:start' }`. Theo plugin lê integrations do config e injeta no Vite.

#### Evidence
Astro tem `defineIntegration` com hooks similares. TheoKit hoje só expõe Vite plugin direto — terceiros precisam saber Vite internals.

#### Files to edit
```
packages/theo/src/vite-plugin/integrations.ts — (NEW)
packages/theo/src/vite-plugin/index.ts — ler integrations do config
packages/theo/src/config/schema.ts — adicionar campo `integrations`
packages/theo/src/server/index.ts — exportar `defineTheoIntegration`
tests/unit/vite-plugin/integrations.test.ts — (NEW)
tests/fixtures/integration-example/ — (NEW)
```

#### Deep file dependency analysis
- `config/schema.ts` ganha campo `integrations: TheoIntegration[]`. Quem importa schema (load-config, define-config) recebe automaticamente o novo tipo.
- `vite-plugin/index.ts` lê `config.integrations` e dispara cada hook no momento certo do Vite lifecycle.
- Adapter para Vite: `theo:config:setup` ⇄ `config()` do Vite plugin; `theo:build:start` ⇄ `buildStart`; `theo:build:done` ⇄ `closeBundle`; `theo:dev:start` ⇄ `configureServer`.

#### Deep Dives
- **Hook context:** cada hook recebe `{ command: 'build' | 'dev', config: TheoConfig, addVitePlugin: (plugin) => void, addVirtualModule: (id, code) => void, addRoute: (path, handler) => void }`.
- **`addRoute` (EC-5):** integration pode registrar rota dinamicamente — útil para `@theokit/integration-otel` que adiciona `/metrics`. **Collision detection:** ao chamar `addRoute(path, handler)`, comparar `path` contra o scan de `server/routes/`. Conflito → `IntegrationRouteCollisionError("Integration '<name>' tentou registrar '<path>', mas server/routes/...ts já existe")`. Sem auto-resolução, sem precedência implícita.
- **`addVirtualModule` (EC-6):** Vite usa IDs como `virtual:`, `\0virtual:`, e Theo reserva `/@theo/*`. Para evitar colisão com Vite internals e com outras integrations, `addVirtualModule(id, code)` valida `id.startsWith('virtual:integration:' + integrationName + '/')`. Resto rejeita com `IntegrationVirtualModulePrefixError("Virtual module IDs must start with virtual:integration:<name>/, got: <id>")`.
- **Ordering:** integrations rodam na ordem do array. Documentar como contrato.

#### Tasks
1. Criar `integrations.ts` com `defineTheoIntegration` + tipos
2. Atualizar `schema.ts` para incluir `integrations`
3. Atualizar `vite-plugin/index.ts` para chamar hooks
4. **Implementar collision detection em `addRoute` (EC-5)**
5. **Implementar validação de prefixo em `addVirtualModule` (EC-6)**
6. Exportar `defineTheoIntegration` no `theokit/server`
7. Criar fixture `integration-example` que adiciona uma virtual module com prefixo válido
8. Testes (inclui collision + prefix tests)
9. CHANGELOG (BREAKING não — campo é opcional)

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_integration_setup_hook_called() — Given integration with setup hook, When dev starts, Then hook called once with context
RED:     test_integration_add_virtual_module() — Given hook calls addVirtualModule with valid prefix, When importing, Then resolves to provided code
RED:     test_integration_add_virtual_module_rejects_invalid_prefix() — Given addVirtualModule('/@theo/manifest', ...), Then throws IntegrationVirtualModulePrefixError (EC-6)
RED:     test_integration_order_preserved() — Given [A, B] in array, When hooks fire, Then A.setup before B.setup
RED:     test_integration_add_route_registers_handler() — Given hook calls addRoute on new path, When GET /custom, Then handler runs
RED:     test_integration_add_route_collision_throws() — Given server/routes/metrics.ts exists, When integration calls addRoute('/metrics'), Then throws IntegrationRouteCollisionError (EC-5)
GREEN:   Implementar integrations.ts + collision detection + prefix validation + wire em vite-plugin/index.ts
REFACTOR: Extrair hook-runner para ser reusado por outros lifecycle events futuros
VERIFY:  npx vitest run tests/unit/vite-plugin/integrations.test.ts
```

BDD scenarios:
- **Happy path:** integration declarada → todos os hooks disparam no ciclo correto; rotas e virtual modules registrados sem colisão
- **Validation error:** integration sem `name` → Zod erro no loadConfig; virtual module sem prefixo válido → rejeitado (EC-6)
- **Edge case:** array vazio → nenhum hook chamado, sem crash; duas integrations registrando virtual modules com mesmo nome local → cada uma com seu prefixo, sem colisão
- **Error scenario:** hook lança → erro propagado com nome da integration no stack; integration colide com rota user → build aborta (EC-5)

#### Acceptance Criteria
- [ ] `defineTheoIntegration` exportado
- [ ] 4 hooks funcionando
- [ ] **`addRoute` detecta colisão com user routes (EC-5)**
- [ ] **`addVirtualModule` valida prefixo `virtual:integration:<name>/` (EC-6)**
- [ ] Fixture demonstrando uso correto
- [ ] Pass: TS, lint, tests
- [ ] CHANGELOG

#### DoD
- [ ] Tasks 1-7
- [ ] Documentação em README seção "Integrations"

---

## Phase 4: Server Plugin System (D1)

**Objective:** Adicionar plugin system runtime com 4 hooks tipados estilo Fastify, sem quebrar `defineMiddleware` existente.

### T4.1 — Tipos, infra de plugin e try/catch global

#### Objective
Definir `TheoApp` (objeto passado para `register`) com `addHook`, `decorateRequest`, e tipos dos 4 hooks. Criar plugin-runner. **Adicionar try/catch global em `execute.ts` agora** (antes de T4.2) para que qualquer hook subsequente possa lançar sem derrubar o processo (EC-8). Implementar guard contra `decorateRequest` colidir com key já registrada (EC-7).

#### Evidence
Sem fundação tipada, hooks viram `any`-soup. Fastify provou que a estrutura tipada é o que segura o ecossistema. EC-8 do edge-case-plan: sem try/catch global antes do `onRequest`, plugin malcomportado em T4.2 já derruba o servidor antes de T4.4 existir. EC-7: dois plugins decorando a mesma key silenciosamente sobrescrevem tipos em runtime.

#### Files to edit
```
packages/theo/src/server/plugin-types.ts — (NEW) tipos
packages/theo/src/server/plugin-runner.ts — (NEW) registry + caller + decoration registry
packages/theo/src/server/define-plugin.ts — (NEW) helper `defineTheoPlugin`
packages/theo/src/server/execute.ts — envolver pipeline num try/catch global com default error handler
packages/theo/src/server/index.ts — re-exports
tests/unit/server/plugin-types.test-d.ts — (NEW) type tests
tests/unit/server/plugin-runner.test.ts — (NEW) inclui collision tests
tests/unit/server/execute-try-catch-global.test.ts — (NEW)
```

#### Deep file dependency analysis
- `plugin-types.ts` — tipos `TheoPlugin`, `TheoApp`, `OnRequestHook`, `PreHandlerHook`, `OnResponseHook`, `OnErrorHook`, erro `DuplicateDecorationError`.
- `plugin-runner.ts` — class `PluginRunner` com `register(plugin)`, `run('onRequest', ctx)`, `getDecorations()`, **`registerDecoration(key, pluginName)` com detecção de colisão**.
- `execute.ts` ganha try/catch top-level **nesta task**. Catch chama default error response (T4.4 ainda não existe — `onError` é cabeado depois). Existing handlers passam a rodar dentro do catch.

#### Deep Dives
- **`decorateRequest<T>(key, value)`:** adiciona property tipada ao `ctx`. Type-level merge via condicional types — `ctx & { [K]: T }`. **Em runtime, runner mantém `Map<key, pluginName>`; segunda decoração da mesma key → `DuplicateDecorationError("Plugin B decorates 'user' already declared by Plugin A")`.**
- **Try/catch global aqui em T4.1:** `execute.ts` envolve toda a pipeline existente. Sem hooks registrados ainda, catch responde com default error JSON `{ requestId, message }`. T4.4 vai adicionar a chamada para `runOnError` dentro desse catch — sem mudar a estrutura.
- **Hook ordering:** plugins registrados em ordem; hooks rodam na ordem de registro. Documentar.
- **Async hooks:** todos os hooks são `async` ou retornam `Promise`. Runner aguarda.

#### Tasks
1. Criar `plugin-types.ts`
2. Criar `plugin-runner.ts` com decoration registry + collision detection
3. Criar `define-plugin.ts` com factory helper
4. **Envolver `execute.ts` num try/catch global com default error response**
5. Re-export em `server/index.ts`
6. Type tests provando inferência (decorate adiciona property ao ctx)
7. Tests de runtime para collision detection
8. Test do try/catch global preservando comportamento atual (regressão)
9. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_plugin_runner_registers_plugin() — Given plugin, When register, Then runner.has('name') === true
RED:     test_plugin_runner_runs_hooks_in_order() — Given 2 plugins each with onRequest, When run, Then both called in registration order
RED:     test_define_plugin_returns_typed_object() — Given factory, When called, Then return matches TheoPlugin
RED:     test_duplicate_decoration_throws() — Given plugin A decorates 'user', When plugin B decorates 'user', Then DuplicateDecorationError com nome de A no message (EC-7)
RED:     test_execute_try_catch_returns_default_error() — Given handler throws unexpected, When request, Then 500 com { requestId, message } e processo não morre (EC-8)
RED:     type test_decorate_adds_property_to_ctx() — Given decorate('db', db), When handler runs, Then ctx.db typed as DB
GREEN:   Implementar fundação + try/catch global + collision detection
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/server/plugin-types.test-d.ts tests/unit/server/plugin-runner.test.ts tests/unit/server/execute-try-catch-global.test.ts
```

BDD scenarios:
- **Happy path:** registro + ordem preservada + try/catch transparente quando não há erro
- **Validation error:** plugin sem `name` → erro Zod ao registrar
- **Edge case:** plugin com nome duplicado → erro `DuplicatePluginError`; duas decorações mesma key → `DuplicateDecorationError`
- **Error scenario:** handler lança em runtime → catch global responde 500 default, processo continua

#### Acceptance Criteria
- [ ] Tipos exportados
- [ ] Runner cobre registry + run + decoration registry
- [ ] **Try/catch global em `execute.ts` presente e testado (EC-8)**
- [ ] **Decoration collision detection funcional (EC-7)**
- [ ] Type test verde
- [ ] Pass: TS strict, lint
- [ ] Regression: todos os tests anteriores de `execute.ts` continuam verdes
- [ ] CHANGELOG

#### DoD
- [ ] Tasks 1-9
- [ ] Tipos publicamente consumíveis
- [ ] Try/catch global preserva 100% do comportamento atual quando não há plugins

---

### T4.2 — Hook `onRequest` (primeiro do lifecycle)

#### Objective
Plugar `PluginRunner.run('onRequest', ctx)` dentro do try/catch global já existente em `execute.ts` (criado em T4.1), antes de qualquer rota ser chamada. Hook recebe `Request`, pode retornar `Response` para short-circuit. **T4.2 não cria try/catch — só conecta o hook no que T4.1 deixou pronto.**

#### Evidence
Auth global, rate limit global, tracing — todos esperam um ponto de entrada antes do route matching. Hoje precisa duplicar em cada rota. EC-8 garantiu que try/catch global já existe; aqui só plugamos.

#### Files to edit
```
packages/theo/src/server/execute.ts — invocar onRequest antes de match (dentro do try/catch global de T4.1)
packages/theo/src/server/plugin-runner.ts — método run específico para onRequest
tests/unit/server/hook-on-request.test.ts — (NEW)
```

#### Deep file dependency analysis
- `execute.ts` é o request handler unificado. Adicionar invocação de `pluginRunner.run('onRequest', { request, ctx })` no início, **dentro** do try/catch global criado em T4.1.
- Se hook retorna `Response`, `execute.ts` retorna direto sem chamar `match`/route handler.
- Se hook lança, catch global de T4.1 já responde default 500 (T4.4 depois vai customizar via `onError`).
- Downstream: adapters (`node.ts`, `bun.ts`, etc.) consomem `execute` — não mudam.

#### Deep Dives
- **Short-circuit semantics:** primeiro hook que retorna `Response` ganha. Subsequentes não rodam.
- **Mutating ctx:** hook pode mutar ctx para passar info adiante (rastreado via `decorateRequest`). Não recomendado fora de decorate.

#### Tasks
1. Adicionar campo `onRequest` em `plugin-types.ts` se ainda não estiver
2. Atualizar `plugin-runner.ts` com método `runOnRequest`
3. Chamar runner no início de `execute.ts`
4. Implementar short-circuit
5. Testes
6. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_on_request_hook_called_before_route_match() — Given plugin with onRequest, When GET /any, Then hook invoked first
RED:     test_on_request_short_circuits_with_response() — Given hook returns 401, When GET /protected, Then 401 returned, route never called
RED:     test_on_request_multiple_plugins_chain() — Given [A, B] both with onRequest passing, When GET, Then both called
RED:     test_on_request_decorate_visible_in_handler() — Given hook decorates 'user', When handler reads ctx.user, Then value present
GREEN:   Implementar cabeamento em execute.ts
REFACTOR: Limpar prováveis duplicações com middleware-runner
VERIFY:  npx vitest run tests/unit/server/hook-on-request.test.ts
```

BDD scenarios:
- **Happy path:** hook passa, rota responde
- **Validation error:** hook retorna 422 com Zod issues → request termina aí
- **Edge case:** sem nenhum plugin registrado → execute funciona como hoje
- **Error scenario:** hook lança → onError chamado (a ser implementado em T4.4)

#### Acceptance Criteria
- [ ] `onRequest` chamado antes do match
- [ ] Short-circuit funcional
- [ ] Decorate visível
- [ ] Pass: TS, lint, tests
- [ ] CHANGELOG

#### DoD
- [ ] Tasks 1-6
- [ ] Existing tests passam sem regressão

---

### T4.3 — Hooks `preHandler` e `onResponse`

#### Objective
Adicionar dois hooks intermediários: `preHandler` (após validação Zod, antes de chamar `handler`) e `onResponse` (após handler retornar, antes de serializar).

#### Evidence
Use cases: rate limiting por usuário (precisa do user resolvido), logging do payload validado, modificar Response antes de serializar.

#### Files to edit
```
packages/theo/src/server/plugin-types.ts — adicionar tipos
packages/theo/src/server/plugin-runner.ts — métodos `runPreHandler`, `runOnResponse`
packages/theo/src/server/execute.ts — invocar nos pontos certos
tests/unit/server/hook-pre-handler.test.ts — (NEW)
tests/unit/server/hook-on-response.test.ts — (NEW)
```

#### Deep file dependency analysis
- `execute.ts` ganha 2 invocações novas: `preHandler` depois do Zod parse, `onResponse` antes da serialização.
- Tipo do `onResponse` permite mutar `Response` — retorna nova Response ou void.

#### Deep Dives
- **preHandler ordering:** roda após Zod validation, antes do handler. Pode rejeitar com Response (short-circuit).
- **onResponse semantics:** roda em sucesso e em erro (após onError). Recebe `{ request, response, ctx }`.
- **Loop guard (EC-9):** ctx carrega flag `inErrorPath: boolean`. Quando `onResponse` lança e `inErrorPath === false`, runner seta `inErrorPath = true` e dispara `onError`. Quando `onResponse` lança e `inErrorPath === true`, runner **não** chama `onError` de novo — apenas loga e responde default 500 sem invocar mais hooks. Previne loop infinito `onResponse → onError → onResponse → ...`.

#### Tasks
1. Adicionar tipos
2. Implementar runners
3. Cabear em execute.ts dentro do try/catch global de T4.1
4. **Implementar flag `inErrorPath` para evitar loop (EC-9)**
5. Testes
6. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_pre_handler_runs_after_zod() — Given body Zod valid, When preHandler runs, Then receives parsed body
RED:     test_pre_handler_short_circuits() — Given preHandler returns 403, Then handler not called
RED:     test_on_response_can_mutate_headers() — Given onResponse adds header, When response sent, Then header present
RED:     test_on_response_runs_on_error_path() — Given handler throws, When onError handles, Then onResponse still called
RED:     test_on_response_throw_does_not_loop() — Given onResponse lança em error path, When inErrorPath=true, Then default 500 + sem segunda invocação de onError (EC-9)
GREEN:   Implementar cabeamento + loop guard
REFACTOR: Consolidate hook-runner ergonomics
VERIFY:  npx vitest run tests/unit/server/hook-pre-handler.test.ts tests/unit/server/hook-on-response.test.ts
```

BDD scenarios:
- **Happy path:** ambos hooks rodam, response final inclui mutações
- **Validation error:** Zod fail → preHandler **não** roda (Zod já abortou)
- **Edge case:** handler retorna Response object direto → onResponse recebe ele
- **Error scenario:** preHandler throws → onError → onResponse com response de erro; onResponse throws em error path → default 500 sem loop (EC-9)

#### Acceptance Criteria
- [ ] 2 hooks novos funcionando
- [ ] Pass: TS, lint, tests
- [ ] CHANGELOG

#### DoD
- [ ] Tasks 1-5
- [ ] Regression suite verde

---

### T4.4 — Hook `onError`

#### Objective
Conectar `runner.runOnError({ request, error, ctx })` dentro do catch global de `execute.ts` (criado em T4.1). Plugin pode customizar a Response de erro (Sentry capture, fallback custom). **T4.4 não cria try/catch — apenas substitui o default error handler de T4.1 pelo runner de plugins.**

#### Evidence
Sentry/Datadog integrations precisam interceptar erros centralmente. Hoje cada handler precisa try/catch manual. T4.1 já estabeleceu o catch global; T4.4 só conecta o runner.

#### Files to edit
```
packages/theo/src/server/plugin-types.ts — tipo OnErrorHook (se não foi criado em T4.1)
packages/theo/src/server/plugin-runner.ts — método runOnError
packages/theo/src/server/execute.ts — substituir default catch handler por runner.runOnError
tests/unit/server/hook-on-error.test.ts — (NEW)
```

#### Deep file dependency analysis
- `execute.ts` já tem try/catch global desde T4.1. Aqui substituímos o default error response por `await runner.runOnError(...)`; se runner retorna Response, usa; senão fallback ao default response que já existe.
- Hooks podem retornar Response customizada; senão default error handler do TheoKit responde.

#### Deep Dives
- **Multiple plugins:** todos os onError rodam (não short-circuit). Primeiro que retorna Response ganha.
- **Re-throw:** hook pode re-throw → propaga para o adapter.

#### Tasks
1. Tipo
2. Runner
3. Try/catch global em execute.ts
4. Testes
5. CHANGELOG (marcar 0.2.0 como "hooks system stable")

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_on_error_called_when_handler_throws() — Given handler throws, When request, Then onError invoked with error
RED:     test_on_error_can_return_custom_response() — Given onError returns 503, Then 503 sent (not 500 default)
RED:     test_on_error_all_plugins_get_called() — Given 2 plugins, When error, Then both onError fire
RED:     test_on_error_rethrow_propagates() — Given onError re-throws, Then error propagates to adapter
GREEN:   Implementar try/catch global
REFACTOR: Centralize default error-response builder
VERIFY:  npx vitest run tests/unit/server/hook-on-error.test.ts
```

BDD scenarios:
- **Happy path:** sem erros → onError nunca chamado
- **Validation error:** Zod fail (não-throw) → onError **não** chamado (Zod responde 422 direto)
- **Edge case:** erro no próprio onError hook → log + default error response
- **Error scenario:** handler async lança → captura via promise rejection

#### Acceptance Criteria
- [ ] onError funcional
- [ ] Pass: TS, lint, tests
- [ ] Existing error tests verdes (regressão zero)
- [ ] CHANGELOG `[Unreleased] > Added: Plugin system (#PR)`

#### DoD
- [ ] Tasks 1-5
- [ ] Plugin system documentado em README ("Plugins")
- [ ] Fixture `plugin-example` em `tests/fixtures/`

---

## Phase 5: Client Enhancements

**Objective:** Adicionar batching transparente, transformer plugável e adapter React Query ao client.

### T5.1 — Batching automático

#### Objective
Implementar microtask-collapsing em `theoFetch`. Chamadas no mesmo tick agrupam num POST batch.

#### Evidence
tRPC tem batching por padrão e reduz latência em UIs com muitas chamadas paralelas. TheoFetch hoje é 1-call-1-request.

#### Files to edit
```
packages/theo/src/client/batch.ts — (NEW) microtask collector
packages/theo/src/client/theo-fetch.ts — usar collector quando batching habilitado
packages/theo/src/server/batch-handler.ts — (NEW) endpoint POST /api/__theo_batch__
packages/theo/src/server/execute.ts — registrar batch handler
packages/theo/src/config/schema.ts — campo `batching: boolean`
tests/unit/client/batch.test.ts — (NEW)
tests/unit/server/batch-handler.test.ts — (NEW)
```

#### Deep file dependency analysis
- `batch.ts` coleta `BatchRequest[]` num array global flushable. `queueMicrotask(flush)` agenda flush no fim do tick.
- `theoFetch` checa `config.batching` em runtime (via Vite-injected constant) — se ligado, enqueueia; senão, fetch direto.
- `batch-handler.ts` recebe `{ requests: [...] }`, executa cada via `execute()`, retorna `{ results: [{ data, error }] }`.

#### Deep Dives
- **Batch endpoint reservado:** `/api/__theo_batch__`. Validar contra collision com user routes — emitir erro no scan.
- **Error handling per item:** cada item do batch retorna `{ data | error }` separado. Um item com erro não invalida o batch inteiro.
- **Max batch size:** 32 requests por batch (configurable via `batching: { max: 32 }`). Evita payload gigante.

#### Tasks
1. Criar `batch.ts` (client-side collector)
2. Atualizar `theo-fetch.ts` para enqueue quando batching habilitado
3. Criar `batch-handler.ts` (server-side)
4. Registrar handler em execute.ts
5. Adicionar `batching` no schema
6. Adicionar validação anti-collision no scan
7. Testes
8. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_batch_collapses_microtask_calls() — Given 3 theoFetch calls in same tick, When flushed, Then 1 HTTP POST
RED:     test_batch_each_caller_gets_own_result() — Given 3 calls returning different data, When resolved, Then each Promise gets correct data
RED:     test_batch_error_isolated_per_item() — Given 1 of 3 fails, When resolved, Then 2 succeed + 1 rejects
RED:     test_batch_disabled_falls_back() — Given batching: false, When theoFetch, Then 1-to-1 HTTP request
GREEN:   Implementar batching client+server
REFACTOR: Extrair shared types (BatchRequest/Result) para core
VERIFY:  npx vitest run tests/unit/client/batch.test.ts tests/unit/server/batch-handler.test.ts
```

BDD scenarios:
- **Happy path:** 3 calls → 1 request → 3 results
- **Validation error:** item com body inválido → erro Zod isolado naquele item
- **Edge case:** batch.max=2, 5 calls → 3 batches sequenciais
- **Error scenario:** rede falha no batch POST → todos os 3 callers rejeitam com mesmo erro

#### Acceptance Criteria
- [ ] Batching configurável
- [ ] Endpoint reservado
- [ ] Erros isolados
- [ ] Pass: TS, lint, tests
- [ ] CHANGELOG

#### DoD
- [ ] Tasks 1-8
- [ ] Regression suite verde

---

### T5.2 — Transformer plugável (D4)

#### Objective
Permitir `defineConfig({ serialization: { transformer } })`. Superjson vira default.

#### Evidence
Apps simples não querem 2.6KB de superjson. ADR D4 já decidiu pluggability.

#### Files to edit
```
packages/theo/src/server/serialization.ts — abstrair transformer (já existe arquivo)
packages/theo/src/config/schema.ts — adicionar campo
packages/theo/src/client/theo-fetch.ts — usar transformer do config
tests/unit/server/serialization-transformer.test.ts — (NEW)
```

#### Deep file dependency analysis
- `serialization.ts` exporta hoje `serialize`/`deserialize`. Refatorar para receber `TheoTransformer` via parâmetro com default superjson.
- Todas as call-sites (execute.ts, theo-fetch.ts) precisam passar transformer da config.

#### Deep Dives
- **Interface `TheoTransformer`:** `{ name: string, serialize(value): string, deserialize(s): unknown }`. Built-ins exportados: `superjsonTransformer`, `jsonTransformer`, `devalueTransformer`.
- **Same transformer client+server:** validado em runtime via handshake — primeiro response inclui header `x-theo-transformer: superjson`; client compara com config e log warning se diferente.

#### Tasks
1. Definir interface
2. Refatorar serialization.ts
3. Adicionar campo em schema
4. Wire em execute.ts e theo-fetch.ts
5. Exportar 3 transformers built-in
6. Testes
7. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_default_transformer_is_superjson() — Given no config, When Date sent, Then roundtrip preserved
RED:     test_json_transformer_drops_dates() — Given jsonTransformer + Date, When roundtrip, Then becomes string
RED:     test_devalue_transformer_handles_circular() — Given circular obj, When serialized via devalue, Then succeeds
RED:     test_mismatched_transformer_warns() — Given client superjson + server json, When request, Then console.warn
GREEN:   Implementar interface + 3 transformers
REFACTOR: Centralize transformer registry
VERIFY:  npx vitest run tests/unit/server/serialization-transformer.test.ts
```

BDD scenarios:
- **Happy path:** default superjson preserva tipos ricos
- **Validation error:** transformer custom com serialize undefined → erro Zod no loadConfig
- **Edge case:** body vazio → transformer pula
- **Error scenario:** deserialize lança → 500 com mensagem útil

#### Acceptance Criteria
- [ ] 3 transformers built-in
- [ ] Config funcional
- [ ] Handshake warning
- [ ] Pass: TS, lint, tests
- [ ] CHANGELOG

#### DoD
- [ ] Tasks 1-7
- [ ] Existing serialization tests verdes

---

### T5.3 — Adapter `@theokit/react-query`

#### Objective
Publicar package separado `@theokit/react-query` com 1 hook `useTheoQuery` que envolve `theoFetch` num `useQuery` do TanStack Query.

#### Evidence
React Query é o padrão de data-fetching em React. Ter adapter oficial baixa atrito.

#### Files to edit
```
packages/theokit-react-query/ — (NEW PACKAGE)
packages/theokit-react-query/package.json
packages/theokit-react-query/src/index.ts
packages/theokit-react-query/src/use-theo-query.ts
packages/theokit-react-query/tsconfig.json
packages/theokit-react-query/tsup.config.ts
packages/theokit-react-query/CHANGELOG.md
tests/unit/react-query/use-theo-query.test.tsx — (NEW)
pnpm-workspace.yaml — adicionar package se filtro for específico
```

#### Deep file dependency analysis
- Novo package no monorepo. Peer dep: `theokit`, `@tanstack/react-query`, `react`.
- `useTheoQuery(routeRef, options)` retorna `UseQueryResult` tipado.

#### Deep Dives
- **Type inference:** assinatura `useTheoQuery<typeof GET>(path, { query, body })` — mesma ergonomia do `theoFetch`. Sob o capô chama `theoFetch` dentro do `queryFn`.
- **queryKey stability (EC-10):** se `queryKey` é derivado por reference de `{ query, body }`, usuário passando objeto inline (`{ query: { search: input } }`) cria nova reference a cada render → React Query refetch infinito (bug clássico). **Defesa:** derivar `queryKey` via **serialização estável** — `[path, stableStringify(query), stableStringify(body)]` onde `stableStringify` ordena keys alfabeticamente (usar `fast-json-stable-stringify` ou similar maduro). Isso garante que `{ a: 1, b: 2 }` e `{ b: 2, a: 1 }` produzem mesma key. Documentar no README do package que valores não-serializáveis (functions, Date sem transformer) não são suportados em queryKey.

#### Tasks
1. Scaffold package
2. Implementar `use-theo-query.ts`
3. **Implementar queryKey estável via stableStringify (EC-10)**
4. Adicionar dep `fast-json-stable-stringify`
5. tsup build setup
6. Testes (com `@testing-library/react`, inclui teste anti-loop)
7. README do package com seção "queryKey stability"
8. CHANGELOG do package
9. Atualizar CHANGELOG root

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_use_theo_query_returns_data() — Given route GET /users, When useTheoQuery, Then data eventually has users
RED:     test_use_theo_query_handles_error() — Given route 500, When hook used, Then error state
RED:     test_use_theo_query_key_includes_query() — Given query { search }, When hook called, Then queryKey contains stableStringify(query)
RED:     test_use_theo_query_inline_object_no_refetch_loop() — Given component re-renders 10x with same query content via inline `{ query: { search: 'a' } }`, When mounted, Then queryFn called once (EC-10)
RED:     test_use_theo_query_key_order_independent() — Given query { a:1, b:2 } and query { b:2, a:1 }, Then queryKey equal (EC-10)
RED:     test_use_theo_query_typed_data() — Given typeof GET, When data accessed, Then TS infers shape (type test)
GREEN:   Implementar hook + stableStringify + types
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/react-query/use-theo-query.test.tsx
```

BDD scenarios:
- **Happy path:** data resolve; re-render com mesma query inline não dispara refetch (EC-10)
- **Validation error:** 422 → error com Zod issues
- **Edge case:** query undefined → queryKey só com path; query com keys em ordens diferentes → mesma queryKey (EC-10)
- **Error scenario:** network error → retry conforme config padrão; query com function inline → warning ou erro claro (não suportado)

#### Acceptance Criteria
- [ ] Package publica
- [ ] Hook tipado
- [ ] Pass: TS, lint, tests
- [ ] CHANGELOGs (package + root)

#### DoD
- [ ] Tasks 1-6
- [ ] Build do package limpo

---

## Phase 6: Router — Streaming SSR

**Objective:** Adicionar streaming SSR opt-in via `ssr.streaming: true`, sem mexer em route groups nem middleware matcher.

### T6.1 — `ssr.streaming` config + `renderToPipeableStream`

#### Objective
Quando `ssr.streaming: true`, o router serve HTML progressivamente via `renderToPipeableStream` (Node) / `renderToReadableStream` (Workers/Bun).

#### Evidence
Pitch "agentes em tempo real" precisa de streaming. ADR D2 já decidiu opt-in.

#### Files to edit
```
packages/theo/src/router/entry-server.ts — adicionar branch streaming
packages/theo/src/config/schema.ts — campo `ssr.streaming: boolean`
packages/theo/src/adapters/node.ts — usar `pipeableStream`
packages/theo/src/adapters/cloudflare.ts — usar `readableStream`
packages/theo/src/adapters/bun.ts — usar `readableStream`
tests/unit/router/streaming.test.tsx — (NEW)
tests/fixtures/streaming-app/ — (NEW)
```

#### Deep file dependency analysis
- `entry-server.ts` ganha branch: se `streaming`, chama `renderToPipeableStream`; senão, comportamento atual (`renderToString`).
- Adapters precisam saber qual API usar — passar via `TheoAdapterContext`.

#### Deep Dives
- **Suspense boundaries:** React 19 emite HTML por boundary. Sem boundaries não tem ganho de streaming — só atraso. Documentar.
- **shellReady event:** server flush HTML inicial assim que shell render; resto streaming. Status code default 200; se erro pré-shell, 500.
- **Client disconnect cleanup (EC-11):** request abortado pelo client (aba fechada, navegação cancelada) deve parar o stream e propagar cancelamento. **Mecânica:** (1) `entry-server` recebe `request.signal` (AbortSignal já presente em `Request` Web Standard); (2) `request.signal.addEventListener('abort', () => pipeable.abort())` (ou `.cancel()` no ReadableStream); (3) `ctx.signal` é exposto para handlers/plugins — quem faz I/O longo (DB query, fetch) deve passar `signal` adiante e respeitar `AbortError`. Plugins do server (T4) recebem `ctx.signal` no contexto.

#### Tasks
1. Adicionar `ssr.streaming` no schema
2. Branch streaming em `entry-server.ts`
3. **Cabear `request.signal.aborted` → `pipeable.abort()` / `stream.cancel()` (EC-11)**
4. **Expor `ctx.signal` para handlers e plugin hooks (EC-11)**
5. Atualizar adapters Node/CF/Bun
6. Fixture com Suspense + slow query que respeita signal
7. Testes (inclui cleanup test)
8. README seção Streaming SSR + nota sobre `ctx.signal`
9. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_streaming_emits_shell_before_data() — Given Suspense boundary with slow promise, When request, Then chunks arrive with shell first
RED:     test_streaming_disabled_uses_render_to_string() — Given streaming: false, When request, Then single HTML chunk
RED:     test_streaming_handles_shell_error() — Given error before shell, When request, Then 500 with default error page
RED:     test_streaming_node_uses_pipeable_stream() — Given Node adapter + streaming, When response, Then content-encoding chunked
RED:     test_streaming_aborts_on_client_disconnect() — Given client abort mid-stream, When signal fires, Then pipeable.abort called AND ctx.signal.aborted === true (EC-11)
RED:     test_streaming_signal_propagates_to_handler() — Given handler reads ctx.signal, When client disconnects, Then handler sees aborted true (EC-11)
GREEN:   Implementar streaming branch + signal wiring
REFACTOR: Extrair render-strategy selector
VERIFY:  npx vitest run tests/unit/router/streaming.test.tsx
```

BDD scenarios:
- **Happy path:** shell + data → 2 chunks
- **Validation error:** route não encontrada → 404 sem streaming
- **Edge case:** sem Suspense no app → 1 chunk só (igual sem streaming); client disconnect → cleanup imediato (EC-11)
- **Error scenario:** erro dentro de Suspense → boundary fallback streamed, status 200 (semântica React 19); handler que ignora signal continua rodando mas resultado é descartado

#### Acceptance Criteria
- [ ] Streaming opt-in funcional
- [ ] 3 adapters atualizados
- [ ] **`request.signal.aborted` propaga para `pipeable.abort()` (EC-11)**
- [ ] **`ctx.signal` exposto para handlers e plugin hooks (EC-11)**
- [ ] Fixture demonstrando handler que respeita signal
- [ ] Pass: TS, lint, tests
- [ ] CHANGELOG

#### DoD
- [ ] Tasks 1-7
- [ ] Regression suite verde
- [ ] Documentação clara sobre Suspense requirement

---

## Phase 7: Dogfood QA (MANDATORY)

> This phase runs AFTER all implementation phases are complete. The plan is NOT done until dogfood passes.

**Objective:** Validar end-to-end que cada mudança funciona como um usuário real experimentaria.

### Execution

Rodar `/dogfood full`. Sem atalho.

### Acceptance Criteria

- [ ] Health score ≥ 85/100 (baseline atual 100/100 — drop aceitável dado o tamanho da entrega, mas ≥85 obrigatório)
- [ ] Zero CRITICAL issues introduzidos por este plano
- [ ] Zero HIGH issues em features deste plano (adapters, plugins, batching, streaming, CLI commands, integrations)
- [ ] Pre-existing issues documentados (não causados por este plano)

### If Dogfood Fails

1. Identificar issues causados por este plano vs pre-existing
2. Corrigir todos CRITICAL/HIGH causados por este plano antes de declarar completo
3. Re-rodar `/dogfood full`
4. Pre-existing issues são logados mas não bloqueiam

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Server sem plugin system (hook tipados) | T4.1, T4.2, T4.3, T4.4 | Implementa 4 hooks (`onRequest`, `preHandler`, `onResponse`, `onError`) + `defineTheoPlugin` |
| 2 | Adapters limitados (3 targets) | T1.1, T1.2, T1.3, T1.4, T1.5 | Adiciona 5 targets: Bun, Deno Deploy, Netlify, AWS Lambda, Static |
| 3 | CLI sem `check`/`add`/`info` | T2.1, T2.2, T2.3 | 3 comandos novos com testes e fixtures |
| 4 | Vite plugin sem extensão pública | T3.1 | `defineTheoIntegration` com 4 hooks de build-time |
| 5 | Router sem streaming SSR | T6.1 | Streaming opt-in via `ssr.streaming` |
| 6 | Client sem batching | T5.1 | Microtask-collapsing transparente |
| 7 | Client com transformer fixo | T5.2 | `serialization.transformer` plugável (superjson/json/devalue) |
| 8 | Sem React Query adapter oficial | T5.3 | Package `@theokit/react-query` publicado |
| 9 | Sem baseline arquitetural para diff | T0.1 | `/architecture-docs` rodado para 6 domínios antes |

**Coverage: 9/9 gaps cobertos (100%).** Item "engenharia transversal → adoção externa" (subir 4→5) é GTM e fica explicitamente FORA do escopo deste plano técnico.

## Edge cases incorporados (revisão 2026-05-17)

Tabela rastreando os 11 MUST FIX do `edge-case-plan` review, todos absorvidos como acceptance criteria, BDD scenarios ou subtasks dentro das tasks existentes (sem criar tasks novas):

| EC | Descrição | Task | Como foi tratado |
|---|---|---|---|
| EC-1 | Bun adapter usado em dev | T1.1 | Subtask 5 + AC "Dev mode guard" + BDD scenario `rejects_dev_mode` |
| EC-2 | `netlify.toml` overwrite destrutivo | T1.3 | Subtask 3 TOML merge + AC + 2 BDD scenarios (`preserves_existing_toml`, `aborts_on_conflicting_redirect`) |
| EC-3 | Static adapter sem suporte a catch-all | T1.5 | Subtask 4 + 2 BDD scenarios (`resolves_catch_all_paths`, `fails_on_catch_all_without_paths`) |
| EC-4 | `theokit add` command injection | T2.2 | Subtasks 3-4 input validation + 3 BDD scenarios (`rejects_shell_metachars`, `rejects_path_traversal`, `spawn_uses_array_not_shell`) |
| EC-5 | Integration `addRoute` colisão | T3.1 | Subtask 4 collision detection + BDD scenario `add_route_collision_throws` |
| EC-6 | Integration `addVirtualModule` colisão | T3.1 | Subtask 5 prefix validation + BDD scenario `add_virtual_module_rejects_invalid_prefix` |
| EC-7 | `decorateRequest` silent override | T4.1 | Subtask 2 collision detection + BDD scenario `duplicate_decoration_throws` |
| EC-8 | Ordering: `onRequest` antes de `onError` | T4.1 / T4.2 / T4.4 | Try/catch global migrado para T4.1; T4.2 e T4.4 agora só plugam hooks no catch existente |
| EC-9 | `onResponse` lançar dispara loop | T4.3 | Subtask 4 `inErrorPath` flag + BDD scenario `on_response_throw_does_not_loop` |
| EC-10 | `useTheoQuery` infinite refetch | T5.3 | Subtask 3 `stableStringify` + 2 BDD scenarios (`inline_object_no_refetch_loop`, `key_order_independent`) |
| EC-11 | Streaming sem cleanup em client disconnect | T6.1 | Subtasks 3-4 signal wiring + 2 BDD scenarios (`aborts_on_client_disconnect`, `signal_propagates_to_handler`) |

SHOULD TEST (7 items) e DOCUMENT (3 items) do edge-case review ficam para incorporar quando as tasks correspondentes forem iniciadas — não requerem mudança no plano agora.

## Global Definition of Done

- [ ] All phases completed (0–7)
- [ ] All tests passing (Vitest unit + integration + type + Playwright E2E)
- [ ] Zero TypeScript errors (`tsc --noEmit` no monorepo)
- [ ] Zero lint warnings
- [ ] Backward compatibility preserved (apps em 0.1.x continuam funcionando sem mudança, exceto onde marcado como BREAKING no CHANGELOG)
- [ ] Code-audit checks passing (`/code-audit all`)
- [ ] **Plan-specific:**
  - [ ] Plugin system documentado em README + 1 fixture (`plugin-example`)
  - [ ] Integrations API documentada em README + 1 fixture (`integration-example`)
  - [ ] 8 adapters reconhecidos no README seção Deploy
  - [ ] 3 novos comandos visíveis em `theokit --help`
  - [ ] Streaming SSR documentado com requisito de Suspense
  - [ ] `@theokit/react-query` publicado no npm
  - [ ] CHANGELOG `0.2.0` consolidado com Added/Changed/BREAKING claros
- [ ] **Dogfood QA PASS** — `/dogfood full` health score ≥ 85, zero CRITICAL
- [ ] **Fixture proof** — toda feature nova tem fixture em `tests/fixtures/`
- [ ] **Cross-validation PASS** — `/cross-validation cross-domain-uplift` antes do dogfood
- [ ] **Architecture diff aceito ou registrado** — `/architecture-docs` AFTER rodado para os 6 domínios, diff revisado com o usuário

---

## Post-Implementation Hooks

Após implementação completa de todas as fases:

1. Rodar `/cross-validation cross-domain-uplift-plan` — gate mais rigoroso, lê plano linha a linha contra código.
2. Após APROVADO: rodar `/dogfood full`.
3. Após dogfood PASS: rodar `/architecture-docs {domain}` para os 6 domínios, output para `docs/architecture/{domain}/diff/`.
4. Perguntar ao usuário se substitui os docs principais pela versão `diff/`.

---

## Out of Scope (registrado para não virar scope creep)

- **Adoção externa** — GTM, não engenharia. Não cabe neste plano. Métricas próprias.
- **Route groups, intercepting routes, parallel routes** — escolha consciente de delegar para React Router v7 (D2 menciona).
- **`theokit.json` registry próprio** — D6 explicitamente descartado em favor de npm direto.
- **Extrair `@theokit/adapter-*` como packages separados** — D5 mantém adapters internos.
- **AWS Lambda WebSocket** — WS via API Gateway WS é modelo diferente, fora desta entrega.
- **Plugin system para tempo de build cruzando com runtime** — separação explícita em D7.
