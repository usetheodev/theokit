---
status: accepted
date: 2026-05-28
deciders: paulo
consulted: claude
informed: release-engineer
---

# ADR 0022: Republish `create-theokit` com template wirado @usetheo/sdk + README + DX hygiene completa

## Context and Problem Statement

`create-theokit@0.1.0-alpha.4` (publicado) gera scaffold com **MOCK chat** (não @usetheo/sdk), **sem README**, **só script `dev`**. CLAUDE.md macro roadmap item #3 "✅ Done 2026-05-22" tem template SDK-wired no WORKSPACE mas T5.0 publish "DEFERRED to operator". Stranger HOJE recebe app subjetivamente quebrado.

## Decision Drivers

1. **5-minute first agent promise** (CLAUDE.md macro roadmap item #2)
2. **Honestidade extrema** — published package NÃO pode ter mock anti-stack em produção
3. **DX hygiene FAANG-grade** — scripts/README/Node version são floor mínimo

## Considered Options

### Opção A — Wait next major (REJEITADA)
Esperar próximo major do theokit pra incluir scaffold fix. **Por quê não:** Cinco semanas de stranger frustration.

### Opção B — Patch release de create-theokit standalone (ACEITA — D2)
Bump `create-theokit@0.1.0-alpha.5+` (ou next) contendo:
- `chat.ts.tmpl` SDK-wired (Agent.create + send + stream, openrouter/openai/gpt-4o-mini)
- `README.md.tmpl` com 5-min quickstart
- Scripts completos (dev/build/start/typecheck) — D3
- `.nvmrc` com `22.12`
- `favicon.ico`
- drizzle-kit em devDeps (postgres/saas)

### Opção C — Adicionar configurador interativo (REJEITADA)
`create-theokit --interactive` que pergunta provider. **Por quê não:** scope creep. Stranger só precisa default sensato.

## Decision Outcome

**D2 (republish), D3 (README + scripts), D10 (DX hygiene como fix-and-forget) aceitas.**

Mudanças (já implementadas em workspace via T1.3 + T2.1/T2.2/T2.3):
- `packages/create-theo/templates/default/server/routes/chat.ts.tmpl` reescrito com @usetheo/sdk
- `packages/create-theo/templates/default/README.md.tmpl` novo (≤80 linhas)
- `packages/create-theo/templates/{default,dashboard,api-only,postgres,saas}/package.json.tmpl` — scripts completos
- `packages/create-theo/templates/*/. nvmrc` novo (5 templates)
- `packages/create-theo/templates/*/public/favicon.ico` novo (5 templates)
- Changeset em `.changeset/dogfood-stranger-fixes.md` (pendente release engineer)
- Tests: `tests/unit/all-templates-dx-hygiene.test.ts` (37 BDD it() — CI required)

### Consequences

**Positivas:**
- Próximo stranger recebe app FUNCIONAL com real LLM em 5 minutos
- README guia user setup OPENROUTER_API_KEY
- Scripts revelam build/start/typecheck commands
- favicon resolve 404 cosmético
- drizzle-kit dispnível pra postgres/saas

**Negativas:**
- Release engineer dependency (npm auth)
- Bump de version exige test:contract + validate:exports pass (já gated via D9)

## More Information

- **Macro roadmap item #3 (CLAUDE.md):** "✅ Done 2026-05-22 — T5.0 SDK publish DEFERRED to operator"
- **Plano:** T1.3 + T2.1 + T2.2 + T2.3
- **Test gate:** `tests/unit/all-templates-dx-hygiene.test.ts`
- **Pendente:** release engineer publica via `pnpm release` quando aprovar este ADR
