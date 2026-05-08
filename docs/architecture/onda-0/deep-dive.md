# Deep Dive — Onda 0 Architecture (BEFORE)

**Date:** 2026-05-08
**State:** Pre-implementation (greenfield)

## 1. State of the System

O sistema **não existe** como código. Existe apenas como:
- `README.md` — API surface e visão do framework
- `docs/ONDAS.md` — Roadmap de implementação em 12 ondas
- `docs/technical/ONDA-0-SOTA-RESEARCH.md` — Pesquisa SOTA com decisões arquiteturais
- `docs/plans/onda-0-fundamento-plan.md` — Plano de implementação detalhado
- `referencias/next.js/` e `referencias/rails/` — Código fonte de referência

## 2. Key Architectural Decisions

| ID | Decision | Source |
|----|----------|--------|
| D1 | define* functions são identity functions (sem validation) | SOTA Research |
| D2 | Pacote único `theo` com subpath exports | Plan ADR |
| D3 | Zod como peerDependency | Plan ADR |
| D4 | loadConfig usa dynamic import (vitest-only na Onda 0) | Plan ADR |
| D5 | Fixtures fora do workspace pnpm | Plan ADR |
| D6 | Web Standards (Request/Response) | SOTA Research |

## 3. What Does NOT Exist Yet

| Component | Status | Planned In |
|-----------|--------|-----------|
| `packages/theo/` | ❌ | Onda 0 |
| `packages/create-theo/` | ❌ (stub) | Onda 0 (stub), Onda 1 (impl) |
| `fixtures/` | ❌ | Onda 0 |
| `tests/` | ❌ | Onda 0 |
| CLI (`theo dev/build/start`) | ❌ | Onda 1 |
| App Router | ❌ | Onda 2 |
| Server Routes runtime | ❌ | Onda 3 |
| Server Actions runtime | ❌ | Onda 4 |
| Middleware runtime | ❌ | Onda 5 |
| Production build | ❌ | Onda 6 |
| Type safety E2E | ❌ | Onda 7 |
| Observability | ❌ | Onda 8 |
| Agent layer | ❌ | Post-MVP |

## 4. Invariants Established by Design

1. **Zod obrigatório, não opt-in** — Toda route/action DEVE ter schema
2. **Web Standards** — Request/Response, não req/res
3. **Explícito > Implícito** — defineAction(), não 'use server'
4. **Convention over Configuration** — Estrutura opinativa, sem src/ prefix
5. **Fail fast** — Validação eager no startup
6. **Identity functions** — define* não transformam dados

## 5. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Generic defaults em RouteConfig podem não inferir corretamente | HIGH | Type tests (Phase 5) validam antes de prosseguir |
| loadConfig com dynamic import não funciona fora de Vitest | MEDIUM | Aceitável na Onda 0; Onda 1 adiciona transpilação |
| Zod como peer pode confundir devs sem Zod instalado | LOW | create-theo (Onda 1) inclui Zod no template |

## 6. Metrics

| Metric | Current | Target (Onda 0) |
|--------|---------|------------------|
| Linhas de código de produção | 0 | ~150 |
| Linhas de teste | 0 | ~300 |
| Packages | 0 | 2 (theo + create-theo stub) |
| Fixtures | 0 | 3 |
| Type tests | 0 | 3 files |
| Unit tests | 0 | ~30 tests |
| TypeScript errors | N/A | 0 |
