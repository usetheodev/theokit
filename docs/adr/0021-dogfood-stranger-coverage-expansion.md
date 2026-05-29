---
status: accepted
date: 2026-05-28
deciders: paulo
consulted: claude
informed: theokit-sdk-maintainers, theo-ui-maintainers
---

# ADR 0021: Dogfood Stranger coverage expansion + ESM-only invariant + fault injection

## Context and Problem Statement

Skill `/dogfood-stranger` shipou com 11 phases cobrindo apenas template `default` + happy path. Run real (2026-05-28) descobriu 5 CRITICAL + 4 MEDIUM findings. Decision sobre **escopo da expansão** + **invariantes arquiteturais derivados**.

## Decision Drivers

1. **Cobertura máxima de cenários** — user pediu "TODOS os cenários passem, MAIS CENÁRIOS"
2. **FAANG-grade (memória `faang-no-workarounds`)** — ZERO workarounds, root cause fixes
3. **Real LLM validation** mandatory (memória `feedback-real-llm-validation` do SDK)
4. **Test determinism** — sem flaky tests, sem cost descontrolado

## Considered Options

Detalhes em plano `dogfood-fixes-and-coverage-expansion-plan.md` v1.1. Decisões resumidas:

### D4 — 18 novas phases (Phase 12-29) organizadas em 4 categorias
- Chaos providers (KEY inválida, rate limit via fault injection, modelo inexistente, 5xx)
- Multi-template (dashboard, api-only, postgres, saas)
- Interação real (tool calling, multi-turn, theme swap)
- Qualidade (typecheck, a11y, mobile viewport) + Background features (cron, job, webhook)

### D5 — Real-LLM tests usam SEMPRE `openai/gpt-4o-mini` via OpenRouter (cheap default)
Reproducibility + custo previsível.

### D6 — Chaos phases usam fault injection determinística (NÃO mock local)
Combinado com D14 (env var SDK).

### D7 — Multi-template smoke roda PARALELO (não sequencial)
Wall-clock ~15min vs ~60min. Port allocation determinística (4100/4200/4300/4400, EC-3 do edge case review).

### D8 — CI workflow OPT-IN via `workflow_dispatch` (não auto PR)
Custo + duração inviabilizam auto-run.

### D11 — Health score ≥ 90/100 como gate de release coordenado
0 CRITICAL + 0 HIGH + ≤ 2 MEDIUM.

### D13 — `@usetheo/ui` permanece ESM-only intencional; theokit gated zero require em UI
**Root cause de EC-S4 + EC-S5:** theokit `theoui-detect.ts:72` e `auto-detect.ts:52,71` usavam `createRequire(...).resolve()` em `@usetheo/ui` — package ESM-only retorna `ERR_PACKAGE_PATH_NOT_EXPORTED`. Fix: substituir por filesystem walk + leitura de `exports[subpath]`. Gate `tests/integration/no-require-on-esm-only-deps.test.ts` previne regressão.

### D14 — Test fault injection via `THEOKIT_TEST_RESPONSE_OVERRIDE` env var (gated por NODE_ENV=test)
Substitui dependency real de provider em chaos scenarios. Custo $0, zero flake, zero quota burn. Padrão FAANG (Stripe SDK test mode, AWS SDK test endpoints).

## Decision Outcome

**Aceitas: D4, D5, D6, D7, D8, D11, D13, D14.**

### Consequences

**Positivas:**
- Health score atinge ≥90 reliably
- 5 CRITICAL findings resolved at root cause
- CI gate previne regressão sistematicamente
- Coverage expande de 11 → 29 phases

**Negativas:**
- SDK ganha feature `THEOKIT_TEST_RESPONSE_OVERRIDE` (D14) — ~50 LOC de manutenção
- ADR D13 cria contract permanente: theokit não pode ADICIONAR require em UI paths sem violar gate
- CI workflow custa ~$0.01 por run (mitigado por opt-in)

## Pros and Cons

| Decision | Pros | Cons |
|---|---|---|
| D4 expansion | Cobertura máxima | +1 hora skill duration |
| D5 cheap model | Reproducibility | Não valida high-end provider behavior |
| D6 fault injection | Zero custo, zero flake | Não valida real provider response |
| D7 parallel | 4x speedup | Race condition risk (mitigado via D3 ports) |
| D8 opt-in CI | Custo controlado | Manual gate (esquecimento risk) |
| D11 90 gate | Quality floor real | Pode bloquear release em finding cosmético |
| D13 ESM-only | Single source truth | Quebra CJS consumers (zero atualmente) |
| D14 env injection | Deterministic chaos | SDK ganha feature de teste pública |

## More Information

- **Plano:** [`.claude/knowledge-base/plans/dogfood-fixes-and-coverage-expansion-plan.md`](../../../.claude/knowledge-base/plans/dogfood-fixes-and-coverage-expansion-plan.md) v1.1
- **Baseline:** [`.claude/knowledge-base/baselines/dogfood-fixes-2026-05-28.md`](../../../.claude/knowledge-base/baselines/dogfood-fixes-2026-05-28.md)
- **Edge case review:** [`.claude/knowledge-base/reviews/edge-cases/dogfood-fixes-and-coverage-expansion-edge-cases-2026-05-28.md`](../../../.claude/knowledge-base/reviews/edge-cases/dogfood-fixes-and-coverage-expansion-edge-cases-2026-05-28.md)
- **Memory `faang-no-workarounds`** (inquebrável)
- **Mirror ADR theo-ui:** [`../../../theo-ui/docs/adr/0003-esm-only-confirmed-and-gated.md`](../../../theo-ui/docs/adr/0003-esm-only-confirmed-and-gated.md)
