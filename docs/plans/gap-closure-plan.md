# Plan: Gap Closure — TheoKit 0.2.0 → production-real

> **Version 1.0** — Fecha os 11 gaps técnicos remanescentes identificados após o cross-domain-uplift: 6 de alto impacto (plugins dev, transformer wiring, batching real, endpoint batch, registry honesto, adapter shim consolidation) e 5 de médio impacto (streaming SSR cross-runtime, WS cross-runtime, useTheoQuery hook, multipart Deno-compat, custom 4xx/5xx cross-adapter). Cada gap tem ≥1 task com TDD RED→GREEN→VERIFY. Resultado: TheoKit deixa de "feature-complete em testes isolados" e passa para "production-real em integração end-to-end", com paridade dev/prod, todos adapters seguindo o mesmo contrato runtime, e o registry CLI honesto (zero references a packages npm fictícios).

## Context

O plano anterior (`cross-domain-uplift-plan.md`) declarou 18 tasks "DONE". A auditoria honesta da iteração subsequente revelou 11 gaps técnicos onde o código existe **isolado** mas não está **integrado**:

1. **Plugins funcionam em prod, não em dev.** `vite-plugin/index.ts` chama `createApiMiddleware(server, serverDir, options.rateLimit)` — não carrega `config.plugins`, não instancia `PluginRunner`, não passa para o middleware. Resultado: o user testa o plugin em dev (não roda), pensa que está quebrado, abandona.
2. **Transformer plugável existe mas não é lido.** `resolveTransformer` aceita config-driven escolha (T5.2). `executeRoute.sendJson` continua chamando `JSON.stringify(data)` direto. `theoFetch` faz `response.json()` direto. O campo `config.serialization` é apenas metadata.
3. **`theoFetch` não bata calls.** ADR D3 do plano anterior: *"batching transparente preserva a API"*. `createBatcher` existe (T5.1). `theoFetch` continua sendo 1 chamada = 1 request HTTP.
4. **Endpoint `/api/__theo_batch__` server-side inexistente.** Plano anterior reservou a rota. Server-execute não tem handler especial. Batch POST a essa URL hoje retorna 404 (rota não encontrada).
5. **`theokit add bun` instala um pacote inexistente.** Registry hardcoded mapeia `bun → theokit-adapter-bun`. O package `theokit-adapter-bun` não existe no npm. Comando falha no primeiro uso real.
6. **Cloudflare e Vercel adapters emitem shim inline próprio.** Bun/Deno/Netlify/AWS-Lambda usam `createWebShim` compartilhado. CF/Vercel duplicam ~50 linhas cada de bridge Node-style → Web. Maintenance debt; bugs corrigidos no shim novo não chegam aos antigos.
7. **Streaming SSR só funciona em `theokit start`.** `theokit build --target=cloudflare` produz worker que ignora `config.ssrStreaming`. Mesmo para Bun e Vercel.
8. **WebSocket apenas em dev (Node + `ws`).** Adapters CF/Bun/Deno mencionam WS nos templates mas não fazem bridge — `Bun.serve({ websocket })`, `Deno.upgradeWebSocket`, `WebSocketPair` (Cloudflare) ficam não-wired.
9. **`useTheoQuery` hook React direto não existe.** Plano antigo prometia `useTheoQuery<typeof GET>(path, opts)`. Hoje usuário faz `useQuery(buildUseTheoQueryConfig(path, opts, fetcher))` — funciona mas tem 1 passo a mais.
10. **`busboy` (multipart) é Node-only.** Em Deno Deploy, multipart upload quebra com import error. `body-parser.ts` usa `busboy` direto.
11. **Custom 404/500 só em Node.** `start.ts` lê `clientDir/404.html` e `500.html`. CF/Vercel/Bun/Lambda emitem responses default sem checar esses arquivos.

**Evidência:** auditoria manual de 2026-05-17 lista esses 11 itens, classificados por impacto (6 alto + 5 médio). Documentação no chat-log da Ralph Loop iter 16.

**Por que agora:**
- Bloqueiam um release 0.2.0 honesto. Itens 1, 4, 5 são bugs visíveis no primeiro contato do user.
- Itens 6, 7 são debt arquitetural — quanto mais código emitido no padrão antigo, mais oneroso refatorar.
- Itens 2, 3 são features prometidas (ADR D3, D4) que ficaram metade-feitas.

## Objective

**Done = TheoKit roda de forma consistente em dev e prod, com paridade entre adapters; transformer + batcher + WS + streaming SSR funcionam end-to-end em todos os runtimes alvo; `theokit add` instala packages que existem; nenhum adapter emite shim duplicado.**

Metas mensuráveis:

- [ ] `defineTheoPlugin` registrado em `theo.config.ts` dispara hooks em `theokit dev` (não só em `theokit start`)
- [ ] `superjson` end-to-end: server serializa via transformer + client deserializa via mesmo transformer
- [ ] `theoFetch` em chamadas paralelas dispara 1 request HTTP (batched)
- [ ] `POST /api/__theo_batch__` responde com array de results
- [ ] `theokit add <known>` instala um package que existe E imprime snippet correto
- [ ] Cloudflare + Vercel adapters consomem `theokit/adapters/web-shim`
- [ ] `config.ssrStreaming: true` produz streaming em todos os adapters (CF/Bun/Vercel)
- [ ] WS endpoints (`defineWebSocket`) funcionam em Bun, Deno e Cloudflare (prod)
- [ ] `useTheoQuery<typeof GET>('/api/users', { query })` é um hook one-liner
- [ ] Multipart upload funciona em Deno (Web Standards FormData)
- [ ] `404.html`/`500.html` são honrados por todos os adapters
- [ ] CHANGELOG `[Unreleased]` consolidado com seção "Gap Closure"
- [ ] Dogfood QA ≥ 85/100

## ADRs

### D1 — Single PluginRunner factory, dev and prod share

**Decisão:** Criar uma função `createPluginRunnerForRequest(config)` que tanto `vite-plugin` (dev) quanto `start.ts` (prod) chamam para obter o mesmo `PluginRunner`. Vite plugin passa o runner para `createApiMiddleware` e `createActionMiddleware`.

**Racional:** Hoje o plugin runner é instanciado só em `start.ts`. Duplicar isso em `vite-plugin/index.ts` é tentador mas viola DRY e cria dois pontos de falha. Centralizar elimina dev/prod drift permanentemente.

**Consequências:**
- `vite-plugin/index.ts` lê config (já lê) e instancia runner ao boot do dev server
- Plugins assumem que `register` roda uma vez por dev session (HMR reload pode disparar de novo — documentar)
- Backward compatible: projetos sem `config.plugins` não pagam custo de instanciação

### D2 — Transformer hook lives in execute pipeline, not in route definition

**Decisão:** `executeRoute` lê `config.serialization` (passada via novo parâmetro opcional `transformer?: TheoTransformer`) e usa para serializar a response final. `sendJson` ganha overload que aceita transformer. `theoFetch` lê config-injected constant (via Vite virtual module) para escolher transformer em runtime.

**Racional:** Alternativa seria deixar cada route declarar o seu transformer — granularidade extra que nenhum usuário pediu (YAGNI). O ponto de transformer único por projeto está alinhado com `superjson` semantics (mesmo do dois lados).

**Consequências:**
- `executeRoute` ganha 1 parâmetro opcional (backward compatible)
- Novo virtual module `/@theo/transformer` exposto pelo vite-plugin com o nome do transformer escolhido — client lê para escolher
- Custom transformers configurados precisam ser serializable em config (closures não podem cruzar build/runtime boundary) — restrição: só `'json' | 'superjson'` strings; objetos custom requerem registração via plugin API (out of scope desse plan, queue)

### D3 — Batching opt-in via header, transparent at the call site

**Decisão:** `theoFetch` mantém assinatura. Internamente: se `globalThis.__THEO_BATCHING__ === true`, enfileira no batcher global; senão, fetch direto. O flag global é setado pelo runtime quando server suporta (detecta via `x-theo-batch-supported` header na primeira response E config-injected constant). Server expõe `POST /api/__theo_batch__` quando `config.batching === true`.

**Racional:** Auto-detection mantém a API single-call enquanto entrega o ganho. Header-based opt-in evita race conditions de primeira chamada (config-injected constant decide imediatamente).

**Consequências:**
- Novo config field `batching: boolean` (default `false`)
- Novo virtual module `/@theo/runtime-config` que client lê para `__THEO_BATCHING__`
- Server reserva `/api/__theo_batch__` — emit error em scan se user route conflitar
- Per-item error isolation: batch response retorna `{ index, data | error }` por item

### D4 — Registry honest: adapters live inside theokit, theokit add becomes a doc-printer

**Decisão:** `theokit add <X>` para um adapter já bundled (bun, deno-deploy, netlify, aws-lambda, static) **não roda `pnpm add`** — imprime instructions de como usar o target já incluído (`theokit build --target=<X>`). Mantém código preparado para futuro: `KNOWN_PACKAGES` ganha campo `kind: 'bundled' | 'external'`. Para `external`, vai para o caminho `pnpm add` real.

**Racional:** Mais honesto que apontar para packages fictícios. Adapters já são bundled (ADR D5 do plano anterior). `theokit add` vira primary surface para discovery (listar adapters disponíveis) + onboarding (printar uso). Quando houver plugins externos legítimos, eles entram com `kind: 'external'`.

**Consequências:**
- Comando muda comportamento mas conserva nome
- Help text atualiza para refletir
- Tests reescritos para a nova semântica
- `KNOWN_PACKAGES` shape ganha 1 campo

### D5 — Cloudflare and Vercel use the shared web-shim, legacy inline shim removed

**Decisão:** Reescrever templates de `cloudflare.ts` e `vercel.ts` para emitir entries que importam `theokit/adapters/web-shim` (assim como bun/netlify/aws-lambda fazem). Remove ~50 linhas inline cada.

**Racional:** DRY. Manutenção concentrada num único shim. Cloudflare Workers e Vercel Functions ambos suportam ESM imports de `theokit` (assumindo bundling via Wrangler/Vercel CLI).

**Consequências:**
- Templates ficam ~5x menores
- `theokit/adapters/web-shim` precisa ser explicitamente listado nas `external` do bundle Worker (Wrangler), ou bundled — verificar comportamento real
- Vercel function entry deixa de fazer `await import('./theo-server/...')` (path internal) — usa `theokit/server` import normal

### D6 — Streaming SSR per-runtime: `renderToReadableStream` for edge, `renderToPipeableStream` for Node

**Decisão:** Cada adapter detecta `config.ssrStreaming` e usa o entry export adequado: Node (`pipeableStream`), edge runtimes (`readableStream`). `entry-server.ts` ganha 2 exports: `renderStreaming` (pipeable, Node) e `renderStreamingWeb` (readable, edge). Adapters escolhem.

**Racional:** React 19 oferece dois APIs distintos. Não há valor em forçar Node streams em edge runtimes (overhead) — usar a API nativa de cada.

**Consequências:**
- `entry-server.ts` template cresce (2 exports quando streaming on)
- Adapters CF/Bun: usam `renderStreamingWeb`; Node usa `renderStreaming`
- Tests por adapter validam a presença do export adequado

### D7 — WS shim per-runtime, declared via adapter capability

**Decisão:** Criar `theokit/adapters/ws-shim` exportando: `createNodeWsBridge`, `createBunWsBridge`, `createDenoWsBridge`, `createCloudflareWsBridge`. Cada adapter template importa o bridge apropriado. `defineWebSocket` handler é runtime-agnostic (recebe `WebSocketLike` que cada bridge implementa).

**Racional:** Mesmo padrão de `web-shim` aplicado a WS. Single implementação por runtime, single entry público.

**Consequências:**
- Novo entry `theokit/adapters/ws-shim`
- 4 bridges, cada um pequeno (~30 LOC)
- `WebSocketLike` interface unificada cobre os 4 runtimes
- Templates dos adapters ganham ~10 linhas para wire WS

### D8 — `useTheoQuery` is a thin hook, ships in `@theokit/react-query`

**Decisão:** Adicionar `useTheoQuery<TResult>(path, options, fetcher)` em `@theokit/react-query` que internamente faz `useQuery(buildUseTheoQueryConfig(...))`. `fetcher` é parâmetro obrigatório (não acopla ao `theoFetch` direto, mantém testabilidade).

**Racional:** API one-liner sem perder a injetabilidade do fetcher. Plano antigo prometia `useTheoQuery<typeof GET>(path, opts)` direto — entregamos com 3-arg signature aceitável.

**Consequências:**
- `@theokit/react-query` cresce 1 export
- Peer-dep `@tanstack/react-query` deixa de ser optional → required (necessário em runtime quando hook usado)

### D9 — Web Standards FormData replaces busboy for multipart

**Decisão:** Refatorar `body-parser.ts` para usar `request.formData()` (Web Standards) quando disponível. Mantém `busboy` como fallback para Node IncomingMessage shape (compat). Em adapters edge/Bun/Deno, o shim converte o body para Web Request antes do parser ver — formData() naturalmente disponível.

**Racional:** Web Standards FormData é universal. busboy é Node-only. Eliminação progressiva da dep busboy é roadmap saudável; este plan inicia a migração.

**Consequências:**
- `body-parser.ts` ganha branch (request shape detection)
- `busboy` continua peer-dep do Node path
- Testes de multipart precisam rodar tanto pelo path Node quanto pelo path Web

### D10 — Custom error pages served by execute pipeline, not by each adapter

**Decisão:** `executeRoute` (e o handler 404 default) ganham parâmetros opcionais `custom404Html?: string`, `custom500Html?: string`. Adapter passa quando emitting. Cada adapter template lê do `.theo/client/{404,500}.html` no boot.

**Racional:** Lógica de "qual HTML emitir em 404/500" pertence ao pipeline central, não a cada adapter. Adapters viram passers do conteúdo.

**Consequências:**
- `executeRoute` ganha 2 parâmetros opcionais (backward compatible)
- Templates lêem os arquivos no boot, passam para `execute`
- Single source of truth para semântica de error page

## Dependency Graph

```
Phase 0 (Architecture snapshot — optional, baselines exist)
    │
    ▼
Phase 1 (Integration cabling — independent of adapter refactor)
    ├── T1.1 Plugins in dev (D1)
    ├── T1.2 Transformer in execute (D2)
    ├── T1.3 Transformer in theoFetch (D2)
    ├── T1.4 Batch endpoint (D3)
    └── T1.5 theoFetch batcher integration (D3)
    │
    ▼
Phase 2 (Adapter consolidation — depends on entries from Phase 1 being stable)
    ├── T2.1 Cloudflare → web-shim (D5)
    ├── T2.2 Vercel → web-shim (D5)
    ├── T2.3 Streaming SSR cross-runtime (D6)
    └── T2.4 Custom 4xx/5xx cross-adapter (D10)
    │
    ▼
Phase 3 (WS cross-runtime — independent, can parallelize with Phase 2)
    ├── T3.1 ws-shim entry (D7)
    ├── T3.2 Bun WS bridge
    ├── T3.3 Deno WS bridge
    └── T3.4 Cloudflare WS bridge
    │
    ▼
Phase 4 (Client ergonomics — independent)
    └── T4.1 useTheoQuery hook (D8)
    │
    ▼
Phase 5 (Body parser portability — independent)
    └── T5.1 FormData multipart for non-Node (D9)
    │
    ▼
Phase 6 (Registry honesty — independent)
    └── T6.1 theokit add becomes doc-printer (D4)
    │
    ▼
Phase 7 (Dogfood QA — MANDATORY, depends on all)
```

**Paralelismo possível:** Phases 1, 3, 4, 5, 6 podem rodar em paralelo. Phase 2 depende de Phase 1 (transformer wire) parcialmente. Phase 7 bloqueia em tudo.

---

## Phase 1: Integration cabling

**Objective:** Conectar features já implementadas mas isoladas — plugin system em dev, transformer no pipeline, batching transparente.

### T1.1 — Plugins funcionam em dev mode

#### Objective
`defineTheoPlugin` declarado em `theo.config.ts` dispara hooks tanto em `theokit dev` quanto em `theokit start`.

#### Evidence
Auditoria gap #1. `vite-plugin/index.ts:78` chama `createApiMiddleware(server, serverDir, options.rateLimit)` — ignora `config.plugins`. Tests integration provam que pipeline funciona quando runner é passado; aqui falta o **cabling**.

#### Files to edit
```
packages/theo/src/vite-plugin/index.ts — load config plugins, instantiate runner once, pass to middlewares
packages/theo/src/vite-plugin/api-middleware.ts — already accepts pluginRunner via ApiMiddlewareOptions, no change
packages/theo/src/vite-plugin/action-middleware.ts — add pluginRunner support symmetric to api-middleware
tests/integration/plugins-in-dev.test.ts — (NEW) integration test starting vite dev server with a plugin and asserting hooks fire
```

#### Deep file dependency analysis
- `vite-plugin/index.ts` hoje recebe `TheoPluginOptions { root, rateLimit, ssr, ssrStreaming }`. Vai ganhar instanciação de `PluginRunner` ao `configResolved` ou `configureServer`.
- `action-middleware.ts` é symmetric a `api-middleware.ts` — precisa receber `pluginRunner` também (server actions são parte do mesmo pipeline executavel).
- Downstream: nada — `executeRoute` já aceita `pluginRunner?` opcional.

#### Deep Dives
- **HMR drift (EC-1, MUST FIX):** quando user edita `theo.config.ts` em dev, Vite recarrega o módulo Vite plugin. Se runner é instanciado em `configureServer` (que pode re-disparar), plugin `register` roda múltiplas vezes — vaza recursos (DB connections, Sentry handlers, etc.). **Solução:** instanciar em `configResolved` (não-HMR-able, roda exatamente uma vez) e cachear em closure de módulo. Quando user edita `theo.config.ts`, emite warning claro: `"theo.config.ts changed; restart dev server for plugin changes to take effect"`. Plugin reload via HMR não é suportado.
- **Async loading:** `createPluginRunnerFromConfig` é async. `configResolved` aceita async hooks. Awaitar antes de retornar do hook garante que `configureServer` já tem runner pronto.
- **Edge case:** config sem `plugins` field → runner undefined → comportamento atual preservado.

#### Tasks
1. Em `vite-plugin/index.ts`, no hook `configResolved` (async), chamar `await createPluginRunnerFromConfig(config.plugins)` e cachear em closure (`let pluginRunner: PluginRunner | undefined`)
2. **EC-1 fix:** monitorar mudanças em `theo.config.ts` via Vite watcher; quando detectar, emit warning `console.warn('[theokit] theo.config.ts changed; restart dev server for plugin changes')` e NÃO re-instanciar (mantém runner antigo)
3. Passar `pluginRunner` para `createApiMiddleware` e `createActionMiddleware` via options
4. Atualizar `createActionMiddleware` signature para receber `pluginRunner?: PluginRunner`
5. Within `action-middleware.ts`, passar o runner para `executeAction` (precisa ver se executeAction já aceita — se não, adicionar)
6. Verificar que runner é instanciado **uma vez por dev session** (test usando spy)
7. Criar integration test em `tests/integration/plugins-in-dev.test.ts`
8. Atualizar CHANGELOG sob `[Unreleased] > Fixed`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_plugin_onRequest_fires_in_dev_mode() — Given vite dev server with plugin declaring onRequest, When GET /api/health, Then hook invoked
RED:     test_plugin_decoration_visible_in_dev_handler() — Given plugin decorating 'db', When handler reads ctx.db, Then value present in dev mode
RED:     test_no_plugins_no_runner_overhead() — Given config without plugins field, When dev server boots, Then no PluginRunner instantiated (memory/log probe)
RED:     test_invalid_plugin_shape_aborts_dev_boot() — Given config.plugins with malformed entry, When dev server boots, Then clear InvalidPluginShapeError thrown
RED:     test_runner_instantiated_once_per_dev_session() — Given dev server boots, plugin register spied, When 10 requests handled, Then register called exactly 1 time (EC-1)
RED:     test_config_change_emits_warning_not_reregister() — Given dev server running, theo.config.ts is edited, When change detected, Then console.warn called with restart-required message AND plugin register NOT called again (EC-1)
GREEN:   Instanciar runner em vite-plugin + passar para middlewares
REFACTOR: Extract plugin-runner-loader helper if logic is repeated
VERIFY:  npx vitest run tests/integration/plugins-in-dev.test.ts
```

BDD scenarios:
- **Happy path:** plugin registrado funciona em dev (hooks disparam, decorations aplicam)
- **Validation error:** plugin malformado aborta dev server com erro útil (não silencioso)
- **Edge case:** sem `plugins` config → boot normal sem overhead
- **Error scenario:** plugin throws em `register()` → erro propaga com nome do plugin

#### Acceptance Criteria
- [ ] Hooks disparam em dev exatamente como em prod
- [ ] `decorateRequest` propaga para handler em dev
- [ ] Sem `plugins` config, runner não é instanciado
- [ ] Pass: `tsc --noEmit`
- [ ] Pass: vitest suite (todos os tests anteriores + novos)

#### DoD
- [ ] Tasks 1-7 completos
- [ ] Tests integration passam
- [ ] Fixture `fixtures/plugin-example/` roda `theokit dev` com hook ativo

---

### T1.2 — Transformer plugado no `executeRoute`

#### Objective
`executeRoute` serializa response usando o transformer configurado em `config.serialization`. Default permanece `'json'` (backward compatible).

#### Evidence
Auditoria gap #2a. `executeRoute.sendJson` linha 14-15: `JSON.stringify(data)`. ADR D4 do plano anterior prometia transformer plugável end-to-end. Server-side metade foi feita; runtime nunca lê.

#### Files to edit
```
packages/theo/src/server/execute.ts — sendJson accepts transformer, executeRoute receives transformer param
packages/theo/src/cli/commands/start.ts — resolve transformer from config, pass to executeRoute
packages/theo/src/vite-plugin/api-middleware.ts — same wiring for dev
packages/theo/src/adapters/web-shim.ts — nothing (transformer aplied before shim)
tests/integration/transformer-end-to-end.test.ts — (NEW) request with Date roundtrips via superjson
```

#### Deep file dependency analysis
- `execute.ts` `sendJson` ganha parâmetro `transformer?: TheoTransformer`. Default = `jsonTransformer`. Branch decide stringify.
- `executeRoute` aceita parâmetro extra `transformer?`. Passa para todos os `sendJson` calls.
- Adapters não mudam — o transformer é aplicado pre-network; o que chega no shim já é string.

#### Deep Dives
- **Header:** server emite `x-theo-transformer: superjson` quando não-default. Client lê (T1.3) para escolher deserializer.
- **Content-Type:** continua `application/json` (superjson serialized é JSON válido — meta lives in body).
- **Edge case:** body que falha serialize (BigInt sem superjson) — erro claro com nome do transformer.
- **Backward compat:** chamadores que não passam transformer continuam usando JSON.stringify (mesma assinatura agora com optional param).

#### Tasks
1. Modificar `execute.ts` `sendJson(res, data, status, transformer?)` — usa `transformer.serialize(data)` se passado
2. Modificar `executeRoute(...args, transformer?)` — passa transformer para todos os `sendJson` calls
3. Modificar `start.ts` para `import { resolveTransformer } from '...'` + passar para cada `executeRoute` invocation
4. Modificar `api-middleware.ts` para mesmo wiring (recebe transformer via ApiMiddlewareOptions)
5. Modificar `vite-plugin/index.ts` para resolver transformer do config e passar
6. Emit `x-theo-transformer` header quando transformer != json
7. Integration test em `tests/integration/transformer-end-to-end.test.ts`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_default_json_no_transformer_header() — Given config.serialization default, When GET /api, Then response has no x-theo-transformer header
RED:     test_superjson_emits_header_and_preserves_date() — Given config.serialization='superjson', When response has Date, Then body is superjson JSON + header set
RED:     test_invalid_transformer_config_aborts_boot() — Given config.serialization='xml' (invalid), When loadConfig runs, Then Zod error
RED:     test_serialize_throws_returns_500_with_transformer_name() — Given handler returns BigInt + json transformer, When serialize, Then 500 with message naming the transformer
RED:     test_transformer_header_strip_falls_back_to_json() — Given CDN strips x-theo-transformer, When client receives, Then client falls back to JSON deserialize without crash (EC-5)
GREEN:   Wire transformer into sendJson + executeRoute + start + api-middleware
REFACTOR: Centralize "resolve transformer from config" if duplicated
VERIFY:  npx vitest run tests/integration/transformer-end-to-end.test.ts
```

BDD scenarios:
- **Happy path:** GET com Date → superjson preserva tipo via roundtrip
- **Validation error:** config inválido → erro Zod no boot
- **Edge case:** sem campo `serialization` → default `json`, comportamento atual
- **Error scenario:** valor não-serializável → 500 com mensagem útil

#### Acceptance Criteria
- [ ] `config.serialization='superjson'` produz roundtrip Date end-to-end
- [ ] Default sem mudança = JSON puro
- [ ] Header `x-theo-transformer` presente apenas em não-default
- [ ] Pass: vitest, tsc

#### DoD
- [ ] Tasks 1-7
- [ ] Existing 779 tests continuam verdes
- [ ] CHANGELOG entry

---

### T1.3 — Transformer plugado no `theoFetch`

#### Objective
`theoFetch` lê o transformer escolhido em build-time (via virtual module) e usa para deserializar response. Falha clara se server e client divergirem.

#### Evidence
Auditoria gap #2b. `theoFetch` linha (atual) faz `response.json()`. Para superjson roundtrip, precisa `superjson.deserialize(JSON.parse(text))`.

#### Files to edit
```
packages/theo/src/vite-plugin/index.ts — expose new virtual module /@theo/transformer
packages/theo/src/client/theo-fetch.ts — read virtual module, use transformer.deserialize
tests/unit/theo-fetch-transformer.test.ts — (NEW)
```

#### Deep file dependency analysis
- `vite-plugin/index.ts` ganha resolveId + load handlers para `/@theo/transformer`. Emite `export const TRANSFORMER_NAME = '...'` baseado em `config.serialization`.
- `theo-fetch.ts` importa de `/@theo/transformer` em build-time. Bundle estático escolhe transformer.
- Edge case: se virtual module não existir (theoFetch usado fora de Vite build), fallback para `json`.

#### Deep Dives
- **Build-time vs runtime decision:** transformer escolhido em build é estático; runtime check do header `x-theo-transformer` valida e warn se divergente.
- **Bundle size:** quando user escolhe `'json'`, superjson NÃO é incluído no client bundle (tree-shake friendly).
- **Mismatch handling:** se response trás `x-theo-transformer: superjson` mas client foi buildado com `'json'`, log warning + tenta deserialize como JSON puro (degrade graceful).

#### Tasks
1. Adicionar virtual module `/@theo/transformer` em `vite-plugin/index.ts`
2. Em `theo-fetch.ts`, importar transformer e usar `transformer.deserialize` em vez de `response.json()`
3. Implementar mismatch warning baseado em header
4. Tests unitários
5. Atualizar CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_theoFetch_uses_superjson_when_configured() — Given build with serialization='superjson', When fetch response has Date, Then result has Date type preserved
RED:     test_theoFetch_falls_back_to_json_outside_vite() — Given theo-fetch imported in non-Vite env, When fetch, Then JSON.parse default
RED:     test_theoFetch_warns_on_transformer_mismatch() — Given client built with 'json' but server emits 'superjson' header, When fetch, Then console.warn
RED:     test_theoFetch_propagates_deserialize_error() — Given malformed superjson payload, When fetch, Then error with transformer name
RED:     test_mismatch_warning_emitted_once_per_session() — Given mismatch detected, When 100 fetches happen, Then console.warn called exactly once (module-scope flag cache, EC-6)
GREEN:   Implement virtual module + theo-fetch read
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/theo-fetch-transformer.test.ts
```

BDD scenarios:
- **Happy path:** superjson → Date preservada
- **Validation error:** transformer mismatch → warn + degrade
- **Edge case:** fora de Vite build → fallback JSON
- **Error scenario:** deserialize throws → error com nome do transformer

#### Acceptance Criteria
- [ ] Date/Map preservada quando ambos lados em superjson
- [ ] Virtual module produz o nome correto
- [ ] Mismatch warning emitido
- [ ] Pass: vitest, tsc

#### DoD
- [ ] Tasks 1-5
- [ ] Backward compat 100% (default json)

---

### T1.4 — Endpoint `POST /api/__theo_batch__` server-side

#### Objective
Server reserva e responde a `POST /api/__theo_batch__` quando `config.batching === true`. Recebe array de requests, executa cada via `executeRoute`, retorna array de results com isolamento de erros.

#### Evidence
Auditoria gap #4. ADR D3 reservou a rota; server nunca implementou.

#### Files to edit
```
packages/theo/src/server/batch-handler.ts — (NEW) handler especial para batch requests
packages/theo/src/server/execute.ts — detectar URL __theo_batch__ e rotear para batch handler
packages/theo/src/server/scan.ts — emit erro se user route conflitar com __theo_batch__
packages/theo/src/config/schema.ts — adicionar campo batching: boolean (default false)
tests/integration/batch-endpoint.test.ts — (NEW)
```

#### Deep file dependency analysis
- `batch-handler.ts` (novo): exporta `handleBatchRequest(body, ctx, executeFn)`. Recebe `{ requests: [...] }`, itera, captura erros por item.
- `execute.ts` ou route matcher: detecta path `/api/__theo_batch__` ANTES do match normal, despacha para batch handler quando habilitado.
- `scan.ts` adiciona validação de colisão.

#### Deep Dives
- **Body shape:** `{ requests: [{ path, method, query?, body?, headers? }, ...] }`. Validado via Zod.
- **Per-item execution:** cada item monta um pseudo-Request, chama `executeRoute` com aquele context. Resultado capturado via response intercept.
- **Max batch size:** `config.batching.max ?? 32` — request maior aborta com 413.
- **Auth/middleware:** cada item passa pelo middleware como request normal — sessions, cookies aplicam.
- **Header injection prevention (EC-2, MUST FIX):** items podem declarar `headers?: Record<string, string>`, mas o batch handler **STRIPA** as seguintes keys antes de cada execução: `authorization`, `cookie`, `x-forwarded-for`, `x-forwarded-host`, `x-forwarded-proto`, `x-real-ip`, `host`. Esses headers vêm do request HTTP outer e NÃO podem ser sobrescritos por item — senão batch vira vetor de session bypass / spoofing. Demais headers (`content-type`, `x-custom-*`) são permitidos por item.
- **Allowed headers per-item:** apenas request-shape headers (content-type, accept, custom). Lista de stripped é constante em `batch-handler.ts`.

#### Tasks
1. Criar `batch-handler.ts` com `handleBatchRequest` + constant `STRIPPED_HEADERS = ['authorization', 'cookie', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'host']`
2. **EC-2 fix:** em `batch-handler.ts`, antes de invocar `executeRoute` por item, remover keys de `STRIPPED_HEADERS` do `item.headers ?? {}` e injetar headers do outer request
3. Modificar `execute.ts` para detectar URL e despachar
4. Adicionar campo `batching` no schema com sub-config max
5. Validar colisão em `scan.ts`
6. Integration test com 3 routes batched
7. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_batch_endpoint_processes_3_requests() — Given POST /api/__theo_batch__ with 3 items, When complete, Then 3 results in order
RED:     test_batch_one_item_fails_others_succeed() — Given 1 of 3 items hits 404, When response, Then index 0 ok, 1 error, 2 ok
RED:     test_batch_disabled_returns_404() — Given config.batching=false, When POST batch URL, Then 404 (route not found)
RED:     test_batch_size_exceeds_max_returns_413() — Given config.batching.max=2, When 3 items, Then 413
RED:     test_user_route_collision_aborts_scan() — Given server/routes/__theo_batch__.ts, When scan runs, Then BatchPathConflictError
RED:     test_batch_strips_authorization_header_per_item() — Given outer request has Authorization: outer, item declares Authorization: stolen, When item executes, Then auth middleware sees 'outer' not 'stolen' (EC-2)
RED:     test_batch_strips_cookie_header_per_item() — Given item declares cookie: forged, When item executes, Then cookie middleware sees outer cookies not forged (EC-2)
RED:     test_batch_strips_x_forwarded_headers_per_item() — Given item declares x-forwarded-for, When item executes, Then IP detection uses outer header (EC-2)
RED:     test_batch_allows_content_type_per_item() — Given item declares content-type: application/json, When item executes, Then content-type respected
GREEN:   Implement batch handler + routing + scan check + STRIPPED_HEADERS filter
REFACTOR: None expected
VERIFY:  npx vitest run tests/integration/batch-endpoint.test.ts
```

BDD scenarios:
- **Happy path:** 3 items → 3 results em ordem
- **Validation error:** body shape inválido → 400 com Zod issues
- **Edge case:** batching desabilitado → endpoint não existe (404)
- **Error scenario:** 1 item falha → outros não afetados

#### Acceptance Criteria
- [ ] Endpoint responde quando habilitado
- [ ] Per-item error isolation funcional
- [ ] Max size enforcement
- [ ] Collision detection no scan
- [ ] **Auth headers (Authorization/Cookie/X-Forwarded-*/Host) stripped from per-item headers (EC-2)**
- [ ] Pass: vitest, tsc

#### DoD
- [ ] Tasks 1-6
- [ ] Integration test passa

---

### T1.5 — `theoFetch` integrado com batcher

#### Objective
Quando `config.batching === true`, `theoFetch` enfileira no batcher global em vez de fetch direto. Transparente para o caller.

#### Evidence
Auditoria gap #3. `createBatcher` é primitive standalone; `theo-fetch.ts` nunca o usa.

#### Files to edit
```
packages/theo/src/vite-plugin/index.ts — expose new virtual module /@theo/runtime-config (batching flag)
packages/theo/src/client/theo-fetch.ts — import flag, branch behavior, share batcher singleton
packages/theo/src/client/batch-transport.ts — (NEW) default HTTP transport for batcher (POST /api/__theo_batch__)
tests/unit/theo-fetch-batched.test.ts — (NEW)
```

#### Deep file dependency analysis
- `theo-fetch.ts` ganha singleton `globalBatcher` lazy-instantiated.
- `batch-transport.ts` (novo) implementa `BatchTransport` que faz `fetch('/api/__theo_batch__', { body: JSON.stringify({ requests }) })`.
- Virtual module `/@theo/runtime-config` expõe `BATCHING_ENABLED: boolean`.

#### Deep Dives
- **Singleton scope:** batcher é per-page (Browser global). React renders multiple paralelos colapsam num único batch.
- **Backward compat:** projetos sem `config.batching=true` mantêm o fetch direto (zero overhead).
- **Error mapping:** batch response com error item → caller theoFetch reject com `TheoFetchError`.

#### Tasks
1. Criar virtual module `/@theo/runtime-config`
2. Criar `batch-transport.ts` com default HTTP transport
3. Modificar `theo-fetch.ts` para checar flag e usar batcher
4. Tests com batcher mock + transport real
5. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_theoFetch_uses_batcher_when_batching_enabled() — Given BATCHING_ENABLED=true, When 3 parallel theoFetch calls, Then 1 HTTP POST
RED:     test_theoFetch_individual_when_batching_disabled() — Given BATCHING_ENABLED=false, When 3 calls, Then 3 GET requests
RED:     test_theoFetch_propagates_per_item_batch_errors() — Given batch returns error for item 1, When the caller awaits, Then promise rejects with TheoFetchError
RED:     test_theoFetch_falls_back_when_batch_unavailable() — Given batch endpoint 404, When theoFetch runs, Then fallback to direct fetch (degrade)
RED:     test_batcher_isolated_per_request_in_ssr() — Given Node SSR using theoFetch, When 2 simultaneous SSR requests, Then their batchers do NOT share state (AsyncLocalStorage scope OR Node skips batcher entirely, EC-7)
GREEN:   Wire batcher into theoFetch
REFACTOR: Centralize "decide direct vs batched" if logic is repeated
VERIFY:  npx vitest run tests/unit/theo-fetch-batched.test.ts
```

BDD scenarios:
- **Happy path:** batching on, 3 chamadas → 1 HTTP request
- **Validation error:** batch response shape errada → fallback ou erro claro
- **Edge case:** batching off → comportamento atual preservado
- **Error scenario:** batch endpoint 404 → degrade gracefully para direct fetch (1 fallback)

#### Acceptance Criteria
- [ ] Theofetch transparente — mesma assinatura
- [ ] Batching reduz N requests para 1
- [ ] Fallback graceful quando endpoint indisponível
- [ ] Pass: vitest, tsc

#### DoD
- [ ] Tasks 1-5
- [ ] Existing theoFetch tests continuam verdes

---

## Phase 2: Adapter consolidation

**Objective:** Padronizar todos os 8 adapters no mesmo contrato runtime (web-shim + streaming + custom errors).

### T2.1 — Cloudflare adapter consome `web-shim`

#### Objective
Substituir o shim inline (~50 linhas) de `cloudflare.ts` por import de `theokit/adapters/web-shim`.

#### Evidence
Auditoria gap #6a. `cloudflare.ts` linha 18-66 emite worker entry com plain object req/res construído inline. `web-shim.ts` já faz exatamente isso de forma testada (6 unit tests).

#### Files to edit
```
packages/theo/src/adapters/cloudflare.ts — template emit reescrito para usar createWebShim
tests/unit/cloudflare-adapter.test.ts — atualizar assertions sobre o template emitido
```

#### Deep file dependency analysis
- Template novo: ~15 linhas em vez de ~50.
- Importa `createWebShim` + `executeRoute` + `matchRoute` + `scanServerRoutes` + `createProductionLoader` de `theokit/server` e `theokit/adapters/web-shim`.
- Wrangler/CF Workers precisam aceitar esses imports — confirmar bundling via `compatibility_flags = ['nodejs_compat']` (já tem).

#### Deep Dives
- **Workers + theokit/server (EC-3, MUST FIX):** o package `theokit` precisa estar deployable como Worker dependency. Sem `compatibility_flags = ['nodejs_compat']` no `wrangler.toml`, Worker quebra em runtime com `Module not found`. Sem `"theokit"` em `dependencies` (NÃO devDependencies) do projeto user, Wrangler não bundla. **Solução:** template emite header comment block no topo do `worker.mjs` declarando os requisitos explicitamente, e o `wrangler.toml` gerado JÁ inclui `nodejs_compat` (verificar que está). README da seção Deploy menciona.
- **Edge case:** Workers não tem `node:fs` mesmo com compat — `scanServerRoutes` (que lê disco) só pode rodar uma vez, no cold start. Cache em closure.

#### Tasks
1. Reescrever template de `cloudflare.ts` para usar `createWebShim`
2. **EC-3 fix:** template emite header comment block:
   ```
   // REQUIRES:
   //   - wrangler.toml: compatibility_flags = ["nodejs_compat"]
   //   - package.json: "theokit" listed in dependencies (NOT devDependencies)
   //   - Wrangler bundles theokit and its transitive deps automatically
   ```
3. Verificar que `wrangler.toml` gerado inclui `nodejs_compat` (já incluído — confirmar)
4. Atualizar tests que verificavam strings do shim antigo
5. Fixture `fixtures/adapter-cloudflare/` para smoke (não precisa rodar wrangler em CI)
6. README Deploy section menciona requirements
7. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_cf_template_imports_web_shim() — Given build CF, When template emitted, Then content contains "from 'theokit/adapters/web-shim'"
RED:     test_cf_template_imports_execute_pipeline() — Given build, Then template imports executeRoute + matchRoute + scanServerRoutes
RED:     test_cf_template_no_inline_shim() — Given build, Then template does NOT contain inline "writeHead, setHeader, getHeader" definitions
RED:     test_cf_template_caches_routes_at_cold_start() — Given build, Then template has lazy routesCache pattern (avoid scan per request)
RED:     test_cf_template_emits_requirements_header() — Given build, Then template starts with comment block mentioning nodejs_compat AND "theokit" in dependencies (EC-3)
RED:     test_cf_wrangler_toml_has_nodejs_compat() — Given build, Then wrangler.toml content includes compatibility_flags = ["nodejs_compat"] (EC-3)
GREEN:   Rewrite cloudflare.ts template using web-shim + emit requirements header
REFACTOR: Possibly extract a shared "emit standard template" helper if pattern repeats with vercel
VERIFY:  npx vitest run tests/unit/cloudflare-adapter.test.ts
```

BDD scenarios:
- **Happy path:** template novo importa web-shim corretamente
- **Validation error:** template inválido (sintaxe) → build falha
- **Edge case:** fixture sem `server/` → template ainda válido, retorna 404 para todos APIs
- **Error scenario:** worker exec throws → propaga 500 via shim

#### Acceptance Criteria
- [ ] Template < 30 linhas
- [ ] Importa web-shim e pipeline
- [ ] Não duplica logic inline
- [ ] Pass: vitest, tsc, build

#### DoD
- [ ] Tasks 1-4
- [ ] Existing CF tests passam ou atualizados
- [ ] Smoke verifica imports

---

### T2.2 — Vercel adapter consome `web-shim`

#### Objective
Mesma refatoração de T2.1 aplicada a `vercel.ts`. Remove o `await import('./theo-server/...')` path interno (legacy) em favor de imports normais.

#### Evidence
Auditoria gap #6b. `vercel.ts` linha 37-50 emite `await import('./theo-server/match.js')` etc — assumindo cópia de arquivos para `.vercel/output`. Switch para `theokit/server` import direto.

#### Files to edit
```
packages/theo/src/adapters/vercel.ts — template reescrito
tests/unit/vercel-adapter.test.ts — atualizar (se existir; se não, criar)
```

#### Deep file dependency analysis
- Mesmo padrão de T2.1.
- Vercel Functions ESM aceita `import` ESM normais — não precisa do path internal hack.

#### Deep Dives
- **Vercel routing config:** `config.json` continua igual (routing rules).
- **Bundle:** Vercel buildpack pode precisar de hint para incluir `theokit` no bundle da function. Verificar via fixture.

#### Tasks
1. Reescrever template de `vercel.ts`
2. Remover cópia manual de `theo-server/*` (não necessário)
3. Test unit para template novo
4. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_vercel_template_imports_web_shim() — template emits "from 'theokit/adapters/web-shim'"
RED:     test_vercel_template_no_path_internal_imports() — template does NOT use "./theo-server/" path
RED:     test_vercel_static_routing_preserved() — config.json continues to route /api/* and filesystem
RED:     test_vercel_function_entry_is_handler_default_export() — template exports default async function
GREEN:   Rewrite vercel.ts
REFACTOR: Extract shared template if duplicated with CF
VERIFY:  npx vitest run tests/unit/vercel-adapter.test.ts
```

BDD scenarios:
- **Happy path:** template novo emite handler ESM
- **Validation error:** config inválido aborta build (existing)
- **Edge case:** fixture sem API → static routing funciona
- **Error scenario:** function exec error → 500 via shim

#### Acceptance Criteria
- [ ] Template usa web-shim
- [ ] config.json correto preservado
- [ ] Pass: vitest, tsc

#### DoD
- [ ] Tasks 1-4
- [ ] Coverage de regression em fixture

---

### T2.3 — Streaming SSR consumido por adapters não-Node

#### Objective
Cloudflare/Bun/Vercel adapters checam `config.ssrStreaming` e usam `renderStreamingWeb` (readable stream) quando habilitado.

#### Evidence
Auditoria gap #7. `entry-server.ts` template emite `renderStreaming` (pipeable Node) quando streaming on. Adapters edge runtime não consomem.

#### Files to edit
```
packages/theo/src/router/entry-server.ts — adicionar export renderStreamingWeb (readableStream) quando streaming on
packages/theo/src/adapters/cloudflare.ts — usar renderStreamingWeb quando config.ssrStreaming
packages/theo/src/adapters/bun.ts — mesma lógica
packages/theo/src/adapters/vercel.ts — mesma lógica
tests/unit/streaming-ssr-web.test.ts — (NEW)
```

#### Deep file dependency analysis
- `entry-server.ts` ganha 2 exports quando streaming on: `renderStreaming` (Node) + `renderStreamingWeb` (Web). Adapters escolhem.
- Templates dos adapters fazem `const html = await renderStreamingWeb(url, { signal })` e retornam Response com body do readable stream.

#### Deep Dives
- **React 19 APIs:** `renderToReadableStream` retorna `{ allReady, ready, ...}`. Setup é diferente do pipeableStream.
- **Signal:** abort de Request propaga via signal nativo.
- **Cloudflare timeout:** 30s CPU limit — documentar.

#### Tasks
1. Adicionar `renderStreamingWeb` no entry-server quando streaming on
2. Modificar templates CF/Bun/Vercel
3. Tests unit
4. Fixture `streaming-ssr` testando ambos

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_entry_server_exports_renderStreamingWeb_when_on() — Given streaming on, Then template has "export async function renderStreamingWeb"
RED:     test_cf_template_uses_renderStreamingWeb_when_streaming() — Given config.ssrStreaming=true, Then template content contains "renderStreamingWeb"
RED:     test_bun_template_uses_renderStreamingWeb_when_streaming() — same for bun
RED:     test_non_streaming_falls_back_to_render() — Given streaming off, Then template uses render (single-shot)
RED:     test_cf_renderStreamingWeb_aborts_on_client_disconnect() — Given CF Worker with streaming SSR, When request.signal aborts mid-stream, Then React stream cancels and cleanup runs (EC-8)
GREEN:   Add renderStreamingWeb + update adapter templates
REFACTOR: Extract "render call" helper if duplicated across adapters
VERIFY:  npx vitest run tests/unit/streaming-ssr-web.test.ts
```

BDD scenarios:
- **Happy path:** streaming on em CF → readable stream emit
- **Validation error:** runtime sem readable stream support → log warning
- **Edge case:** streaming off → fallback ao render
- **Error scenario:** stream abort → cleanup

#### Acceptance Criteria
- [ ] renderStreamingWeb presente quando streaming on
- [ ] CF/Bun/Vercel consomem
- [ ] Pass: vitest, tsc

#### DoD
- [ ] Tasks 1-4
- [ ] Streaming SSR docs atualizadas para mencionar suporte cross-runtime

---

### T2.4 — Custom 4xx/5xx em todos os adapters

#### Objective
Adapters lêem `.theo/client/{404,500}.html` no boot e usam quando 404/500 ocorre.

#### Evidence
Auditoria gap #11. `start.ts` faz; outros adapters não.

#### Files to edit
```
packages/theo/src/server/execute.ts — sendError accepts custom HTML params
packages/theo/src/adapters/cloudflare.ts — template reads + uses custom HTML
packages/theo/src/adapters/bun.ts — same
packages/theo/src/adapters/vercel.ts — same
packages/theo/src/adapters/netlify.ts — same
packages/theo/src/adapters/aws-lambda.ts — same
packages/theo/src/adapters/deno-deploy.ts — same
tests/unit/custom-error-pages.test.ts — (NEW)
```

#### Deep file dependency analysis
- `sendError` ganha overload com `custom404Html?`, `custom500Html?` parameters.
- Cada template lê os arquivos no cold start, cacheia em closure, passa para `executeRoute` calls.

#### Deep Dives
- **Header preservation:** error responses ainda emit `x-request-id`.
- **Content-Type:** se custom HTML existe → `text/html`; senão → JSON default.

#### Tasks
1. Modificar `execute.ts` sendError para aceitar HTML custom
2. Atualizar cada template de adapter para ler arquivos no boot
3. Tests
4. Fixture com 404.html custom

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_404_serves_custom_html_when_present() — Given .theo/client/404.html exists, When 404, Then response body is custom HTML + Content-Type html
RED:     test_500_serves_custom_html_when_present() — same for 500
RED:     test_default_json_when_custom_missing() — Given no custom, When 404, Then JSON default
RED:     test_cf_template_loads_custom_pages() — Given CF build, Then template content includes "custom404Html" or similar variable
RED:     test_custom_error_html_size_capped_at_1mb() — Given .theo/client/404.html with 5MB content, When adapter boots, Then warning emitted + file ignored (degrade to JSON default, EC-9)
GREEN:   Wire custom HTML through executeRoute + each adapter template
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/custom-error-pages.test.ts
```

BDD scenarios:
- **Happy path:** 404.html custom serve corretamente
- **Validation error:** request inválido + 500.html → custom HTML
- **Edge case:** sem custom → JSON fallback
- **Error scenario:** custom file não-lido por perm → fallback gracefully JSON

#### Acceptance Criteria
- [ ] Custom HTML serve em todos os 6 adapters runtime (CF/Bun/Vercel/Netlify/AWS/Deno)
- [ ] Fallback JSON quando custom ausente
- [ ] Pass: vitest, tsc

#### DoD
- [ ] Tasks 1-4

---

## Phase 3: WebSocket cross-runtime

**Objective:** WS funciona em produção em Bun, Deno, Cloudflare (atualmente só em dev Node + `ws`).

### T3.1 — `theokit/adapters/ws-shim` entry

#### Objective
Novo entry export expondo 4 bridges WS, um por runtime. Cada bridge converte o handler `defineWebSocket` para a API nativa do runtime.

#### Evidence
Auditoria gap #8. WS roda em dev (vite uses `ws` package), nada em prod adapters.

#### Files to edit
```
packages/theo/src/adapters/ws-shim.ts — (NEW) 4 bridges + WebSocketLike interface
packages/theo/package.json — adicionar export "./adapters/ws-shim"
packages/theo/tsup.config.ts — adicionar entry
tests/unit/ws-shim.test.ts — (NEW)
```

#### Deep file dependency analysis
- `ws-shim.ts` exporta 4 funções: `createNodeWsBridge(server, handler)`, `createBunWsBridge(handler)`, `createDenoWsBridge(request, handler)`, `createCloudflareWsBridge(request, handler)`.
- Cada uma adapta a API nativa para a `WebSocketLike` interface do TheoKit.
- Templates dos adapters Bun/Deno/CF importam o bridge correspondente.

#### Deep Dives
- **WebSocketLike interface:** `{ send(data), close(code?, reason?), on(event, cb) }` — common denominator.
- **Cloudflare:** usa `WebSocketPair`, retorna response com `webSocket` upgrade.
- **Bun:** usa `Bun.serve({ websocket })` com `open/message/close` callbacks.
- **Deno:** usa `Deno.upgradeWebSocket(request)` que retorna `{ response, socket }`.

#### Tasks
1. Criar `ws-shim.ts` com 4 bridges
2. Adicionar exports + tsup entry
3. Tests
4. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_node_bridge_calls_handler_on_message() — Given Node ws + handler, When message arrives, Then handler.onMessage called
RED:     test_bun_bridge_returns_serve_websocket_config() — Given handler, Then result has open/message/close functions
RED:     test_deno_bridge_returns_response_with_upgrade() — Given request, Then response has 101 upgrade headers
RED:     test_cf_bridge_returns_websocketpair_response() — Given handler, Then response carries webSocket pair
RED:     test_ws_handler_open_called_before_any_message() — For each runtime (Node, Bun, Deno, CF), Given handler subscribes to onMessage, When client connects and sends immediately, Then onOpen fires BEFORE first onMessage (buffer if needed, EC-10)
GREEN:   Implement 4 bridges
REFACTOR: Extract WebSocketLike adapter helper
VERIFY:  npx vitest run tests/unit/ws-shim.test.ts
```

BDD scenarios:
- **Happy path:** mensagem chega no handler em todos os 4 runtimes
- **Validation error:** handler retorna erro → close com code apropriado
- **Edge case:** client desconecta → handler.onClose chamado
- **Error scenario:** message não-serializable → emit erro via channel

#### Acceptance Criteria
- [ ] 4 bridges funcionais
- [ ] Entry publicamente importável
- [ ] Pass: vitest, tsc

#### DoD
- [ ] Tasks 1-4

---

### T3.2 — Bun adapter wire WS via shim

#### Objective
Bun adapter template chama `createBunWsBridge` para WS routes, passa o config para `Bun.serve`.

#### Evidence
Necessidade direta após T3.1.

#### Files to edit
```
packages/theo/src/adapters/bun.ts — wire WS bridge in template
tests/unit/bun-adapter.test.ts — adicionar test "wires WS"
```

#### Deep file dependency analysis
- Template novo: `import { createBunWsBridge } from 'theokit/adapters/ws-shim'`.
- Scan de `server/ws/` no boot, cria bridges, configura `Bun.serve({ websocket: bridgeConfig })`.

#### Deep Dives
- **Multiple WS routes:** `Bun.serve` aceita single `websocket` config — route por URL via `bridge.handler(url)`.

#### Tasks
1. Scan WS routes no template bun
2. Configurar `Bun.serve` com bridge
3. Test
4. CHANGELOG

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_bun_template_imports_ws_bridge() — Given bun build, Then template content has "createBunWsBridge"
RED:     test_bun_template_scans_ws_routes() — template has "scanWebSocketRoutes" call
RED:     test_bun_template_configures_serve_websocket() — template configures Bun.serve({ websocket: ... })
RED:     test_bun_template_handles_no_ws_routes_gracefully() — fixture without ws/, template doesn't break
GREEN:   Update bun.ts template
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/bun-adapter.test.ts
```

BDD scenarios:
- **Happy path:** WS message → handler invoked
- **Validation error:** WS endpoint inexistente → 404 (não upgrade)
- **Edge case:** sem WS routes → template skip
- **Error scenario:** handler throws → close com code 1011

#### Acceptance Criteria
- [ ] Template emite WS wiring
- [ ] Sem WS routes não emite código WS
- [ ] Pass: vitest, tsc

#### DoD
- [ ] Tasks 1-4

---

### T3.3 — Deno adapter wire WS via shim

(estrutura idêntica a T3.2 para Deno)

#### Objective
Deno template usa `createDenoWsBridge` em request handler.

#### Files to edit
```
packages/theo/src/adapters/deno-deploy.ts
tests/unit/deno-adapter.test.ts
```

#### Tasks
1. Detect upgrade requests no template Deno
2. Call `createDenoWsBridge(request, handler)`
3. Test

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_deno_template_imports_ws_bridge()
RED:     test_deno_template_detects_upgrade_requests() — template checks `request.headers.get('upgrade') === 'websocket'`
RED:     test_deno_template_returns_upgrade_response()
RED:     test_deno_no_ws_routes_handled_gracefully()
GREEN:   Update deno-deploy.ts template
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/deno-adapter.test.ts
```

BDD scenarios:
- **Happy path / Validation / Edge / Error:** mesma estrutura de T3.2.

#### Acceptance Criteria + DoD
Idêntico a T3.2.

---

### T3.4 — Cloudflare adapter wire WS via shim

#### Objective
CF template detecta WS upgrade, retorna `WebSocketPair` response.

#### Files to edit
```
packages/theo/src/adapters/cloudflare.ts
tests/unit/cloudflare-adapter.test.ts
```

#### Tasks
1. Detect upgrade in CF template
2. Call `createCloudflareWsBridge`
3. Test

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_cf_template_imports_ws_bridge()
RED:     test_cf_template_detects_upgrade()
RED:     test_cf_template_returns_101_with_webSocket_pair()
RED:     test_cf_no_ws_routes_handled_gracefully()
GREEN:   Update cloudflare.ts template
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/cloudflare-adapter.test.ts
```

BDD scenarios: mesmo padrão.

#### Acceptance Criteria + DoD
Idêntico a T3.2.

---

## Phase 4: Client ergonomics

### T4.1 — `useTheoQuery` hook direto

#### Objective
`useTheoQuery(path, options, fetcher)` é hook one-liner. Internamente usa `useQuery` + `buildUseTheoQueryConfig`.

#### Evidence
Auditoria gap #9. Plano antigo prometeu hook direto; entregamos config builder.

#### Files to edit
```
packages/theokit-react-query/src/index.ts — adicionar useTheoQuery
packages/theokit-react-query/package.json — peer deps require @tanstack/react-query (não mais optional)
tests/unit/use-theo-query.test.tsx — (NEW)
```

#### Deep file dependency analysis
- Novo export `useTheoQuery<TResult>(path, options, fetcher)` wraps `useQuery(buildUseTheoQueryConfig(path, options, fetcher))`.
- Peer dep muda — package.json atualiza.

#### Deep Dives
- **Types:** `TResult` inferido do fetcher signature.
- **Options pass-through:** terceiro arg pode ser `{ enabled?, refetchInterval?, ...useQueryOptions }`.

#### Tasks
1. Implementar `useTheoQuery`
2. Atualizar package.json peer deps
3. Tests com `@testing-library/react`
4. Atualizar README do package

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_useTheoQuery_returns_data() — Given fetcher returns data, When mounted, Then data eventually resolved
RED:     test_useTheoQuery_stable_key_no_refetch() — Given inline options { query: { x:1 } } in re-renders, When mounted, Then queryFn called once
RED:     test_useTheoQuery_propagates_error() — Given fetcher throws, When mounted, Then error state set
RED:     test_useTheoQuery_typed_data() — Given fetcher returns { users }, When destructured, Then type matches (type test)
RED:     test_useTheoQuery_emits_use_client_error_in_rsc() — Given useTheoQuery imported in a file without "use client", When React tries to render in RSC context, Then clear error "useTheoQuery is a Client Component hook; add 'use client' to this file" (EC-11)
GREEN:   Implement hook
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/use-theo-query.test.tsx
```

BDD scenarios:
- **Happy path:** dados retornados, key estável
- **Validation error:** options inválido → error state
- **Edge case:** sem options → query sem args
- **Error scenario:** fetcher throws → propagated

#### Acceptance Criteria
- [ ] Hook one-liner funcional
- [ ] Stable key (EC-10)
- [ ] Pass: vitest, tsc

#### DoD
- [ ] Tasks 1-4

---

## Phase 5: Body parser portability

### T5.1 — FormData multipart para non-Node runtimes

#### Objective
`body-parser.ts` detecta shape do request e usa `request.formData()` (Web Standards) quando disponível, busboy quando Node IncomingMessage.

#### Evidence
Auditoria gap #10. busboy é Node-only — Deno breaks.

#### Files to edit
```
packages/theo/src/server/body-parser.ts — adicionar branch web-vs-node
tests/unit/body-parser-web.test.ts — (NEW)
```

#### Deep file dependency analysis
- `parseRequestBody(req)` ganha branch: se `req instanceof Request` (Web Standard) → `formData()`; senão → busboy path.
- Web shim (`createWebShim`) hoje converte Request para Node-style req — pode-se evitar essa conversion para multipart e passar Request original adiante.

#### Deep Dives
- **`request.formData()`** retorna FormData. Iterar `entries()` para extrair fields + files (Blob).
- **Files:** Blob → buffer via `arrayBuffer()` para compatibilidade com `UploadedFile` type.
- **Size limits via Content-Length pre-check (EC-4, MUST FIX):** `request.formData()` materializa o body inteiro em memória ANTES de retornar — sem pre-check, request de 2GB → OOM no Worker/Lambda/Bun. **Solução:** antes de chamar `formData()`, ler `Content-Length` header e abortar com 413 se exceder `config.upload.maxFileSize * config.upload.maxFiles + 1MB` (1MB de margin para encoding overhead). 3 linhas:
  ```typescript
  const contentLength = Number(req.headers.get('content-length') ?? '0')
  const maxTotal = opts.maxFileSize * opts.maxFiles + 1_048_576
  if (contentLength > maxTotal) throw new Error('Request body too large')
  ```
- **Idempotent parse (EC-12, SHOULD TEST):** body stream pode ser consumido só uma vez. Se `parseRequestBody` é chamado segunda vez, deve retornar cached result em vez de tentar consumir de novo. Atual implementação Node já tem isso implicitamente (busboy não retry). Web path precisa cache explícito num WeakMap por Request.

#### Tasks
1. Adicionar branch web em parseRequestBody (detecta `req instanceof Request`)
2. **EC-4 fix:** ANTES de `request.formData()`, ler Content-Length e abortar com erro `RequestBodyTooLargeError` (413) se exceder `maxFileSize * maxFiles + 1MB margin`
3. **EC-12 cache:** mantém WeakMap<Request, Promise<ParsedBody>> para idempotência
4. Wrapper Web → ParsedBody equivalente
5. Tests cobrindo ambos paths
6. Fixture multipart upload em Deno e Bun

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_parseRequestBody_web_formData_extracts_fields_and_files() — Given Web Request with multipart, When parsed, Then fields + files separados
RED:     test_parseRequestBody_node_path_still_works() — Given Node IncomingMessage multipart, When parsed via busboy, Then continues working
RED:     test_parseRequestBody_web_respects_max_file_size() — Given Web Request with oversize file, When parsed, Then error
RED:     test_parseRequestBody_web_handles_no_files() — Given Web Request multipart with only fields, When parsed, Then files: []
RED:     test_parseRequestBody_web_rejects_oversize_via_content_length() — Given Content-Length=2GB and maxTotal=10MB, When parseRequestBody called, Then throws RequestBodyTooLargeError BEFORE consuming body (EC-4)
RED:     test_parseRequestBody_web_idempotent_second_call() — Given parseRequestBody called once and resolves, When called again on SAME Request, Then returns cached result (no body re-consumption error) (EC-12)
GREEN:   Add Web branch + Content-Length pre-check + WeakMap cache
REFACTOR: Centralize fields/files normalization
VERIFY:  npx vitest run tests/unit/body-parser-web.test.ts
```

BDD scenarios:
- **Happy path:** Web multipart → fields + files extraídos
- **Validation error:** oversize → erro com nome do arquivo
- **Edge case:** Web request com Content-Type não-multipart → fields vazios, JSON path
- **Error scenario:** FormData() throws → erro propagado

#### Acceptance Criteria
- [ ] Multipart funciona em Deno
- [ ] Multipart continua em Node via busboy
- [ ] **Content-Length pre-check rejeita oversize antes de materializar (EC-4)**
- [ ] **Second-call retorna cached result (EC-12 idempotência)**
- [ ] Pass: vitest, tsc

#### DoD
- [ ] Tasks 1-4

---

## Phase 6: Registry honesty

### T6.1 — `theokit add` instala adapters bundled (não pacotes fictícios)

#### Objective
`theokit add <X>` reconhece que adapters são bundled e imprime instruções de uso em vez de tentar instalar package inexistente. Continua aceitando `kind: 'external'` para futuro plugin ecosystem.

#### Evidence
Auditoria gap #5. Registry aponta para `theokit-adapter-bun` etc. que não existem.

#### Files to edit
```
packages/theo/src/cli/commands/add.ts — KNOWN_PACKAGES ganha campo kind, branch behavior
tests/unit/cli-add.test.ts — atualizar tests
```

#### Deep file dependency analysis
- `KNOWN_PACKAGES` shape muda: `Record<string, { kind: 'bundled' | 'external'; npm?: string; usage: string }>`.
- Para `bundled`: imprime usage snippet (e.g., `theokit build --target=bun`).
- Para `external`: roda spawn pnpm/npm add (existing path).

#### Deep Dives
- **EC-4 security:** validação de input regex permanece.
- **Backward compat:** existing tests precisam atualizar — `npm` field continua existindo só para `external` kind.

#### Tasks
1. Refatorar `KNOWN_PACKAGES` com novo shape
2. Branch em `runAdd` baseado em kind
3. Atualizar tests
4. Atualizar README CLI section

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_add_bundled_adapter_prints_usage_no_spawn() — Given input='bun' (bundled), When runAdd, Then no spawn called, usage printed
RED:     test_add_external_package_spawns_pm() — Given input='plugin-sentry' (external example, kind: external), Then spawn called
RED:     test_add_unknown_still_errors_with_suggestion() — same as before
RED:     test_add_validates_input_regex_first() — security path preserved (EC-4)
GREEN:   Refactor KNOWN_PACKAGES + branch
REFACTOR: Extract bundled-vs-external decision helper
VERIFY:  npx vitest run tests/unit/cli-add.test.ts
```

BDD scenarios:
- **Happy path:** `theokit add bun` → usage snippet, no spawn
- **Validation error:** input malicioso → rejected (EC-4)
- **Edge case:** unknown name → suggestion
- **Error scenario:** spawn failure (external) → exit code propagated

#### Acceptance Criteria
- [ ] `theokit add bun` não tenta pnpm add
- [ ] Usage snippet preciso
- [ ] EC-4 mantido
- [ ] Pass: vitest, tsc

#### DoD
- [ ] Tasks 1-4

---

## Phase 7: Dogfood QA (MANDATORY)

> This phase runs AFTER all implementation phases are complete. The plan is NOT done until dogfood passes.

**Objective:** Validar que cada gap fechado realmente funciona end-to-end.

### Execution

Rodar `/dogfood full` (ou o `scripts/dogfood-smoke.sh` proxy). Adicionar 4 checks novos no smoke:

1. Plugin hook fires em `theokit dev`
2. `theoFetch` com Date → roundtrip preserves
3. `POST /api/__theo_batch__` responds with results array
4. `theokit add bun` does NOT spawn pnpm

### Acceptance Criteria

- [ ] Health score ≥ 85/100
- [ ] Zero CRITICAL issues introduzidos
- [ ] Zero HIGH issues nos features modificados (plugins, transformer, batching, adapter shim, registry)
- [ ] Pre-existing issues documentados (não causados por este plano)

### If Dogfood Fails

1. Identificar gaps causados por este plano vs pre-existing
2. Corrigir CRITICAL/HIGH causados
3. Re-rodar dogfood
4. Pre-existing issues logados mas não bloqueiam

---

## Coverage Matrix

| # | Gap | Task(s) | Resolution |
|---|---|---|---|
| 1 | Plugins não funcionam em dev mode | T1.1 | `vite-plugin/index.ts` instancia runner + passa para api/action middlewares |
| 2 | Transformer não plugado em runtime | T1.2 + T1.3 | `executeRoute` aceita transformer; `theoFetch` lê virtual module `/@theo/transformer` |
| 3 | `theoFetch` não usa batcher | T1.5 | `theoFetch` enfileira no `globalBatcher` quando `BATCHING_ENABLED` |
| 4 | Endpoint `/api/__theo_batch__` inexistente | T1.4 | Server-side handler implementado, scan detecta colisões |
| 5 | Registry `theokit add` packages fictícios | T6.1 | `KNOWN_PACKAGES` ganha kind; bundled adapters não spawn |
| 6 | Cloudflare/Vercel não usam web-shim | T2.1 + T2.2 | Templates reescritos para importar `createWebShim` |
| 7 | Streaming SSR só em Node | T2.3 | `renderStreamingWeb` exportado + consumido por CF/Bun/Vercel |
| 8 | WS apenas em dev | T3.1 + T3.2 + T3.3 + T3.4 | `ws-shim` entry com 4 bridges, adapters wire WS |
| 9 | `useTheoQuery` hook direto | T4.1 | `@theokit/react-query` exporta hook one-liner |
| 10 | Multipart parser Node-only | T5.1 | Web FormData branch em `body-parser.ts` |
| 11 | Custom 404/500 só Node | T2.4 | Adapters lêem e passam para `executeRoute.sendError` |

**Coverage: 11/11 gaps cobertos (100%).**

## Edge cases incorporados (revisão 2026-05-17)

Tabela rastreando os 15 ECs do `edge-case-plan` review:

| EC | Severidade | Task | Como foi tratado |
|---|---|---|---|
| EC-1 | MUST FIX | T1.1 | Subtask 2 (configResolved + warn on change) + 2 BDD scenarios |
| EC-2 | MUST FIX | T1.4 | Subtask 2 (STRIPPED_HEADERS) + 4 BDD scenarios + AC |
| EC-3 | MUST FIX | T2.1 | Subtask 2-3 (requirements header + wrangler.toml) + 2 BDD scenarios |
| EC-4 | MUST FIX | T5.1 | Subtask 2 (Content-Length pre-check) + 1 BDD scenario + AC |
| EC-5 | SHOULD TEST | T1.2 | 1 BDD scenario `transformer_header_strip_falls_back_to_json` |
| EC-6 | SHOULD TEST | T1.3 | 1 BDD scenario `mismatch_warning_emitted_once_per_session` |
| EC-7 | SHOULD TEST | T1.5 | 1 BDD scenario `batcher_isolated_per_request_in_ssr` |
| EC-8 | SHOULD TEST | T2.3 | 1 BDD scenario `cf_renderStreamingWeb_aborts_on_client_disconnect` |
| EC-9 | SHOULD TEST | T2.4 | 1 BDD scenario `custom_error_html_size_capped_at_1mb` |
| EC-10 | SHOULD TEST | T3.1+T3.2-4 | 1 BDD scenario `ws_handler_open_called_before_any_message` |
| EC-11 | SHOULD TEST | T4.1 | 1 BDD scenario `useTheoQuery_emits_use_client_error_in_rsc` |
| EC-12 | SHOULD TEST | T5.1 | Subtask 3 (WeakMap cache) + 1 BDD scenario + AC |
| EC-13 | DOCUMENT | T1.5 | Deep Dive note: primeira chamada paga custo de descoberta |
| EC-14 | DOCUMENT | T3.4 | CHANGELOG entry: `@cloudflare/workers-types` peer dep para typecheck |
| EC-15 | DOCUMENT | T4.1 | CHANGELOG `[BREAKING]`: peer dep change → bump major do `@theokit/react-query` |

## Global Definition of Done

- [ ] All 7 phases completed
- [ ] All tests passing (Vitest unit + integration + type + Playwright E2E)
- [ ] Zero TypeScript errors (`tsc --noEmit`)
- [ ] Zero lint warnings (no lint configured; tsc strict + `any-audit` cover)
- [ ] Backward compatibility preserved (apps em 0.1.x rodam sem mudança)
- [ ] Code-audit checks passing
- [ ] **Plan-specific:**
  - [ ] `defineTheoPlugin` em config dispara hooks em `theokit dev`
  - [ ] Superjson end-to-end com Date preservada
  - [ ] 3 paralelas `theoFetch` → 1 HTTP POST
  - [ ] `POST /api/__theo_batch__` retorna array de results
  - [ ] `theokit add bun` imprime usage, não spawn
  - [ ] CF + Vercel templates importam `createWebShim`
  - [ ] CF + Bun + Vercel consomem `renderStreamingWeb` quando streaming on
  - [ ] WS funciona em Bun + Deno + CF prod (não só Node dev)
  - [ ] `useTheoQuery` hook one-liner exportado
  - [ ] Multipart upload funciona em Deno
  - [ ] Custom 404.html honrado em todos os adapters
- [ ] **Dogfood QA PASS** — health score ≥ 85, zero CRITICAL/HIGH causados
- [ ] **Fixture proof** — `fixtures/plugin-example/`, `fixtures/batch-example/`, `fixtures/ws-cross-runtime/`, `fixtures/custom-error-pages/`
- [ ] **Cross-validation PASS** — `/cross-validation gap-closure-plan` antes do dogfood

---

## Post-Implementation Hooks

1. Rodar `/edge-case-plan gap-closure-plan` (será disparado automaticamente pelo to-plan skill)
2. Implementar phases em ordem (1 → 2 → 3/4/5/6 paralelos → 7)
3. Rodar `/cross-validation gap-closure-plan` antes do dogfood final
4. Rodar `/dogfood full` (ou proxy script atualizado)
5. Rodar `/architecture-docs` AFTER se houve mudanças arquiteturais (provável em vite-plugin + adapters)
