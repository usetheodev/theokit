# Edge Case Review v2 — architecture-medium-deferrals

Data: 2026-05-27 (segunda passada após v1.1 dobrar os 2 MUST FIX da v1)
Tasks analisadas: 9
Edge cases NOVOS encontrados: 3 (MUST FIX: 1, SHOULD TEST: 2, DOCUMENT: 0)

**Status pré-revisão:** v1.0 do edge-case review apontou 7 ECs; v1.1 do plano dobrou 2 MUST FIX (EC-1 ws-upgrade guard + EC-2 PK-based UPDATE). 4 SHOULD TEST já estão como REDs no TDD das tasks. 1 DOCUMENT aceito.

**Segunda passada** procura por edges que escaparam da v1.0 ou que surgem da forma como v1.1 foi escrita.

---

## MUST FIX

### EC-v2-1: T4.2 re-run da pipeline ACUMULA rows em tabelas com PK AUTOINCREMENT

- **Task afetada:** T4.2
- **Família:** State
- **Cenário:** O `setup-loop-architecture-review.sh` chama `init_db` que usa `CREATE TABLE IF NOT EXISTS` (verificado em `/home/paulo/Projetos/plugins/loop-architecture-review/scripts/architecture_database.py`). `files_inventoried.path` tem `UNIQUE` (UPSERT seguro). Mas `architectural_findings`, `principle_violations`, `design_pattern_findings`, `folder_observations`, `naming_violations`, `coupling_metrics`, `cycles` têm `id INTEGER PRIMARY KEY AUTOINCREMENT` SEM unique em conteúdo. Cada re-run da pipeline INSERE rows novas (não atualiza as antigas). Após T4.2 a DB pode ter 16 architectural_findings (8 antigas + 8 novas) em vez de 8.
- **Impacto:** T4.3 falha o count-mismatch check (encontra 2 OCP rows em vez de 1 — uma antiga marcada `resolved` da pre-cleanup audit + uma nova da re-run). Audit trail confuso; reports duplicados.
- **Fix sugerido:** Em T4.2 step 1 (`Backup DB`), também CLEAR as findings-tables ANTES do pipeline rodar OU rodar pipeline contra DB nova e MIGRAR só os finding-ids resolvidos manualmente. Linha extra no script:
  ```python
  # Pre-pipeline cleanup: clear findings to avoid AUTOINCREMENT accumulation
  cur.execute("DELETE FROM architectural_findings WHERE status='open' AND created_at < ?", (today,))
  ```
  Ou (mais conservador): rename architecture.db → architecture-pre-medium-deferrals.db ANTES de rodar a pipeline, deixando uma DB vazia para a re-run popular do zero.

---

## SHOULD TEST

### EC-v2-2: Drift entre `VALID_TARGETS` array e chaves do `adapterRegistry`

- **Task afetada:** T1.1
- **Teste sugerido:** `test_valid_targets_matches_registry_keys()` — Given `import { VALID_TARGETS } from 'adapters/types'` and `import { adapterRegistry } from 'adapters/registry'`, When `Object.keys(adapterRegistry).sort()` compared to `VALID_TARGETS.slice().sort()`, Then **identical**. Garante que nenhum target seja registrado SEM aparecer em `VALID_TARGETS` (caso onde build aceita o target via flag check mas o registry não tem; ou vice-versa).

### EC-v2-3: T4.3 script idempotente em re-runs

- **Task afetada:** T4.3
- **Teste sugerido:** `test_mark_resolved_script_idempotent()` — Given a DB where rows ARE ALREADY resolved (status='resolved'), When `mark-medium-deferrals-resolved.py` runs again, Then exit_code=0 (não falha) AND a SELECT WHERE status='resolved' continua retornando o mesmo count. O abort-on-count-mismatch (EC-2 v1) deve diferenciar entre "esperado 1 row found 2 (FAIL)" e "esperado 1 row já resolvido, found 1 já resolvido (OK noop)". O script deve checar `status='open'` no SELECT pré-UPDATE — se já está resolved, silently skip.

---

## Resumo

| Task | Edges (v2) | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 0 | 0 | 0 | 0 |
| T1.1 | 1 | 0 | 1 (EC-v2-2) | 0 |
| T2.1 | 0 | 0 | 0 | 0 |
| T2.2 | 0 | 0 | 0 | 0 |
| T2.3 | 0 | 0 | 0 | 0 |
| T3.1 | 0 | 0 | 0 | 0 |
| T4.1 | 0 | 0 | 0 | 0 |
| T4.2 | 1 | 1 (EC-v2-1) | 0 | 0 |
| T4.3 | 1 | 0 | 1 (EC-v2-3) | 0 |
| **TOTAL** | **3** | **1** | **2** | **0** |

**Veredicto:** PLANO OK COM 1 AJUSTE MENOR — apenas EC-v2-1 (T4.2 rename pre-pipeline para evitar AUTOINCREMENT accumulation) precisa ser dobrado. Os 2 SHOULD TEST já têm fix em ≤3 linhas (testes adicionais ao TDD da task).

Após dobrar EC-v2-1 (rename ou DELETE pre-pipeline), plano fica pronto para Ralph loop.

---

## Estado consolidado (v1 + v2)

| Versão | MUST FIX | Dobrado? |
|---|---|---|
| v1 EC-1 (T2.3 httpServer guard) | ✅ | sim, em plano v1.1 |
| v1 EC-2 (T4.3 PK-based UPDATE) | ✅ | sim, em plano v1.1 |
| v2 EC-v2-1 (T4.2 AUTOINCREMENT accumulation) | ⏳ | pendente — pequeno fix |

Total edge cases identificados across ambas as passadas: **10** (7 v1 + 3 v2). 9 com fix planejado (≤3 lines cada). Nenhum scope creep, nenhuma abstração nova.
