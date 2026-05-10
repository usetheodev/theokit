# Edge Case Review — onda-20-polish-publish

Data: 2026-05-10
Tasks analisadas: 5
Edge cases encontrados: 2 (MUST FIX: 1, SHOULD TEST: 0, DOCUMENT: 1)

## MUST FIX

### EC-1: Package name "theo" may already be taken on npm
- **Task afetada:** T2.1
- **Família:** Boundary / Resource
- **Cenário:** The package name `theo` on npm may already be registered by someone else. If it is, `npm publish` will fail with a 403 error. The plan assumes the name is available but never checks.
- **Impacto:** Publish fails. Need to either: use a scoped name (`@theo/framework`), negotiate the name, or rename.
- **Fix sugerido:** CONFIRMED: `theo` is taken (Salesforce, 109 versions). `create-theo` also exists (5 versions, usetheo.dev). Options: (a) Use scoped `@usetheo/theo` + `@usetheo/create-theo`, (b) Use `theo-framework` + `create-theo-app`, (c) Contact usetheo.dev owner (may be same project). User must decide package names before publish.

## DOCUMENT

### EC-2: create-theo templates use `workspace:*` for theo dependency
- **Risco aceito:** Template `package.json.tmpl` files have `"theo": "workspace:*"` as dependency. This works in the monorepo but after npm publish, users need `"theo": "^0.1.0-alpha.0"`. Changesets should handle this transformation during publish (pnpm's `workspace:*` protocol is replaced with actual versions). If it doesn't, templates will fail to install. This is a known pnpm workspace behavior — changesets handles it. Document but don't fix preemptively.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 0 | 0 | 0 | 0 |
| T0.2 | 0 | 0 | 0 | 0 |
| T1.1 | 0 | 0 | 0 | 0 |
| T2.1 | 2 | 1 (EC-1) | 0 | 1 (EC-2) |
| T3.1 | 0 | 0 | 0 | 0 |

**Veredicto:** PLANO PRECISA DE AJUSTE — 1 MUST FIX (EC-1: verify npm name availability before publish).
