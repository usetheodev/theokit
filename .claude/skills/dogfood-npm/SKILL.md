---
name: dogfood-npm
description: "QA testing do TheoKit como consumidor npm REAL. Instala theokit e create-theokit do registry público, scaffold projeto, dev, build, start, API, auth, typed client, generators, routes — tudo como um user faria após npm install. Zero referência ao monorepo."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Write
argument-hint: "[full|quick]"
---

# Dogfood npm: QA do TheoKit como consumidor npm real

Testa o TheoKit como um user externo faria — instalando do npm, não do monorepo.

**Princípio**: Este dogfood NÃO usa o monorepo. Cria um diretório temporário, instala do npm, e valida tudo.

## Diretório de teste

Usa `/tmp/theokit-npm-test-{timestamp}/` — fora do monorepo.

## Arguments

| Arg | Scope |
|---|---|
| *(no arg)* or `full` | Tudo (12 fases) |
| `quick` | Scaffold + imports only |

## Execution: 12 Phases

### Phase 1: npm Package Exists

```bash
npm view theokit version
npm view create-theokit version
```

**Avaliar:**
- [ ] `theokit` existe no npm com versão correta
- [ ] `create-theokit` existe no npm com versão correta
- [ ] License, description presentes

### Phase 2: Scaffold via npx

```bash
cd /tmp
npx create-theokit@latest theokit-npm-test
```

**Avaliar:**
- [ ] `npx create-theokit` executa sem erro
- [ ] Diretório criado com estrutura correta
- [ ] `app/page.tsx` existe
- [ ] `server/routes/health.ts` existe
- [ ] `theo.config.ts` existe
- [ ] `package.json` tem `theokit` como dependency (não `workspace:*`)
- [ ] `.gitignore` existe (renomeado de `_gitignore`)

### Phase 3: Install Dependencies

```bash
cd theokit-npm-test
npm install
```

**Avaliar:**
- [ ] `npm install` completa sem erros
- [ ] `node_modules/theokit` existe
- [ ] `node_modules/theokit/dist/` existe

### Phase 4: Import Validation

```bash
node -e "import('theokit').then(m => console.log('defineConfig:', typeof m.defineConfig))"
node -e "import('theokit/server').then(m => console.log('defineRoute:', typeof m.defineRoute, 'defineAction:', typeof m.defineAction, 'defineMiddleware:', typeof m.defineMiddleware, 'requireAuth:', typeof m.requireAuth, 'createSessionManager:', typeof m.createSessionManager, 'defineWebSocket:', typeof m.defineWebSocket, 'createRateLimiter:', typeof m.createRateLimiter, 'getCookie:', typeof m.getCookie))"
node -e "import('theokit/client').then(m => console.log('theoFetch:', typeof m.theoFetch, 'TheoFetchError:', typeof m.TheoFetchError))"
```

**Avaliar:**
- [ ] `theokit` exports: defineConfig, loadConfig, theoPlugin, scanRoutes
- [ ] `theokit/server` exports: defineRoute, defineAction, defineMiddleware, requireAuth, AuthRequiredError, createSessionManager, defineWebSocket, createRateLimiter, getCookie, setCookie, deleteCookie
- [ ] `theokit/client` exports: theoFetch, TheoFetchError

### Phase 5: Dev Server

```bash
npx theokit dev --port 3500 &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3500/
curl -s http://localhost:3500/api/health
kill %1
```

**Avaliar:**
- [ ] `npx theokit dev` starts without error
- [ ] `/` → 200
- [ ] `/api/health` → JSON with `{"ok":true}`
- [ ] `x-request-id` header present

### Phase 6: Generator

```bash
npx theokit generate route users
npx theokit generate action create-user
npx theokit generate page settings
npx theokit generate ws notifications
```

**Avaliar:**
- [ ] `server/routes/users.ts` criado com `from 'theokit/server'`
- [ ] `server/actions/create-user.ts` criado com `from 'theokit/server'`
- [ ] `app/settings/page.tsx` criado com component
- [ ] `server/ws/notifications.ts` criado com `from 'theokit/server'`

### Phase 7: Route Listing

```bash
npx theokit routes
```

**Avaliar:**
- [ ] Lista API routes (health, users)
- [ ] Lista actions (create-user)
- [ ] Lista WebSocket (notifications)
- [ ] Total count correto

### Phase 8: Build

```bash
npx theokit build
```

**Avaliar:**
- [ ] Build completa sem erros
- [ ] `.theo/client/index.html` existe
- [ ] Assets hashados em `.theo/client/assets/`

### Phase 9: Production Server

```bash
npx theokit start --port 3501 &
sleep 2
curl -s -o /dev/null -w "%{http_code}" http://localhost:3501/
curl -s http://localhost:3501/api/health
kill %1
```

**Avaliar:**
- [ ] Production server starts
- [ ] `/` → 200
- [ ] `/api/health` → JSON

### Phase 10: Docker

```bash
npx theokit docker
```

**Avaliar:**
- [ ] `Dockerfile` criado
- [ ] `.dockerignore` criado
- [ ] Dockerfile contém `node:22`
- [ ] Dockerfile contém `theokit build` e `theokit start`

### Phase 11: Error Messages

```bash
npx theokit generate model user          # → Invalid type
npx theokit generate route UPPER         # → Invalid name (kebab-case)
npx theokit build --target=aws           # → Invalid target
```

**Avaliar:**
- [ ] Invalid type → "Available types: route, action, page, ws"
- [ ] Invalid name → "Use kebab-case"
- [ ] Invalid target → "Available targets: node, vercel, cloudflare"

### Phase 12: Template Scaffold (ALL)

Testar CADA template via npx:

```bash
# Dashboard
npx create-theokit /tmp/test-dash --template=dashboard
# API-only
npx create-theokit /tmp/test-api --template=api-only
# Postgres
npx create-theokit /tmp/test-pg --template=postgres
# Invalid
npx create-theokit /tmp/test-bad --template=nonexistent
```

**Avaliar:**
- [ ] Dashboard: app/dashboard/layout.tsx existe
- [ ] API-only: server/routes/users.ts existe
- [ ] Postgres: db/schema.ts + drizzle.config.ts existem
- [ ] Invalid: "Template not found. Available: default, dashboard, api-only, postgres"

### Cleanup

```bash
rm -rf /tmp/theokit-npm-test /tmp/test-dash /tmp/test-api /tmp/test-pg /tmp/test-bad
```

## Report

Salvar em `docs/audit/dogfood-npm-{YYYY-MM-DD}.md`.

```markdown
# Dogfood npm Report — {date}

## Package Info
- theokit: {version} on npm
- create-theokit: {version} on npm
- Published by: {user}

## Health Score: {N}/100

| Phase | Score | Max | Status |
|-------|-------|-----|--------|
| npm Package Exists | {N} | 5 | PASS/FAIL |
| Scaffold via npx | {N} | 10 | PASS/FAIL |
| Install Dependencies | {N} | 10 | PASS/FAIL |
| Import Validation | {N} | 15 | PASS/FAIL |
| Dev Server | {N} | 10 | PASS/FAIL |
| Generator | {N} | 10 | PASS/FAIL |
| Route Listing | {N} | 5 | PASS/FAIL |
| Build | {N} | 10 | PASS/FAIL |
| Production Server | {N} | 10 | PASS/FAIL |
| Docker | {N} | 5 | PASS/FAIL |
| Error Messages | {N} | 5 | PASS/FAIL |
| Template Scaffold | {N} | 5 | PASS/FAIL |

## Issues Found
- {issue description} — {severity}
```

## Scoring

| Score | Meaning |
|-------|---------|
| 90-100 | npm package is production-ready |
| 70-89 | Minor issues to fix |
| 50-69 | Significant problems |
| <50 | Broken — do not recommend |

## Princípios

1. **NUNCA usar o monorepo.** Tudo é instalado do npm.
2. **Testar como user externo.** Zero acesso a source code.
3. **Validar TODOS os exports.** Se está no package.json exports, deve funcionar.
4. **Validar TODOS os templates.** Se create-theokit oferece, deve funcionar.
5. **Validar TODOS os CLI commands.** Se o --help mostra, deve funcionar.
6. **Se quebrar no npm, não existe.** O monorepo passando testes é irrelevante se o npm package está quebrado.
