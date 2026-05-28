# Edge Case Review — framework-maturity-hardening

**Data:** 2026-05-21
**Plano revisado:** `docs/plans/framework-maturity-hardening-plan.md`
**Tasks analisadas:** 14 (T0.1 → T9.1)
**Edge cases encontrados:** 24 (MUST FIX: 12, SHOULD TEST: 5, DOCUMENT: 7)
**Status do plano:** AJUSTADO — 12 MUST FIX incorporados na versão atual.

---

## MUST FIX (incorporados ao plano)

### EC-1: `theokit check` crasha quando `app/` não existe

- **Task afetada:** T1.1
- **Família:** Input
- **Cenário:** Usuário roda em projeto sem `app/` (e.g. monorepo só com `server/`, primeiro setup do scaffold).
- **Impacto:** ts-morph lança erro de glob vazio; stack trace em vez de mensagem clara.
- **Fix incorporado:** No walker, se `app/**` retornar 0 arquivos, log warning e continuar com `server/**`. Se ambos vazios, exit 0 com "No source files to check". RED test `test_cli_handles_missing_app_dir_gracefully` adicionado.

### EC-2: scanner não exclui `node_modules/` explicitamente

- **Task afetada:** T1.1
- **Família:** Input / Performance
- **Cenário:** Glob default segue tudo; parseia `node_modules/@*/...`.
- **Impacto:** Minutos de scan + falsos positivos da Rule 1 em código de libraries.
- **Fix incorporado:** Walker declara `exclude: ['**/node_modules/**', '**/dist/**', '**/.theo/**', '**/build/**']`. RED test `test_walker_excludes_node_modules`.

### EC-3: `theokit check` roda contra projetos não-TheoKit

- **Task afetada:** T1.1
- **Família:** Input
- **Cenário:** Usuário roda no diretório errado (Next.js puro, projeto Vite genérico). Rule 1 detecta `fetch` POST em todo lugar.
- **Impacto:** Centenas de falsos positivos; usuário perde confiança.
- **Fix incorporado:** Primeira ação do check: ler `package.json`, exit 1 se `theokit` ausente de deps + devDeps. RED test `test_cli_exits_1_outside_theokit_project`.

### EC-4: sink síncrono bloqueia a request inteira

- **Task afetada:** T2.1
- **Família:** Timing / Performance
- **Cenário:** Sink user-provided faz `fs.appendFileSync(...)` em disco lento OU `await fetch('https://sentry.io')` sem timeout.
- **Impacto:** Cada CSRF warn adiciona 100ms-2s à latência; sob pico, FD esgotam.
- **Fix incorporado:** `dispatchCsrfWarn` invoca sink como fire-and-forget — `void Promise.resolve().then(() => safeInvokeSink(...))`. NUNCA await no request path. RED test `test_slow_sink_does_not_block_request`.

### EC-5: dedup `warnOnce` ambíguo quando sink throws

- **Task afetada:** T2.1
- **Família:** State
- **Cenário:** Sink throws na 1ª invocação. Dedup já registrou a chave. Próximas 1000 ocorrências viram invisíveis.
- **Impacto:** Telemetria silenciosa: usuário acha que está limpo, mas o sink está quebrado.
- **Fix incorporado:** Dedup acontece **só após delivery bem-sucedida** — Set é populado dentro do `.then()`, não do `.catch()`. RED test `test_failing_sink_does_not_silence_future_events`.

### EC-6: recipe test depende de `jq` que CI runner pode não ter

- **Task afetada:** T3.1
- **Família:** Resource
- **Cenário:** GitHub Windows / minimal containers / alpine sem jq.
- **Impacto:** Recipe doc quebra em ambientes legítimos; recipe test não roda no Windows.
- **Fix incorporado:** Guia mostra duas variantes (jq + Node-only). Recipe test usa a variante Node-only. Sem dependência shell-tool.

### EC-7: `vercel deploy` pode hang indefinidamente

- **Task afetada:** T4.1
- **Família:** Timing
- **Cenário:** Vercel build farm overload, regional outage, autenticação congelada.
- **Impacto:** CI nightly preso até timeout default GitHub Actions (6h). Burn de minutos.
- **Fix incorporado:** `timeout 300 vercel deploy --token "$VERCEL_TOKEN" --yes` (5min hard cap) + `curl --max-time 30`.

### EC-8: Playwright `webServer.timeout` default insuficiente para scaffold+install

- **Task afetada:** T5.1
- **Família:** Timing
- **Cenário:** Primeira run CI: `pnpm create theo` + `pnpm install` + `pnpm dev`. Estoura os 60s default.
- **Impacto:** CI flake intermitente. Re-run resolve, mascara o problema.
- **Fix incorporado:** Cada projeto Playwright declara `webServer.timeout: 180_000`.

### EC-9: testes `postgres`/`saas` rodam antes do banco estar pronto

- **Task afetada:** T5.1
- **Família:** Timing
- **Cenário:** `services: postgres:16` no GitHub Actions reporta healthy mas porta/auth ainda em transição.
- **Impacto:** Primeira request hit `connection refused`. Flake.
- **Fix incorporado:** Step pré-Playwright: `until pg_isready -h localhost -U postgres -t 1; do sleep 1; done` com cap de 30s.

### EC-10: endpoint `/__theo/test/disconnect-ws` pode vazar pra produção

- **Task afetada:** T6.1
- **Família:** Security / Boundary
- **Cenário:** Implementação ingênua mounta em todo modo. Em prod, qualquer um chama o endpoint e mata WS de outros usuários.
- **Impacto:** DoS trivial em produção.
- **Fix incorporado:** Endpoint só monta se `NODE_ENV === 'test'` OR `security.exposeTestEndpoints === true`. Default: 404. RED test `test_disconnect_endpoint_returns_404_in_prod`.

### EC-11: baseline absoluta de load test é flaky em CI variável

- **Task afetada:** T7.1
- **Família:** Timing
- **Cenário:** GitHub Actions varia bastante (free tier vs paid; runner sobrecarregado vs saudável).
- **Impacto:** Nightly CI vermelho aleatoriamente; equipe ignora notificações.
- **Fix incorporado:** Asserts relativos — p99 atual ≤ baseline × 1.20; RPS atual ≥ baseline × 0.80. Baseline auto-atualiza em main branch. Memory growth + errors + abort rate seguem absolutos.

### EC-12: publish multi-package não é atômico

- **Task afetada:** T9.1
- **Família:** State
- **Cenário:** `pnpm publish theokit@0.2.0` succeeds, `pnpm publish create-theokit@0.2.0` falha. `latest` aponta pra theokit novo + scaffold velho.
- **Impacto:** Usuário pega combinação inconsistente; `npm create theokit` quebra.
- **Fix incorporado:** Script `publish-coordinated.sh`: dry-run TODOS primeiro; só prossegue se todos OK. Rollback (`npm dist-tag rm`) se step 6 falhar mid-way. RED test `test_dry_run_blocks_partial_publish`.

---

## SHOULD TEST (RED tests adicionados nas tasks)

### EC-13: `useAgentStream` override case-insensitive de header
- **Task:** T0.1
- **Teste:** `test_user_override_lowercase_header_wins` — assert browser fetch normalization não duplica `X-Theo-Action` quando user passa `'x-theo-action'`.

### EC-14: glob do walker respeita boundaries de symlink
- **Task:** T1.1
- **Teste:** `test_walker_respects_symlink_boundaries` — symlink `app/external → /etc` não puxa arquivos fora da cwd.

### EC-15: `/__theo/csrf-readiness/reset` aplica Origin check além do header
- **Task:** T2.2
- **Teste:** `test_reset_endpoint_rejects_cross_origin` — header X-Theo-Action presente mas Origin alheio = 403.

### EC-16: WebSocket reconnect em close code 1006 (abnormal)
- **Task:** T6.1
- **Teste:** `test_ws_reconnects_after_close_code_1006` — server crash (não shutdown limpo) também dispara reconnect.

### EC-17: smoke install pós-publish retry em propagação npm
- **Task:** T9.1
- **Teste:** `test_smoke_install_retries_on_eresolve` — npm CDN lag até 60s; 3 retries com backoff 5s.

---

## DOCUMENT (riscos aceitos conscientemente)

### EC-18: `--fix` em working tree sujo
Documentar em `--help` e migration guide: "Run on clean tree". Refusal automática é over-engineering.

### EC-19: usuário substitui `options.fetch` no `useAgentStream`
Documentar no JSDoc: "If you override `fetch`, attach `X-Theo-Action: 1` yourself".

### EC-20: scan em monorepo gigante (>10k files)
Caso raro. Aceitar até primeiro report real. Add `--max-files` flag se reportado.

### EC-21: sink composto (Sentry + OTel + stdout simultâneos)
API single sink. User compõe manualmente: `sink: (e) => { sentry(e); otel(e); }`.

### EC-22: store CSRF readiness perde dados ao bater 1000 routes
Limite documentado nos docs do endpoint. Outliers > 1000 routes distintos são raros.

### EC-23: WebSocket reconnect ≈ 11s deixa teste lento
Spec usa `test.setTimeout(20_000)`.

### EC-24: usuários com `theokit: "*"` auto-upgrade no flip de `latest`
Eles pediram. Documentar no CHANGELOG do 0.3.0: "Users pinning '*' will receive 0.3.0 automatically — see migration guide".

---

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 2 | 0 | 1 | 1 |
| T1.1 | 4 | 3 | 1 | 0 |
| T1.2 | 1 | 0 | 0 | 1 |
| T2.1 | 3 | 2 | 0 | 1 |
| T2.2 | 2 | 0 | 1 | 1 |
| T3.1 | 1 | 1 | 0 | 0 |
| T4.1 | 1 | 1 | 0 | 0 |
| T5.1 | 2 | 2 | 0 | 0 |
| T6.1 | 3 | 1 | 1 | 1 |
| T7.1 | 1 | 1 | 0 | 0 |
| T8.1 | 0 | 0 | 0 | 0 |
| T9.1 | 2 | 1 | 1 | 1 |
| Plan-wide | 2 | 0 | 0 | 1 |
| **TOTAL** | **24** | **12** | **5** | **7** |

**Veredicto final:** ✅ **PLANO OK** após incorporação dos 12 MUST FIX.

---

## Trilha de auditoria

Mudanças aplicadas ao `framework-maturity-hardening-plan.md` em 2026-05-21:

1. Nova seção "Edge Cases (incorporated 2026-05-21 from edge-case-plan review)" com referência cruzada a este arquivo.
2. T1.1 tasks numeradas atualizadas: 3 novas etapas (EC-1, EC-2, EC-3) + 4 novos RED tests + fixtures adicionais.
3. T2.1 Deep Dives expandido com "Fire-and-forget dispatch — CRITICAL" (EC-4) + "Dedup-after-delivery" (EC-5) + 2 RED tests.
4. T3.1 recipe example com 2 variantes (jq + Node-only) + nota EC-6.
5. T4.1 deep-file analysis atualizada com `timeout 300` (EC-7) + `curl --max-time 30`.
6. T5.1 dois pontos atualizados com `webServer.timeout: 180_000` (EC-8) e `pg_isready` wait (EC-9).
7. T6.1 Deep Dives adicionou nota CRITICAL (EC-10) + 2 RED tests.
8. T7.1 thresholds reescritos como relativos (EC-11) com baseline auto-atualizada em main.
9. T9.1 Publish sequence reescrita como atômica (EC-12) com dry-run gate + rollback guard + 2 RED tests.

Total: 24 BDD scenarios adicionados ao plano (12 MUST FIX + 5 SHOULD TEST + 7 que já estavam contemplados ou são SHOULD TEST sem reforço).
