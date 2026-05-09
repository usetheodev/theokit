# Theo Framework — SOTA Scorecard

**Última atualização:** 2026-05-08
**Pesquisador:** Claude (SOTA Research Skill)

## Scores por Domínio

| Domínio | Score | Status | Notas |
|---------|-------|--------|-------|
| config | 2/5 | 🟡 Implementado (Onda 0) | defineConfig, loadConfig, theoConfigSchema, TheoConfigError |
| server-routes | 3/5 | 🟡 Implementado (Onda 3) | Runtime pipeline, API middleware, Zod validation, params, query |
| server-actions | 1/5 | 🔴 Pesquisa Onda 4 | REST endpoints, CSRF origin+header, Zod input |
| middleware | 1/5 | 🔴 Contrato apenas | defineMiddleware identity function |
| build | 1/5 | 🔴 Pesquisa Onda 1 | Vite dev server pattern pesquisado |
| type-safety | 2/5 | 🟡 Type tests passando | 11 type tests com expectTypeOf |
| project-structure | 2/5 | 🟡 Implementado (Onda 0) | validateProjectStructure + fixtures |
| dx | 1/5 | 🔴 Pesquisa Onda 1 | create-theo + theo dev patterns pesquisados |
| routing | 2/5 | 🟡 Implementado (Onda 2) | File-based routing, React Router v7, 4 fixtures, 13 E2E |
| layouts | 2/5 | 🟡 Implementado (Onda 2) | Nested via Outlet, root + dashboard layouts |
| error-handling | 0/5 | ⚪ Onda 8 | Fora de escopo |
| observability | 0/5 | ⚪ Onda 8 | Fora de escopo |
| security | 0/5 | 🔴 Pesquisa Onda 4 | CSRF origin+header para actions |
| testing | 2/5 | 🟡 Vitest + Playwright | 182 unit/integration + 13 E2E tests |

## Legenda

- 🔴 Score < 2: Pesquisa ou definição inicial
- 🟡 Score 2-3: Implementação parcial
- 🟢 Score 4-5: Implementação sólida com testes
- ⚪ Fora de escopo da onda atual
