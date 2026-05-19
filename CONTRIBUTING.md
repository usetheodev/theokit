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

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating, you agree to abide by its terms.

## Security

Security vulnerabilities go through the process in [SECURITY.md](SECURITY.md),
NOT a public issue. Please respect the disclosure flow.
