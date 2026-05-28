# Edge Case Review — playwright-postgres-templates-ci

Data: 2026-05-28
Tasks analisadas: 5 (T0.1, T1.1, T1.2, T1.3, T2.1)
Edge cases encontrados: 6 (MUST FIX: 3, SHOULD TEST: 2, DOCUMENT: 1)

## MUST FIX

### EC-1: `drizzle-kit` não está instalado em lugar nenhum
- **Task afetada:** T1.1, T1.2
- **Família:** Resource / Setup
- **Cenário:** Plano manda rodar `pnpm --filter fixture-template-postgres exec drizzle-kit push`. Verificado: `drizzle-kit` NÃO consta em `fixtures/template-postgres/package.json` deps, NÃO consta em `fixtures/template-saas/package.json` deps, NÃO consta no `package.json` root. `pnpm exec drizzle-kit --version` retorna `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "drizzle-kit" not found`.
- **Impacto:** Job CI nova falha imediatamente no passo "Push schema". 0% chance de funcionar como planejado.
- **Fix sugerido:** Adicionar `"drizzle-kit": "^0.30.0"` em `devDependencies` do root `package.json`. Mudar comandos do plano de `pnpm --filter ... exec drizzle-kit push` para `pnpm exec drizzle-kit push --config fixtures/template-postgres/drizzle.config.ts` (e equivalente para saas). Atualizar T1.1, T1.2, T2.1 ditto.

### EC-2: Fixtures `template-postgres` e `template-saas` NÃO estão no `pnpm-workspace.yaml`
- **Task afetada:** T1.1 (filtro pnpm), T1.2 (validação local)
- **Família:** Resource / Workspace
- **Cenário:** `pnpm-workspace.yaml` lista `fixtures/template-default`, `fixtures/services-*` mas NÃO lista `fixtures/template-{dashboard,api-only,postgres,saas}`. Confirmado via `pnpm list -r` — só 5 pacotes (template-default, theoui-autoinject, services-{python,node,both}) aparecem. As 4 fixtures de template restantes têm `node_modules/theokit` mas é install stale, não registro de workspace.
- **Impacto:** Comando `pnpm --filter fixture-template-postgres exec ...` falha com `No projects matched the filters`. Mesmo se EC-1 for fixado, este comando ainda não acha o pacote.
- **Fix sugerido:** Trocar a estratégia inteira: usar `--config` flag direto. Comando vira `pnpm exec drizzle-kit push --config fixtures/template-postgres/drizzle.config.ts` rodado do root. Sem `--filter`, sem workspace dependency. Mesma resolução vale localmente e em CI.

### EC-3: `drizzle-kit push` prompts interativos podem travar CI
- **Task afetada:** T1.1, T1.2
- **Família:** I/O / Interactivity
- **Cenário:** `drizzle-kit push` mostra confirmação interativa quando detecta destructive changes (drop coluna, rename) — comportamento padrão. Em CI, o stdin não é TTY então drizzle-kit DEVERIA cair pra non-interactive, mas histórico do projeto mostra inconsistência (algumas versões pedem `--force`, outras `--yes`, outras respeitam `CI=true`).
- **Impacto:** Primeira execução no Postgres limpo é destructive-free (criação inicial) então passa. Mas se alguém alterar `db/schema.ts` em PR futuro (ex: rename de coluna), o job CI hangs até timeout.
- **Fix sugerido:** Adicionar `--force` flag ao comando `drizzle-kit push --force --config ...` em T1.1. Comentar inline: "fixture-only destructive-OK; real apps never use --force in CI."

## SHOULD TEST

### EC-4: Webserver hang quando `DATABASE_URL` aponta pra Postgres caído
- **Task afetada:** T1.1, T1.2
- **Família:** Timing / Resource
- **Cenário:** Se Postgres service container demorar a ficar healthy E o teste Playwright iniciar antes (race condition entre `pg_isready` health-check e o webServer boot), o `theokit dev` da fixture-postgres tenta `postgres(process.env.DATABASE_URL!)` em startup, conecta no socket, falha com ETIMEDOUT/ECONNREFUSED. Vite dev server crasha no boot, Playwright timeout 180s.
- **Teste sugerido:** `test_postgres_unreachable_fails_fast` — Given `DATABASE_URL` pointing at an unreachable host (intentionally invalid `<pg-url-unreachable>` placeholder; e.g. `postgres-scheme://invalid:invalid@localhost:9999/x`), When `theokit dev` boots fixture-template-postgres, Then process exits within 30s with actionable error mentioning the URL (não trava até webServer timeout 180s).

### EC-5: `THEO_SESSION_SECRET` rejeitado pela validação de comprimento mínimo
- **Task afetada:** T1.1
- **Família:** Input / Boundary
- **Cenário:** O valor literal proposto é `playwright_test_secret_32chars_min_dummy` (40 chars). TheoKit valida session secret com `min(32)` em algum lugar do schema (security-hardening plan). Se a validação for `min(64)` ou outra, o valor é rejeitado e o template saas crasha no boot.
- **Teste sugerido:** `test_session_secret_passes_schema_validation` — Given `THEO_SESSION_SECRET=playwright_test_secret_32chars_min_dummy`, When the schema-loader validates it, Then valid=true. Adicionar verificação rápida ao T1.2 antes de rodar Playwright.

## DOCUMENT

### EC-6: GitHub Actions secret-scanner false positive no valor inline
- **Risco aceito:** O literal `playwright_test_secret_32chars_min_dummy` contém a palavra "secret" e pode trigar warning do secret-scanner (gitleaks/trufflehog). ADR D4 do plano já cita o pattern de `playwright.config.ts:168` (OPENROUTER_API_KEY=PLAYWRIGHT_PLACEHOLDER) que já passa nos scanners do repo (já em produção). Aceitável: se um scanner futuro flagar, basta adicionar comentário `// gitleaks:allow` ou similar.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 0 | 0 | 0 | 0 |
| T1.1 | 4 | 3 (EC-1, EC-2, EC-3) | 1 (EC-5) | 0 |
| T1.2 | 4 | 3 (EC-1, EC-2, EC-3) | 1 (EC-4) | 0 |
| T1.3 | 0 | 0 | 0 | 0 |
| T2.1 | 1 | 1 (EC-1 cascade) | 0 | 0 |

**Veredicto:** PLANO PRECISA DE AJUSTE (3 MUST FIX bloqueiam execução). EC-1, EC-2, EC-3 são todos no mesmo eixo: a estratégia de invocação `pnpm --filter <fixture> exec drizzle-kit` é tripla-quebrada (drizzle-kit não instalado, fixture não no workspace, push pode prompt). Os 3 colapsam em **uma única mudança no plano**:

> **Patch consolidado para T1.1, T1.2, T2.1:**
> 1. Adicionar a `package.json` root: `"drizzle-kit": "^0.30.0"` em `devDependencies`
> 2. Trocar comandos `pnpm --filter fixture-template-postgres exec drizzle-kit push` por `pnpm exec drizzle-kit push --force --config fixtures/template-postgres/drizzle.config.ts` (rodado do root). Mesmo para saas.
> 3. Documentar inline: "`--force` is fixture-only — real apps validate destructive changes manually"
> 4. Adicionar a `pnpm-workspace.yaml` as 4 fixtures `template-{dashboard,api-only,postgres,saas}` (segue padrão das outras fixtures — corrige um drift pré-existente; opcional para este plano, mas higiênico)

Edge-cases EC-4 e EC-5 viram RED tests adicionais em T1.2 (validação local antes da CI YAML ser commitada).
