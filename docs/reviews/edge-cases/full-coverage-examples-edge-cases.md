# Edge Case Review — full-coverage-examples

**Data:** 2026-05-17
**Tasks analisadas:** 30 (12 phases, ~30 tasks)
**Edge cases encontrados:** 8 (MUST FIX: 3, SHOULD TEST: 3, DOCUMENT: 2)

## MUST FIX

### EC-1: Fixtures não fazem parte do pnpm workspace, mas plano sugere `pnpm theokit dev` por fixture

- **Task afetada:** T0.1 (README de fixtures), README de cada fixture nova
- **Família:** Boundary / Integração
- **Cenário:** `pnpm-workspace.yaml` declara apenas `packages/*` e `my-test`. As fixtures existentes em `tests/fixtures/` rodam via integration tests que importam módulos programaticamente. O plano sugere que cada fixture README documente `pnpm theokit dev`, mas sem `node_modules` próprio e sem entrada no workspace, esse comando vai falhar (`theokit: command not found`).
- **Impacto:** Usuário lê fixture README, tenta rodar, erro confuso. Pior: parece que o framework está quebrado.
- **Fix sugerido:** README de cada fixture explica que fixtures são **test fixtures consumidos por integration tests**, não projetos standalone. Comando real para rodar é `npx vitest run tests/integration/fixture-<name>.test.ts`. Para criar um projeto standalone, usar `npx create-theokit`. Atualizar T0.1 (fixtures index README) para refletir isso.

### EC-2: Hardcoded `SECRET` em sessions-auth + saas template vira vulnerabilidade se deploy em prod

- **Task afetada:** T3.1 (sessions-auth fixture), T10.1 (saas template)
- **Família:** Security
- **Cenário:** Plano menciona "demo SECRET = `demo-only-do-not-use`" no `.env.example`. Usuário clona, esquece de mudar, deploy em produção. Sessions encrypted com SECRET conhecido = forjáveis por qualquer atacante.
- **Impacto:** Vulnerabilidade de auth bypass em qualquer SaaS criado a partir do template.
- **Fix sugerido:** SECRET placeholder explícito tipo `SECRET=<CHANGE_ME_TO_RANDOM_32_CHARS_OR_REFUSE_TO_BOOT>`. Adicionar check no `createSessionManager` (ou em uma helper `assertProductionSecret`) que **recusa boot em production** se SECRET contém `CHANGE_ME` ou `demo`. Adicionar a esta task: `T3.1 task 5: assert dev server warns + prod server refuses to boot with placeholder secret`. Mesmo padrão para T10.1.

### EC-3: Template `default` rewrite (T1.1+T1.2) pode quebrar testes E2E pré-existentes que assumem o wire format manual

- **Task afetada:** T1.1, T1.2
- **Família:** Backward compat
- **Cenário:** Existem testes integration que dependem do template default emitindo SSE com format específico (chunks `data: {...}\n\n`). Se `defineAgentEndpoint` produz mesmo wire format (que produz), tudo bem. Se houver alguma diferença sutil (whitespace, ordem de eventos), testes quebram.
- **Impacto:** PR vermelho, debugging caro.
- **Fix sugerido:** Antes de mergear T1.1, rodar `grep -rln "/api/chat" tests/` e validar cada teste afetado contra o novo wire format. Adicionar à task 2 do T1.1: `Verify wire format byte-comparable via curl test against fixture agent-endpoint-mock (T2.2 must land first)`. Reordenar dependências: T2.2 antes de T1.1 (Phase 2 antes de Phase 1 finalizar). Plano atualmente diz Phase 1 antes de Phase 2 — **inverter**.

## SHOULD TEST

### EC-4: Adapter fixture integration tests podem timeout em CI (6 builds × ~10s cada)

- **Task afetada:** T8.1-T8.6
- **Família:** Resource / Timing
- **Teste sugerido:** `test_adapter_fixture_build_completes_under_60s` — Given any adapter fixture, When build runs, Then exits 0 in < 60s. Adicionar timeout explícito no `vitest.config.ts` por suite. Considerar `concurrent: false` para a suite de adapters (sequencial, não paralela — Vite Builds são CPU-heavy).

### EC-5: Custom transformer fixture (T7.2) — config.serialization pode não estar sendo lida no client em todos os caminhos

- **Task afetada:** T7.2
- **Família:** Integração
- **Teste sugerido:** `test_client_uses_custom_transformer_for_deserialization` — Given `theo.config.ts` with custom transformer, When client fetches data, Then deserialize uses the custom transformer not default superjson. Validar com Date round-trip end-to-end (server → wire → client).

### EC-6: react-query fixture (T4.4) — peer dep `@tanstack/react-query` pode entrar em conflict com versão diferente no workspace root

- **Task afetada:** T4.4
- **Família:** Dependencies
- **Teste sugerido:** `test_react_query_fixture_uses_pinned_version` — Given package.json, Then dependency `@tanstack/react-query` is pinned to exactly one major. CI deve falhar se workspace tem dois majores diferentes.

## DOCUMENT

### EC-7: 24 novas fixtures + 1 template = PR gigantesco

- **Risco aceito:** Cross-validation e dogfood vão demorar mais que de costume (estimado ~30 min vs ~10 min). Não é blocker — vale a pena entregar tudo junto para evitar "ondas" parciais que deixam o sistema em estado inconsistente entre PRs.
- **Mitigação documentada:** Plano de execução em phases (1, 2-9 paralelo, 10, 11). Cada phase é commit independente, não um único PR monolítico. Permite rollback granular.

### EC-8: Adapter fixtures são compile-only (ADR D2) — não provam deploy real

- **Risco aceito:** Já documentado no ADR D2. Vale reforçar no README de cada fixture adapter: "este fixture valida apenas o emit do adapter; deploy real requer credenciais cloud e roda em job CI separado (nightly), fora deste plano". Adicionar nota no `tests/fixtures/README.md` (T0.1) também.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 (fixtures index) | 2 | 1 | 0 | 1 |
| T1.1 (default chat.ts) | 1 | 1 | 0 | 0 |
| T1.2 (default page.tsx) | 0 | 0 | 0 | 0 |
| T3.1 (sessions-auth) | 1 | 1 | 0 | 0 |
| T4.4 (react-query) | 1 | 0 | 1 | 0 |
| T7.2 (custom-transformer) | 1 | 0 | 1 | 0 |
| T8.1-T8.6 (adapters) | 2 | 0 | 1 | 1 |
| T10.1 (saas) | 1 | 1 | 0 | 0 |
| Plan-level | 1 | 0 | 0 | 1 |

**Veredicto:** **PLANO PRECISA DE AJUSTE** — 3 MUST FIX a incorporar.

## Mudanças requeridas no plano antes de salvar v1.1

1. **EC-1 (T0.1):** Atualizar T0.1 + README template para esclarecer que fixtures são test fixtures, não projetos runnable. Remover instrução `pnpm theokit dev` do README; substituir por `npx vitest run tests/integration/fixture-<name>.test.ts`.

2. **EC-2 (T3.1, T10.1):** Adicionar task no T3.1: implementar `assertProductionSecret(secret)` helper que recusa boot quando SECRET contém `CHANGE_ME` ou `demo-`. Replicar em T10.1. Adicionar 2 BDD scenarios extras: "dev server warns on placeholder secret" e "prod server refuses to boot with placeholder secret".

3. **EC-3 (T1.1):** Inverter dependência: **T2.2 (agent-endpoint-mock fixture) deve completar antes de T1.1**. Atualizar dependency graph: Phase 2 (T2.2 only) → Phase 1 (template migration) → demais phases. Atualizar Files-to-edit no T1.1 com check explícito: `Verify wire format byte-comparable against fixture T2.2`.
