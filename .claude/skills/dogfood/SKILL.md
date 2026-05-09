---
name: dogfood
description: "QA testing do Theo framework como usuário real. Roda create-theo, theo dev, theo build, theo start, testa frontend routing, API routes, actions, middleware, type safety. Gera relatório estruturado."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Write, Agent
argument-hint: "[full|quick|scaffold|dev|api|build|prod|routing|e2e|unit]"
---

# Dogfood: QA do Theo Framework

Testa o Theo como um usuário real faria. Executa comandos reais, avalia output, e produz relatório.

## Diretório de teste

Todos os testes manuais usam `my-test/` dentro do monorepo. Este diretório:
- Está listado em `pnpm-workspace.yaml` (resolve `workspace:*`)
- Está no `.gitignore` (não entra no git)

## Arguments

| Arg | Scope | Fases |
|---|---|---|
| *(no arg)* or `full` | Tudo | 1-10 |
| `quick` | Scaffold + dev + API smoke | 1-4 |
| `scaffold` | Apenas scaffold | 1-2 |
| `dev` | Apenas dev server (frontend + API) | 1, 3-4 |
| `api` | Apenas API routes + actions | 1, 4 |
| `build` | Apenas build | 1, 5 |
| `prod` | Apenas production server | 1, 5-6 |
| `routing` | Apenas frontend routing | 1, 3 |
| `e2e` | Apenas Playwright E2E | 1, 8 |
| `unit` | Apenas testes automatizados | 1 |

## Execution: 10 Phases

### Phase 1: Pre-flight (sempre roda)

```bash
pnpm typecheck 2>&1
pnpm test 2>&1
pnpm test:types 2>&1
grep -rn '\bany\b' packages/theo/src/ --include="*.ts" || echo "ZERO any"
echo "Node: $(node -v) | pnpm: $(pnpm -v) | Commit: $(git rev-parse --short HEAD) | Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

**Gate:** Se qualquer check falhar, PARE e reporte.

**Avaliar:**
- [ ] `pnpm typecheck` — zero errors
- [ ] `pnpm test` — all green (contar total)
- [ ] `pnpm test:types` — all green
- [ ] Zero `any` em production code

### Phase 2: Scaffold (modes: `full`, `quick`, `scaffold`)

```bash
pnpm try:clean 2>&1
pnpm try:scaffold 2>&1
```

**Avaliar:**
- [ ] Scaffold completa sem erros
- [ ] `my-test/app/page.tsx` contém "Hello Theo"
- [ ] `.gitignore`, `theo.config.ts`, `package.json`, `server/routes/health.ts` existem

### Phase 3: Frontend Dev Server (modes: `full`, `quick`, `dev`, `routing`)

```bash
cd my-test && npx tsx ../packages/theo/src/cli/index.ts dev --port 3456 &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3456/
curl -s -o /dev/null -w "%{http_code}" http://localhost:3456/@theo/entry-client
curl -s -o /dev/null -w "%{http_code}" http://localhost:3456/@theo/route-manifest
kill %1 2>/dev/null
```

**Avaliar:**
- [ ] GET / → 200
- [ ] entry-client → 200 JavaScript
- [ ] route-manifest → 200 JavaScript

### Phase 4: API Routes + Actions (modes: `full`, `quick`, `dev`, `api`)

Usar fixture `server-routes-basic` para routes completas e `server-actions-basic` para actions.

**Avaliar:**
- [ ] GET /api/health → `{"ok":true}` 200
- [ ] POST valid → 201
- [ ] POST invalid → 400 VALIDATION_ERROR
- [ ] Params → `{"id":"42"}`
- [ ] Query → `{"search":"theo"}`
- [ ] 404 / 405 handling
- [ ] Actions: valid → 200, invalid → 400, CSRF → 403

### Phase 5: Build (modes: `full`, `build`, `prod`)

```bash
cd fixtures/production-build
npx tsx ../../packages/theo/src/cli/index.ts build
```

**Avaliar:**
- [ ] Build completa sem erros
- [ ] `.theo/client/index.html` existe
- [ ] `.theo/client/assets/` tem JS/CSS hashados
- [ ] `public/logo.png` copiado para `.theo/client/logo.png`
- [ ] Build time aceitável (< 10s)

### Phase 6: Production Server (modes: `full`, `prod`)

```bash
cd fixtures/production-build
npx tsx ../../packages/theo/src/cli/index.ts start --port 4000 &
sleep 2
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/
curl -s http://localhost:4000/api/health
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/dashboard
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/logo.png
kill %1 2>/dev/null
```

**Avaliar:**
- [ ] GET / → 200 HTML
- [ ] GET /api/health → 200 JSON `{"ok":true}`
- [ ] GET /dashboard → 200 (SPA fallback)
- [ ] GET /logo.png → 200 (public asset)
- [ ] Paridade dev/prod (mesmas rotas funcionam)

### Phase 7: HMR Test (modes: `full`)

```bash
cd my-test && npx tsx ../packages/theo/src/cli/index.ts dev --port 3456 &
sleep 4
# Frontend HMR
echo 'export default function Page() { return <h1>Modified</h1> }' > app/page.tsx
sleep 2 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3456/
# Restore + Backend HMR
printf 'export default function Page() {\n  return <h1>Hello Theo</h1>\n}\n' > app/page.tsx
mkdir -p server/routes
printf 'import { defineRoute } from "theo/server"\nexport const GET = defineRoute({ handler: () => ({ ping: "pong" }) })\n' > server/routes/ping.ts
sleep 2 && curl -s http://localhost:3456/api/ping
kill %1 2>/dev/null
```

**Avaliar:**
- [ ] Server sobrevive edit frontend + backend
- [ ] Nova route auto-detectada

### Phase 8: E2E Playwright (modes: `full`, `e2e`)

```bash
CI=true pnpm test:e2e 2>&1
```

**Avaliar:**
- [ ] Todos Playwright tests GREEN
- [ ] Layouts, errors, not-found funcionam

### Phase 9: DX Evaluation (modes: `full`)

8 dimensões, cada uma 1-5:

1. **Scaffold Speed** — `create-theo` rápido?
2. **Zero Config** — funciona sem editar?
3. **Error Messages** — erros acionáveis?
4. **Dev Startup** — `theo dev` rápido?
5. **File Structure** — intuitiva?
6. **API DX** — criar route/action simples?
7. **Routing DX** — criar page intuitivo?
8. **Build DX** — `theo build` rápido? Mensagens claras?

Testar erros:
```bash
npx tsx packages/create-theo/src/cli.ts "Bad!" 2>&1
cd /tmp && npx tsx /path/to/theo dev 2>&1
npx tsx /path/to/theo start 2>&1  # sem build → erro claro
```

### Phase 10: Regression Check (modes: `full`)

```bash
pnpm test 2>&1 | grep "passed"
```

**Avaliar:**
- [ ] Todos os testes de todas as ondas passam
- [ ] Nenhuma regressão

## Report

Salvar em `docs/audit/dogfood-{YYYY-MM-DD}.md`.

```markdown
# Dogfood Report — {date}

## Environment
- Node: {version}
- pnpm: {version}
- Commit: {sha}
- Mode: {full|quick|...}

## Health Score: {N}/100

| Phase | Score | Max | Status |
|-------|-------|-----|--------|
| Pre-flight | {N} | 12 | PASS/FAIL |
| Scaffold | {N} | 8 | PASS/FAIL |
| Frontend | {N} | 8 | PASS/FAIL |
| API+Actions | {N} | 12 | PASS/FAIL |
| Build | {N} | 10 | PASS/FAIL |
| Production | {N} | 12 | PASS/FAIL |
| HMR | {N} | 8 | PASS/FAIL/SKIP |
| E2E | {N} | 10 | PASS/FAIL |
| DX | {N} | 12 | {score}/5 |
| Regression | {N} | 8 | PASS/FAIL |

## Checklist Summary

### Infra
- [ ] TypeScript: zero errors
- [ ] Unit tests: N/N green
- [ ] Type tests: N/N green
- [ ] Zero `any` in production code

### Scaffold (Onda 1)
- [ ] Creates valid project with all files

### Frontend (Onda 1+2)
- [ ] Dev server: 200, virtual modules
- [ ] Routing, layouts, errors, not-found (via E2E)

### Backend (Onda 3+4+5)
- [ ] API routes: GET, POST, params, query, validation
- [ ] Actions: CSRF, Zod input, 403/404/405
- [ ] Middleware: headers, ctx.requestId
- [ ] Context: available in routes AND actions

### Build + Production (Onda 6)
- [ ] `theo build` generates .theo/client/
- [ ] Assets hashed, public/ copied
- [ ] `theo start` serves app on production
- [ ] SPA fallback for frontend routes
- [ ] API works in production
- [ ] Static files with correct MIME types

### Type Safety (Onda 7)
- [ ] Zod → handler type inference
- [ ] Zero any in public API
- [ ] ctx: unknown (requires narrowing)

### DX
- [ ] Error messages: clean, no stack traces
- [ ] Build messages clear
- [ ] "Run theo build first" when no build
```

## Scoring

| Score | Meaning |
|-------|---------|
| 90-100 | Ship it |
| 70-89 | Minor issues, shippable |
| 50-69 | Needs work |
| <50 | Broken |

## Princípios

1. **Brutalmente honesto.**
2. **Evidência sobre opinião.**
3. **Actionable.**
4. **Teste como usuário.**
5. **Não ignora warnings.**
6. **Backend é cidadão de primeira classe.**
7. **Build+prod testados com mesmo rigor que dev.**
