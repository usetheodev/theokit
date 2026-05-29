---
'create-theokit': minor
'theokit': patch
---

**Templates DX overhaul + scaffold SDK wiring (fix EC-S2/S3/S6 do dogfood-stranger run 2026-05-28)**

- **`create-theokit` templates** (default/dashboard/api-only/postgres/saas):
  - Scripts completos: `dev` + `build` + `start` + `typecheck` declarados em todos
  - `.nvmrc` com `22.12` em todos
  - `public/favicon.ico` em todos (resolve 404 cosmético EC-S8)
  - `drizzle-kit` em devDeps de postgres + saas (EC-10 SHOULD TEST)

- **`theokit` framework** (theokit/packages/theo):
  - `vite-plugin/theoui-detect.ts` refatorado: substituído `createRequire(...).resolve()` por filesystem walk + leitura de `package.json:exports[subpath]`. **Resolve EC-S4 root cause** (Page não hidratava) — Chrome MCP confirmou `<main>`, `<header>`, `<textarea>` agora renderizam.
  - `vite-plugin/auto-detect.ts` refatorado: mesma técnica filesystem walk (eliminação de `createRequire`).
  - D13 invariant gated por `tests/integration/no-require-on-esm-only-deps.test.ts` (2 BDD it()) — previne regressão de require em `@usetheo/ui` (ESM-only by design).
  - Playwright spec `tests/e2e/scaffold-page-hydrates.spec.ts` (4 BDD it()) — required CI check para hydration regression.

ADRs:
- [`theokit/docs/adr/0021-dogfood-stranger-coverage-expansion.md`](docs/adr/0021-dogfood-stranger-coverage-expansion.md) — D4-D14
- [`theokit/docs/adr/0022-create-theokit-republish-with-sdk-wired.md`](docs/adr/0022-create-theokit-republish-with-sdk-wired.md) — D2/D3/D10

Plan: [`.claude/knowledge-base/plans/dogfood-fixes-and-coverage-expansion-plan.md`](../../.claude/knowledge-base/plans/dogfood-fixes-and-coverage-expansion-plan.md) v1.1 FAANG-grade.
