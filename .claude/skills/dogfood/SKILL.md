---
name: dogfood
description: "QA testing do Theo framework como usuário real. Roda create-theo, theo dev, testa frontend routing, API routes, Zod validation, DX. Gera relatório estruturado. Use quando pedir para 'dogfood', 'QA test', 'testar como usuário', ou 'eat our own cooking'."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Write, Agent
argument-hint: "[full|quick|scaffold|dev|api|routing|e2e|unit]"
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
| *(no arg)* or `full` | Tudo | 1-8 |
| `quick` | Scaffold + dev + API smoke | 1-4 |
| `scaffold` | Apenas scaffold | 1-2 |
| `dev` | Apenas dev server (frontend + API) | 1, 3-4 |
| `api` | Apenas API routes | 1, 4 |
| `routing` | Apenas frontend routing | 1, 3 |
| `e2e` | Apenas Playwright E2E | 1, 6 |
| `unit` | Apenas testes automatizados | 1 |

## Execution: 8 Phases

### Phase 1: Pre-flight (sempre roda)

Verificar que o workspace está saudável antes de qualquer teste.

```bash
pnpm typecheck 2>&1
pnpm test 2>&1
pnpm test:types 2>&1
echo "Node: $(node -v) | pnpm: $(pnpm -v) | Commit: $(git rev-parse --short HEAD) | Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

**Gate:** Se qualquer check falhar, PARE e reporte.

**Avaliar:**
- [ ] `pnpm typecheck` — zero errors
- [ ] `pnpm test` — all green (contar total)
- [ ] `pnpm test:types` — all green
- [ ] Zero `any` em production code: `grep -rn '\bany\b' packages/theo/src/ --include="*.ts"`

### Phase 2: Scaffold (modes: `full`, `quick`, `scaffold`)

```bash
pnpm try:clean 2>&1
pnpm try:scaffold 2>&1
```

**Avaliar:**
- [ ] Scaffold completa sem erros
- [ ] `my-test/app/page.tsx` existe e contém "Hello Theo"
- [ ] `my-test/theo.config.ts` existe
- [ ] `my-test/package.json` com name correto
- [ ] `my-test/index.html` com `/@theo/entry-client`
- [ ] `my-test/.gitignore` existe (não `_gitignore`)
- [ ] `my-test/package.json.tmpl` NÃO existe
- [ ] `my-test/server/routes/health.ts` existe

### Phase 3: Frontend Dev Server (modes: `full`, `quick`, `dev`, `routing`)

```bash
cd my-test && npx tsx ../packages/theo/src/cli/index.ts dev --port 3456 &
sleep 5

# Frontend
curl -s -o /dev/null -w "%{http_code}" http://localhost:3456/
curl -s http://localhost:3456/ | grep '<div id="root">'
curl -s -o /dev/null -w "%{http_code}" http://localhost:3456/@theo/entry-client
curl -s -o /dev/null -w "%{http_code}" http://localhost:3456/@theo/route-manifest

kill %1 2>/dev/null
```

**Avaliar:**
- [ ] `GET /` retorna HTTP 200
- [ ] Response contém `<div id="root">`
- [ ] `/@theo/entry-client` retorna 200 com JavaScript
- [ ] `/@theo/route-manifest` retorna 200 com JavaScript
- [ ] Route manifest contém `export const routes`

### Phase 4: API Routes (modes: `full`, `quick`, `dev`, `api`)

Subir dev server no `my-test/` (ou fixture `server-routes-basic`).

Para testar no `my-test/` scaffoldado:
```bash
cd my-test && npx tsx ../packages/theo/src/cli/index.ts dev --port 3456 &
sleep 5

# API Health
curl -s http://localhost:3456/api/health

# 404
curl -s http://localhost:3456/api/nonexistent

kill %1 2>/dev/null
```

Para testar com fixture completa (routes + params + validation):
```bash
cd fixtures/server-routes-basic && npx tsx ../../packages/theo/src/cli/index.ts dev --port 3470 &
sleep 5

# 1. GET simples
curl -s http://localhost:3470/api/health

# 2. POST válido
curl -s -X POST http://localhost:3470/api/users -H 'Content-Type: application/json' -d '{"name":"Paulo","email":"paulo@test.com"}'

# 3. POST inválido → 400
curl -s -X POST http://localhost:3470/api/users -H 'Content-Type: application/json' -d '{"name":"","email":"bad"}'

# 4. Params
curl -s http://localhost:3470/api/users/42

# 5. Query
curl -s "http://localhost:3470/api/users?search=theo"

# 6. 404
curl -s http://localhost:3470/api/nonexistent

# 7. 405
curl -s -X DELETE http://localhost:3470/api/health

kill %1 2>/dev/null
```

**Avaliar:**
- [ ] GET /api/health → `{"ok":true}` com 200
- [ ] POST válido → 201 com dados corretos
- [ ] POST inválido → 400 com `{ error: { code: "VALIDATION_ERROR", issues: [...] } }`
- [ ] Params → `{"id":"42"}`
- [ ] Query → `{"search":"theo"}`
- [ ] /api/nonexistent → 404 com `{ error: { code: "NOT_FOUND" } }`
- [ ] DELETE /api/health → 405 com `{ error: { code: "METHOD_NOT_ALLOWED" } }`
- [ ] Content-Type de todas respostas é `application/json`

### Phase 5: HMR Test (modes: `full`)

Testar HMR de frontend E backend.

```bash
cd my-test && npx tsx ../packages/theo/src/cli/index.ts dev --port 3456 &
sleep 4

# Frontend HMR
echo 'export default function Page() { return <h1>Modified</h1> }' > app/page.tsx
sleep 2
curl -s -o /dev/null -w "%{http_code}" http://localhost:3456/

# Restaurar
printf 'export default function Page() {\n  return <h1>Hello Theo</h1>\n}\n' > app/page.tsx

# Backend HMR: criar nova route
mkdir -p server/routes
echo 'import { defineRoute } from "theo/server"\nexport const GET = defineRoute({ handler: () => ({ ping: "pong" }) })' > server/routes/ping.ts
sleep 2
curl -s http://localhost:3456/api/ping

kill %1 2>/dev/null
```

**Avaliar:**
- [ ] Server sobrevive edit de page.tsx
- [ ] Server sobrevive criação de nova route
- [ ] Nova route `/api/ping` responde após criação
- [ ] Nenhum crash

### Phase 6: E2E Playwright (modes: `full`, `e2e`)

```bash
CI=true pnpm test:e2e 2>&1
```

**Avaliar:**
- [ ] Todos os Playwright tests GREEN
- [ ] Hello Theo renderiza no browser
- [ ] Nested layouts funcionam
- [ ] Error boundaries funcionam
- [ ] Not-found funciona
- [ ] Zero console errors

### Phase 7: DX Evaluation (modes: `full`)

7 dimensões, cada uma 1-5:

1. **Scaffold Speed** — `create-theo` completa em tempo aceitável?
2. **Zero Config** — Projeto funciona sem editar nenhum arquivo?
3. **Error Messages** — Erros são acionáveis?
4. **Dev Startup** — `theo dev` printa URLs rapidamente?
5. **File Structure** — Estrutura gerada é intuitiva?
6. **API DX** — Criar route é simples? Zod errors são claros?
7. **Routing DX** — Criar page é intuitivo? Layouts fazem sentido?

Testar erros:
```bash
# Scaffold com nome inválido
npx tsx packages/create-theo/src/cli.ts "Bad Name!" 2>&1

# Dev sem app/
cd /tmp && npx tsx /path/to/theo/src/cli/index.ts dev 2>&1

# POST sem Content-Type
curl -s -X POST http://localhost:3456/api/users -d '{"name":"test"}'
```

### Phase 8: Regression Check (modes: `full`)

Verificar que features de ondas anteriores não quebraram.

```bash
# Onda 0: Contracts
pnpm test 2>&1 | grep -c "passed"

# Onda 1: Scaffold + dev
# (já testado em Phase 2+3)

# Onda 2: Frontend routing
# (já testado em Phase 6 via Playwright)

# Onda 3: API routes
# (já testado em Phase 4)
```

**Avaliar:**
- [ ] Todos os testes de todas as ondas passam
- [ ] Nenhuma regressão introduzida

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
| Pre-flight | {N} | 15 | PASS/FAIL |
| Scaffold | {N} | 10 | PASS/FAIL |
| Frontend | {N} | 10 | PASS/FAIL |
| API Routes | {N} | 15 | PASS/FAIL |
| HMR | {N} | 10 | PASS/FAIL/SKIP |
| E2E | {N} | 15 | PASS/FAIL |
| DX | {N} | 15 | {score}/5 |
| Regression | {N} | 10 | PASS/FAIL |

## Issues

### {ID}: {title}
- **Severity:** CRITICAL / HIGH / MEDIUM / LOW
- **Phase:** {phase}
- **Command:** `{command}`
- **Expected:** {what should happen}
- **Actual:** {what happened}
- **Repro:** {steps}
- **Fix:** {sugestão}

## Checklist Summary

### Infra
- [ ] TypeScript: zero errors
- [ ] Unit tests: N/N green
- [ ] Type tests: N/N green
- [ ] Zero `any` in production code

### Scaffold (Onda 1)
- [ ] Scaffold: creates valid project
- [ ] Package.json name correct
- [ ] .gitignore exists
- [ ] Server routes template exists

### Frontend (Onda 1+2)
- [ ] Dev server: responds 200
- [ ] Virtual modules: entry-client + route-manifest serve JS
- [ ] File-based routing: multiple pages work
- [ ] Nested layouts: root + segment layouts
- [ ] Error boundaries: broken page caught
- [ ] Not-found: unknown URL handled

### Backend (Onda 3)
- [ ] GET /api/health → JSON 200
- [ ] POST valid → correct status + data
- [ ] POST invalid → 400 VALIDATION_ERROR with issues
- [ ] Dynamic params extracted correctly
- [ ] Query strings parsed correctly
- [ ] 404 for unmatched API routes
- [ ] 405 for wrong HTTP method
- [ ] Content-Type: application/json on all API responses

### DX
- [ ] Error messages: clean, no stack traces
- [ ] Scaffold speed acceptable
- [ ] Zero config needed
- [ ] No crashes, no hangs
```

## Scoring

| Score | Meaning |
|-------|---------|
| 90-100 | Ship it |
| 70-89 | Minor issues, shippable |
| 50-69 | Needs work before next onda |
| <50 | Broken, fix before anything else |

## Princípios

1. **Brutalmente honesto.** Se está quebrado, diz que está quebrado.
2. **Evidência sobre opinião.** Comando reproduzível + output real.
3. **Actionable.** Cada issue sugere fix.
4. **Teste como usuário.** Só usa o que o dev teria acesso.
5. **Não ignora warnings.** Warning hoje = bug amanhã.
6. **Backend é cidadão de primeira classe.** API routes testados com mesma rigorosidade que frontend.
