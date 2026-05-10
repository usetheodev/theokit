# Plan: Cross-Validation Gaps — Theo vs Next.js vs Rails

> **Version 1.0** — Este plano resolve TODOS os gaps identificados na cross-validation do Theo framework contra as implementações de referência Next.js e Rails. São 10 gaps organizados em 8 fases de implementação por severidade (ALTA → BAIXA), garantindo que o Theo alcance paridade competitiva com frameworks maduros sem sacrificar suas vantagens em type safety e simplicidade. O resultado final é um framework pronto para produção com file upload, route manifests, middleware composável, logging estruturado, catch-all routes, serialização rica, config por environment, error suggestions e WebSocket channels.

## Context

A cross-validation do Theo (2,804 LOC) contra Next.js (100K+ LOC) e Rails (250K+ LOC) revelou 10 gaps organizados por severidade:

**ALTA** (bloqueante para uso real):
- Gap #3: File upload (multipart/FormData) — Next.js usa busboy, Rails usa Rack::Multipart. Theo só aceita JSON.

**MÉDIA** (impacto em DX ou produção):
- Gap #1/#7: Route manifest em produção — Next.js gera 10+ manifests no build. Theo escaneia filesystem por request em `start.ts` (linhas 97, 124).
- Gap #5: Middleware composável — Rails tem middleware stack com `insert_before`/`insert_after`. Theo tem 1 arquivo `server/middleware.ts`.
- Gap #10: Structured logging — Rails tem TaggedLogging. Theo tem `logger.ts` (29 linhas) com `console.log(JSON.stringify(...))`.

**BAIXA** (nice-to-have, pós-MVP):
- Gap #2: Catch-all routes (`[...slug]`) — Next.js suporta. Theo não.
- Gap #4: Serialização rica (Date, Map, Set) — Next.js usa `devalue`. Theo só JSON.
- Gap #6: Config por environment — Rails tem `config/environments/`, Next.js tem phases. Theo não distingue.
- Gap #8: Error recovery suggestions — Rails tem `ActionableExceptions`. Theo não.
- Gap #9: WebSocket pub/sub — Rails tem ActionCable channels. Theo tem raw WS.

**Evidência de performance issue em start.ts:**
```typescript
// Linha 97 — scanServerActions chamado POR REQUEST em produção
const actions = scanServerActions(serverDir)
// Linha 124 — scanServerRoutes chamado POR REQUEST em produção
const routes = scanServerRoutes(serverDir)
```
Isto é O(n) filesystem I/O por request. Inaceitável para produção.

## Objective

Resolver 10/10 gaps (100%) da cross-validation, mantendo as vantagens do Theo em type safety, simplicidade e zero-overhead identity functions.

**Metas específicas:**
- Routes e actions escaneadas UMA VEZ no build, carregadas do manifest em produção
- Suporte a `multipart/form-data` em routes e actions
- Middleware composável via array de handlers
- Logger estruturado com níveis, contexto e output configurável
- Catch-all routes `[...param]`
- Serialização rica com superjson
- Config por environment via `theo.config.{env}.ts`
- Sugestões de correção em erros comuns
- WebSocket channels com rooms e broadcast

## ADRs

### D1 — Route Manifest como JSON em .theo/manifest.json

**Decision:** Gerar um `manifest.json` durante `theo build` contendo routes, actions e WebSocket endpoints pré-escaneados. O `theo start` carrega este manifest em vez de escanear o filesystem.

**Rationale:** Next.js prova que manifests eliminam I/O em runtime. O scan atual em `start.ts` faz `readdirSync` + `statSync` recursivos por request — completamente desnecessário em produção onde os arquivos não mudam. JSON é simples de gerar e carregar. Alternativas consideradas: SQLite (overhead desnecessário), JS module (não serializa regex). JSON com recompilação de patterns no load é o sweet spot.

**Consequences:** Build time aumenta marginalmente (~5ms). Cold start em produção reduz drasticamente. Dev mode continua com scan por request (necessário para HMR). Regex patterns não são serializáveis — precisam ser recompilados do `routePath` no load.

### D2 — Busboy para multipart parsing

**Decision:** Usar `busboy` como dependência para parsing de `multipart/form-data`, encapsulado atrás de uma interface interna `parseMultipart()`.

**Rationale:** Next.js usa busboy com sucesso. É a lib mais madura, battle-tested, sem dependências transitivas pesadas. Alternativas: `formidable` (mais pesado, mais features desnecessárias — YAGNI), `multer` (Express-specific), implementação própria (proibido pela seção 9 — não reinvente a roda). Busboy é stream-based, eficiente para arquivos grandes.

**Consequences:** Nova dependência no `packages/theo`. Arquivos ficam em memória por default (buffer), com opção de disk em config futura. Limite de tamanho configurável via `theoConfigSchema`.

### D3 — Middleware como array ordenado

**Decision:** Middleware passa de arquivo único (`server/middleware.ts`) para suporte a diretório (`server/middleware/`) com arquivos numerados (`01-cors.ts`, `02-auth.ts`) OU export de array no arquivo único.

**Rationale:** Rails prova que middleware composável é essencial para aplicações reais. A abordagem de diretório com prefixo numérico é explícita (KISS) e não requer configuração de ordem (convention over configuration). Manter backward compat com arquivo único. Alternativas: config em `theo.config.ts` (mistura concerns), builder pattern (over-engineering).

**Consequences:** `middleware-runner.ts` precisa suportar array de handlers. Ordem determinística via sort alfanumérico. Backward compatible — arquivo único continua funcionando.

### D4 — Logger com níveis e output plugável

**Decision:** Expandir `logger.ts` com níveis (`debug`, `info`, `warn`, `error`), contexto enriquecido (`method`, `url`, `status`, `duration`, `requestId`, `userAgent`, `ip`) e output configurável via `createLogger()`.

**Rationale:** O logger atual (29 linhas) é funcional mas insuficiente para debugging em produção. Rails tem `TaggedLogging` com tagged output. Next.js tem hooks de instrumentação. Não adicionar dependência externa — structured JSON logging é simples de implementar. Alternativa: pino/winston (overhead desnecessário para o que precisamos — YAGNI + KISS).

**Consequences:** API pública nova: `createLogger()` exportado de `theokit/server`. Backward compat: `logRequest()` continua funcionando. Configurável via `theo.config.ts`.

### D5 — Catch-all via convenção `[...param]`

**Decision:** Suportar `[...param]` em nomes de arquivo para catch-all routes, compilando para regex `(.+)` em vez de `([^/]+)`.

**Rationale:** Next.js usa esta mesma convenção. É intuitiva e consistente com o pattern existente de `[param]`. Rails usa `*glob` — a convenção Next.js é mais natural para ecosistema TypeScript.

**Consequences:** `scan.ts` e `match.ts` precisam reconhecer o pattern. Catch-all routes devem ser ordenadas DEPOIS de todas as específicas. Sem optional catch-all (`[[...param]]`) — YAGNI por agora.

### D6 — superjson para serialização rica

**Decision:** Usar `superjson` para serializar/deserializar tipos JavaScript nativos (Date, Map, Set, RegExp, BigInt, undefined, NaN, Infinity) em responses de routes e actions.

**Rationale:** Next.js usa `devalue` mas `superjson` é mais popular no ecosistema TS (TanStack, tRPC). Suporta roundtrip completo. Alternativa: implementação própria (viola seção 9). Opt-in via flag no config para não quebrar JSON puro.

**Consequences:** Nova dependência. Client `theoFetch` precisa deserializar com superjson quando ativado. Header `X-Theo-Serialization: superjson` para sinalizar ao client.

### D7 — Config por environment via merge de arquivos

**Decision:** Suportar `theo.config.{NODE_ENV}.ts` que é merged sobre `theo.config.ts`. Ex: `theo.config.production.ts` override para prod.

**Rationale:** Rails tem `config/environments/*.rb`. Next.js tem phases. A abordagem de arquivo separado é mais simples que phases (KISS) e não requer API nova. Deep merge simples dos objetos.

**Consequences:** `loadConfig()` precisa tentar carregar o arquivo env-specific e mergear. Ambiente determinado por `NODE_ENV`. Arquivo env-specific é opcional.

### D8 — Sugestões de correção via distância de Levenshtein

**Decision:** Quando uma route ou action não é encontrada, sugerir a mais próxima usando distância de Levenshtein. Mensagens de erro de config já são boas — estender para runtime.

**Rationale:** Rails tem `ActionableExceptions` com sugestões. Levenshtein é simples (20 linhas), sem dependência externa. Melhora DX significativamente em typos comuns como `/api/uesrs` → "Did you mean /api/users?"

**Consequences:** Função utilitária `suggest()` reusável. Aplicada em rotas 404 e actions 404. Mensagem inclui "Did you mean: {sugestão}?" quando distância < 3.

### D9 — WebSocket channels com rooms e broadcast

**Decision:** Adicionar abstração `defineChannel()` sobre `defineWebSocket()` para suportar rooms e broadcast. Inspirado em ActionCable mas mais simples.

**Rationale:** Rails ActionCable prova que raw WS é insuficiente para apps reais (chat, notifications, realtime). A abstração de channel/room é o pattern consagrado. Manter `defineWebSocket` para uso low-level. `defineChannel` é açúcar sobre ele.

**Consequences:** Nova API: `defineChannel()` com `onSubscribe`, `onMessage`, `onUnsubscribe`. In-memory room manager (sem Redis — YAGNI para MVP). Backward compat total — `defineWebSocket` não muda.

## Dependency Graph

```
Phase 0 (Manifest) ──▶ Phase 1 (File Upload) ──▶ Phase 3 (Middleware)
        │                                               │
        │                                               ▼
        │                                         Phase 4 (Logging)
        │
        ├──▶ Phase 2 (Catch-all) [parallel com Phase 1]
        │
        └──▶ Phase 5 (Serialização) [parallel com Phase 1]

Phase 6 (Config Env) [independente, parallel com qualquer]

Phase 7 (Error Suggestions) [independente, parallel com qualquer]

Phase 8 (WS Channels) [independente, parallel com qualquer]

Phase 9 (Dogfood QA) [sequencial, depois de TUDO]
```

- **Phase 0** é bloqueante para Phases 1, 2, 5 (manifest precisa suportar novos route types)
- **Phases 2, 5, 6, 7, 8** podem rodar em paralelo entre si
- **Phase 3** precisa de Phase 1 (middleware precisa lidar com multipart bodies)
- **Phase 4** precisa de Phase 3 (logging precisa logar middleware chain)
- **Phase 9** é sempre última

---

## Phase 0: Route Manifest em Produção

**Objective:** Eliminar filesystem scanning por request em produção, gerando manifest no build e carregando-o no start.

### T0.1 — Criar módulo de manifest (geração e carregamento)

#### Objective
Criar `packages/theo/src/server/manifest.ts` com funções para gerar e carregar o manifest JSON contendo routes, actions e WebSocket endpoints.

#### Evidence
`start.ts:97` chama `scanServerActions(serverDir)` por request. `start.ts:124` chama `scanServerRoutes(serverDir)` por request. Ambos fazem `readdirSync` recursivo — O(n) I/O síncrono por request HTTP. Em produção com 50 routes, isso são ~150 syscalls por request desnecessários.

#### Files to edit
```
packages/theo/src/server/manifest.ts — (NEW) Tipos e funções de manifest
packages/theo/src/server/index.ts — Exportar novas funções e tipos
```

#### Deep file dependency analysis
- `manifest.ts` (NEW): Importa `scanServerRoutes` de `scan.ts`, `scanServerActions` de `action-scan.ts`, `scanWebSocketRoutes` de `ws-scan.ts`, `compilePattern` de `match.ts`. Gera JSON. Nenhum dependente downstream por enquanto — será consumido por `build.ts` e `start.ts` em T0.2/T0.3.
- `server/index.ts`: Barrel export. Adicionar exports de `manifest.ts`. Downstream: qualquer consumidor de `theokit/server`.

#### Deep Dives

**Manifest Schema:**
```typescript
interface TheoManifest {
  version: 1
  generatedAt: string // ISO timestamp
  routes: ManifestRoute[]
  actions: ManifestAction[]
  websockets: ManifestWebSocket[]
}

interface ManifestRoute {
  filePath: string    // relativo ao serverDir
  routePath: string   // ex: /api/users/:id
  paramNames: string[]
}

interface ManifestAction {
  filePath: string    // relativo ao serverDir
  actionPath: string  // ex: users/create
}

interface ManifestWebSocket {
  filePath: string
  wsPath: string      // ex: /ws/chat
}
```

**Invariantes:**
- `filePath` é RELATIVO ao serverDir (portável entre builds)
- `pattern` (RegExp) NÃO é serializado — recompilado no load via `compilePattern()`
- `version: 1` para futuro versionamento

#### Tasks
1. Criar `manifest.ts` com interface `TheoManifest` e sub-interfaces
2. Implementar `generateManifest(serverDir: string): TheoManifest`
3. Implementar `writeManifest(manifest: TheoManifest, outputDir: string): void` — escreve JSON em `.theo/manifest.json`
4. Implementar `loadManifest(distDir: string, serverDir: string): LoadedManifest` — lê JSON, recompila patterns, resolve filePaths relativos ao serverDir do runtime (EC-2: serverDir pode diferir entre build e deploy)
5. Exportar tipos e funções de `server/index.ts`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_generateManifest_scans_routes() — Given server dir with routes/health.ts e routes/users/[id].ts, When generateManifest(serverDir), Then returns manifest with 2 routes, correct routePaths e paramNames (MUST fail before implementation)
RED:     test_generateManifest_scans_actions() — Given server dir with actions/create-user.ts, When generateManifest(serverDir), Then returns manifest with 1 action, actionPath='create-user'
RED:     test_generateManifest_scans_websockets() — Given server dir with ws/chat.ts, When generateManifest(serverDir), Then returns manifest with 1 websocket, wsPath='/ws/chat'
RED:     test_generateManifest_empty_dir() — Given server dir without routes/actions/ws, When generateManifest(serverDir), Then returns manifest with empty arrays
RED:     test_writeManifest_creates_json_file() — Given a manifest object and output dir, When writeManifest(manifest, outDir), Then .theo/manifest.json exists with valid JSON
RED:     test_loadManifest_recompiles_patterns() — Given manifest.json with route /api/users/:id, When loadManifest(distDir), Then returned route has pattern RegExp that matches /api/users/123
RED:     test_loadManifest_resolves_filepaths() — Given manifest with relative filePath 'routes/health.ts', When loadManifest(distDir, serverDir), Then filePath is resolved to absolute path via serverDir (EC-2)
RED:     test_loadManifest_missing_file_throws() — Given no manifest.json exists, When loadManifest(distDir, serverDir), Then throws Error with message about running 'theo build'
RED:     test_loadManifest_different_serverDir() — Given manifest generated with serverDir=/build/server, When loadManifest(distDir, '/deploy/server'), Then filePaths resolve relative to /deploy/server (EC-2: cross-env deploy)
GREEN:   Implement generateManifest, writeManifest, loadManifest
REFACTOR: Extract shared path resolution logic
VERIFY:  npx vitest run tests/unit/manifest.test.ts
```

#### Acceptance Criteria
- [ ] `generateManifest()` produz manifest completo com routes, actions, websockets
- [ ] `writeManifest()` escreve JSON válido em `.theo/manifest.json`
- [ ] `loadManifest()` lê JSON e recompila RegExp patterns
- [ ] FilePaths relativos no JSON, absolutos no load
- [ ] Pass: TypeScript strict check (tsc --noEmit)
- [ ] Pass: Lint check (eslint — zero warnings)
- [ ] Pass: Vitest tests green

#### DoD (Definition of Done)
- [ ] Todas as 8 RED tests passando
- [ ] Zero TypeScript errors
- [ ] Zero lint warnings
- [ ] Fixture `fixtures/server-routes-basic` usada para testes

---

### T0.2 — Integrar geração de manifest no build

#### Objective
Gerar `manifest.json` automaticamente durante `theo build` para todos os adapters.

#### Evidence
`build.ts` atualmente faz apenas Vite build (client + SSR). Não gera nenhum metadata sobre routes/actions. O manifest precisa ser gerado APÓS o Vite build para estar no output dir.

#### Files to edit
```
packages/theo/src/cli/commands/build.ts — Adicionar geração de manifest após Vite build
packages/theo/src/adapters/node.ts — Incluir manifest generation no adapter
packages/theo/src/adapters/types.ts — Verificar se interface DeployAdapter precisa mudar
```

#### Deep file dependency analysis
- `build.ts` (34 linhas): Carrega config, valida estrutura, seleciona adapter, chama `adapter.build()`. Precisa chamar `generateManifest()` + `writeManifest()` após o build. Dependentes: CLI entry point.
- `node.ts` (41 linhas): Faz Vite build client + SSR. Pode incluir manifest generation aqui OU no `build.ts`. Melhor no `build.ts` para ser cross-adapter.
- `adapters/types.ts`: Define `DeployAdapter` interface. Não precisa mudar se manifest for gerado no `build.ts`.

#### Deep Dives

**Sequência de build atualizada:**
```
1. loadConfig()
2. validateProjectStructure()
3. adapter.build() (Vite client + SSR)
4. generateManifest(serverDir) ← NOVO
5. writeManifest(manifest, distDir) ← NOVO
```

**Edge case:** Se `server/` não existe (app frontend-only), gerar manifest vazio — não falhar.

#### Tasks
1. Importar `generateManifest`, `writeManifest` em `build.ts`
2. Após `adapter.build()`, chamar `generateManifest(serverDir)`
3. Chamar `writeManifest(manifest, distDir)`
4. Logar número de routes/actions/ws encontradas

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_build_generates_manifest() — Given valid project with routes, When buildCommand() completes, Then .theo/manifest.json exists
RED:     test_build_manifest_contains_routes() — Given project with server/routes/health.ts, When buildCommand(), Then manifest.json contains route with routePath '/api/health'
RED:     test_build_without_server_dir() — Given project without server/ dir, When buildCommand(), Then manifest.json exists with empty arrays (no error)
RED:     test_build_manifest_after_vite() — Given project, When buildCommand(), Then manifest.json is generated AFTER .theo/client/ exists
GREEN:   Add manifest generation to buildCommand
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/build-manifest.test.ts
```

#### Acceptance Criteria
- [ ] `theo build` gera `.theo/manifest.json` automaticamente
- [ ] Manifest contém todas as routes, actions e websockets
- [ ] Build sem `server/` não falha — gera manifest vazio
- [ ] Funciona para todos os targets (node, vercel, cloudflare)
- [ ] Pass: TypeScript strict check
- [ ] Pass: Vitest tests green

#### DoD (Definition of Done)
- [ ] 4 RED tests passando
- [ ] Manifest gerado em build real com fixture project
- [ ] Zero TypeScript errors

---

### T0.3 — Usar manifest no start (eliminar scan por request)

#### Objective
Modificar `start.ts` para carregar routes/actions/websockets do manifest em vez de escanear filesystem por request.

#### Evidence
`start.ts:97` e `start.ts:124` fazem scan síncrono por request. Com manifest, isso vira uma leitura única no startup.

#### Files to edit
```
packages/theo/src/cli/commands/start.ts — Carregar manifest no startup, usar dados cached
```

#### Deep file dependency analysis
- `start.ts` (230 linhas): Request handler com scan inline. Precisa mover scan para startup e usar dados do manifest. Downstream: nenhum (é entry point). Upstream: `scan.ts`, `action-scan.ts`, `match.ts`, `execute.ts`, `action-execute.ts`.

#### Deep Dives

**Antes (por request):**
```typescript
// Dentro do request handler
const actions = scanServerActions(serverDir) // POR REQUEST!
const routes = scanServerRoutes(serverDir)   // POR REQUEST!
```

**Depois (no startup):**
```typescript
// No startup
const manifest = loadManifest(distDir)
const { routes, actions, websockets } = manifest

// Dentro do request handler — usa dados em memória
const match = matchRoute(url, routes) // Zero I/O
```

**Edge case:** Se manifest.json não existe (build antigo), fallback para scan com warning.

#### Tasks
1. Importar `loadManifest` em `start.ts`
2. Carregar manifest no startup (antes de `createServer`)
3. Remover chamadas de `scanServerRoutes` e `scanServerActions` do request handler
4. Usar `manifest.routes` e `manifest.actions` no request handler
5. Manter WebSocket routes do manifest
6. Adicionar fallback: se manifest não existe, warn e scan uma vez no startup

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_start_loads_manifest_at_startup() — Given .theo/manifest.json exists with routes, When startCommand(), Then routes are served from manifest data (no scan per request)
RED:     test_start_without_manifest_warns() — Given .theo/ exists but no manifest.json, When startCommand(), Then logs warning "No manifest found, scanning routes..."
RED:     test_start_manifest_routes_match() — Given manifest with /api/health, When GET /api/health, Then returns 200 (route resolved from manifest)
RED:     test_start_manifest_actions_match() — Given manifest with action create-user, When POST /api/__actions/create-user/createUser, Then action executes correctly
GREEN:   Refactor start.ts to load manifest at startup
REFACTOR: Extract request routing to helper functions
VERIFY:  npx vitest run tests/integration/start-manifest.test.ts
```

#### Acceptance Criteria
- [ ] `theo start` carrega manifest uma vez no startup
- [ ] Zero filesystem scanning durante handling de requests
- [ ] Fallback graceful se manifest não existe
- [ ] Todas as routes/actions funcionam identicamente
- [ ] WebSocket upgrade usa dados do manifest
- [ ] Pass: TypeScript strict check
- [ ] Pass: Vitest tests green

#### DoD (Definition of Done)
- [ ] 4 RED tests passando
- [ ] Performance: zero `readdirSync` no request path
- [ ] Backward compat: funciona sem manifest (com warning)

---

### T0.4 — Fixture e testes de integração para manifest

#### Objective
Criar fixture project e testes de integração que validem o fluxo completo build → manifest → start.

#### Evidence
Os testes unitários de T0.1-T0.3 testam partes isoladas. Precisa de teste end-to-end do fluxo.

#### Files to edit
```
fixtures/manifest-production/ — (NEW) Fixture project com routes, actions e ws
tests/integration/manifest-flow.test.ts — (NEW) Teste do fluxo build → manifest → start
```

#### Deep file dependency analysis
- `fixtures/manifest-production/` (NEW): Mini-projeto Theo com `app/page.tsx`, `server/routes/health.ts`, `server/routes/users/[id].ts`, `server/actions/create-user.ts`, `server/ws/chat.ts`, `theo.config.ts`. Nenhum dependente.
- `tests/integration/manifest-flow.test.ts` (NEW): Usa fixture para testar build+start. Depende de `buildCommand`, `startCommand`, fixture files.

#### Tasks
1. Criar fixture `manifest-production` com routes, actions e ws
2. Criar teste de integração que executa build e verifica manifest
3. Verificar que manifest contém todas as entries esperadas

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_full_build_produces_manifest() — Given fixture project, When theo build runs, Then .theo/manifest.json exists with correct content
RED:     test_manifest_has_all_routes() — Given fixture with 2 routes, When manifest is read, Then 2 routes with correct paths
RED:     test_manifest_has_actions() — Given fixture with 1 action, When manifest is read, Then 1 action entry
RED:     test_manifest_version_field() — Given generated manifest, When reading version, Then equals 1
GREEN:   Create fixture and integration tests
REFACTOR: None expected
VERIFY:  npx vitest run tests/integration/manifest-flow.test.ts
```

#### Acceptance Criteria
- [ ] Fixture project é válida e buildável
- [ ] Manifest gerado contém todos os endpoints
- [ ] Testes de integração passam
- [ ] Pass: Vitest tests green

#### DoD (Definition of Done)
- [ ] Fixture criada com routes/actions/ws
- [ ] 4 testes de integração passando

---

## Phase 1: File Upload (Multipart/FormData)

**Objective:** Suportar upload de arquivos via `multipart/form-data` em routes e actions, eliminando o gap #3 (severidade ALTA).

### T1.1 — Implementar parseMultipart com busboy

#### Objective
Criar módulo `body-parser.ts` que abstrai parsing de JSON e multipart/form-data usando busboy.

#### Evidence
`execute.ts:53-80` (`parseBody`) só aceita `application/json`. Qualquer POST com `multipart/form-data` retorna erro "Expected Content-Type: application/json". Isso bloqueia file upload em qualquer app Theo.

#### Files to edit
```
packages/theo/src/server/body-parser.ts — (NEW) Parser unificado JSON + multipart
packages/theo/src/server/execute.ts — Usar novo parser em vez de parseBody inline
packages/theo/src/server/action-execute.ts — Usar novo parser
packages/theo/package.json — Adicionar dependência busboy
```

#### Deep file dependency analysis
- `body-parser.ts` (NEW): Módulo standalone. Importa `busboy`. Exporta `parseRequestBody()` que retorna `{ fields, files }`. Dependentes: `execute.ts`, `action-execute.ts`.
- `execute.ts` (195 linhas): `parseBody()` na linha 53 será substituído por import de `body-parser.ts`. A função `parseBody()` interna pode ser mantida como alias ou removida. `executeRoute()` na linha 82 usa `body` como `unknown` — precisa aceitar fields+files.
- `action-execute.ts` (85 linhas): Linha 52-56 usa `parseBody()` de `execute.ts`. Mesmo tratamento.
- `package.json`: Adicionar `busboy` como dependency. Adicionar `@types/busboy` como devDependency.

#### Deep Dives

**ParsedBody type:**
```typescript
interface UploadedFile {
  fieldname: string
  filename: string
  encoding: string
  mimeType: string
  buffer: Buffer
  size: number
}

interface ParsedBody {
  fields: Record<string, string>
  files: UploadedFile[]
  json?: unknown // Parsed JSON if content-type was application/json
}
```

**Lógica de parsing:**
1. Se `Content-Type: application/json` → parse JSON (behavior atual)
2. Se `Content-Type: multipart/form-data` → parse com busboy
3. Se nenhum body (GET/DELETE) → retorna vazio
4. Outros content-types → erro 415 Unsupported Media Type

**Integração com Zod:**
- Para multipart, `body` no handler recebe `{ fields, files }`
- Zod schema pode validar `fields` separadamente
- `files` não passa por Zod (são buffers)

**Limites de segurança:**
- File size limit default: 10MB (configurável via theoConfigSchema)
- Max files per request: 10
- Max field size: 1MB

#### Tasks
1. `npm install busboy` e `npm install -D @types/busboy`
2. Criar `body-parser.ts` com `parseRequestBody(req: IncomingMessage, options?): Promise<ParsedBody>`
3. Implementar branch JSON (mover lógica de `parseBody()` atual)
4. Implementar branch multipart com busboy
5. Adicionar limites configuráveis (maxFileSize, maxFiles, maxFieldSize)
6. Validar boundary em multipart Content-Type antes de criar busboy (EC-3: crash se boundary ausente)
7. Sanitizar filenames com `path.basename()` para prevenir path traversal (EC-6)
8. Atualizar `execute.ts` para usar `parseRequestBody()`
7. Atualizar `action-execute.ts` para usar `parseRequestBody()`
8. Manter backward compat: se JSON, handler recebe `body` como antes
9. Se multipart, handler recebe `{ ...fields, _files: UploadedFile[] }`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_parseBody_json() — Given request with Content-Type: application/json and body '{"name":"John"}', When parseRequestBody(req), Then returns { json: { name: 'John' }, fields: {}, files: [] }
RED:     test_parseBody_multipart_fields() — Given multipart request with field name=John, When parseRequestBody(req), Then returns fields.name = 'John'
RED:     test_parseBody_multipart_file() — Given multipart request with file upload (test.txt, content 'hello'), When parseRequestBody(req), Then returns files[0] with filename='test.txt', buffer containing 'hello'
RED:     test_parseBody_multipart_mixed() — Given multipart with field name=John AND file avatar.png, When parseRequestBody(req), Then returns both fields and files
RED:     test_parseBody_empty_get() — Given GET request with no body, When parseRequestBody(req), Then returns { json: undefined, fields: {}, files: [] }
RED:     test_parseBody_unsupported_content_type() — Given request with Content-Type: text/xml, When parseRequestBody(req), Then rejects with error 'Unsupported Content-Type'
RED:     test_parseBody_file_size_limit() — Given multipart with file > maxFileSize, When parseRequestBody(req, { maxFileSize: 100 }), Then rejects with error about file size limit
RED:     test_parseBody_max_files_limit() — Given multipart with 11 files and maxFiles=10, When parseRequestBody(req), Then rejects with error about max files
RED:     test_parseBody_missing_boundary() — Given Content-Type 'multipart/form-data' WITHOUT boundary param, When parseRequestBody(req), Then rejects with 400 'Missing multipart boundary' (EC-3)
RED:     test_parseBody_filename_sanitized() — Given multipart file with filename '../../../etc/passwd', When parseRequestBody(req), Then file.filename === 'passwd' (basename only, EC-6)
RED:     test_executeRoute_with_multipart() — Given route handler and multipart request, When executeRoute(), Then handler receives fields + files in body
RED:     test_executeAction_with_multipart() — Given action and multipart request, When executeAction(), Then handler receives parsed input from fields
GREEN:   Implement body-parser.ts and update execute.ts + action-execute.ts
REFACTOR: Remove old parseBody from execute.ts, keep as re-export for backward compat
VERIFY:  npx vitest run tests/unit/body-parser.test.ts
```

#### Acceptance Criteria
- [ ] `multipart/form-data` requests parsed corretamente
- [ ] Files extraídos com metadata (filename, mimeType, size, buffer)
- [ ] JSON requests continuam funcionando sem mudança
- [ ] Limites de segurança enforced (maxFileSize, maxFiles)
- [ ] Unsupported content-types retornam 415
- [ ] Zod validation funciona em fields de multipart
- [ ] Pass: TypeScript strict check
- [ ] Pass: Vitest tests green

#### DoD (Definition of Done)
- [ ] 10 RED tests passando
- [ ] busboy adicionado como dependência
- [ ] Backward compat: JSON routes não quebram
- [ ] Fixture com upload testada

---

### T1.2 — Adicionar maxFileSize ao config schema

#### Objective
Permitir configuração de limites de upload via `theo.config.ts`.

#### Evidence
Limites de upload precisam ser configuráveis — 10MB default pode ser muito ou pouco dependendo do app.

#### Files to edit
```
packages/theo/src/config/schema.ts — Adicionar uploadLimits ao schema
packages/theo/src/server/body-parser.ts — Ler limits do config
packages/theo/src/vite-plugin/api-middleware.ts — Passar limits para parser
packages/theo/src/cli/commands/start.ts — Passar limits para parser
```

#### Deep file dependency analysis
- `schema.ts` (16 linhas): Schema Zod do config. Adicionar `upload` com sub-fields. Downstream: `loadConfig`, todos que usam `TheoConfig`.
- `body-parser.ts`: Já aceita options com limits. Precisa receber config.
- `api-middleware.ts`: Passa para `executeRoute`. Precisa passar limits.
- `start.ts`: Idem.

#### Tasks
1. Adicionar schema `uploadSchema` com `maxFileSize`, `maxFiles`, `maxFieldSize`
2. Adicionar `upload` opcional ao `theoConfigSchema`
3. Passar config.upload para parser nos middlewares
4. Documentar defaults

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_config_upload_defaults() — Given config without upload, When loadConfig(), Then upload is undefined (defaults used internally)
RED:     test_config_upload_custom() — Given config { upload: { maxFileSize: 5_000_000 } }, When loadConfig(), Then upload.maxFileSize === 5_000_000
RED:     test_config_upload_invalid() — Given config { upload: { maxFileSize: -1 } }, When loadConfig(), Then throws TheoConfigError
RED:     test_upload_limit_applied() — Given config with maxFileSize: 100, When uploading 200 byte file, Then returns 413 Payload Too Large
GREEN:   Add upload config schema and wire through
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/config-upload.test.ts
```

#### Acceptance Criteria
- [ ] `upload.maxFileSize` configurável em `theo.config.ts`
- [ ] Defaults sensatos (10MB files, 10 files, 1MB fields)
- [ ] Validação Zod no config
- [ ] Limits passados para parser em dev e prod
- [ ] Pass: TypeScript strict check
- [ ] Pass: Vitest tests green

#### DoD (Definition of Done)
- [ ] 4 RED tests passando
- [ ] Config tipo atualizado com upload

---

### T1.3 — Fixture e tipo para file upload

#### Objective
Criar fixture project e type tests para file upload.

#### Files to edit
```
fixtures/file-upload/ — (NEW) Fixture com route de upload
tests/integration/file-upload.test.ts — (NEW) Teste de integração
tests/type/file-upload.test-d.ts — (NEW) Type tests para UploadedFile
```

#### Tasks
1. Criar fixture com `server/routes/upload.ts` que recebe multipart
2. Criar teste de integração que faz upload real
3. Criar type test para `UploadedFile` e `ParsedBody`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_upload_route_receives_file() — Given fixture with upload route, When POST multipart with file, Then handler receives file buffer
RED:     test_upload_route_json_still_works() — Given fixture with JSON route, When POST JSON, Then handler receives parsed JSON (backward compat)
RED:     test_upload_type_inference() — Given defineRoute with multipart, When accessing body._files, Then type is UploadedFile[] (expectTypeOf)
RED:     test_upload_returns_filename() — Given upload route that echoes filename, When uploading test.pdf, Then response contains filename 'test.pdf'
GREEN:   Create fixture and tests
REFACTOR: None expected
VERIFY:  npx vitest run tests/integration/file-upload.test.ts && npx vitest run tests/type/file-upload.test-d.ts
```

#### Acceptance Criteria
- [ ] Fixture project funcional com upload
- [ ] Integração end-to-end testada
- [ ] Types corretos via expectTypeOf
- [ ] Pass: Vitest tests green

#### DoD (Definition of Done)
- [ ] Fixture criada e funcional
- [ ] 4 tests passando

---

## Phase 2: Catch-all Routes

**Objective:** Suportar `[...param]` para catch-all server routes, eliminando gap #2.

### T2.1 — Suporte a catch-all em scan e match

#### Objective
Reconhecer pattern `[...param]` em nomes de arquivo, compilar para regex catch-all e ordenar após routes específicas.

#### Evidence
`scan.ts:21` — `rel.replace(/\[([^\]]+)\]/g, ':$1')` não reconhece `[...param]`. `match.ts:13` — `routePath.replace(/:([^/]+)/g, ...)` usa `([^/]+)` que não captura `/`. Catch-all precisa de `(.+)`.

#### Files to edit
```
packages/theo/src/server/scan.ts — Reconhecer [...param] e converter para :...param
packages/theo/src/server/match.ts — Compilar :...param para (.+) regex
```

#### Deep file dependency analysis
- `scan.ts` (68 linhas): `fileToRoutePath()` na linha 7. Regex na linha 21 precisa de case adicional para `[...param]`. Downstream: `scanServerRoutes()` retorna `ServerRouteNode[]` consumido por `match.ts`, `api-middleware.ts`, `start.ts`, `manifest.ts` (novo).
- `match.ts` (42 linhas): `compilePattern()` na linha 8. Regex na linha 13 precisa reconhecer `:...param` e gerar `(.+)` em vez de `([^/]+)`. `matchRoute()` na linha 20 não muda. Downstream: `executeRoute` via `start.ts` e `api-middleware.ts`.

#### Deep Dives

**Transformação de paths:**
```
server/routes/docs/[...slug].ts → /api/docs/:...slug
```

**Regex compilation:**
```
:param    → ([^/]+)     (segmento único)
:...param → (.+)        (catch-all: um ou mais segmentos)
```

**Ordenação (sort em scanServerRoutes):**
```
1. Static routes (no params)
2. Dynamic routes (com :param)
3. Catch-all routes (com :...param)  ← NOVO
```

**Edge cases:**
- `[...slug]` deve capturar `a/b/c` como string inteira
- Catch-all NÃO deve capturar string vazia (precisa de pelo menos 1 segmento)
- Catch-all SEMPRE último na ordem de matching

#### Tasks
1. Atualizar `fileToRoutePath()` para converter `[...param]` → `:...param`
2. Atualizar `compilePattern()` para reconhecer `:...param` → `(.+)` regex
3. Atualizar sort em `scanServerRoutes()` para catch-all routes no final
4. Atualizar `ServerRouteNode` — adicionar flag `isCatchAll?: boolean`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_catchall_file_to_route() — Given file 'docs/[...slug].ts', When fileToRoutePath(), Then returns '/api/docs/:...slug'
RED:     test_catchall_compile_pattern() — Given routePath '/api/docs/:...slug', When compilePattern(), Then pattern matches '/api/docs/a/b/c' with param slug='a/b/c'
RED:     test_catchall_does_not_match_empty() — Given routePath '/api/docs/:...slug', When testing against '/api/docs', Then does NOT match (catch-all requires 1+ segments)
RED:     test_catchall_sorted_last() — Given routes ['/api/docs/:...slug', '/api/docs/intro', '/api/docs/:id'], When scanServerRoutes(), Then order is: /api/docs/intro, /api/docs/:id, /api/docs/:...slug
RED:     test_catchall_match_single_segment() — Given catch-all route, When URL is '/api/docs/intro', Then matches with slug='intro'
RED:     test_catchall_match_multiple_segments() — Given catch-all route, When URL is '/api/docs/a/b/c/d', Then matches with slug='a/b/c/d'
RED:     test_regular_route_still_works() — Given mix of regular and catch-all routes, When URL matches regular route, Then regular route wins (not catch-all)
RED:     test_catchall_in_manifest() — Given manifest with catch-all route, When loadManifest(), Then recompiled pattern matches multi-segment paths
GREEN:   Implement catch-all support in scan.ts and match.ts
REFACTOR: Extract paramName detection to shared helper
VERIFY:  npx vitest run tests/unit/server-route-scan.test.ts tests/unit/server-route-match.test.ts
```

#### Acceptance Criteria
- [ ] `[...slug].ts` reconhecido como catch-all
- [ ] Pattern compila para regex que captura múltiplos segmentos
- [ ] Catch-all routes sempre últimas na ordem de matching
- [ ] Regular routes com prioridade sobre catch-all
- [ ] Manifest serializa e recompila catch-all corretamente
- [ ] Pass: TypeScript strict check
- [ ] Pass: Vitest tests green

#### DoD (Definition of Done)
- [ ] 8 RED tests passando
- [ ] Backward compat: routes existentes não quebram
- [ ] Fixture atualizada com catch-all

---

## Phase 3: Middleware Composável

**Objective:** Suportar múltiplos middlewares via diretório `server/middleware/` com ordem determinística, eliminando gap #5.

### T3.1 — Suporte a diretório de middlewares

#### Objective
Atualizar `middleware-runner.ts` para suportar tanto arquivo único (`server/middleware.ts`) quanto diretório (`server/middleware/`).

#### Evidence
`middleware-runner.ts:19` — Só procura `middleware.ts`. Rails tem stack com 20+ middlewares. Theo precisa de composição para CORS + auth + logging + rate-limit.

#### Files to edit
```
packages/theo/src/server/middleware-runner.ts — Suportar diretório e array
packages/theo/src/server/middleware-scan.ts — (NEW) Escanear diretório de middlewares
```

#### Deep file dependency analysis
- `middleware-runner.ts` (45 linhas): `runMiddlewareAndContext()` é chamado por `execute.ts:96` e `action-execute.ts:34`. Precisa suportar N middlewares em sequência. Downstream: `execute.ts`, `action-execute.ts`.
- `middleware-scan.ts` (NEW): Escaneia `server/middleware/` retornando lista ordenada de file paths. Sem dependentes — consumido por `middleware-runner.ts`.

#### Deep Dives

**Estratégia de detecção:**
1. Se `server/middleware.ts` existe → modo legacy (arquivo único)
2. Se `server/middleware/` existe → modo diretório (múltiplos arquivos)
3. Se ambos existem → erro com mensagem clara
4. Se nenhum existe → skip middleware (behavior atual)

**Convenção de diretório:**
```
server/middleware/
├── 01-cors.ts        # Executado primeiro
├── 02-auth.ts        # Executado segundo
├── 03-rate-limit.ts  # Executado terceiro
└── _helpers.ts       # Ignorado (prefixo _)
```

**Execução em cadeia:**
Cada middleware recebe `(request, next)`. `next()` chama o próximo middleware. Se qualquer um não chama `next()`, a cadeia aborta.

#### Tasks
1. **FIX EC-1:** Alinhar `MiddlewareHandler` type com runtime — alterar `define-middleware.ts` para `(req: IncomingMessage, res: ServerResponse, next: () => Promise<void>) => void | Promise<void>` (match Node.js reality em `middleware-runner.ts:24`). Atualizar `define-middleware.ts` e type tests.
2. Criar `middleware-scan.ts` com `scanMiddlewares(serverDir): string[]`
3. Sort alfanumérico dos arquivos (prefixo numérico garante ordem)
4. Ignorar `_` e `.` prefixed files
5. Atualizar `runMiddlewareAndContext()` para executar array de middlewares
6. Implementar cadeia: cada `next()` chama o próximo middleware
7. Manter backward compat com arquivo único
8. Erro claro se tanto arquivo quanto diretório existem

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_scan_middleware_dir() — Given server/middleware/ with 01-cors.ts e 02-auth.ts, When scanMiddlewares(), Then returns ['01-cors.ts', '02-auth.ts'] in order
RED:     test_scan_middleware_ignores_underscore() — Given server/middleware/ with _helpers.ts, When scanMiddlewares(), Then returns empty (ignored)
RED:     test_run_single_middleware_file() — Given server/middleware.ts (legacy), When runMiddlewareAndContext(), Then middleware executes (backward compat)
RED:     test_run_middleware_chain() — Given 2 middlewares that add headers, When runMiddlewareAndContext(), Then both headers present in response
RED:     test_middleware_chain_abort() — Given middleware[0] that doesn't call next(), When runMiddlewareAndContext(), Then middleware[1] never runs, aborted=true
RED:     test_middleware_chain_order() — Given 01-first.ts and 02-second.ts, When runMiddlewareAndContext(), Then first runs before second (verified by header order)
RED:     test_both_file_and_dir_error() — Given server/middleware.ts AND server/middleware/ dir, When runMiddlewareAndContext(), Then throws Error about ambiguous config
RED:     test_no_middleware_skips() — Given no middleware.ts and no middleware/ dir, When runMiddlewareAndContext(), Then returns { ctx: {}, aborted: false }
GREEN:   Implement middleware-scan.ts and update middleware-runner.ts
REFACTOR: Extract middleware chain execution to helper
VERIFY:  npx vitest run tests/unit/middleware-composable.test.ts
```

#### Acceptance Criteria
- [ ] Diretório `server/middleware/` suportado com ordem alfanumérica
- [ ] Backward compat: arquivo único `server/middleware.ts` funciona
- [ ] Cadeia de middlewares executa em ordem
- [ ] Abort em qualquer ponto para a cadeia
- [ ] Erro claro se ambiguidade entre arquivo e diretório
- [ ] Pass: TypeScript strict check
- [ ] Pass: Vitest tests green

#### DoD (Definition of Done)
- [ ] 8 RED tests passando
- [ ] Fixture `fixtures/middleware-composable` criada
- [ ] Backward compat verificada com fixture existente `fixtures/middleware-context`

---

## Phase 4: Structured Logging

**Objective:** Implementar logger estruturado com níveis, contexto enriquecido e output plugável, eliminando gap #10.

### T4.1 — Expandir logger com níveis e createLogger

#### Objective
Evoluir `logger.ts` de 29 linhas para um logger estruturado com `debug`, `info`, `warn`, `error` e factory `createLogger()`.

#### Evidence
`logger.ts` atual: 29 linhas, apenas `logRequest()` com `console.log(JSON.stringify(...))`. Sem níveis, sem filtragem, sem contexto configurável. Rails `TaggedLogging` permite filtrar por nível e taggear com request context.

#### Files to edit
```
packages/theo/src/server/logger.ts — Expandir com níveis e createLogger
packages/theo/src/server/index.ts — Exportar createLogger e tipos
packages/theo/src/config/schema.ts — Adicionar config de logging
packages/theo/src/cli/commands/start.ts — Usar createLogger
packages/theo/src/vite-plugin/api-middleware.ts — Usar createLogger
packages/theo/src/vite-plugin/action-middleware.ts — Usar createLogger
```

#### Deep file dependency analysis
- `logger.ts` (29 linhas): Exporta `RequestLog`, `LoggerFn`, `logRequest()`. Downstream: `start.ts`, `api-middleware.ts`, `action-middleware.ts`. Expandir mantendo `logRequest()` para backward compat.
- `server/index.ts`: Precisa exportar `createLogger`, `TheoLogger`, `LogLevel`.
- `config/schema.ts`: Adicionar `logging` com `level` e `format` ao schema.

#### Deep Dives

**API do Logger:**
```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

interface TheoLogger {
  debug(msg: string, context?: Record<string, unknown>): void
  info(msg: string, context?: Record<string, unknown>): void
  warn(msg: string, context?: Record<string, unknown>): void
  error(msg: string, context?: Record<string, unknown>): void
  child(context: Record<string, unknown>): TheoLogger
}

function createLogger(options?: { level?: LogLevel; output?: (log: StructuredLog) => void }): TheoLogger
```

**Structured Log format:**
```json
{
  "level": "info",
  "msg": "GET /api/users → 200",
  "timestamp": "2026-05-10T14:30:00.000Z",
  "requestId": "abc-123",
  "method": "GET",
  "url": "/api/users",
  "status": 200,
  "duration": 12,
  "userAgent": "Mozilla/5.0...",
  "ip": "127.0.0.1"
}
```

**Child logger:** Herda contexto. Ex: `logger.child({ requestId })` retorna logger com requestId em todo output.

#### Tasks
1. Definir tipos `LogLevel`, `TheoLogger`, `StructuredLog`
2. Implementar `createLogger(options?)` com filtragem por nível
3. Implementar `child(context)` que herda contexto pai
4. Manter `logRequest()` como wrapper (backward compat)
5. Adicionar `logging` ao config schema (level, format)
6. Atualizar `start.ts` para usar `createLogger` com config
7. Atualizar dev middlewares para usar logger
8. Exportar de `server/index.ts`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_createLogger_defaults() — Given no options, When createLogger(), Then logger.info() outputs to console with 'info' level
RED:     test_logger_level_filtering() — Given createLogger({ level: 'warn' }), When logger.info('test'), Then nothing is output (filtered)
RED:     test_logger_warn_passes() — Given createLogger({ level: 'warn' }), When logger.warn('test'), Then output contains level='warn'
RED:     test_logger_child_inherits_context() — Given logger.child({ requestId: '123' }), When child.info('test'), Then output contains requestId='123'
RED:     test_logger_structured_output() — Given createLogger(), When logger.info('msg', { key: 'val' }), Then output is valid JSON with level, msg, timestamp, key
RED:     test_logger_custom_output() — Given createLogger({ output: fn }), When logger.info('test'), Then fn is called with StructuredLog
RED:     test_logger_error_includes_stack() — Given createLogger(), When logger.error('fail', { error: new Error('boom') }), Then output includes error stack
RED:     test_logRequest_backward_compat() — Given existing logRequest() call, When logRequest({ method, url, status, duration, requestId }), Then outputs structured JSON (same as before)
GREEN:   Implement createLogger and updated logger
REFACTOR: Consolidate log output formatting
VERIFY:  npx vitest run tests/unit/logger-structured.test.ts
```

#### Acceptance Criteria
- [ ] `createLogger()` cria logger com níveis `debug/info/warn/error/silent`
- [ ] Filtragem por nível funciona corretamente
- [ ] `child()` herda e estende contexto
- [ ] Output é JSON estruturado com timestamp
- [ ] Custom output function suportada
- [ ] `logRequest()` backward compatible
- [ ] Config `logging.level` respeitado
- [ ] Pass: TypeScript strict check
- [ ] Pass: Vitest tests green

#### DoD (Definition of Done)
- [ ] 8 RED tests passando
- [ ] Logger usado em start.ts e dev middlewares
- [ ] Exportado de theokit/server

---

## Phase 5: Serialização Rica

**Objective:** Suportar tipos JavaScript nativos (Date, Map, Set, etc.) em responses via superjson, eliminando gap #4.

### T5.1 — Integrar superjson opt-in

#### Objective
Adicionar serialização rica opt-in via flag no config, usando superjson para roundtrip de tipos nativos.

#### Evidence
`execute.ts:186` — `sendJson(res, handlerResult)` usa `JSON.stringify()` que perde tipo de Date, Map, Set. tRPC e TanStack Router usam superjson com sucesso.

#### Files to edit
```
packages/theo/src/server/serialization.ts — (NEW) Wrapper de serialização
packages/theo/src/server/execute.ts — Usar serialização condicional
packages/theo/src/server/action-execute.ts — Usar serialização condicional
packages/theo/src/server/index.ts — Exportar tipos
packages/theo/src/client/theo-fetch.ts — Deserializar com superjson se header presente
packages/theo/src/config/schema.ts — Adicionar flag serialization
packages/theo/package.json — Adicionar superjson como peer/optional dependency
```

#### Deep file dependency analysis
- `serialization.ts` (NEW): Wrapper thin sobre superjson. `serialize(data)` → `{ json, meta }`. `deserialize({ json, meta })` → data. Dependentes: `execute.ts`, `action-execute.ts`, `theo-fetch.ts`.
- `execute.ts`: `sendJson()` precisa usar `serialize()` quando habilitado. Header `X-Theo-Serialization: superjson` adicionado ao response.
- `theo-fetch.ts`: Precisa detectar header e deserializar.

#### Deep Dives

**Protocolo:**
1. Server serializa com superjson → response body `{ json, meta }`
2. Server adiciona header `X-Theo-Serialization: superjson`
3. Client detecta header → deserializa com superjson
4. Client sem header → parse JSON normal (backward compat)

**Config:**
```typescript
theoConfigSchema.extend({
  serialization: z.enum(['json', 'superjson']).default('json')
})
```

#### Tasks
1. Criar `serialization.ts` com `serializeResponse()` e `deserializeResponse()`
2. Adicionar `serialization` ao config schema
3. Atualizar `sendJson()` para usar superjson quando config ativa
4. Adicionar header `X-Theo-Serialization` ao response
5. Atualizar `theoFetch` para detectar header e deserializar
6. Adicionar superjson como optional peerDependency

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_serialize_date() — Given { createdAt: new Date('2026-01-01') }, When serializeResponse(data), Then deserialized result has Date instance (not string)
RED:     test_serialize_map() — Given { map: new Map([['a', 1]]) }, When roundtrip serialize→deserialize, Then result.map is Map with entry ['a', 1]
RED:     test_serialize_set() — Given { tags: new Set(['a', 'b']) }, When roundtrip, Then result.tags is Set with values 'a', 'b'
RED:     test_serialize_plain_json_passthrough() — Given config serialization='json', When sendJson(), Then response is plain JSON (no meta, no header)
RED:     test_superjson_header_set() — Given config serialization='superjson', When response sent, Then header X-Theo-Serialization = 'superjson'
RED:     test_theoFetch_deserializes_superjson() — Given response with X-Theo-Serialization header, When theoFetch(), Then result contains Date instances
RED:     test_theoFetch_plain_json_fallback() — Given response without X-Theo-Serialization header, When theoFetch(), Then result is plain JSON parsed
RED:     test_config_serialization_default() — Given config without serialization, When loadConfig(), Then serialization === 'json'
GREEN:   Implement serialization module and integrate
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/serialization.test.ts
```

#### Acceptance Criteria
- [ ] Date, Map, Set, BigInt sobrevivem roundtrip
- [ ] Opt-in via config (default 'json' — zero breaking change)
- [ ] Header `X-Theo-Serialization` sinaliza ao client
- [ ] theoFetch deserializa automaticamente
- [ ] Plain JSON funciona sem mudança
- [ ] Pass: TypeScript strict check
- [ ] Pass: Vitest tests green

#### DoD (Definition of Done)
- [ ] 8 RED tests passando
- [ ] superjson como peerDependency
- [ ] Backward compat total

---

## Phase 6: Config por Environment

**Objective:** Suportar configuração específica por environment via merge de arquivos, eliminando gap #6.

### T6.1 — Merge de config por NODE_ENV

#### Objective
Carregar `theo.config.{NODE_ENV}.ts` e mergear sobre `theo.config.ts`.

#### Evidence
`loadConfig()` em `load-config.ts` só carrega `theo.config.ts`. Não distingue dev/prod. Rails tem `config/environments/production.rb` que override.

#### Files to edit
```
packages/theo/src/config/load-config.ts — Carregar e mergear config por env
```

#### Deep file dependency analysis
- `load-config.ts` (54 linhas): Carrega `theo.config.ts`, valida com Zod, retorna `TheoConfig`. Precisa tentar carregar `theo.config.{env}.ts` e deep merge. Downstream: `build.ts`, `start.ts`, `dev` command, todos que chamam `loadConfig()`.

#### Deep Dives

**Estratégia de merge:**
```typescript
// 1. Load base: theo.config.ts
const baseConfig = await loadConfigFile('theo.config.ts')

// 2. Load env-specific: theo.config.production.ts (optional)
const envConfig = await loadConfigFile(`theo.config.${NODE_ENV}.ts`)

// 3. Deep merge: env overrides base
const merged = deepMerge(baseConfig, envConfig)

// 4. Validate merged result with Zod
const config = theoConfigSchema.parse(merged)
```

**Deep merge rules:**
- Primitives: env overrides base
- Objects: recursive merge
- Arrays: env replaces base (not concat)
- `undefined` in env: doesn't override (keeps base value)

**Edge cases:**
- `NODE_ENV` undefined → skip env-specific load
- Env-specific file doesn't exist → use base only (no error)
- Env-specific file has invalid config → error with clear message

#### Tasks
1. Implementar `deepMerge()` utility (simples, sem lib) — skip `__proto__`, `constructor`, `prototype` keys para prevenir prototype pollution (EC-4)
2. Atualizar `loadConfig()` para detectar `NODE_ENV`
3. Tentar carregar `theo.config.{env}.ts`
4. Mergear configs e validar resultado
5. Manter behavior atual quando env-specific não existe

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_load_base_only() — Given theo.config.ts with port:3000, no env file, When loadConfig(), Then port===3000 (unchanged)
RED:     test_load_env_override() — Given theo.config.ts port:3000 AND theo.config.production.ts port:8080 AND NODE_ENV=production, When loadConfig(), Then port===8080
RED:     test_load_env_partial_merge() — Given base with port:3000+ssr:false AND production with ssr:true, When loadConfig(NODE_ENV=production), Then port===3000 AND ssr===true
RED:     test_load_env_missing_file() — Given only theo.config.ts AND NODE_ENV=staging, When loadConfig(), Then returns base config (no error)
RED:     test_load_env_invalid_throws() — Given theo.config.production.ts with invalid port:-1, When loadConfig(NODE_ENV=production), Then throws TheoConfigError
RED:     test_deepMerge_nested() — Given { a: { b: 1, c: 2 } } merged with { a: { b: 3 } }, When deepMerge(), Then result { a: { b: 3, c: 2 } }
RED:     test_deepMerge_array_replace() — Given { items: [1] } merged with { items: [2, 3] }, When deepMerge(), Then result { items: [2, 3] }
RED:     test_deepMerge_prototype_pollution() — Given override { '__proto__': { admin: true } }, When deepMerge(base, override), Then {}.admin === undefined (prototype NOT polluted, EC-4)
RED:     test_no_node_env() — Given NODE_ENV undefined, When loadConfig(), Then loads base only
GREEN:   Implement deepMerge and env-specific config loading
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/config-env.test.ts
```

#### Acceptance Criteria
- [ ] `theo.config.production.ts` merged sobre `theo.config.ts`
- [ ] Merge parcial funciona (override seletivo)
- [ ] Env-specific file é opcional
- [ ] Resultado final validado por Zod
- [ ] Backward compat total (nenhuma mudança requerida)
- [ ] Pass: TypeScript strict check
- [ ] Pass: Vitest tests green

#### DoD (Definition of Done)
- [ ] 8 RED tests passando
- [ ] Zero breaking changes em loadConfig

---

## Phase 7: Error Recovery Suggestions

**Objective:** Adicionar "did you mean?" em erros 404 de routes e actions, eliminando gap #8.

### T7.1 — Implementar sugestão por distância de Levenshtein

#### Objective
Quando uma route ou action não é encontrada, sugerir a mais próxima se existir match com distância ≤ 3.

#### Evidence
`start.ts:126-129` e `api-middleware.ts` retornam "API route not found" sem contexto. Rails `ActionableExceptions` sugere correções. Typos como `/api/uesrs` são comuns em desenvolvimento.

#### Files to edit
```
packages/theo/src/server/suggest.ts — (NEW) Levenshtein distance + suggestion
packages/theo/src/server/execute.ts — Nenhuma mudança (sendError já aceita message)
packages/theo/src/cli/commands/start.ts — Adicionar sugestão no 404
packages/theo/src/vite-plugin/api-middleware.ts — Adicionar sugestão no 404
packages/theo/src/vite-plugin/action-middleware.ts — Adicionar sugestão no 404
```

#### Deep file dependency analysis
- `suggest.ts` (NEW): Pure function `findSuggestion(input: string, candidates: string[]): string | null`. Implementa Levenshtein. Sem dependências externas. Downstream: `start.ts`, `api-middleware.ts`, `action-middleware.ts`.

#### Deep Dives

**Levenshtein implementação (20 linhas):**
```typescript
function levenshtein(a: string, b: string): number {
  // Standard dynamic programming, O(n*m)
}

function findSuggestion(input: string, candidates: string[], maxDistance = 3): string | null {
  let best: string | null = null
  let bestDist = maxDistance + 1
  for (const c of candidates) {
    const d = levenshtein(input, c)
    if (d < bestDist) { bestDist = d; best = c }
  }
  return best
}
```

**Mensagem aprimorada:**
```
"API route not found: /api/uesrs. Did you mean: /api/users?"
```

#### Tasks
1. Criar `suggest.ts` com `levenshtein()` e `findSuggestion()`
2. Atualizar `start.ts` route 404 para incluir sugestão
3. Atualizar `api-middleware.ts` route 404 para incluir sugestão
4. Atualizar `action-middleware.ts` action 404 para incluir sugestão

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_levenshtein_identical() — Given 'users' and 'users', When levenshtein(), Then returns 0
RED:     test_levenshtein_one_char() — Given 'users' and 'uesrs', When levenshtein(), Then returns 2
RED:     test_levenshtein_different() — Given 'abc' and 'xyz', When levenshtein(), Then returns 3
RED:     test_findSuggestion_match() — Given input '/api/uesrs', candidates ['/api/users', '/api/posts'], When findSuggestion(), Then returns '/api/users'
RED:     test_findSuggestion_no_match() — Given input '/api/xyz', candidates ['/api/users'], When findSuggestion(maxDistance=3), Then returns null (distance too large)
RED:     test_findSuggestion_empty_candidates() — Given input '/api/users', candidates [], When findSuggestion(), Then returns null
RED:     test_404_with_suggestion() — Given route /api/users exists, When GET /api/uesrs, Then 404 message includes 'Did you mean: /api/users?'
RED:     test_404_without_suggestion() — Given route /api/users exists, When GET /api/completely-different, Then 404 message does NOT include 'Did you mean'
GREEN:   Implement suggest.ts and update 404 handlers
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/suggest.test.ts
```

#### Acceptance Criteria
- [ ] Levenshtein corretamente calculado
- [ ] Sugestões aparecem quando distância ≤ 3
- [ ] Sem sugestão quando nada próximo
- [ ] Mensagem de erro clara e útil
- [ ] Funciona em dev e prod
- [ ] Pass: TypeScript strict check
- [ ] Pass: Vitest tests green

#### DoD (Definition of Done)
- [ ] 8 RED tests passando
- [ ] 404s em routes e actions incluem sugestões

---

## Phase 8: WebSocket Channels

**Objective:** Adicionar abstração `defineChannel()` com rooms e broadcast sobre `defineWebSocket()`, eliminando gap #9.

### T8.1 — Implementar defineChannel com room manager

#### Objective
Criar API de channels para WebSocket com suporte a rooms, broadcast e subscription.

#### Evidence
`defineWebSocket()` atual é raw — cada handler gerencia connections manualmente. Rails ActionCable prova que rooms/channels são essenciais para chat, notifications, realtime dashboards. Sem abstração, cada app reinventa o wheel.

#### Files to edit
```
packages/theo/src/server/define-channel.ts — (NEW) Channel definition e room manager
packages/theo/src/server/channel-manager.ts — (NEW) In-memory room management
packages/theo/src/server/index.ts — Exportar defineChannel e tipos
packages/theo/src/server/define-websocket.ts — Não muda (backward compat)
packages/theo/src/cli/commands/start.ts — Suportar channel handlers no WS upgrade
packages/theo/src/vite-plugin/index.ts — Suportar channel handlers no dev WS
```

#### Deep file dependency analysis
- `define-channel.ts` (NEW): Define `ChannelHandler` interface e `defineChannel()` identity function. Importa `WebSocketLike`. Dependentes: user code.
- `channel-manager.ts` (NEW): `ChannelManager` class que gerencia rooms e connections. Métodos: `subscribe(ws, room)`, `unsubscribe(ws, room)`, `broadcast(room, data, excludeWs?)`, `broadcastAll(data)`. In-memory Map. Dependentes: WS handlers em `start.ts` e vite-plugin.
- `start.ts`: WS upgrade handler (linha 190+) precisa detectar channel handlers e usar ChannelManager.

#### Deep Dives

**API do Channel:**
```typescript
interface ChannelHandler<TMessage = unknown> {
  onSubscribe?: (ws: WebSocketLike, room: string, req: IncomingMessage) => void
  onMessage?: (ws: WebSocketLike, room: string, data: TMessage) => void
  onUnsubscribe?: (ws: WebSocketLike, room: string) => void
}

function defineChannel<TMessage = unknown>(handler: ChannelHandler<TMessage>): ChannelHandler<TMessage>
```

**Protocolo de rooms:**
```
Client → Server: { type: "subscribe", room: "chat-123" }
Client → Server: { type: "message", room: "chat-123", data: { text: "hello" } }
Client → Server: { type: "unsubscribe", room: "chat-123" }
```

**ChannelManager:**
```typescript
class ChannelManager {
  private rooms: Map<string, Set<WebSocketLike>>
  subscribe(ws, room): void
  unsubscribe(ws, room): void
  broadcast(room, data, exclude?): void
  broadcastAll(data): void
  getRoomSize(room): number
  cleanup(ws): void  // Remove de todos os rooms
}
```

**Convenção de arquivos:**
- `server/ws/chat.ts` com `export default defineChannel(...)` → detectado como channel
- `server/ws/raw.ts` com `export default defineWebSocket(...)` → raw handler (existing)
- Detecção: se handler tem `onSubscribe`, é channel. Senão, é raw.

#### Tasks
1. Criar `channel-manager.ts` com `ChannelManager` class
2. Criar `define-channel.ts` com tipos e identity function
3. Atualizar `start.ts` WS handler para detectar channels
4. Implementar protocol parsing (subscribe/message/unsubscribe)
5. Usar `ChannelManager` para gerenciar rooms
6. Cleanup automático quando WS fecha
7. Exportar de `server/index.ts`

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_channel_manager_subscribe() — Given ChannelManager, When subscribe(ws, 'room-1'), Then getRoomSize('room-1') === 1
RED:     test_channel_manager_broadcast() — Given 2 ws in 'room-1', When broadcast('room-1', { msg: 'hi' }), Then both ws.send() called
RED:     test_channel_manager_broadcast_exclude() — Given ws1,ws2 in room, When broadcast('room-1', data, ws1), Then only ws2.send() called
RED:     test_channel_manager_unsubscribe() — Given ws in 'room-1', When unsubscribe(ws, 'room-1'), Then getRoomSize('room-1') === 0
RED:     test_channel_manager_cleanup() — Given ws in rooms ['a', 'b'], When cleanup(ws), Then ws removed from both rooms
RED:     test_channel_manager_empty_room() — Given empty room, When broadcast('empty', data), Then nothing happens (no error)
RED:     test_defineChannel_identity() — Given channel handler, When defineChannel(handler), Then returns same handler reference
RED:     test_channel_protocol_subscribe() — Given channel WS connection, When client sends { type: 'subscribe', room: 'r1' }, Then onSubscribe() called with room='r1'
RED:     test_channel_protocol_message() — Given subscribed client, When sends { type: 'message', room: 'r1', data: { text: 'hi' } }, Then onMessage() called
RED:     test_channel_protocol_unsubscribe() — Given subscribed client, When sends { type: 'unsubscribe', room: 'r1' }, Then onUnsubscribe() called
RED:     test_channel_disconnect_cleanup() — Given subscribed client, When WS closes, Then cleanup() removes from all rooms
RED:     test_raw_ws_still_works() — Given defineWebSocket handler (no onSubscribe), When WS connection, Then handled as raw (backward compat)
GREEN:   Implement ChannelManager, defineChannel, and protocol handling
REFACTOR: Extract protocol parser
VERIFY:  npx vitest run tests/unit/channel-manager.test.ts tests/unit/define-channel.test.ts
```

#### Acceptance Criteria
- [ ] `defineChannel()` cria handlers com rooms
- [ ] `ChannelManager` gerencia subscribe/unsubscribe/broadcast
- [ ] Protocol JSON para rooms funciona
- [ ] Cleanup automático no disconnect
- [ ] `defineWebSocket()` continua funcionando (backward compat)
- [ ] Broadcast exclui sender quando especificado
- [ ] Pass: TypeScript strict check
- [ ] Pass: Vitest tests green

#### DoD (Definition of Done)
- [ ] 12 RED tests passando
- [ ] Fixture `fixtures/websocket-channels` criada
- [ ] Backward compat com `fixtures/websocket-basic`

---

## Coverage Matrix

| # | Gap / Requirement | Severidade | Task(s) | Resolution |
|---|---|---|---|---|
| 1 | Route manifest em produção | MÉDIA | T0.1, T0.2, T0.3, T0.4 | Manifest gerado no build, carregado no start. Zero scan per-request. |
| 2 | Catch-all routes `[...slug]` | BAIXA | T2.1 | `[...param]` reconhecido em scan, compilado para `(.+)` regex |
| 3 | File upload (multipart/FormData) | ALTA | T1.1, T1.2, T1.3 | busboy parse multipart, config de limites, types para UploadedFile |
| 4 | Serialização rica (Date, Map, Set) | BAIXA | T5.1 | superjson opt-in via config, header para client detection |
| 5 | Middleware composável | MÉDIA | T3.1 | Diretório `server/middleware/` com ordem alfanumérica |
| 6 | Config por environment | BAIXA | T6.1 | `theo.config.{NODE_ENV}.ts` merged sobre base |
| 7 | Build manifests | MÉDIA | T0.1, T0.2 | Consolidado com gap #1 — mesmo manifest |
| 8 | Error recovery suggestions | BAIXA | T7.1 | Levenshtein "Did you mean?" em 404s |
| 9 | WebSocket pub/sub | BAIXA | T8.1 | `defineChannel()` com rooms, broadcast, ChannelManager |
| 10 | Structured logging | MÉDIA | T4.1 | `createLogger()` com níveis, child, output plugável |

**Coverage: 10/10 gaps cobertos (100%)**

## Global Definition of Done

- [ ] Todas as 9 fases completadas (0-8 + dogfood)
- [ ] Todos os testes passando (Vitest + Playwright)
- [ ] Zero TypeScript errors (tsc --noEmit)
- [ ] Zero lint warnings
- [ ] Backward compatibility preservada em TODAS as APIs existentes
- [ ] Code-audit checks passando em todos os packages modificados
- [ ] 86+ RED tests especificados (inclui 4 edge case fixes), todos GREEN
- [ ] Novas APIs exportadas de `theokit/server`
- [ ] 4+ novos fixtures criados
- [ ] Manifest gerado em build, carregado em start
- [ ] File upload funcional end-to-end
- [ ] **Dogfood QA PASS** — `/dogfood full` health score >= 70, zero CRITICAL issues
- [ ] **Fixture proof** — cada feature tem fixture reproduzível

## Final Phase: Dogfood QA (MANDATORY)

> Esta fase roda APÓS todas as fases de implementação. O plano NÃO está done até dogfood passar.

**Objective:** Validar que as mudanças funcionam como um usuário real experienciaria, não apenas como unit tests assertam.

### Execution

Run `/dogfood full`. Always full. No shortcuts.

### Acceptance Criteria

- [ ] Health score >= 70/100
- [ ] Zero CRITICAL issues introduzidas por este plano
- [ ] Zero HIGH issues em comandos/features modificados por este plano
- [ ] Issues pré-existentes documentadas (não causadas por este plano)

### If Dogfood Fails

1. Identificar quais issues são causadas por este plano vs pré-existentes
2. Corrigir todos os CRITICAL e HIGH issues deste plano antes de declarar complete
3. Re-run `/dogfood full` para confirmar fixes
4. Issues pré-existentes logadas mas NÃO bloqueiam completion do plano
