---
status: accepted
date: 2026-05-28
deciders: paulo
consulted: claude
---

# ADR 0019: Versões dos templates de `create-theokit` derivadas de source-of-truth única; script + gate CI rejeitam drift

## Context and Problem Statement

Os templates em `theokit/packages/create-theo/templates/` declaram versões hardcoded de `theokit`, `@usetheo/sdk` e `@usetheo/ui`. Hoje mantidas a mão. Resultado mensurado em 2026-05-28 (baseline):

- **2 entries OUT of range** — `@usetheo/ui@^0.11.0-next.0` em `default` e `saas`, enquanto repo está em `0.12.0-next.0` (caret pre-release exclui `0.12.0-*` quando pin é `^0.11.0-next.0`).
- **Drift INTERNO entre templates** — 3 versões diferentes de `theokit` em 5 templates do mesmo release (`api-only`/`dashboard`/`postgres` em `^0.1.0-alpha.1`; `default` em `^0.1.0-alpha.4`; `saas` em `^0.1.0-alpha.5`).

Sem gate, drift continua crescendo. Humanos esquecem.

## Decision Drivers

1. **DRY** — uma source-of-truth.
2. **KISS** — script de ~50 LOC; não trazer Renovate/Dependabot complexity para um problema fechado.
3. **Testes** — gate em CI rejeita drift; humano não pode esquecer.

## Considered Options

### Opção A — Manter manual (REJEITADA)
Status quo. Drift confirmado prova que humano falha.

### Opção B — `workspace:*` nos templates (REJEITADA)
`workspace:*` resolve para versão do workspace local, mas templates viram `package.json` real do APP do usuário, que NÃO está no workspace. Quebra `pnpm install` no app gerado.

### Opção C — Changesets (REJEITADA isoladamente)
Changesets já está em uso para CHANGELOG/version bump em `packages/`. Não cobre sync de templates. **Será integrado** (hook `version-packages`) mas Changesets sozinho não resolve.

### Opção D — Script declarativo + CI gate (ACEITA)
`scripts/sync-template-versions.mjs` lê workspace versions, reescreve templates em `--write` mode, valida em `--check` mode. CI roda `--check`. `version-packages` hook chama `--write`.

## Decision Outcome

`theokit/scripts/sync-template-versions.mjs`:
- **Source of truth:** `packages/theo/package.json:version` (para `theokit`); `pnpm-lock.yaml` (para `@usetheo/sdk`, `@usetheo/ui`).
- **Algoritmo:** `findTemplatePackages()` walk recursivo 2 níveis (EC-2 fix — cobre `services/agent-node/`, `services/agent-python/`).
- **Buckets cobertos:** `dependencies` E `devDependencies`.
- **Idempotent:** templates sem managed deps são ignorados (EC-4); `workspace:*` é ignorado (EC-3).
- **Modos:** `--check` (default, CI) sai 1 em drift; `--write` (manual/release) corrige.

CI gate em `.github/workflows/`: step `pnpm check:templates` falha PR com drift.

Hook `version-packages` em `package.json`:
```jsonc
{ "version-packages": "changeset version && pnpm sync:templates" }
```

Pre-commit hook **com ordem explícita (EC-3)**: GATE 1 (`.bak` link check) antes de GATE 2 (`check:templates`).

### Consequences

**Positivas:**
- Drift impossível pós-merge.
- Bump de versão do framework propaga automaticamente.
- Release path validado pelo Changesets hook.

**Negativas:**
- Primeira execução pode produzir grandes diffs cosméticos (EC-8: indent normalization). Aceitar como commit "style:" separado.
- `yaml@^2.8.4` já é devDep — sem nova dep.

## Pros and Cons of the Options

| Opção | Prós | Contras |
|---|---|---|
| A (manual) | Zero código | Drift garantido |
| B (workspace:*) | DRY no monorepo | Quebra app real do usuário |
| C (Changesets só) | Já em uso | Não cobre templates |
| **D (script + gate)** | **Simples, source-of-truth, CI-enforced** | **~50 LOC + 1 step CI** |

## More Information

- **Plano:** T2.1 + T2.2.
- **Baseline:** [`cross-repo-coesao-2026-05-28.md`](../../../.claude/knowledge-base/baselines/cross-repo-coesao-2026-05-28.md) §1 (drift table).
- **EC-2 fix:** walk recursivo cobre templates aninhados em `services/`.
- **EC-3 fix:** pre-commit hook ordering — `.bak` antes de `check:templates`.
- **EC-8 ressalva:** diff cosmético inicial é aceitável.
