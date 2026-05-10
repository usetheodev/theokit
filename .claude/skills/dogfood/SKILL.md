---
name: dogfood
description: "QA testing do TheoKit framework como usuário real. Cobre TODAS as 20 ondas: scaffold, templates, dev, build, prod, API, actions, cookies, auth, typed client, env vars, rate limiting, error pages, SSR, WebSocket, deploy adapters, generators, route listing, rename/publish readiness. Gera relatório estruturado."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Write, Agent
argument-hint: "[full|quick|scaffold|dev|api|build|prod|routing|e2e|unit|templates|cookies|auth|typed-client|ssr|websocket|generators]"
---

# Dogfood: QA do TheoKit Framework (20 Ondas)

Testa o TheoKit como um usuário real faria. Executa comandos reais, avalia output, e produz relatório.

**IMPORTANTE**: O package name é `theokit` (não `theo`). CLI é `theokit`. Imports são `from 'theokit/server'`. Scaffold é `npx create-theokit`.

## Diretório de teste

Testes manuais usam `my-test/` dentro do monorepo (workspace member, gitignored).

## Arguments

| Arg | Scope | Fases |
|---|---|---|
| *(no arg)* or `full` | Tudo | 1-21 |
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
| `websocket` | WebSocket endpoints | 1, 16 |
| `generators` | theokit generate + theokit routes | 1, 17 |

## Execution: 21 Phases

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

**Avaliar:**
- [ ] GET /api/health → JSON 200 com x-request-id
- [ ] 404 → JSON error
- [ ] Structured JSON logging

### Phase 6: Cookie Helpers (modes: `full`, `cookies`)

```bash
npx tsx -e "import { getCookie, setCookie, deleteCookie } from './packages/theo/src/server/index.ts'; console.log('OK')"
```

- [ ] getCookie/setCookie/deleteCookie importáveis

### Phase 7: Build (modes: `full`, `build`, `prod`)

```bash
cd fixtures/production-build
npx tsx ../../packages/theo/src/cli/index.ts build
```

- [ ] `.theo/client/index.html` existe
- [ ] `404.html`, `500.html` copiados

### Phase 8: Production Server (modes: `full`, `prod`)

- [ ] `/` → 200, `/api/health` → JSON, `/dashboard` → 200, `/logo.png` → 200

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

### Phase 12: Typed Client (modes: `full`, `typed-client`)

```bash
npx tsx -e "import { theoFetch, TheoFetchError } from './packages/theo/src/client/index.ts'; console.log(typeof theoFetch, typeof TheoFetchError)"
```

- [ ] theoFetch + TheoFetchError importáveis
- [ ] Subpath `./client` no package.json exports

### Phase 13: Auth System (modes: `full`, `auth`)

```bash
npx tsx -e "import { createSessionManager, requireAuth, AuthRequiredError } from './packages/theo/src/server/index.ts'; console.log(typeof createSessionManager, typeof requireAuth, typeof AuthRequiredError)"
```

- [ ] Todos importáveis
- [ ] Secret < 32 chars rejeitado

### Phase 14: Env Vars + Error Pages + Rate Limiting (modes: `full`)

- [ ] envPrefix: `THEO_PUBLIC_`
- [ ] 404.html/500.html copiados no build
- [ ] createRateLimiter importável

### Phase 15: SSR (modes: `full`, `ssr`)

- [ ] Config `ssr: boolean` (default false)
- [ ] Entry server com renderToPipeableStream + onShellError
- [ ] Entry client: hydrateRoot (ssr=true) / createRoot (ssr=false)
- [ ] Fixture `ssr-basic/` existe

### Phase 16: WebSocket (modes: `full`, `websocket`)

- [ ] defineWebSocket importável
- [ ] scanWebSocketRoutes escaneia server/ws/
- [ ] ws é optional peerDep

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
| API+Actions | {N} | 5 | PASS/FAIL |
| Cookies | {N} | 3 | PASS/FAIL |
| Build | {N} | 5 | PASS/FAIL |
| Production | {N} | 5 | PASS/FAIL |
| E2E | {N} | 5 | PASS/FAIL |
| HMR | {N} | 3 | PASS/FAIL |
| DX | {N} | 5 | {score}/5 |
| Typed Client | {N} | 5 | PASS/FAIL |
| Auth System | {N} | 5 | PASS/FAIL |
| Env/Errors/Rate | {N} | 5 | PASS/FAIL |
| SSR | {N} | 5 | PASS/FAIL |
| WebSocket | {N} | 5 | PASS/FAIL |
| Generators | {N} | 5 | PASS/FAIL |
| Deploy Adapters | {N} | 5 | PASS/FAIL |
| Package Validation | {N} | 5 | PASS/FAIL |
| Naming/README | {N} | 5 | PASS/FAIL |
| Regression | {N} | 5 | PASS/FAIL |
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
8. **TODAS as 20 ondas cobertas — nenhum skip.**
9. **Package name é `theokit`, CLI é `theokit`, imports são `theokit/*`.**
10. **README é 100% honesto — zero features aspiracionais.**
