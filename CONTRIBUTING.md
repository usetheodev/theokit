# Contributing to TheoKit

Thanks for your interest in TheoKit. This document is the short, runnable
contract between you and the codebase: what to install, what to test
before opening a PR, and what shape contributions should take.

If you're upgrading an existing TheoKit app from 0.2.x to 0.3.0, see
[docs/migrating/0.2-to-0.3.md](docs/migrating/0.2-to-0.3.md) — this
guide is for changes to the framework itself.

## Quick start

```bash
git clone https://github.com/usetheodev/theokit.git
cd theokit
pnpm install
pnpm try:scaffold        # generates examples/onda1-hello-theo
pnpm --filter onda1-hello-theo dev
```

If `pnpm try:scaffold` fails, you're missing a dependency or your Node
version is too old. TheoKit targets Node 20+.

## Local testing — before every PR

These three commands are the gate. CI runs the same ones; if they pass
locally, your PR is likely to pass in CI.

```bash
# 1. Unit + integration tests
npx vitest run

# 2. Type check
npx tsc -p packages/theo/tsconfig.json --noEmit

# 3. Browser tests
npx playwright install --with-deps     # one-time, downloads browsers
npx playwright test

# 4. Dogfood smoke — proxy for /dogfood full
bash scripts/dogfood-smoke.sh
```

`scripts/dogfood-smoke.sh` exits 0 when health is ≥ 41/48 (≥ 85%).
Lower than that means your PR is missing something foundational; fix
before opening the PR.

## How to add a feature

1. Open an issue (or comment on an existing one). Confirm scope before
   investing time.
2. Branch off `develop` (NOT `main`). Branch name: `feat/<short-slug>`.
3. Write a failing test first. Yes — even when you "know" how it'll
   work. The TDD cycle is mandatory; see `.claude/rules/testing.md`.
4. Implement the minimum code to make the test pass.
5. Refactor for clarity; the tests stay green.
6. Update CHANGELOG.md under `[Unreleased]`. Use the
   [Keep a Changelog](https://keepachangelog.com/) categories
   (Added / Changed / Deprecated / Removed / Fixed / Security).
7. Run the four-command gate above.
8. Open the PR. Fill in the template.

## How to add a fixture

Fixtures under `fixtures/` are how the framework proves it actually works.
Each one is a minimal app that exercises ONE primitive end-to-end.

1. Create `fixtures/<your-fixture>/` with `package.json`, `theo.config.ts`,
   `app/`, and `server/` (only what your fixture needs).
2. Add a row to `fixtures/README.md` (the `template-html-validator` test
   asserts every fixture has a row).
3. If your fixture ships HTML, ensure `public/index.html` references
   `/@theo/entry-client` (the `template-html-validator` test asserts this).
4. Run `npx vitest run tests/unit/fixtures-index.test.ts` to confirm the
   structural linter is green.

## How to write a Playwright spec

The pattern lives in `tests/e2e/template-default.spec.ts`:

- `collectConsoleErrors(page)` returns a mutable array; assert it
  equals `[]` at the end of every scenario.
- Use `getByRole` / `getByText` selectors, not CSS selectors.
- Each spec is independent; no shared state between tests.

Run a single spec with:

```bash
npx playwright test tests/e2e/template-default.spec.ts
```

## Branch + commit conventions

- **Branches**: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `refactor/<slug>`.
  Never work directly on `main`.
- **Commits**: imperative present tense, short subject (≤ 72 chars).
  The first line is the subject; an empty line follows; the body
  explains the *why* (the diff already shows the *what*).
- **Co-authoring**: if you paired with someone, add
  `Co-Authored-By: Name <email>` lines at the end of the commit body.
- **Squash on merge**: PRs are squashed by default. The PR title becomes
  the commit subject — write it carefully.

## How releases work

The release engineer is the only person who runs `npm publish`. If your
PR needs a new release to be visible to users, mention that in the PR
description; the maintainer will queue the publish.

For the 0.3.0 cutover specifically, see
[docs/plans/theokit-0.3.0-cutover-execution-plan.md](docs/plans/theokit-0.3.0-cutover-execution-plan.md).

## Cross-repo dev: linking @usetheo/ui

Por default, `@usetheo/ui` é consumido como npm dep (peerDep `^0.11.0-next.0`).
Edições locais em `../theo-ui/` NÃO refletem sem publish.

Para iterar nos dois repos simultaneamente (ADR
[`0020`](docs/adr/0020-cross-repo-workspace-link-opt-in.md)):

```sh
# 1. Pré-requisito: ../theo-ui já buildado (vite-plugin.js precisa existir em dist/)
pnpm --dir ../theo-ui build

# 2. Ativa workspace link cross-repo (preserva pnpm-workspace.yaml como .bak)
pnpm theo-ui:link

# 3. Itera com HMR
pnpm dev
# ... edita theo-ui/src/ e theokit/packages/theo/src/ ...

# 4. Restaura antes de commit
pnpm theo-ui:unlink
```

**Importante:** o pre-commit hook bloqueia commits enquanto
`pnpm-workspace.yaml.bak` existe (GATE 0). Isso garante que CI sempre roda
contra o `pnpm-workspace.yaml` canônico (publish-and-bump path), validando
que o ciclo de release continua funcionando.

CI nunca usa esse modo. Veja [ADR 0020](docs/adr/0020-cross-repo-workspace-link-opt-in.md).

### Cuidados (EC-9, EC-10, EC-link-9)

- **Use um terminal por checkout.** Rodar `pnpm theo-ui:link` em paralelo no
  mesmo checkout pode disputar o `.bak` durante a janela de cópia (<100ms).
  Não é race destrutivo (guard `if [ -f .bak ] abort` cobre), mas evite.
- **Você está editando DOIS repos independentes.** Edições em `../theo-ui/src/`
  ficam em `theo-ui/`; edições em `packages/theo/src/` ficam em `theokit/`.
  São DOIS `git commit`, DOIS `git push`, DOIS PRs. O modo linked acelera HMR,
  NÃO unifica commits.
- **Se algo der errado e o link travar** (Ctrl+C durante `pnpm install`, etc):
  `mv pnpm-workspace.yaml.bak pnpm-workspace.yaml && pnpm install` desfaz
  manualmente.

### Assimetria intencional: SDK linked default, UI linked opt-in

`@usetheo/sdk` permanece como workspace link permanente em
`pnpm-workspace.yaml`. UI fica de fora por default. A assimetria reflete o
perfil de acoplamento:

| Pillar | Acoplamento ao runtime do theokit | Workspace mode |
|---|---|---|
| `@usetheo/sdk` | runtime de produção (`server/agent/*`) | **link permanente** |
| `@usetheo/ui` | dep opcional via auto-detect | **link opt-in** |

Ver [ADR 0020](docs/adr/0020-cross-repo-workspace-link-opt-in.md) (theokit) +
[ADR 0001](../theokit-sdk/docs/adr/0001-workspace-link-default-status-quo.md)
(theokit-sdk, mirror).

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating, you agree to abide by its terms.

## Security

Security vulnerabilities go through the process in [SECURITY.md](SECURITY.md),
NOT a public issue. Please respect the disclosure flow.
