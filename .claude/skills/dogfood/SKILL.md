---
name: dogfood
description: "QA testing do TheoKit framework como usuário real. Cobre TODAS as 22 ondas: scaffold, templates, dev, build, prod, API, actions, cookies, auth, typed client, env vars, rate limiting, error pages, SSR, WebSocket, deploy adapters, generators, route listing, rename/publish readiness, cross-validation features. Gera relatório estruturado."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Write, Agent
argument-hint: "[full|quick|scaffold|dev|api|build|prod|routing|e2e|unit|templates|cookies|auth|typed-client|ssr|websocket|generators|xval]"
---

# Dogfood: QA do TheoKit Framework (22 Ondas)

Testa o TheoKit como um usuário real faria. Executa comandos reais, avalia output, e produz relatório.

**IMPORTANTE**: O package name é `theokit` (não `theo`). CLI é `theokit`. Imports são `from 'theokit/server'`. Scaffold é `npx create-theokit`.

## Diretório de teste

Testes manuais usam `my-test/` dentro do monorepo (workspace member, gitignored).

## Arguments

| Arg | Scope | Fases |
|---|---|---|
| *(no arg)* or `full` | Tudo | 1-22 |
| `quick` | Scaffold + dev + API smoke | 1-4 |
| `scaffold` | Apenas scaffold default | 1-2 |
| `templates` | Scaffold TODOS os templates | 1-2, 3 |
| `dev` | Apenas dev server | 1, 4-5 |
| `api` | Apenas API routes + actions | 1, 5 |
| `cookies` | Apenas cookie helpers | 1, 6 |
| `build` | Apenas build | 1, 7 |
| `prod` | Apenas production server | 1, 7-8 |
| `routing` | Apenas frontend routing | 1, 4 |
| `e2e` | Apenas Playwright E2E | 1, 9 |
| `unit` | Apenas testes automatizados | 1 |
| `auth` | Auth system (sessions + requireAuth) | 1, 13 |
| `typed-client` | Typed client (theoFetch) | 1, 12 |
| `ssr` | SSR rendering | 1, 15 |
| `websocket` | WebSocket endpoints + channels | 1, 16 |
| `generators` | theokit generate + theokit routes | 1, 17 |
| `xval` | Cross-validation features only | 1, 22 |

## Execution: 22 Phases

### Phase 1: Pre-flight (sempre roda)

```bash
pnpm typecheck 2>&1
pnpm test 2>&1
pnpm test:types 2>&1
grep -rn '\bany\b' packages/theo/src/ --include="*.ts" || echo "ZERO any"
```

**Gate:** Se qualquer check falhar, PARE.

**Avaliar:**
- [ ] `pnpm typecheck` — zero errors
- [ ] `pnpm test` — all green (contar total)
- [ ] `pnpm test:types` — all green
- [ ] Zero `any` em production code

### Phase 2: Scaffold Default (modes: `full`, `quick`, `scaffold`)

```bash
pnpm try:clean && pnpm try:scaffold
```

**Avaliar:**
- [ ] Scaffold completa sem erros
- [ ] `my-test/app/page.tsx` contém "Hello Theo"
- [ ] `.gitignore`, `theo.config.ts`, `server/routes/health.ts` existem

### Phase 3: Scaffold ALL Templates (modes: `full`, `templates`)

**Templates a testar:**

| Template | Arquivos chave | Verificação |
|----------|---------------|-------------|
| `default` | app/page.tsx, server/routes/health.ts | "Hello Theo" |
| `dashboard` | app/layout.tsx, app/dashboard/layout.tsx, app/about/page.tsx | Nested layouts |
| `api-only` | server/routes/health.ts, server/routes/users.ts | API routes |
| `postgres` | db/schema.ts, db/index.ts, server/context.ts, drizzle.config.ts, .env.example | Drizzle ORM |

- [ ] Invalid template → "Template not found. Available: default, dashboard, api-only, postgres"
- [ ] Templates usam `from 'theokit/server'` (não `from 'theo/server'`)
- [ ] Template package.json.tmpl usa `"theokit": "workspace:*"` e scripts `theokit dev/build/start`

### Phase 4: Frontend Dev Server (modes: `full`, `quick`, `dev`, `routing`)

```bash
cd my-test && npx tsx ../packages/theo/src/cli/index.ts dev --port 3456 &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3456/
curl -s -o /dev/null -w "%{http_code}" http://localhost:3456/@theo/entry-client
curl -s -o /dev/null -w "%{http_code}" http://localhost:3456/@theo/route-manifest
kill %1 2>/dev/null
```

### Phase 5: API Routes + Actions + Middleware (modes: `full`, `quick`, `dev`, `api`)

**Setup:** No projeto `my-test`, garantir que existem routes e actions para testar.

**Avaliar:**
- [ ] GET /api/health → JSON 200 com x-request-id
- [ ] 404 → JSON error com "Did you mean?" quando typo próximo
- [ ] Structured JSON logging (campo `level`, `msg`, `timestamp` no output)
- [ ] POST /api/health com Content-Type: multipart/form-data → não crasheia (pode retornar 405 se route é GET-only, mas não deve crashear)
- [ ] POST com Content-Type: text/xml → 415 Unsupported Content-Type

### Phase 6: Cookie Helpers (modes: `full`, `cookies`)

```bash
npx tsx -e "import { getCookie, setCookie, deleteCookie } from './packages/theo/src/server/index.ts'; console.log('OK')"
```

- [ ] getCookie/setCookie/deleteCookie importáveis

### Phase 7: Build + Manifest (modes: `full`, `build`, `prod`)

```bash
cd fixtures/production-build
npx tsx ../../packages/theo/src/cli/index.ts build
```

**Avaliar:**
- [ ] `.theo/client/index.html` existe
- [ ] `404.html`, `500.html` copiados
- [ ] `.theo/manifest.json` existe e é JSON válido
- [ ] manifest.json contém `version: 1`, `generatedAt`, arrays `routes`, `actions`, `websockets`
- [ ] manifest.json routes contêm `filePath` (relativo), `routePath`, `paramNames`
- [ ] Console output mostra contagem de routes/actions/ws

### Phase 8: Production Server + Manifest Loading (modes: `full`, `prod`)

- [ ] `/` → 200, `/api/health` → JSON, `/dashboard` → 200, `/logo.png` → 200
- [ ] Server carrega manifest no startup (log não deve conter "scanning routes" warning)
- [ ] Zero `readdirSync` durante request handling (routes servidas do manifest em memória)

### Phase 9: E2E Playwright (modes: `full`, `e2e`)

```bash
CI=true pnpm test:e2e 2>&1
```

### Phase 10: HMR (modes: `full`)

Frontend edit + backend new route auto-detect.

### Phase 11: DX Evaluation (modes: `full`)

12 dimensões + error messages:
1. Scaffold Speed
2. Zero Config
3. Error Messages: invalid name, invalid structure, no build, invalid template, invalid target, invalid gen type, invalid gen name
4. Dev Startup
5. File Structure
6. API DX
7. Routing DX
8. Build DX
9. Template Variety (4 templates)
10. Generator DX (`theokit generate`)
11. Route Listing DX (`theokit routes`)
12. Deploy DX (`theokit docker`, `--target`)

### Phase 12: Typed Client + Serialization (modes: `full`, `typed-client`)

```bash
npx tsx -e "import { theoFetch, TheoFetchError } from './packages/theo/src/client/index.ts'; console.log(typeof theoFetch, typeof TheoFetchError)"
npx tsx -e "import { serializeResponse, deserializeResponse } from './packages/theo/src/server/index.ts'; console.log(typeof serializeResponse, typeof deserializeResponse)"
```

- [ ] theoFetch + TheoFetchError importáveis
- [ ] Subpath `./client` no package.json exports
- [ ] serializeResponse + deserializeResponse importáveis de `theokit/server`
- [ ] Config `serialization: 'json' | 'superjson'` aceita pelo schema (default 'json')

### Phase 13: Auth System (modes: `full`, `auth`)

```bash
npx tsx -e "import { createSessionManager, requireAuth, AuthRequiredError } from './packages/theo/src/server/index.ts'; console.log(typeof createSessionManager, typeof requireAuth, typeof AuthRequiredError)"
```

- [ ] Todos importáveis
- [ ] Secret < 32 chars rejeitado

### Phase 14: Env Vars + Error Pages + Rate Limiting + Config (modes: `full`)

- [ ] envPrefix: `THEO_PUBLIC_`
- [ ] 404.html/500.html copiados no build
- [ ] createRateLimiter importável
- [ ] Config `upload` aceita: `maxFileSize`, `maxFiles`, `maxFieldSize`
- [ ] Config `logging` aceita: `level` (debug/info/warn/error/silent)
- [ ] Config `serialization` aceita: `json` ou `superjson`
- [ ] `theo.config.production.ts` é mergeado sobre `theo.config.ts` quando NODE_ENV=production
- [ ] `deepMerge` exportado de theokit e protegido contra prototype pollution (__proto__ ignorado)

### Phase 15: SSR (modes: `full`, `ssr`)

- [ ] Config `ssr: boolean` (default false)
- [ ] Entry server com renderToPipeableStream + onShellError
- [ ] Entry client: hydrateRoot (ssr=true) / createRoot (ssr=false)
- [ ] Fixture `ssr-basic/` existe

### Phase 16: WebSocket + Channels (modes: `full`, `websocket`)

```bash
npx tsx -e "
import { defineWebSocket, defineChannel, ChannelManager } from './packages/theo/src/server/index.ts';
console.log(typeof defineWebSocket, typeof defineChannel, typeof ChannelManager)
"
```

- [ ] defineWebSocket importável
- [ ] defineChannel importável (identity function)
- [ ] ChannelManager importável (class com subscribe/unsubscribe/broadcast/cleanup)
- [ ] scanWebSocketRoutes escaneia server/ws/
- [ ] ws é optional peerDep
- [ ] defineChannel é backward compat (defineWebSocket continua funcionando)

### Phase 17: Generators + Route Listing (modes: `full`, `generators`)

```bash
pnpm try:clean && pnpm try:scaffold
cd my-test
npx tsx ../packages/theo/src/cli/index.ts generate route users
npx tsx ../packages/theo/src/cli/index.ts generate action create-user
npx tsx ../packages/theo/src/cli/index.ts generate page settings
npx tsx ../packages/theo/src/cli/index.ts generate ws notifications
npx tsx ../packages/theo/src/cli/index.ts routes
```

- [ ] 4 generators criam arquivos corretos com imports `theokit/server`
- [ ] Invalid type/name → erros claros
- [ ] `theokit routes` lista endpoints
- [ ] Arquivos gerados usam `from 'theokit/server'` (não `from 'theo/server'`)

### Phase 18: Deploy Adapters (modes: `full`)

- [ ] `--target` flag (node, vercel, cloudflare)
- [ ] Invalid target → erro claro
- [ ] `theokit docker` gera Dockerfile + .dockerignore
- [ ] Adapters têm build function

### Phase 19: Build Pipeline + Package Validation (modes: `full`)

```bash
pnpm build
npx publint packages/theo
npx publint packages/create-theo
npx @arethetypeswrong/cli --pack packages/theo --ignore-rules cjs-resolves-to-esm no-resolution
npx vitest run tests/smoke/
```

- [ ] publint "All good" para ambos
- [ ] attw "No problems"
- [ ] Smoke tests passam
- [ ] Subpaths `.`, `./server`, `./vite-plugin`, `./client` resolvem

### Phase 20: Naming + README Integrity (modes: `full`)

**Avaliar que o rename theo → theokit está completo:**

```bash
# Package names
grep '"name"' packages/theo/package.json   # → "theokit"
grep '"name"' packages/create-theo/package.json  # → "create-theokit"
# CLI name
grep "cac(" packages/theo/src/cli/index.ts  # → cac('theokit')
# CLI version
grep "version(" packages/theo/src/cli/index.ts  # → '0.1.0-alpha.0'
# Bin name
grep '"theokit"' packages/theo/package.json  # bin → theokit
# Vite aliases
grep "find:" packages/theo/src/vite-plugin/index.ts  # → 'theokit', 'theokit/server'
# Generator imports
grep "from 'theokit" packages/theo/src/cli/commands/generate.ts
```

**README integrity:**
- [ ] README.md NÃO contém `defineAgent`
- [ ] README.md NÃO contém `theo/agent`
- [ ] README.md NÃO contém `theo/react`
- [ ] README.md NÃO contém `Theo Cloud`
- [ ] README.md NÃO contém `theo deploy`
- [ ] README.md contém `theokit` (não `theo` sozinho como package)
- [ ] README.md contém `create-theokit`
- [ ] README.md contém `defineRoute`, `theoFetch`, `requireAuth`, `defineWebSocket`

### Phase 21: Regression Check (modes: `full`)

```bash
pnpm test 2>&1 | grep "passed"
pnpm test:e2e 2>&1 | grep "passed"
```

### Phase 22: Cross-Validation Features (modes: `full`, `xval`)

Testa TODAS as features adicionadas pela Onda 21 (cross-validation gaps).

#### 22.1 — Route Manifest

```bash
# Verificar que manifest é gerado no build
cd fixtures/production-build
npx tsx ../../packages/theo/src/cli/index.ts build 2>&1
cat .theo/manifest.json | head -5
```

- [ ] `.theo/manifest.json` gerado automaticamente durante build
- [ ] Contém `version: 1`
- [ ] Routes com `filePath` relativo, `routePath`, `paramNames`
- [ ] Actions com `filePath` relativo, `actionPath`

```bash
# Verificar imports
npx tsx -e "import { generateManifest, writeManifest, loadManifest } from './packages/theo/src/server/index.ts'; console.log(typeof generateManifest, typeof writeManifest, typeof loadManifest)"
```

- [ ] generateManifest, writeManifest, loadManifest importáveis de `theokit/server`

#### 22.2 — File Upload (Multipart/FormData)

```bash
npx tsx -e "import { parseRequestBody } from './packages/theo/src/server/index.ts'; console.log(typeof parseRequestBody)"
```

- [ ] parseRequestBody importável de `theokit/server`
- [ ] Aceita `application/json` (backward compat)
- [ ] Aceita `multipart/form-data` com boundary
- [ ] Rejeita `multipart/form-data` sem boundary com erro claro (EC-3)
- [ ] Rejeita content-types não suportados com 415
- [ ] Filenames sanitizados (basename only, sem path traversal — EC-6)
- [ ] Config `upload.maxFileSize`, `upload.maxFiles`, `upload.maxFieldSize` aceitas no schema
- [ ] busboy é dependência em packages/theo/package.json

#### 22.3 — Catch-all Routes

```bash
# Criar fixture temporária com catch-all e testar scan
npx tsx -e "
import { compilePattern } from './packages/theo/src/server/match.js';
const { pattern, paramNames } = compilePattern('/api/docs/:...slug');
console.log('matches /api/docs/a/b/c:', pattern.test('/api/docs/a/b/c'));
console.log('paramNames:', paramNames);
console.log('no match /api/docs:', pattern.test('/api/docs'));
"
```

- [ ] `[...slug].ts` reconhecido como catch-all em scan
- [ ] `:...slug` compila para regex `(.+)` (multi-segmento)
- [ ] Catch-all NÃO match path vazio (precisa 1+ segmentos)
- [ ] paramNames contém `slug` (sem `...` prefix)
- [ ] Sort: static > dynamic > catch-all

#### 22.4 — Middleware Composável

```bash
npx tsx -e "
import { existsSync } from 'fs';
console.log('middleware-scan exists:', existsSync('./packages/theo/src/server/middleware-scan.ts'));
"
```

- [ ] `middleware-scan.ts` existe
- [ ] Suporta diretório `server/middleware/` com arquivos numerados (01-cors.ts, 02-auth.ts)
- [ ] Sort alfanumérico garante ordem de execução
- [ ] Ignora arquivos `_` e `.` prefixados
- [ ] Backward compat: `server/middleware.ts` (arquivo único) continua funcionando
- [ ] Erro claro se tanto `middleware.ts` quanto `middleware/` existem (ambiguidade)
- [ ] Cadeia aborta se qualquer middleware não chama `next()`

#### 22.5 — Structured Logging

```bash
npx tsx -e "
import { createLogger } from './packages/theo/src/server/index.ts';
const logger = createLogger({ level: 'info', output: (log) => console.log(JSON.stringify(log)) });
logger.info('test', { key: 'value' });
logger.debug('should not appear');
const child = logger.child({ requestId: '123' });
child.warn('child log');
"
```

- [ ] createLogger importável de `theokit/server`
- [ ] Suporta níveis: debug, info, warn, error, silent
- [ ] Filtragem por nível funciona (debug não aparece quando level=info)
- [ ] Output JSON estruturado com `level`, `msg`, `timestamp`
- [ ] `child()` herda contexto do pai
- [ ] Custom output function suportada
- [ ] `logRequest()` backward compatible (não quebra código existente)
- [ ] Config `logging.level` aceita no schema

#### 22.6 — Serialização Rica (superjson)

```bash
npx tsx -e "
import { serializeResponse, deserializeResponse } from './packages/theo/src/server/index.ts';
const data = { date: new Date('2026-01-01'), tags: new Set(['a', 'b']) };
const s = serializeResponse(data);
const d = deserializeResponse(s);
console.log('date is Date:', d.date instanceof Date);
console.log('tags is Set:', d.tags instanceof Set);
"
```

- [ ] serializeResponse + deserializeResponse importáveis
- [ ] Date sobrevive roundtrip (instanceof Date)
- [ ] Set sobrevive roundtrip (instanceof Set)
- [ ] Map sobrevive roundtrip
- [ ] Config `serialization: 'json' | 'superjson'` (default 'json')
- [ ] superjson é dependência em packages/theo/package.json

#### 22.7 — Config por Environment

```bash
npx tsx -e "
import { deepMerge } from './packages/theo/src/config/load-config.js';
const base = { a: 1, nested: { b: 2, c: 3 } };
const override = { a: 10, nested: { b: 20 } };
console.log(JSON.stringify(deepMerge(base, override)));
// Prototype pollution test (EC-4)
const malicious = JSON.parse('{\"__proto__\": {\"polluted\": true}}');
deepMerge({}, malicious);
console.log('polluted:', ({}).polluted);
"
```

- [ ] `deepMerge` exportado e funcional
- [ ] Deep merge: nested objects merged recursivamente
- [ ] Arrays substituídas (não concatenadas)
- [ ] `__proto__`, `constructor`, `prototype` ignorados (EC-4)
- [ ] `theo.config.{NODE_ENV}.ts` carregado e mergeado sobre base quando existe
- [ ] Arquivo env-specific é opcional (sem erro se não existe)
- [ ] Resultado final validado por Zod

#### 22.8 — Error Suggestions (Did you mean?)

```bash
npx tsx -e "
import { findSuggestion, levenshtein } from './packages/theo/src/server/suggest.js';
console.log('distance users/uesrs:', levenshtein('users', 'uesrs'));
console.log('suggestion:', findSuggestion('/api/uesrs', ['/api/users', '/api/posts']));
console.log('no suggestion:', findSuggestion('/api/xyz', ['/api/users']));
"
```

- [ ] levenshtein calcula distância corretamente
- [ ] findSuggestion retorna match mais próximo quando distância ≤ 3
- [ ] Retorna null quando nada próximo
- [ ] 404 em dev (api-middleware) inclui "Did you mean?" para typos
- [ ] 404 em prod (start.ts) inclui "Did you mean?" para typos
- [ ] 404 em actions também inclui sugestão

#### 22.9 — WebSocket Channels

```bash
npx tsx -e "
import { defineChannel, ChannelManager } from './packages/theo/src/server/index.ts';
const ch = defineChannel({ onSubscribe: () => {} });
console.log('defineChannel identity:', ch.onSubscribe !== undefined);
const mgr = new ChannelManager();
const mockWs = { send: () => {}, close: () => {} };
mgr.subscribe(mockWs, 'room-1');
console.log('room size:', mgr.getRoomSize('room-1'));
mgr.unsubscribe(mockWs, 'room-1');
console.log('after unsub:', mgr.getRoomSize('room-1'));
"
```

- [ ] defineChannel importável (identity function)
- [ ] ChannelManager importável (class)
- [ ] subscribe/unsubscribe/broadcast/cleanup funcionam
- [ ] getRoomSize retorna contagem correta
- [ ] cleanup remove WS de todos os rooms
- [ ] broadcast exclui sender quando especificado
- [ ] defineWebSocket continua funcionando (backward compat)

## Report

Salvar em `docs/audit/dogfood-{YYYY-MM-DD}.md`.

```markdown
# Dogfood Report — {date}

## Health Score: {N}/100

| Phase | Score | Max | Status |
|-------|-------|-----|--------|
| Pre-flight | {N} | 5 | PASS/FAIL |
| Scaffold Default | {N} | 3 | PASS/FAIL |
| Scaffold Templates | {N} | 5 | PASS/FAIL |
| Frontend | {N} | 5 | PASS/FAIL |
| API+Actions+Middleware | {N} | 5 | PASS/FAIL |
| Cookies | {N} | 3 | PASS/FAIL |
| Build+Manifest | {N} | 5 | PASS/FAIL |
| Production+Manifest | {N} | 5 | PASS/FAIL |
| E2E | {N} | 5 | PASS/FAIL |
| HMR | {N} | 3 | PASS/FAIL |
| DX | {N} | 5 | {score}/5 |
| Typed Client+Serialization | {N} | 5 | PASS/FAIL |
| Auth System | {N} | 5 | PASS/FAIL |
| Env/Errors/Rate/Config | {N} | 5 | PASS/FAIL |
| SSR | {N} | 5 | PASS/FAIL |
| WebSocket+Channels | {N} | 5 | PASS/FAIL |
| Generators | {N} | 5 | PASS/FAIL |
| Deploy Adapters | {N} | 5 | PASS/FAIL |
| Package Validation | {N} | 5 | PASS/FAIL |
| Naming/README | {N} | 5 | PASS/FAIL |
| Regression | {N} | 5 | PASS/FAIL |
| Cross-Validation | {N} | 9 | PASS/FAIL |

## Cross-Validation Feature Status

| Feature | Sub-phase | Status | Evidence |
|---------|-----------|--------|----------|
| Route Manifest | 22.1 | PASS/FAIL | {evidência} |
| File Upload | 22.2 | PASS/FAIL | {evidência} |
| Catch-all Routes | 22.3 | PASS/FAIL | {evidência} |
| Composable Middleware | 22.4 | PASS/FAIL | {evidência} |
| Structured Logging | 22.5 | PASS/FAIL | {evidência} |
| Rich Serialization | 22.6 | PASS/FAIL | {evidência} |
| Config per Env | 22.7 | PASS/FAIL | {evidência} |
| Error Suggestions | 22.8 | PASS/FAIL | {evidência} |
| WS Channels | 22.9 | PASS/FAIL | {evidência} |
```

## Scoring

| Score | Meaning |
|-------|---------|
| 90-100 | Ship it |
| 70-89 | Minor issues |
| 50-69 | Needs work |
| <50 | Broken |

## Princípios

1. **Brutalmente honesto.**
2. **Evidência sobre opinião.**
3. **Actionable.**
4. **Teste como usuário.**
5. **TODOS os templates testados — nenhum skip.**
6. **Backend é cidadão de primeira classe.**
7. **Build+prod com mesmo rigor que dev.**
8. **TODAS as 22 ondas cobertas — nenhum skip.**
9. **Package name é `theokit`, CLI é `theokit`, imports são `theokit/*`.**
10. **README é 100% honesto — zero features aspiracionais.**
11. **Cross-validation features testadas com código executável, não apenas import checks.**
