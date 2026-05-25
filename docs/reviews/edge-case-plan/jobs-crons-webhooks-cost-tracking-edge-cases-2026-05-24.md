# Edge Case Review — jobs-crons-webhooks-cost-tracking

Data: 2026-05-24
Tasks analisadas: 25
Edge cases encontrados: 14 (MUST FIX: 4, SHOULD TEST: 4, DOCUMENT: 6)

> O plano já cataloga 43 edge cases distribuídos nos 3 reference docs e os incorpora explicitamente em vários testes (EC-1 a EC-12 por reference). Esta revisão NÃO repete o que está coberto. Foca em fronteiras que escaparam.

## MUST FIX

### EC-1: `vercel.json` / `wrangler.toml` / `serverless.yml` sobrescrita destruindo config do usuário
- **Task afetada:** T1.5 (adapter translators)
- **Família:** State / Data-loss
- **Cenário:** Usuário já tem `vercel.json` com `{ functions, headers, redirects, env }` customizado. Translator hoje "appenda" mas o plano não especifica como. Se o translator escrever o arquivo inteiro (substituindo o existente), o usuário perde toda configuração custom.
- **Impacto:** Data loss em arquivo de configuração de deploy. Usuário descobre só no deploy.
- **Fix sugerido:** No translator, **read existing JSON/TOML/YAML → merge crons-only field → write back**. Falhar com erro actionable se parsing do existente falha (não silenciosamente sobrescrever). Adicionar 1 test "translator preserves existing fields outside crons[]".

### EC-2: `readRawBody` sem `maxBodyBytes` permite OOM via webhook gigante
- **Task afetada:** T0.2 (raw body helper) + T4.2/T4.3/T4.4 (providers)
- **Família:** Security / Resource exhaustion
- **Cenário:** Atacante POST com `Content-Length: 1GB` para `/api/webhooks/stripe`. `readRawBody` chama `req.clone().text()` que lê tudo na memória antes de qualquer verify rodar. Single request derruba o processo.
- **Impacto:** DoS trivial. Webhook routes MUST limit body size (Stripe says max 256KB, GitHub 25MB, Slack 4MB).
- **Fix sugerido:** Adicionar `maxBodyBytes` opção em `readRawBody(req, { maxBodyBytes = 1_000_000 })`. Após N bytes lidos, throw `BodyTooLargeError` → handler retorna 413. Default 1MB cobre todos providers cobertos no plano.

### EC-3: `verify` function que **throws** (ao invés de retornar `{ok:false}`) deixa endpoint em estado indefinido
- **Task afetada:** T4.1 (defineWebhook)
- **Família:** Error handling
- **Cenário:** User-supplied `verify` faz `JSON.parse` em header malformado e throws. Ou helper `stripe(...)` tem bug que throws ao invés de retornar `{ok:false}`. O plano não diz se `defineWebhook` envolve `verify` em try/catch. Sem isso → 500 silencioso, handler chamado? não chamado? unclear.
- **Impacto:** Segurança incerta. Pior cenário: handler chamado porque exception swallowed em algum middleware downstream → bypass de verify.
- **Fix sugerido:** Em T4.1, envolver chamada de `verify` em try/catch. Exception → tratar como `{ok:false, reason: 'verify threw: <msg>'}` + log error. Adicionar test `test_verify_throws_treated_as_failure`.

### EC-4: `InMemoryJobBackend` dispatcher fires **após** processo desligar
- **Task afetada:** T2.2 (InMemory backend)
- **Família:** Resource / Lifecycle
- **Cenário:** `enqueue` agenda `setTimeout` para dispatch. Processo recebe SIGTERM (deploy, restart). setTimeout pendentes resolvem APÓS o shutdown handlers, callback executa contra `backend` já em estado parcial → erro silencioso ou worse.
- **Impacto:** Jobs perdidos em todo restart. Em dev (hot reload), perda contínua. Jobs com idempotency podem ser corretamente re-enqueued no próximo run mas estado intermediário é confuso.
- **Fix sugerido:** No `InMemoryJobBackend.constructor`, registrar handler em `process.on('beforeExit')` que: (1) clearTimeout em todos pending, (2) log "N jobs dropped on shutdown — use Postgres backend for durability". Adicionar test `test_pending_jobs_cleared_on_beforeExit`.

---

## SHOULD TEST

### EC-5: Atomic manifest write — race entre `theokit build` rodando e `theokit dev` re-scanning
- **Task afetada:** T1.3 (cron manifest), T2.3 (jobs manifest)
- **Teste sugerido:** `test_manifest_write_atomic` — Given two concurrent writes to `.theo/crons.json`, When both complete, Then file is valid JSON (not interleaved garbage). Fix: write to `.theo/crons.json.tmp` + `fs.rename()` atomic.

### EC-6: `outbox.flush` quando `backend.enqueue` lança — comportamento não especificado
- **Task afetada:** T2.5 (outbox)
- **Teste sugerido:** `test_outbox_flush_backend_throw_logs_and_continues` — Given outbox with 3 entries + backend.enqueue throwing on entry 2, When res.on('finish') fires, Then entries 1 + 3 ainda dispatched + entry 2 logged with error + response not affected (already sent).

### EC-7: `PostgresJobBackend` pool exhaustion com leases longas
- **Task afetada:** T3.1 (Postgres backend)
- **Teste sugerido:** `test_postgres_dequeue_pool_exhaustion` — Given pg.Pool of size 2 + 3 concurrent worker dequeue calls each holding lease for 30s, When awaited, Then 3rd call queues (not errors) + completes within 30s. Asserts pool config requires timeout, doesn't deadlock.

### EC-8: `defineCron` handler that returns Promise that **never resolves**
- **Task afetada:** T1.4 (Node scheduler)
- **Teste sugerido:** `test_handler_hang_doesnt_block_scheduler` — Given handler that returns `new Promise(() => {})` (never resolves), When next tick arrives, Then scheduler still fires NEXT cron AND emits warning that previous handler never completed. Without this, single buggy cron freezes entire scheduler.

---

## DOCUMENT

### EC-9: `JobRegistry` augmentation esquecida → tipos `never` silenciosos
- **Risco aceito:** Sem o `declare module 'theokit/server' { interface JobRegistry { ... } }`, `ctx.queue.enqueue` aceita `never` como chave — qualquer string é type error mas a mensagem é confusa ("not assignable to never"). Documentar em `docs/concepts/jobs.md` + adicionar exemplo em JSDoc de `defineJob`. Não é fix em código — é educação.

### EC-10: HMR + dynamic import cache no `cron-scan` / `job-scan`
- **Risco aceito:** Vite HMR re-imports modules; o scanner usa `await import(filePath)` que tem seu próprio cache (ESM module cache). Mudanças no handler durante `theokit dev` podem requerer restart manual. Documentar como known limitation em `docs/concepts/crons.md` + `jobs.md`. Fix futuro: `import.meta.hot.accept` mas fora de escopo do 0.5.0.

### EC-11: Outbox NÃO se aplica em Cloudflare Workers (não há `res.on('finish')`)
- **Risco aceito:** Já parcialmente coberto por D8 (routes only). Aprofundar: CF Workers usa Web Response, sem lifecycle hooks. Outbox no edge runtime degrada para "fire immediately" (sem rollback). Documentar em `docs/concepts/jobs.md` seção "Adapter limitations". Não bloqueia release — é trade-off conhecido.

### EC-12: Webhook providers NÃO descomprimem `Content-Encoding: gzip`
- **Risco aceito:** HMAC é sempre sobre wire bytes. Se proxy/CDN descomprime ANTES do TheoKit receber, sig falha. Stripe não envia gzip; GitHub e Slack também não. Documentar em `docs/concepts/webhooks.md` que "TheoKit verifies HMAC against raw wire bytes; do not place a gzip-decompressing proxy in front".

### EC-13: `InMemoryUsageStorage` memory unbounded em prod
- **Risco aceito:** Já documentado implicitamente — InMemory é dev/test only. Adicionar warning explícito em `docs/concepts/cost-tracking.md`: "Production deployments MUST use Postgres/Redis storage adapter (recipe in 0.6.0 R0.6.7). InMemory accumulates indefinitely."

### EC-14: `trackAgentRun` failure dentro de `defineAgentEndpoint` SSE generator
- **Risco aceito:** Já parcialmente coberto pelo test "tracking failure doesn't break response". Aprofundar: failure DEVE ser visível em logs (não silenciosamente swallowed). Documentar invariant em JSDoc de `trackAgentRun`: "tracking errors are logged via `logger.warn` and never propagate to the caller". Garantir test asserta `logger.warn` foi chamado.

---

## Resumo

| Task | Edges encontrados | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.2 (raw body) | 1 | 1 (EC-2) | 0 | 0 |
| T1.3 (cron manifest) | 1 | 0 | 1 (EC-5) | 0 |
| T1.4 (Node scheduler) | 1 | 0 | 1 (EC-8) | 0 |
| T1.5 (adapter translators) | 1 | 1 (EC-1) | 0 | 0 |
| T2.2 (InMemory backend) | 1 | 1 (EC-4) | 0 | 0 |
| T2.3 (job scan) | 2 | 0 | 1 (EC-5 shared) | 1 (EC-10) |
| T2.4 (queue client typed) | 1 | 0 | 0 | 1 (EC-9) |
| T2.5 (outbox) | 2 | 0 | 1 (EC-6) | 1 (EC-11) |
| T3.1 (Postgres) | 1 | 0 | 1 (EC-7) | 0 |
| T4.1 (defineWebhook) | 1 | 1 (EC-3) | 0 | 0 |
| T4.2/T4.3/T4.4 (providers) | 1 | 0 | 0 | 1 (EC-12) |
| T5.1 (UsageStorage) | 1 | 0 | 0 | 1 (EC-13) |
| T5.2 (trackAgentRun) | 1 | 0 | 0 | 1 (EC-14) |

**Veredicto:** PLANO PRECISA DE AJUSTE

Os 4 MUST FIX são reais e baratos de incorporar:

- **EC-1** — 1 task adicional (read-merge-write) em T1.5; pode estar dentro do mesmo TDD strict
- **EC-2** — adicionar `maxBodyBytes` opcional em T0.2; 1 test extra
- **EC-3** — wrap em try/catch em T4.1; 1 test extra
- **EC-4** — `process.on('beforeExit')` cleanup em T2.2; 1 test extra

Nenhum desses fixes adiciona abstração — todos são `if` / `try` / single function modification. KISS preservado.

Os 4 SHOULD TEST adicionam ~4 tests ao plano (todos baratos: 30min-1h cada). Os 6 DOCUMENT adicionam ~6 parágrafos distribuídos nos 3 docs de concepts (T6.3).

**Recomendação:** incorporar os 4 MUST FIX no plano antes de salvar como v1.1, manter SHOULD TEST como adições no TDD de cada task afetada, e tratar os DOCUMENT como notas dentro de T6.3 (concept docs).
