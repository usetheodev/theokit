# Edge Case Review — system-100-percent-functional

Data: 2026-05-25
Tasks analisadas: 17 (T0.1, T0.2, T0.3, T1.1, T1.2, T2.1, T2.2, T3.1, T4.1, T5.1, T5.2, T6.1, T7.1, T7.2, T7.3, T7.4, T7.5)
Edge cases encontrados: 11 (MUST FIX: 4, SHOULD TEST: 4, DOCUMENT: 3)

> O plano já cobre vários edge cases inline (knip compatibility em T0.1, EC-105 preservation em T1.1, KEY rollback test em T2.1). Esta revisão foca em fronteiras adicionais que escaparam — especialmente colisões entre Phase 0 (Zod) e Phase 2 (outbox/ctx), além de robustez do dogfood E2E (Phase 7).

## MUST FIX

### EC-1: `theo.config.ts.adapters[]` + `--target` flag — precedência indefinida
- **Task afetada:** T1.1 (cron CLI wiring)
- **Família:** Input / State
- **Cenário:** O CLI hoje aceita `--target=<x>` (verificado em `build.ts:25`). O `theo.config.ts` aceita um array de adapters em `config.adapters[]`. Quando o usuário passa `--target=vercel` mas tem `adapters: ['cloudflare']` no config, qual ganha? O plano de T1.1 invoca a translation baseada em `--target` apenas; o array do config é ignorado para crons.
- **Impacto:** Usuário deploy para vercel, espera que cloudflare também receba crons (porque está no config), descobre só no incidente que CF ficou sem crons. Silent miss.
- **Fix sugerido:** Em T1.1, decidir e documentar: **`--target` flag é autoritativo para THIS build invocation; `config.adapters[]` é informativo (lista o que o app suporta) mas não dispara translations adicionais**. Adicionar 1 RED test: `test_target_flag_is_authoritative_ignores_config_adapters_array`.

### EC-2: Plugin `decorateRequest('queue', ...)` colisão com `ctx.queue`
- **Task afetada:** T2.1 (outbox wiring em `http/execute.ts`)
- **Família:** Boundary / Integration
- **Cenário:** Confirmado em código (`packages/theo/src/server/plugin-types.ts:43`, `plugins/plugin-runner.ts:76`): plugins existentes podem chamar `app.decorateRequest('queue', myQueue)`. A nova feature do T2.1 também injeta `ctx.queue` automaticamente quando `jobs.backend` está configurado. Conflito: framework sobrescreve plugin OU plugin sobrescreve framework, dependendo da ordem de execução.
- **Impacto:** Plugin do usuário (ex: `decorateRequest('queue', myCustomQueue)`) é silenciosamente substituído pelo `ctx.queue` do TheoKit OU vice-versa. Difícil de debugar.
- **Fix sugerido:** Em T2.1, detectar colisão: se `ctx.queue` já existe (decorado por plugin) ANTES da injeção do framework, throw `DuplicateContextKeyError` com mensagem actionable ("plugin decorated 'queue'; choose a different key OR remove jobs.backend from config"). Adicionar 1 RED test `test_queue_decoration_collision_throws`.

### EC-3: `examples/full-stack-agent/server/tools/*.ts` precisa também resolver para Zod 3 após override
- **Task afetada:** T0.3 (typecheck clean gate)
- **Família:** Boundary / Type
- **Cenário:** `pnpm.overrides.zod = "3.25.76"` aplica ao workspace inteiro. PORÉM `examples/full-stack-agent/package.json` declara `"zod": "^3.24.0"` — após install, examples também usam 3.25.76. Verificado parcial. **Mas:** `defineAgentTool({ inputSchema: z.object(...) })` em `calculator.ts:116` — o `inputSchema` é passado para SDK's `defineTool`, e o SDK foi compilado contra ZOD 4 (cross-repo `theokit-sdk` pre-existing failure). Type mismatch pode persistir mesmo após Zod 3 single-version.
- **Impacto:** Após T0.1, alguns dos 100+ erros podem persistir porque a SDK exige Zod 4 shape. Plano assume cascade auto-resolve — pode não acontecer.
- **Fix sugerido:** Em T0.3, ANTES de fixar individualmente, rodar `pnpm typecheck 2>&1 | grep "examples/full-stack-agent/server/tools"` para isolar se erros persistem APENAS porque do SDK. Se sim, documentar como pre-existing fora de escopo (alinha com B7 = "OUT OF SCOPE: theokit-sdk fails to build"). Adicionar nota em T0.3 Acceptance Criteria.

### EC-4: T7.4 (scaffold→build→start E2E) — port 3000 conflict + race-to-bind
- **Task afetada:** T7.4 (Sub-fase D do dogfood)
- **Família:** Resource / Timing
- **Cenário:** Script `scripts/e2e-scaffold-build-start.sh` faz `pnpm theokit start &` em background, depois `curl http://localhost:3000/`. Dois problemas reais:
  1. Porta 3000 pode estar em uso (outro `theokit dev`, outro serviço local) → server falha silenciosamente OU bind em porta diferente
  2. `curl` pode rodar ANTES do server bind (race) → 7 (connection refused)
- **Impacto:** Test verde-falso (script reporta sucesso porque `curl` retorna no fallback) OU vermelho-falso (server demorou 200ms a mais que esperado). Dogfood Phase 7 sub-fase D não confiável.
- **Fix sugerido:** No script (≤3 linhas): usar `PORT=$(comm -23 <(seq 49152 65535 | sort) <(ss -Hltn | awk '{print $4}' | sed 's/.*://' | sort -u) | head -1)` para porta livre + `until curl -sf http://localhost:$PORT/ > /dev/null; do sleep 0.1; done` para esperar bind. Adicionar 1 RED test `test_e2e_handles_port_conflict_with_random_port`.

---

## SHOULD TEST

### EC-5: `@ts-expect-error` órfãos após cascade resolve em T4.1
- **Task afetada:** T4.1 (full suite green)
- **Teste sugerido:** `test_no_orphan_ts_expect_error_after_zod_fix` — Given workspace post-T0.1, When `grep -rn "@ts-expect-error" tests/ packages/theo/src/`, Then cada hit é seguido por um erro TS real (não-órfão). Caso contrário, eslint `@typescript-eslint/no-unused-vars` (ou rule equivalente) reporta como warning. O fix Zod pode REMOVER erros esperados, deixando `@ts-expect-error` órfãos que viram lint errors.

### EC-6: T2.1 outbox + streaming response long-poll segura
- **Task afetada:** T2.1
- **Teste sugerido:** `test_outbox_long_poll_streaming_holds_until_stream_end` — Given route que enqueues + retorna ReadableStream que demora 30s, When `res.on('finish')` finalmente fires, Then jobs dispatched. Comportamento já documentado em EC-12 do reference doc, mas confirmar que long-poll de 30s+ NÃO cria orphan timers ou memory leak.

### EC-7: T6.1 (Vercel adapter smoke) — precondition `pnpm install` em `examples/deploy-vercel/`
- **Task afetada:** T6.1
- **Teste sugerido:** `test_vercel_example_has_node_modules_or_script_installs_first` — Given script `scripts/test-vercel-build.sh`, When invocado, Then checa `test -d examples/deploy-vercel/node_modules` antes de rodar build; se não existir, faz `pnpm install --filter ./examples/deploy-vercel` automaticamente. Sem isso, CI roda em projeto sem deps e build falha com mensagem confusa.

### EC-8: T7.5 (production-shape) — bundle 350KB orçamento é só para default template
- **Task afetada:** T7.5
- **Teste sugerido:** `test_bundle_budget_per_template_not_global` — Given templates {default, dashboard, api-only, postgres, saas}, When cada build, Then assertion roda apenas em `default` (per CLAUDE.md current baseline 193.90 KB). Outros templates NÃO testados — documentar como gap. Sem essa clarificação, plano pode falhar em produção se alguém roda budget check em saas template (que tem mais deps).

---

## DOCUMENT

### EC-9: T0.2 fallback `z.custom<(origin: string) => boolean>(...)` perde validação de assinatura runtime
- **Risco aceito:** `z.custom<>()` aceita qualquer valor que passe o predicate `(v) => typeof v === 'function'`. Não valida que a função tem 1 arg `string` e retorna `boolean`. Aceitável porque (a) TS-side a inferência é exata via generic, (b) runtime user-error em CORS config seria notado no primeiro request rejeitado. Adicionar 1 frase em JSDoc da `corsSchema`.

### EC-10: T0.1 `pnpm.overrides` pode desligar peer-dep warnings
- **Risco aceito:** `pnpm overrides` força version mesmo se houver `peerDependencies` conflito. Aceitável porque knip é devDep (não runtime); knip warning é trade-off conhecido. Se knip outright falhar, fallback é `T0.1b: remove knip do CI` documentado no plano.

### EC-11: T7.5 memory test de 100 requests é piso, não teto
- **Risco aceito:** 100 requests sequenciais (não concurrent, não over time) detectam vazamentos GRANDES, não pequenos. Bom o suficiente para Phase 7 (production-shape FLOOR). Vazamentos pequenos (1KB/req) só aparecem após dias — fora do escopo. Documentar em T7.5 que esse teste é "smoke floor", não "leak detector".

---

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 1 | 0 | 0 | 1 (EC-10) |
| T0.2 | 1 | 0 | 0 | 1 (EC-9) |
| T0.3 | 2 | 1 (EC-3) | 1 (EC-5 partial) | 0 |
| T1.1 | 1 | 1 (EC-1) | 0 | 0 |
| T2.1 | 2 | 1 (EC-2) | 1 (EC-6) | 0 |
| T4.1 | 1 | 0 | 1 (EC-5) | 0 |
| T6.1 | 1 | 0 | 1 (EC-7) | 0 |
| T7.4 | 1 | 1 (EC-4) | 0 | 0 |
| T7.5 | 2 | 0 | 1 (EC-8) | 1 (EC-11) |

**Veredicto:** PLANO PRECISA DE AJUSTE

Os 4 MUST FIX são todos baratos:

- **EC-1** — 1 frase de decisão de precedência (`--target` autoritativo) + 1 RED test
- **EC-2** — 1 `if (ctx.queue !== undefined) throw DuplicateContextKeyError(...)` em `execute.ts` + 1 RED test
- **EC-3** — 1 grep de pré-flight em T0.3 para isolar SDK-related vs Zod-related + 1 nota em Acceptance Criteria
- **EC-4** — 2 linhas no script bash (porta aleatória + wait-for-bind loop) + 1 RED test

Os 4 SHOULD TEST adicionam ~4 RED tests aos respectivos TDD blocks (baratos). Os 3 DOCUMENT viram 1 frase JSDoc + 1 frase no Acceptance Criteria de cada task afetada.

**Recomendação:** incorporar os 4 MUST FIX no plano antes de salvar como v1.1, adicionar SHOULD TEST aos blocks TDD correspondentes, e adicionar as 3 notas DOCUMENT inline.

**Nota especial sobre EC-2 (colisão queue):** este é o edge case mais sério do conjunto. O risco de plugin sobrescrever silenciosamente o `ctx.queue` do framework (ou vice-versa) é o tipo de bug que aparece em produção depois de meses. Vale a 1 linha de defesa explícita.

**Nota sobre EC-3:** é o único MUST FIX que pode resultar em "plano não consegue chegar a 100% green" — porque depende de fix em repo sibling `theokit-sdk`. O plano explicitamente declarou theokit-sdk como OUT OF SCOPE (B7), mas T0.3 (typecheck clean) pode bater nele. Aceitar pragmaticamente: documentar gap "pre-existing in sibling repo" em vez de bloquear o plano.
