---
name: dogfood
description: "QA testing do Theo framework como usuário real. Scaffold all templates, theo dev, theo build, theo start, API routes, actions, cookies, middleware, type safety. Gera relatório estruturado."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Write, Agent
argument-hint: "[full|quick|scaffold|dev|api|build|prod|routing|e2e|unit|templates|cookies]"
---

# Dogfood: QA do Theo Framework

Testa o Theo como um usuário real faria. Executa comandos reais, avalia output, e produz relatório.

## Diretório de teste

Testes manuais usam `my-test/` dentro do monorepo (workspace member, gitignored).

## Arguments

| Arg | Scope | Fases |
|---|---|---|
| *(no arg)* or `full` | Tudo | 1-12 |
| `quick` | Scaffold + dev + API smoke | 1-4 |
| `scaffold` | Apenas scaffold default | 1-2 |
| `templates` | Scaffold TODOS os templates | 1-2, 3 (template-specific) |
| `dev` | Apenas dev server | 1, 4-5 |
| `api` | Apenas API routes + actions | 1, 5 |
| `cookies` | Apenas cookie helpers | 1, 6 |
| `build` | Apenas build | 1, 7 |
| `prod` | Apenas production server | 1, 7-8 |
| `routing` | Apenas frontend routing | 1, 4 |
| `e2e` | Apenas Playwright E2E | 1, 9 |
| `unit` | Apenas testes automatizados | 1 |

## Execution: 12 Phases

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

Testar CADA template. Para cada um: scaffold → verificar estrutura → cleanup.

```bash
# Template: dashboard
pnpm try:clean
npx tsx packages/create-theo/src/cli.ts my-test --template=dashboard
# Verificar: layout.tsx, about/page.tsx, dashboard/layout.tsx

# Template: api-only
pnpm try:clean
npx tsx packages/create-theo/src/cli.ts my-test --template=api-only
# Verificar: server/routes/health.ts, server/routes/users.ts

# Template: invalid → erro claro
npx tsx packages/create-theo/src/cli.ts /tmp/test-bad --template=nonexistent
# Deve mostrar "Template not found"
```

**Avaliar para CADA template:**
- [ ] Scaffold completa sem erros
- [ ] Arquivos template-específicos existem
- [ ] `pnpm install` (workspace) resolve deps
- [ ] `theo dev` sobe sem crash (quando aplicável)

**Templates a testar:**

| Template | Arquivos chave | Verificação |
|----------|---------------|-------------|
| `default` | app/page.tsx, server/routes/health.ts | "Hello Theo" |
| `dashboard` | app/layout.tsx, app/dashboard/layout.tsx, app/about/page.tsx | Nested layouts |
| `api-only` | server/routes/health.ts, server/routes/users.ts | API routes |

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
- [ ] POST valid → 201
- [ ] POST invalid → 400 VALIDATION_ERROR com requestId
- [ ] Params, Query, 404, 405
- [ ] Actions: CSRF, Zod input
- [ ] Middleware: x-custom-header, ctx.requestId

### Phase 6: Cookie Helpers (modes: `full`, `cookies`)

Usar fixture `cookies-test` ou testar inline.

```bash
# Verificar que cookie helpers são exportados
npx tsx -e "import { getCookie, setCookie, deleteCookie } from './packages/theo/src/server/index.ts'; console.log('OK')"
```

**Avaliar:**
- [ ] `getCookie` importável de `theo/server`
- [ ] `setCookie` importável de `theo/server`
- [ ] `deleteCookie` importável de `theo/server`
- [ ] Defaults seguros: httpOnly, sameSite=lax

### Phase 7: Build (modes: `full`, `build`, `prod`)

```bash
cd fixtures/production-build
npx tsx ../../packages/theo/src/cli/index.ts build
```

**Avaliar:**
- [ ] `.theo/client/index.html` existe
- [ ] Assets hashados
- [ ] public/ copiado

### Phase 8: Production Server (modes: `full`, `prod`)

```bash
npx tsx ../../packages/theo/src/cli/index.ts start --port 4000 &
sleep 2
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/
curl -s http://localhost:4000/api/health
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/dashboard
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/logo.png
kill %1 2>/dev/null
```

### Phase 9: E2E Playwright (modes: `full`, `e2e`)

```bash
CI=true pnpm test:e2e 2>&1
```

### Phase 10: HMR (modes: `full`)

Frontend edit + backend new route auto-detect.

### Phase 11: DX Evaluation (modes: `full`)

9 dimensões, cada uma 1-5:

1. **Scaffold Speed**
2. **Zero Config**
3. **Error Messages** (dev sem app, invalid name, no build, invalid template)
4. **Dev Startup**
5. **File Structure**
6. **API DX**
7. **Routing DX**
8. **Build DX**
9. **Template Variety** — templates cobrem use cases reais?

### Phase 12: Regression Check (modes: `full`)

```bash
pnpm test 2>&1 | grep "passed"
```

## Report

Salvar em `docs/audit/dogfood-{YYYY-MM-DD}.md`.

```markdown
# Dogfood Report — {date}

## Health Score: {N}/100

| Phase | Score | Max | Status |
|-------|-------|-----|--------|
| Pre-flight | {N} | 10 | PASS/FAIL |
| Scaffold Default | {N} | 5 | PASS/FAIL |
| Scaffold Templates | {N} | 10 | PASS/FAIL |
| Frontend | {N} | 7 | PASS/FAIL |
| API+Actions | {N} | 10 | PASS/FAIL |
| Cookies | {N} | 5 | PASS/FAIL |
| Build | {N} | 8 | PASS/FAIL |
| Production | {N} | 10 | PASS/FAIL |
| E2E | {N} | 10 | PASS/FAIL |
| HMR | {N} | 5 | PASS/FAIL |
| DX | {N} | 12 | {score}/5 |
| Regression | {N} | 8 | PASS/FAIL |

## Checklist Summary

### Infra
- [ ] TypeScript: zero errors
- [ ] Unit tests: N/N green
- [ ] Type tests: N/N green
- [ ] Zero `any`

### Templates
- [ ] `default`: scaffolds + runs
- [ ] `dashboard`: scaffolds with layouts + about + dashboard
- [ ] `api-only`: scaffolds with health + users routes
- [ ] Invalid template: clear error message

### Cookies (Onda 9)
- [ ] getCookie parses cookie header
- [ ] setCookie with httpOnly + sameSite defaults
- [ ] deleteCookie sets Max-Age=0
- [ ] Multiple cookies append (not overwrite)

### Frontend (Onda 1+2)
- [ ] Dev server: 200, virtual modules
- [ ] Routing, layouts, errors, not-found (via E2E)

### Backend (Onda 3+4+5)
- [ ] Routes, actions, middleware, context

### Observability (Onda 8)
- [ ] x-request-id on all API responses
- [ ] Structured JSON logging

### Build + Production (Onda 6)
- [ ] Build generates .theo/client/
- [ ] Production server serves all

### Type Safety (Onda 7)
- [ ] Zero any, Zod inference, ctx: unknown
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
8. **Cookies testados como feature de primeira classe.**
