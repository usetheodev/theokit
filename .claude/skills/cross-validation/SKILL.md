---
name: cross-validation
description: "Cross-validate implementation against plan — line-by-line rigor. Compares every task, ADR, TDD cycle, acceptance criterion, and DoD item from the plan against actual code. THE most important quality gate before declaring a plan done."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Agent
argument-hint: "[plan-slug|plan-file-path] [--phase N] [--task T{N}.{M}]"
---

# Cross-Validation: Plan vs Implementation

A skill mais rigorosa do pipeline. Lê o plano linha por linha, lê o código linha por linha, e cruza tudo. Não existe "acho que está implementado" — ou está comprovado com evidência, ou é uma divergência.

## Argumento

- `$ARGUMENTS` = slug do plano (busca em `docs/plans/{slug}-plan.md`) ou caminho completo
- `--phase N` = analisa apenas a Phase N
- `--task T{N}.{M}` = analisa apenas uma task específica
- Sem argumento = analisa o plano mais recente em `docs/plans/`

## Filosofia

**Você é o auditor que ninguém quer, mas todos precisam.**

Princípios inquebráveis:

1. **Evidência ou divergência.** Cada item do plano precisa de prova no código. `grep` confirmou, `npx vitest` passou, o arquivo existe — isso é evidência.
2. **Linha por linha.** Lê CADA task e verifica CADA sub-item. Não pula nada.
3. **O plano é a verdade.** Se o plano diz "criar interface Foo com campos a, b, c" e o código tem `Foo { a, b }` — campo `c` falta. Divergência.
4. **Implementação parcial = não implementado.** 4 de 5 sub-items feitos = task NÃO completa.
5. **Testes são cidadãos de primeira classe.** Teste especificado no plano que não existe = CRITICAL.
6. **ADRs são contratos.** Se ADR diz "Zod como fonte única" e tem interface manual duplicando schema = BLOCKER.

## Processo

### Passo 1 — Carregar o Plano

Leia o plano COMPLETO. Extraia e indexe:
- **ADRs**: cada decisão (D1, D2, ...)
- **Phases**: cada fase com seu objetivo
- **Tasks**: cada task (T{N}.{M}) com files to edit, checklist, TDD, acceptance criteria, DoD
- **Coverage Matrix**: gap → task
- **Global DoD**: critérios globais

### Passo 2 — Verificar ADRs

Para CADA ADR: leia consequências, verifique no código com grep/read.

### Passo 3 — Verificar Tasks (Linha por Linha)

Para CADA task:
- **Files to Edit**: existe? conteúdo conforme?
- **Checklist Items**: cada item implementado? grep + read confirma?
- **TDD Cycle**: cada teste existe, passa, asserta o correto?
- **Acceptance Criteria**: cada critério verificável, verificado AGORA?
- **DoD**: satisfeito? (`npx tsc --noEmit`, `npm test`, `npm run lint`)

### Passo 4 — Detecção de Anomalias

- **Over-implementation**: código fora do escopo do plano
- **Dead code**: exports sem consumidor
- **Wiring gaps**: funcionalidade existe mas não conectada
- **Testes fantasma**: testes que passam mas testam mocks, não implementação real

## Classificação de Divergências

| Severidade | Significado | Critério |
|---|---|---|
| **BLOCKER** | Violação de ADR, invariante quebrada, security gap | Fix obrigatório |
| **CRITICAL** | Task incompleta, teste faltando, acceptance criteria não atendido | Fix antes de fechar fase |
| **MAJOR** | Implementação diverge mas funciona | Atualizar plano OU código |
| **MINOR** | Detalhe técnico sem impacto | Documentar |
| **INFO** | Observação sem ação | Registrar |

## Formato do Report

Salvo em `docs/reviews/cross-validation/{slug}-xval-{YYYY-MM-DD}.md`.

```markdown
# Cross-Validation Report — {nome do plano}

**Data:** {YYYY-MM-DD}
**Plano:** `docs/plans/{slug}-plan.md`
**Commit:** {git rev-parse --short HEAD}

## Sumário Executivo

| Métrica | Valor |
|---|---|
| ADRs verificados | N/N conformes |
| Tasks verificadas | N/N conformes |
| Testes verificados | N/N existem e passam |
| Acceptance Criteria | N/N satisfeitos |
| DoD items | N/N satisfeitos |
| Coverage Matrix | N/N gaps cobertos |
| Divergências totais | N (BLOCKER: N, CRITICAL: N, MAJOR: N, MINOR: N, INFO: N) |
| **Veredicto** | **APROVADO / REPROVADO / APROVADO COM RESSALVAS** |

## Conformidade Score

  >= 95% com 0 BLOCKER e 0 CRITICAL → APROVADO
  >= 85% com 0 BLOCKER              → APROVADO COM RESSALVAS
  < 85% OU qualquer BLOCKER         → REPROVADO

## Tasks (detalhamento por task)

### T{N}.{M} — {título}
**Status:** CONFORME / PARCIAL / DIVERGENTE / NÃO IMPLEMENTADA
{tabelas de files, checklist, TDD, acceptance, DoD}

## Todas as Divergências (Consolidado)

| ID | Severidade | Task/ADR | Descrição | Fix Sugerido |
|---|---|---|---|---|

## Próximo Passo
{se REPROVADO: lista do que corrigir}
{se APROVADO: proceder para /dogfood}
```

## Integração com o Pipeline

```
/to-plan → docs/plans/{slug}-plan.md
    ↓
/edge-case-plan {slug} → review de edge cases
    ↓
[IMPLEMENTAÇÃO — fases do plano]
    ↓
/cross-validation {slug} → ESTA SKILL — verifica plan vs código
    ↓
  APROVADO? → /dogfood full → plan complete
  REPROVADO? → fix divergências → /cross-validation {slug} (loop)
```
