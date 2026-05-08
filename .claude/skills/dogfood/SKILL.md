---
name: dogfood
description: "QA testing do Theo framework como usuário real. Roda create-theo, theo dev, theo build, theo start, testa routes/actions/middleware, avalia DX, gera relatório estruturado. Use quando pedir para 'dogfood', 'QA test', 'testar como usuário', ou 'eat our own cooking'."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Agent
argument-hint: "[full|quick|scaffold|dev|build|routes|actions|dx]"
---

# Dogfood: QA do Theo Framework

Use a sessão atual como tester. Execute comandos reais do Theo, avalie output como um QA engineer rigoroso, e produza relatório estruturado.

## Arguments

| Arg | Scope | Time |
|---|---|---|
| *(no arg)* or `full` | Tudo: scaffold + dev + build + routes + actions + DX | ~15 min |
| `quick` | Scaffold + dev + smoke tests | ~5 min |
| `scaffold` | Apenas `npx create-theo` | ~3 min |
| `dev` | Apenas `theo dev` + HMR | ~5 min |
| `build` | Apenas `theo build` + `theo start` | ~3 min |
| `routes` | Apenas server routes + validation | ~5 min |
| `actions` | Apenas server actions + forms | ~5 min |
| `dx` | Apenas DX evaluation (8 dimensões, 1-5) | ~5 min |

## Execution: 6 Phases

### Phase 1: Pre-flight (sempre roda)

1. Verificar se o workspace está funcional:
   ```bash
   npx tsc --noEmit 2>&1 | tail -5
   npm test 2>&1 | tail -10
   ```
2. Registrar environment: commit SHA, date, Node version.

### Phase 2: Scaffold (modes: `full`, `quick`, `scaffold`)

```bash
# Criar projeto temporário
TMPDIR=$(mktemp -d)
cd $TMPDIR
npx create-theo@latest test-app --template basic 2>&1
cd test-app
npm install 2>&1 | tail -5
```

Avaliar:
- Scaffold completa sem erros?
- Estrutura de arquivos correta?
- `package.json` tem scripts corretos?
- `theo.config.ts` existe e é válido?
- `app/page.tsx` existe?

### Phase 3: Dev Server (modes: `full`, `quick`, `dev`)

```bash
# Iniciar dev server
npx theo dev &
DEV_PID=$!
sleep 3

# Testar
curl -s http://localhost:3000 | head -20
curl -s http://localhost:3000/api/health | head -5

kill $DEV_PID
```

Avaliar:
- Dev server inicia em < 3s?
- Homepage responde com HTML válido?
- Health endpoint funciona?
- HMR funciona (editar arquivo e verificar reload)?

### Phase 4: Build + Production (modes: `full`, `build`)

```bash
npx theo build 2>&1 | tail -10
npx theo start &
START_PID=$!
sleep 2

curl -s http://localhost:3000 | head -20
curl -s http://localhost:3000/api/health | head -5

kill $START_PID
```

Avaliar:
- Build completa sem erros?
- Build output contém client e server bundles?
- Production server inicia?
- Respostas corretas?
- Dev/prod parity?

### Phase 5: Routes + Actions (modes: `full`, `routes`, `actions`)

Testar server routes:
```bash
# GET route
curl -s http://localhost:3000/api/users

# POST route with valid body
curl -s -X POST http://localhost:3000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"John","email":"john@test.com"}'

# POST route with invalid body (Zod validation)
curl -s -X POST http://localhost:3000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"","email":"not-an-email"}'

# 404 route
curl -s http://localhost:3000/api/nonexistent
```

Testar server actions (se fixtures disponíveis).

### Phase 6: DX Evaluation (modes: `full`, `dx`)

8 dimensões, cada uma 1-5:

1. **Help Quality** — `theo --help`, subcommand help
2. **Error Messages** — Erros acionáveis? Mostram arquivo/linha?
3. **Exit Codes** — Consistentes?
4. **Type Safety** — Autocomplete funciona? Tipos inferem?
5. **Progressive Disclosure** — Zero-config funciona? Advanced é opt-in?
6. **Discoverability** — Novato consegue descobrir o que fazer?
7. **Consistency** — Patterns uniformes entre comandos?
8. **Speed** — Dev startup < 500ms? HMR < 100ms? Build < 30s?

## Report

Salvo em `docs/audit/dogfood-{YYYY-MM-DD}.md`.

**Health Score:**
- `full`: scaffold(20%) + dev(20%) + build(20%) + routes(20%) + DX(20%)
- `quick`: scaffold(40%) + dev(60%)

**Issue severity:** CRITICAL / HIGH / MEDIUM / LOW

Para cada issue:
1. ID e severidade
2. Comando que triggered
3. O que deu errado
4. Steps to reproduce
5. Expected vs actual
6. Fix sugerido
7. Regression test name

## Princípios

1. **Brutalmente honesto.** Se está quebrado, diz que está quebrado.
2. **Evidência sobre opinião.** Comando reproduzível + output real.
3. **Actionable.** Cada issue sugere fix ou regression test.
4. **Teste como usuário.** Não usa internals — só o que `--help` mostra.
5. **Edge cases.** Empty inputs, invalid paths, missing config.
6. **DX não é opcional.** CLI que funciona mas é dolorosa = falha de produto.
