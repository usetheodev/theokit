---
name: dogfood
description: "QA testing do Theo framework como usuário real. Roda create-theo, theo dev, testa no browser, avalia DX, gera relatório estruturado. Use quando pedir para 'dogfood', 'QA test', 'testar como usuário', ou 'eat our own cooking'."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Write, Agent
argument-hint: "[full|quick|scaffold|dev|unit|e2e]"
---

# Dogfood: QA do Theo Framework

Testa o Theo como um usuário real faria. Executa comandos reais, avalia output, e produz relatório.

## Diretório de teste

Todos os testes usam `/my-test` dentro do monorepo. Este diretório:
- Está listado em `pnpm-workspace.yaml` (resolve `workspace:*`)
- Está no `.gitignore` (não entra no git)

## Arguments

| Arg | Scope | Fases |
|---|---|---|
| *(no arg)* or `full` | Tudo: unit + scaffold + dev + e2e | 1-6 |
| `quick` | Scaffold + dev server smoke | 1-3 |
| `scaffold` | Apenas scaffold | 1-2 |
| `dev` | Apenas dev server | 1, 3 |
| `unit` | Apenas testes automatizados | 1 |
| `e2e` | Apenas Playwright E2E | 1, 5 |

## Execution: 6 Phases

### Phase 1: Pre-flight (sempre roda)

Verificar que o workspace está saudável antes de qualquer teste.

```bash
# 1. TypeScript check
pnpm typecheck 2>&1

# 2. Unit + Integration tests
pnpm test 2>&1

# 3. Type tests
pnpm test:types 2>&1

# 4. Registrar environment
echo "Node: $(node -v)"
echo "pnpm: $(pnpm -v)"
echo "Commit: $(git rev-parse --short HEAD)"
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

**Gate:** Se qualquer check falhar, PARE e reporte. Não prossiga com scaffold/dev se unit tests falham.

**Avaliar:**
- [ ] `pnpm typecheck` — zero errors
- [ ] `pnpm test` — all green
- [ ] `pnpm test:types` — all green
- [ ] Contar: total tests, total files, time

### Phase 2: Scaffold (modes: `full`, `quick`, `scaffold`)

Testar o fluxo `create-theo` como um usuário faria.

```bash
# 1. Limpar teste anterior
pnpm try:clean 2>&1

# 2. Scaffoldar projeto
pnpm try:scaffold 2>&1

# 3. Verificar estrutura gerada
ls -la my-test/
ls my-test/app/
cat my-test/package.json
cat my-test/theo.config.ts
cat my-test/app/page.tsx

# 4. Instalar deps (workspace resolve)
pnpm install 2>&1
```

**Avaliar:**
- [ ] Scaffold completa sem erros
- [ ] `my-test/app/page.tsx` existe e contém "Hello Theo"
- [ ] `my-test/theo.config.ts` existe e é válido
- [ ] `my-test/package.json` existe com name correto
- [ ] `my-test/index.html` existe com `/@theo/entry-client`
- [ ] `my-test/.gitignore` existe (não `_gitignore`)
- [ ] `my-test/package.json.tmpl` NÃO existe
- [ ] `pnpm install` resolve workspace deps sem erros

### Phase 3: Dev Server (modes: `full`, `quick`, `dev`)

Testar `theo dev` no projeto scaffoldado.

```bash
# 1. Subir dev server (background, porta auto)
cd my-test
npx tsx ../packages/theo/src/cli/index.ts dev --port 3456 &
DEV_PID=$!
sleep 4

# 2. Testar HTTP
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3456/)
echo "Status: $HTTP_STATUS"

# 3. Verificar HTML
curl -s http://localhost:3456/ | head -20

# 4. Verificar virtual module
curl -s -o /dev/null -w "%{http_code}" http://localhost:3456/@theo/entry-client
echo ""

# 5. Cleanup
kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null
```

**Avaliar:**
- [ ] Dev server inicia sem erros
- [ ] `GET /` retorna HTTP 200
- [ ] Response é HTML com `<div id="root">`
- [ ] Response contém `/@theo/entry-client`
- [ ] `GET /@theo/entry-client` retorna HTTP 200 com JavaScript
- [ ] JavaScript contém `createRoot`
- [ ] Server fecha sem erros (graceful shutdown)

### Phase 4: HMR Test (modes: `full`)

Testar Hot Module Replacement.

```bash
# 1. Subir dev server
cd my-test
npx tsx ../packages/theo/src/cli/index.ts dev --port 3456 &
DEV_PID=$!
sleep 4

# 2. Verificar conteúdo original
curl -s http://localhost:3456/@theo/entry-client | grep -o "page.tsx" || echo "MISSING page.tsx ref"

# 3. Modificar page.tsx
echo 'export default function Page() { return <h1>Modified</h1> }' > app/page.tsx

# 4. Esperar HMR processar
sleep 2

# 5. Verificar que server ainda responde
curl -s -o /dev/null -w "%{http_code}" http://localhost:3456/

# 6. Restaurar original
echo 'export default function Page() { return <h1>Hello Theo</h1> }' > app/page.tsx

# 7. Cleanup
kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null
```

**Avaliar:**
- [ ] Server continua respondendo após edit
- [ ] Nenhum crash no server após modificação
- [ ] File restore funciona

### Phase 5: E2E Playwright (modes: `full`, `e2e`)

Testar rendering real no browser.

```bash
pnpm test:e2e 2>&1
```

**Avaliar:**
- [ ] Playwright tests all green
- [ ] `<h1>Hello Theo</h1>` renderiza no browser
- [ ] Título "Theo App" correto
- [ ] `#root` element existe
- [ ] Zero console errors

### Phase 6: DX Evaluation (modes: `full`)

Avaliar Developer Experience em 5 dimensões (1-5 cada):

1. **Scaffold Speed** — `create-theo` completa em tempo aceitável?
2. **Zero Config** — Projeto funciona sem editar nenhum arquivo?
3. **Error Messages** — Erros são acionáveis? (ex: missing app/)
4. **Dev Startup** — `theo dev` printa URLs rapidamente?
5. **File Structure** — Estrutura gerada é intuitiva?

Testar erros:
```bash
# Scaffold com nome inválido
npx tsx packages/create-theo/src/cli.ts "Bad Name!" 2>&1

# Dev sem app/
npx tsx packages/theo/src/cli/index.ts dev 2>&1
# (rodar de um dir sem app/ — deve falhar com mensagem clara)
```

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
| Pre-flight | {N} | 20 | PASS/FAIL |
| Scaffold | {N} | 20 | PASS/FAIL |
| Dev Server | {N} | 20 | PASS/FAIL |
| HMR | {N} | 10 | PASS/FAIL/SKIP |
| E2E | {N} | 15 | PASS/FAIL |
| DX | {N} | 15 | {score}/5 |

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

- [ ] TypeScript: zero errors
- [ ] Unit tests: N/N green
- [ ] Type tests: N/N green
- [ ] Scaffold: creates valid project
- [ ] Dev server: responds 200
- [ ] Virtual module: serves JavaScript
- [ ] E2E: Hello Theo in browser
- [ ] Error messages: actionable
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
