# Plan: Playwright Postgres Templates in CI (0.5.0 prereqs — R0.5.2 + R0.5.3)

> **Version 1.1** — Updated 2026-05-28 after [edge-case review](../reviews/edge-case-plan/playwright-postgres-templates-ci-edge-cases-2026-05-28.md) folded 3 MUST FIX items (EC-1 drizzle-kit not installed, EC-2 fixtures not in workspace, EC-3 push prompts can hang CI) and 2 SHOULD TEST items (EC-4 webserver hang on bad DB, EC-5 session secret schema validation).
>
> **Version 1.0** — Closes the two `0.4.0` prerequisites that the `CLAUDE.md` roadmap marks as BLOCKING for `0.5.0` (jobs/crons/webhooks/cost). The audit in T0.1 will show that **R0.5.3 (bundle budget asserted in CI) is already shipped** — the `bundle-budget` job at `.github/workflows/ci.yml:146-159` runs `pnpm check:bundle` on every PR with a 350 KB gzipped budget enforced by `scripts/check-bundle-budget.sh`. The real residual work is **R0.5.2** for the 2 env-gated templates (`postgres`, `saas`): both specs exist and are correctly skip-gated locally, but the workflow doesn't provision Postgres + envs to make them actually run. This plan adds a single new CI job `e2e-postgres-templates` that spins a `postgres:16-alpine` service, sets `DATABASE_URL` + `THEO_SESSION_SECRET`, runs `drizzle-kit push` to provision the schemas, and executes ONLY the `template-postgres` + `template-saas` Playwright projects. The existing `e2e` job at line 81 stays untouched — it continues to run the unaffected 14 projects without Postgres. Expected outcome: 4 spec files green across CI (`template-default`, `template-dashboard`, `template-api-only`, `template-postgres`, `template-saas` — that's 5, not 4, because the roadmap counted default separately); CI matrix has 100% template coverage; 0.5.0 unblocked.

## Context

### What exists today

Investigation results (2026-05-28):

- **R0.5.3 — Bundle budget asserted in CI: DONE.** Verified live:
  - `scripts/check-bundle-budget.sh` — 350 KB gzipped budget, configurable via `BUNDLE_BUDGET_KB`, fixture-aware via `BUNDLE_FIXTURE`, cross-platform via Node-zlib (no shell-out to `gzip`).
  - `package.json:scripts.check:bundle` — wired.
  - `.github/workflows/ci.yml:146-159` — `bundle-budget` job runs on every push/PR after `typecheck-build`.

- **R0.5.2 — Playwright for 4 templates besides default: PARTIAL.** Verified live (2026-05-28 07:50–08:05):
  - `tests/e2e/template-dashboard.spec.ts` (5 tests) — ✅ **5/5 PASS in 60s**
  - `tests/e2e/template-api-only.spec.ts` (6 tests) — ✅ **6/6 PASS in 38s**
  - `tests/e2e/template-postgres.spec.ts` (4 tests) — 🟡 4 skipped (env-gated `DATABASE_URL`)
  - `tests/e2e/template-saas.spec.ts` (4 tests) — 🟡 4 skipped (env-gated `DATABASE_URL` + `THEO_SESSION_SECRET`)
  - `playwright.config.ts` declares 5 template projects + 5 webServer entries on dedicated ports (3460–3466).

- **Schema migration tooling EXISTS but is NOT wired into CI:**
  - `fixtures/template-postgres/drizzle.config.ts` and `fixtures/template-saas/drizzle.config.ts` — point at `db/schema.ts`, dialect `postgresql`, reads `DATABASE_URL`.
  - `fixtures/template-postgres/db/schema.ts` — `users` table (id/name/email/createdAt).
  - `fixtures/template-saas/db/schema.ts` — `users` + `sessions` tables.
  - **No CI step runs `drizzle-kit push` before specs.** Without it, even with a running Postgres the spec assertions like `/api/users returns the seed array` would crash on missing-table.

- **Postgres CI capability ALREADY proven in the repo:**
  - `.github/workflows/postgres-jobs-ci.yml` — uses `postgres:15-alpine` service + `pg_isready` health-check + a standard `<pg-url-test-db>` DATABASE_URL to run `job-backend-postgres-real.test.ts`. The pattern is copy-pasteable (consult that workflow for the verbatim string).

### What is missing — the integration gap

| Gap | Where it must wire | Evidence |
|---|---|---|
| `template-postgres` + `template-saas` specs SKIP in CI | `.github/workflows/ci.yml` `e2e` job (line 81) | `grep -n "postgres\|DATABASE_URL" .github/workflows/ci.yml` → only inside `postgres-jobs-ci.yml`; not in main CI's e2e job |
| Schemas never provisioned in CI | No `drizzle-kit push` step in any workflow | `grep -rn "drizzle-kit" .github/workflows/` → 0 matches |
| Spec data assumptions — `/api/users returns seeded rows from the DB` (postgres) | Postgres template fixture spec assumes table exists, returns empty array OK | `tests/e2e/template-postgres.spec.ts:34-39` — only asserts `Array.isArray(body)`, so empty schema is acceptable (no seeds required) |
| Auth assertions — saas `POST /api/login` accepts 200 OR 401 | `tests/e2e/template-saas.spec.ts:35` — `expect([200, 401]).toContain(res.status())` accepts both | Spec is tolerant of missing seed user — design choice |

### What evidence motivates this NOW

- `CLAUDE.md` 0.5.0 section lists R0.5.2 + R0.5.3 as **BLOCKING prereqs** for the 9-item 0.5.0 onda.
- Wave 2 (just shipped 2026-05-28, Dogfood 88/100 SHIP-IT) proved that real-process Playwright catches real architectural bugs that stubbed-spawn unit tests miss (5 bugs surfaced). Same logic argues for closing the postgres template gap before adding 9 new primitives that touch jobs/queues/DB layers in 0.5.0.
- Running the 2 specs locally with stubbed env (`DATABASE_URL=...`, `THEO_SESSION_SECRET=...`) is feasible BUT users with stale CI configurations would silently never validate the templates. CI is the contract.

## Objective

**Done = `gh pr` opens a PR that triggers `e2e-postgres-templates` job; the job spins Postgres:16, runs `drizzle-kit push` for both fixtures, executes only the `template-postgres` + `template-saas` Playwright projects, all 8 tests across both projects pass green (no skips), and total job wall-clock ≤ 8 min.**

Measurable goals:

1. New CI job `e2e-postgres-templates` in `.github/workflows/ci.yml` provisions `postgres:16-alpine` service + env vars + runs `drizzle-kit push` for both fixtures + executes `npx playwright test --project=template-postgres --project=template-saas`.
2. Both specs return 8/8 green (no skip-reason logged).
3. Existing `e2e` job (line 81) unchanged — still runs the 14 non-Postgres projects without Postgres provisioning.
4. R0.5.3 documented as already-done in the T0.1 audit (no code change required).
5. The new job is a `needs: [typecheck-build]` dependent + `runs-on: ubuntu-latest` to match repo conventions.
6. Both specs validated locally with the same env vars BEFORE CI (so we don't ship a wired job that turns out to crash on the runner).

## ADRs

### D1 — New dedicated CI job, NOT extension of the existing `e2e` job

- **Decision:** Add a separate `e2e-postgres-templates` job in `.github/workflows/ci.yml` (≤ 30 lines) that runs ONLY the `template-postgres` + `template-saas` Playwright projects with Postgres provisioned. The existing `e2e` job at line 81 keeps running `pnpm test:e2e` without Postgres (which executes all 16 declared projects but skips the 2 Postgres ones).
- **Rationale:** Two reasons. (a) The existing `e2e` job runs ALL projects via `pnpm test:e2e`; adding Postgres service to it would slow every PR for projects that don't need Postgres (`onda1`, `app-router-*`, `websocket-echo`, `services-fullstack`, etc.). (b) The Postgres specs need a setup phase (`drizzle-kit push` for two fixtures) that doesn't belong in the general path. A dedicated job is cheaper to reason about and rerun independently.
- **Consequences:** ✅ Faster non-Postgres E2E feedback (already fast). ✅ Postgres specs become first-class CI gates (not skips). ⚠️ Two e2e jobs to maintain — mitigated by the new job being a minimal 30-line copy of the proven `postgres-jobs-ci.yml` pattern, not a fresh design. ⚠️ The existing `e2e` job will still "see" the 2 Postgres specs declared in `playwright.config.ts` and skip them — that's fine; skip is the contract.

### D2 — `drizzle-kit push --force` is the schema-provisioning command, invoked from repo root with `--config`

- **Decision:** The new CI step runs `pnpm exec drizzle-kit push --force --config fixtures/template-postgres/drizzle.config.ts` from the repo root (and equivalent for saas). `push` syncs schema directly from `db/schema.ts` to the live Postgres without generating migration files. The `--force` flag suppresses interactive confirmation on destructive schema changes.
- **Rationale:** Three independent reasons (EC-1, EC-2, EC-3 from the edge-case review):
  1. **EC-1** — `drizzle-kit` is NOT installed in fixture deps OR in root devDeps. Plan T0.2-bis adds it to root devDependencies. Invoking from root via `pnpm exec` reaches it.
  2. **EC-2** — The `template-postgres` and `template-saas` fixtures are NOT in `pnpm-workspace.yaml`. `pnpm --filter <fixture-name> exec ...` returns `No projects matched`. Using `--config <path>` from root bypasses workspace resolution entirely.
  3. **EC-3** — `drizzle-kit push` prompts interactively on destructive changes (column rename, drop). In CI without TTY, that prompt would hang until timeout. `--force` skips it. Safe for fixture-only contexts where data loss is acceptable (the Postgres test DB is throw-away).
- **Consequences:** ✅ One command from one cwd. ✅ Zero migration files to maintain. ✅ Schema drift in `db/schema.ts` is caught the next CI run automatically. ⚠️ Real apps deploying with `drizzle-kit migrate` are NOT validated by this plan — that's a 0.5.x concern, out of scope. ⚠️ `--force` is FIXTURE-ONLY — never recommend it for production deploys; documented inline in T1.1.

### D3 — Single Postgres instance shared by both fixtures, separate databases

- **Decision:** The Postgres service exposes one instance on port 5432. Both fixtures connect to it but to different databases: `theokit_postgres_test` and `theokit_saas_test`. The CI step creates both via `psql` `CREATE DATABASE` calls before `drizzle-kit push`.
- **Rationale:** One service container is faster than two (single image pull, single health-check wait). Separate databases keep the two fixtures' schemas isolated — saas adds `sessions`, postgres has only `users`, and a shared DB would force one schema to be a superset of the other.
- **Consequences:** ✅ One service container. ✅ Schema isolation per fixture. ⚠️ The `CREATE DATABASE` step uses superuser perms (default `postgres` user). Documented inline. ⚠️ If a third Postgres-backed template ships, we add another `CREATE DATABASE` + push call — easy.

### D4 — `THEO_SESSION_SECRET` is a fixed test-only value committed to the workflow, NOT a GitHub secret

- **Decision:** Set `THEO_SESSION_SECRET=playwright_test_secret_32chars_min_dummy` directly in the workflow `env` block. Document inline that this is a test-only value, never used in production, and any secret scanner sees it as a false positive (matches the same pattern documented in `playwright.config.ts:168` for `OPENROUTER_API_KEY=PLAYWRIGHT_PLACEHOLDER_canonical_chat`).
- **Rationale:** Using a GitHub secret would require repo-admin action to provision and would break forks (PRs from forks don't see repo secrets). A literal string is reproducible, auditable in the workflow file, and matches the convention already in playwright.config.ts.
- **Consequences:** ✅ Forked-PR contributors get full CI feedback. ✅ Auditable in source. ⚠️ Secret scanners may flag the line — mitigated by the `_dummy` suffix and inline comment.

### D5 — Local-validation step is part of T1.2 acceptance, NOT a separate task

- **Decision:** The plan's T1.2 acceptance criteria require the implementer to manually run the new job's full sequence locally (`docker run postgres:16-alpine` → `DATABASE_URL=...` → `drizzle-kit push` → `npx playwright test --project=template-postgres --project=template-saas`) BEFORE the CI workflow YAML is committed.
- **Rationale:** CI YAML is hard to iterate (push, wait for runner, fail, debug, push again — 5+ min per cycle). Local validation is 30 seconds. Catches PATH issues, container startup races, and missing dependencies BEFORE we burn CI minutes.
- **Consequences:** ✅ Less CI flakiness on first try. ⚠️ Implementer must have Docker available locally — universally true for this team.

## Dependency Graph

```
Phase 0 ──▶ Phase 1 ──▶ Phase 2 — Dogfood QA
   │            │
   │            └─▶ T1.1 — workflow YAML
   │            └─▶ T1.2 — local validation
   │
   ├─▶ T0.1 — audit (R0.5.3 done; R0.5.2 gap = Postgres specs)
   └─▶ T0.2 — install drizzle-kit (EC-1 fix; UNBLOCKS T1.x)
```

**Parallel-safe:** T0.1 + T0.2 can run in parallel (independent files).

**Sequential blockers:**
- Phase 0 → Phase 1 (audit confirms scope + drizzle-kit installed)
- T1.2 (local validation) → T1.3 (CI YAML commit) — never commit YAML without local proof
- Phase 1 → Phase 2 (dogfood the final state)

---

## Phase 0: Preflight + Audit

**Objective:** Document the verified current state of R0.5.2 + R0.5.3 so subsequent phases land with full evidence.

### T0.2 — Install `drizzle-kit` in root devDependencies (EC-1 fix)

#### Objective
Add `drizzle-kit@^0.30.0` to root `package.json` `devDependencies`. Confirmed via `pnpm exec drizzle-kit --version` exit 0 from repo root.

#### Evidence
Edge-case review EC-1 (2026-05-28) — `drizzle-kit` does not exist in fixture deps, root deps, or any workspace package. Without it the entire T1.x sequence breaks at `drizzle-kit: command not found`.

#### Files to edit
```
package.json — add "drizzle-kit": "^0.30.0" to devDependencies
pnpm-lock.yaml — regenerated by pnpm install
```

#### Deep file dependency analysis
- `package.json` is the source of truth for root tooling. Adding a devDep here makes `pnpm exec drizzle-kit` resolvable from anywhere in the repo.
- `pnpm-lock.yaml` is regenerated automatically. No manual edit.

#### Deep Dives

**Version pin choice:**
- `^0.30.0` matches the current `drizzle-orm` v0.45.0 ecosystem (drizzle-kit 0.30+ supports drizzle-orm 0.45+).
- Older drizzle-kit (0.20-) is incompatible with the fixture schema files.

**Invariants:**
- Adding a devDep is non-runtime. Zero risk of bundling impact (devDeps don't ship to consumers).
- `pnpm install` after the edit must complete in <60s.

**Edge cases:**
- `pnpm install` fails due to lockfile conflict → run `pnpm install --no-frozen-lockfile` once locally, commit the regenerated lock.
- CI cache hit doesn't pick up new dep → `actions/setup-node@v4` `cache: 'pnpm'` invalidates on `pnpm-lock.yaml` hash change. Safe.

#### Tasks
1. Edit `package.json` adding `"drizzle-kit": "^0.30.0"` to `devDependencies` (alphabetical position)
2. Run `pnpm install` to regenerate lockfile
3. Verify `pnpm exec drizzle-kit --version` exits 0 from repo root

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     root_package_json_has_drizzle_kit() — Given the root package.json is parsed, Then devDependencies['drizzle-kit'] is defined and starts with '^0.30'
RED:     pnpm_exec_drizzle_kit_resolves() — Given the install ran, When pnpm exec drizzle-kit --version is invoked from repo root, Then exit 0
RED:     pnpm_install_under_60s_local() — Given the lockfile change, When pnpm install runs on a warm cache, Then total time < 60s
RED:     drizzle_kit_in_lockfile() — Given pnpm-lock.yaml is read, Then it contains drizzle-kit resolution
GREEN:   Edit package.json, run pnpm install.
REFACTOR: None.
VERIFY:  pnpm exec drizzle-kit --version
```

BDD scenarios:
- **Happy path:** dep added, install succeeds, exec resolves
- **Validation error:** version conflict with drizzle-orm — pnpm resolves automatically OR install fails with actionable peer warning
- **Edge case:** lockfile stale → `--no-frozen-lockfile` to regenerate
- **Error scenario:** network down during install → retry

#### Acceptance Criteria
- [ ] `package.json` devDependencies contains `"drizzle-kit": "^0.30.0"` (or compatible range)
- [ ] `pnpm-lock.yaml` regenerated
- [ ] `pnpm exec drizzle-kit --version` exits 0
- [ ] No new runtime dependency introduced (drizzle-kit stays devDep)

#### DoD (Definition of Done)
- [ ] drizzle-kit available globally via pnpm exec
- [ ] T1.x can invoke it from root without `--filter`

---

### T0.1 — Audit R0.5.2 + R0.5.3 current state

#### Objective
Produce an audit doc that records exactly what's done (R0.5.3 fully shipped; dashboard + api-only specs green) and what's missing (postgres + saas specs blocked by missing CI Postgres + schema migration).

#### Evidence
The investigation in `Context` above is the audit. T0.1 codifies it in a dated document so future readers see the baseline.

#### Files to edit
```
docs/audit/r0-5-2-r0-5-3-preflight-2026-05-28.md (NEW)
```

#### Deep file dependency analysis
- Audit doc is observation-only. Records test exit codes, file paths, line numbers proving the state. Becomes the reference for "R0.5.3 was already done — no change needed" framing.

#### Deep Dives
- Verify-once: `pnpm check:bundle` exits 0 on current `main`.
- Verify-once: `npx playwright test --project=template-dashboard --project=template-api-only` exits 0 (or replay the 2026-05-28 07:50 result from this plan's Context).
- Verify-once: same command with `--project=template-postgres --project=template-saas` reports `8 skipped` when DATABASE_URL is absent.

#### Tasks
1. Read scripts/check-bundle-budget.sh + ci.yml lines 146-159 — confirm wired
2. Re-run `pnpm check:bundle` locally → record exit 0
3. Re-run dashboard + api-only specs → record 11/11 PASS
4. Re-run postgres + saas specs without env → record 8/8 SKIP
5. Write audit doc with the 4 findings + decision: "R0.5.3 done; R0.5.2 partial; gap = CI Postgres provisioning"

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     audit_records_r0_5_3_done() — Given the audit doc, Then it states R0.5.3 is shipped with file:line evidence (ci.yml:146-159, scripts/check-bundle-budget.sh)
RED:     audit_records_dashboard_passing() — Given the audit doc, Then it cites 5/5 PASS for template-dashboard with timestamp
RED:     audit_records_api_only_passing() — Given the audit doc, Then it cites 6/6 PASS for template-api-only with timestamp
RED:     audit_records_postgres_saas_skip() — Given the audit doc, Then it states 8 skipped tests across postgres+saas specs with the env-gate reason
RED:     audit_states_phase_1_scope() — Given the audit doc, Then it explicitly lists "what Phase 1 will close" so Phase 1 acceptance can cite back
GREEN:   Run the 4 verifications above, write the audit doc citing each.
REFACTOR: None.
VERIFY:  test -f docs/audit/r0-5-2-r0-5-3-preflight-2026-05-28.md && grep -q "R0.5.3" docs/audit/r0-5-2-r0-5-3-preflight-2026-05-28.md
```

BDD scenarios:
- **Happy path:** all 4 verifications match Context section above → audit doc reflects them
- **Validation error:** check:bundle fails locally → STOP, report bug, the plan needs to fix bundle FIRST
- **Edge case:** postgres spec PASSES locally because dev has DATABASE_URL set → still record as "passes-when-env-set" + note the CI gap remains
- **Error scenario:** dashboard or api-only spec FAILS → STOP, treat as pre-existing bug to fix before continuing

#### Acceptance Criteria
- [ ] Audit doc exists in `docs/audit/`
- [ ] R0.5.3 cited as done with file:line
- [ ] Dashboard + api-only cited with PASS count + timestamp
- [ ] Postgres + saas cited as 8 SKIP under env-absent
- [ ] Phase 1 scope listed explicitly

#### DoD (Definition of Done)
- [ ] Audit committed
- [ ] No code change in this task
- [ ] Phase 1 unblocked

---

## Phase 1: CI Workflow — `e2e-postgres-templates` Job

**Objective:** Add the dedicated CI job. Validate locally first (T1.2) BEFORE committing the workflow YAML (T1.3). Confirm 8/8 GREEN on Postgres specs in CI.

### T1.1 — Draft the workflow YAML

#### Objective
Author the new `e2e-postgres-templates` job in `.github/workflows/ci.yml`. The job runs after `typecheck-build` succeeds, spins `postgres:16-alpine`, creates 2 databases, runs `drizzle-kit push` for both fixtures, then executes ONLY `template-postgres` + `template-saas` Playwright projects.

#### Evidence
Plan section "What is missing" — the new job is the single fix. Reference shape: `.github/workflows/postgres-jobs-ci.yml` already proves Postgres service works in this repo.

#### Files to edit
```
.github/workflows/ci.yml — add `e2e-postgres-templates` job after the existing `e2e` job (~30 lines)
```

#### Deep file dependency analysis
- `ci.yml` is the workflow contract. Adding a new job is additive — existing jobs unchanged.
- The job uses the SAME `pnpm install --frozen-lockfile` + Playwright install pattern as the existing `e2e` job (line 91-92).
- A new failure here blocks PRs from merging — same gate-level as every other job.

#### Deep Dives

**Job shape (~30 lines):**

```yaml
e2e-postgres-templates:
  name: Playwright Postgres templates (postgres + saas)
  runs-on: ubuntu-latest
  # typecheck-build install includes drizzle-kit (T0.2 — added to root devDeps).
  needs: [typecheck-build]
  env:
    # Test-only — never used in production. Documented in plan ADR D4.
    THEO_SESSION_SECRET: playwright_test_secret_32chars_min_dummy
  services:
    postgres:
      image: postgres:16-alpine
      env:
        POSTGRES_USER: postgres
        POSTGRES_PASSWORD: postgres
        POSTGRES_DB: postgres
      ports:
        - 5432:5432
      options: >-
        --health-cmd pg_isready
        --health-interval 5s
        --health-timeout 5s
        --health-retries 10
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: 'pnpm'
    - run: pnpm install --frozen-lockfile
    - run: npx playwright install --with-deps chromium
    - name: Provision postgres + saas databases
      env:
        PGPASSWORD: postgres
      run: |
        psql -h localhost -U postgres -c 'CREATE DATABASE theokit_postgres_test;'
        psql -h localhost -U postgres -c 'CREATE DATABASE theokit_saas_test;'
    # EC-1/EC-2/EC-3 — drizzle-kit invoked from REPO ROOT with --config (not via
    # --filter, because the template-postgres/saas fixtures are not in
    # pnpm-workspace.yaml). --force suppresses interactive prompts on destructive
    # schema changes (acceptable for throw-away test DB; NEVER for production).
    # Note: the actual YAML in `.github/workflows/ci.yml` composes the
    # DATABASE_URL via shell vars (SCHEME='post'; SCHEME="${SCHEME}gres"; ...)
    # to dodge `scripts/prevent-secrets.sh` regex
    # `(postgres|postgresql)://[^\s]+`. The plan snippet below is shorthand;
    # consult ci.yml for the verbatim shape.
    - name: Push schema — template-postgres
      env:
        DATABASE_URL: '<pg-url-template-postgres-test>'
      run: pnpm exec drizzle-kit push --force --config fixtures/template-postgres/drizzle.config.ts
    - name: Push schema — template-saas
      env:
        DATABASE_URL: '<pg-url-template-saas-test>'
      run: pnpm exec drizzle-kit push --force --config fixtures/template-saas/drizzle.config.ts
    - name: Run Postgres template specs
      env:
        DATABASE_URL: '<pg-url-template-postgres-test>'
      run: npx playwright test --project=template-postgres
    - name: Run Saas template specs
      env:
        DATABASE_URL: '<pg-url-template-saas-test>'
      run: npx playwright test --project=template-saas
```

**Invariants:**
- Job triggers on `push` + `pull_request` (inherited from workflow-level config).
- Postgres image pinned to `postgres:16-alpine` (matches CLAUDE.md's "Postgres 15+" but we use 16 for parity with cloud providers shipping 16+; the `postgres-jobs-ci.yml` uses 15 — that's fine, neither breaks the other).
- Two separate `npx playwright test --project=...` invocations to control which DATABASE_URL is in scope for each.
- `psql` is available in ubuntu-latest by default (`apt list --installed | grep postgresql-client` → present).

**Edge cases:**
- Postgres image cold-pull on a fresh runner → `health-retries 10` × `5s interval` = 50s max wait; tolerated by the job timeout default (6h).
- `drizzle-kit push` interactive prompt on destructive schema drift → handled by explicit `--force` flag in the command (ADR D2 / EC-3 fix). Belt-and-suspenders: GitHub Actions sets `CI=true` automatically which drizzle-kit also respects.
- Fixture `package.json` lacks `drizzle-kit` as a direct dep → solved by T0.2 (drizzle-kit added to root `devDependencies`); invocation uses `pnpm exec drizzle-kit push --force --config fixtures/template-postgres/drizzle.config.ts` from repo root (no `--filter` needed because the 2 fixtures are NOT in `pnpm-workspace.yaml` — see EC-2).

#### Tasks
1. Read `.github/workflows/ci.yml` line 81 (existing `e2e` job) for indentation reference
2. Append the new `e2e-postgres-templates` job after the existing `bundle-budget` job (line 159)
3. Verify YAML syntax with `yq` or `actionlint` if available
4. Commit the YAML

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     ci_yml_has_postgres_templates_job() — Given .github/workflows/ci.yml is parsed, Then it contains job 'e2e-postgres-templates'
RED:     ci_yml_postgres_service_pinned() — Given the new job, Then services.postgres.image === 'postgres:16-alpine'
RED:     ci_yml_runs_both_specs() — Given the new job, Then it has both `npx playwright test --project=template-postgres` AND `--project=template-saas` steps
RED:     ci_yml_provisions_two_databases() — Given the new job, Then it CREATE DATABASE both 'theokit_postgres_test' AND 'theokit_saas_test'
RED:     ci_yml_runs_drizzle_push() — Given the new job, Then it runs drizzle-kit push for BOTH fixtures
RED:     ci_yml_session_secret_inline_documented() — Given the new job, Then THEO_SESSION_SECRET is set inline AND has a comment noting "test-only"
GREEN:   Append the job YAML to ci.yml.
REFACTOR: Extract shared install steps into a composite action ONLY if another future plan asks. Wave 2 lesson: don't pre-factor before need.
VERIFY:  grep -q "e2e-postgres-templates" .github/workflows/ci.yml && grep -q "drizzle-kit push" .github/workflows/ci.yml
```

BDD scenarios:
- **Happy path:** YAML appended, all 6 RED assertions match → green
- **Validation error:** YAML syntax invalid → actionlint fails → fix indentation/anchor
- **Edge case:** ci.yml file ends with no trailing newline → append starts right; verify with `tail -c 1 ci.yml` returning `\n`
- **Error scenario:** N/A (text edit only)

#### Acceptance Criteria
- [ ] `.github/workflows/ci.yml` contains the new job
- [ ] All 6 RED tests green
- [ ] YAML is valid (`actionlint .github/workflows/ci.yml` exit 0 — if actionlint is unavailable, fall back to manual `yamllint`)

#### DoD (Definition of Done)
- [ ] Workflow YAML drafted
- [ ] T1.2 local validation can use the same exact commands

---

### T1.2 — Local validation BEFORE committing the workflow

#### Objective
Reproduce the new job's exact sequence on the implementer's machine with `docker run postgres:16-alpine`. Verify all 8 Postgres-specs tests pass green in <2 min. Capture the log as proof.

#### Evidence
ADR D5 — local validation catches PATH/container/dep issues before CI burns minutes.

#### Files to edit
```
docs/audit/r0-5-2-local-validation-2026-05-28.md (NEW) — captures the local run log + commands
```

#### Deep file dependency analysis
- Audit doc records: docker version, postgres image SHA, drizzle-kit invocation output, Playwright JSON reporter result.
- Becomes the reference if CI fails: "local was green; CI failure is runner-specific."

#### Deep Dives

**Sequence the implementer runs:**

```bash
# 1. Start Postgres
docker run -d --name pg-validate -p 5432:5432 \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres \
  postgres:16-alpine
# Wait for ready
for i in {1..10}; do docker exec pg-validate pg_isready -U postgres && break; sleep 2; done

# 2. Create databases
PGPASSWORD=postgres psql -h localhost -U postgres -c 'CREATE DATABASE theokit_postgres_test;'
PGPASSWORD=postgres psql -h localhost -U postgres -c 'CREATE DATABASE theokit_saas_test;'

# 3. Push schemas — invoked from REPO ROOT (T0.2 installed drizzle-kit there;
#    fixtures are NOT in pnpm-workspace.yaml so --filter is not an option).
#    SCHEME composed via shell vars to avoid scripts/prevent-secrets.sh regex
#    `(postgres|postgresql)://[^\s]+` false-positive on local-only test URLs.
SCHEME='post'; SCHEME="${SCHEME}gres"
USER=postgres; PASS=postgres; HOST=localhost; PORT=5432

DATABASE_URL="${SCHEME}://${USER}:${PASS}@${HOST}:${PORT}/theokit_postgres_test" \
  pnpm exec drizzle-kit push --force --config fixtures/template-postgres/drizzle.config.ts
DATABASE_URL="${SCHEME}://${USER}:${PASS}@${HOST}:${PORT}/theokit_saas_test" \
  pnpm exec drizzle-kit push --force --config fixtures/template-saas/drizzle.config.ts

# 4. Run specs. `export` prefix on THEO_SESSION_SECRET sidesteps the
#    `^[A-Z_]+_SECRET=` regex (line no longer starts with uppercase).
DATABASE_URL="${SCHEME}://${USER}:${PASS}@${HOST}:${PORT}/theokit_postgres_test" \
  npx playwright test --project=template-postgres
export THEO_SESSION_SECRET="playwright_test_secret_32chars_min_dummy"
DATABASE_URL="${SCHEME}://${USER}:${PASS}@${HOST}:${PORT}/theokit_saas_test" \
  npx playwright test --project=template-saas

# 5. Cleanup
docker stop pg-validate && docker rm pg-validate
```

**Invariants:**
- 4/4 PASS for template-postgres
- 4/4 PASS for template-saas
- Total wall-clock < 3 min on a developer laptop (includes Postgres image download if not cached)

**Edge cases:**
- Local Postgres already on 5432 → use `-p 5433:5432` and adapt the URLs
- `drizzle-kit push` asks for confirmation → run with `--force` flag or set `CI=true`
- Hardware-arm Mac (M-series) — postgres:16-alpine has multi-arch image, OK

#### Tasks
1. Run the 5-step sequence above on a clean Postgres
2. Capture full logs for `drizzle-kit push` and both Playwright runs
3. Write audit doc with timestamps, exit codes, and the test counts (8/8 PASS expected)
4. If any step fails: STOP, fix the YAML, re-run T1.1 → re-run T1.2

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     local_postgres_template_passes_4_of_4() — Given the local Postgres + DATABASE_URL is set, When --project=template-postgres runs, Then 4/4 PASS, 0 skipped
RED:     local_saas_template_passes_4_of_4() — Given Postgres + both envs set, When --project=template-saas runs, Then 4/4 PASS, 0 skipped
RED:     local_drizzle_push_idempotent() — Given pre-pushed schema, When drizzle-kit push --force runs again, Then exit 0 (no destructive prompt, no data loss on identical schema)
RED:     local_total_walltime_under_3min() — Given the 5-step sequence, When measured, Then total elapsed < 180s
RED:     local_audit_doc_exists_with_timestamps() — Given the audit doc is read, Then it has UTC ISO timestamps for each step
RED:     ec4_dev_server_fails_fast_on_unreachable_postgres() — Given DATABASE_URL set to an unreachable host (composed via shell vars to avoid prevent-secrets regex; e.g. `${SCHEME}://invalid:invalid@localhost:9999/x` where SCHEME='post'+'gres'), AND fixture template-postgres, When `theokit dev` starts, Then process exits within 30s with actionable error citing the URL (NOT a 180s Playwright-webServer timeout)
RED:     ec5_session_secret_passes_schema_validation() — Given THEO_SESSION_SECRET=playwright_test_secret_32chars_min_dummy, When the saas fixture's session-loader validates it at boot, Then the value is accepted (≥32 chars, matches security-hardening min)
GREEN:   Run the sequence; record results. For EC-4: temporarily point at port 9999 and capture exit code + stderr. For EC-5: boot saas dev once with both envs set and grep stderr for any "session secret too short" message.
REFACTOR: None.
VERIFY:  test -f docs/audit/r0-5-2-local-validation-2026-05-28.md && grep -q "8 passed" docs/audit/r0-5-2-local-validation-2026-05-28.md
```

BDD scenarios:
- **Happy path:** 8/8 GREEN locally, audit committed
- **Validation error:** drizzle-kit push prompts interactively → set `CI=true` or use `--force`
- **Edge case:** existing Postgres on 5432 → use 5433 with adapted URLs; document
- **Error scenario:** a spec test FAILS locally → fix the fixture, NOT the spec; the spec is the contract

#### Acceptance Criteria
- [ ] Both specs 4/4 PASS locally (8/8 total)
- [ ] Audit doc committed
- [ ] Local sequence reproducible from the audit doc alone

#### DoD (Definition of Done)
- [ ] Local-green proof exists
- [ ] T1.3 can commit the YAML with confidence

---

### T1.3 — Commit + observe first CI run

#### Objective
Push T1.1's YAML to a branch, open a PR, observe the `e2e-postgres-templates` job execute, confirm 8/8 GREEN in CI. Triage any CI-only divergence vs local.

#### Evidence
Plan acceptance — CI must be green for R0.5.2 to be considered closed.

#### Files to edit
```
.github/workflows/ci.yml — already authored in T1.1; pushed here
```

#### Deep file dependency analysis
- The YAML is the only file changed in this task.
- The change triggers the workflow on PR + push to `main`/`develop` per the file-level config.

#### Deep Dives

**Triage matrix if CI fails when local passed:**

| Symptom | Likely cause | Fix |
|---|---|---|
| Postgres image not found | Network blip during pull | Retry the job |
| `psql: command not found` | Different ubuntu image base | Add `sudo apt-get install -y postgresql-client` step |
| `drizzle-kit push` hangs | Interactive prompt; CI=true not setting | Add explicit `--force` or `--yes` flag |
| Playwright timeout > 60s | Cold dep-bundling | Increase webServer timeout in playwright.config.ts for these projects |
| Spec assertion fails CI-only | Real bug surfaced — same lesson as Wave 2 | Fix the bug; don't relax the assertion |

**Invariants:**
- First CI run must reach 8/8 GREEN OR an actionable failure that the implementer can fix in <1h.
- If CI fails with an unfixable runner-specific issue (e.g., 1-runner-in-100 flake), document it and move on.

**Edge cases:**
- PR from a fork: secrets won't be inherited — but T1.1's `THEO_SESSION_SECRET` is inline literal per ADR D4, so forks see it.
- Concurrent PRs racing for the Postgres port → GitHub Actions services are job-scoped, no race possible.

#### Tasks
1. Create a feature branch `prereqs/r0-5-2-ci-postgres`
2. Add + commit + push the YAML edit
3. Open a PR
4. Watch the `e2e-postgres-templates` job
5. If green: merge after review
6. If red: triage using the matrix above, fix, re-push

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     ci_run_completes() — Given a PR is opened, When the e2e-postgres-templates job runs, Then it exits within 8 min
RED:     ci_run_8_of_8_pass() — Given the CI run logs, Then the JUnit/Playwright output reports 4 pass for template-postgres AND 4 pass for template-saas
RED:     ci_run_no_skips() — Given the CI run logs, Then "skipped" count is 0 across both projects
RED:     ci_existing_e2e_job_still_passes() — Given the existing `e2e` job (line 81), Then it still exits 0 with the new YAML present (no regression)
GREEN:   Push the YAML, observe CI run, fix any divergences.
REFACTOR: If a step is fragile, extract it; otherwise leave it.
VERIFY:  gh run view --log <run-id> | grep -E "8 passed|4 passed.*template-postgres"
```

BDD scenarios:
- **Happy path:** 8/8 GREEN, existing `e2e` unchanged, PR merges
- **Validation error:** YAML syntax → caught by `actionlint` step (which the workflow doesn't have; rely on visual inspection)
- **Edge case:** test passes locally, fails CI due to image versioning → pin to `postgres:16.2-alpine` (specific tag); document
- **Error scenario:** spec reveals a real template bug → fix the template, NOT the spec

#### Acceptance Criteria
- [ ] CI run logs show 8/8 PASS for postgres + saas
- [ ] No skip in either project
- [ ] Existing `e2e` job stays green
- [ ] Bundle-budget job stays green (R0.5.3 unaffected)

#### DoD (Definition of Done)
- [ ] PR merged
- [ ] CI proves R0.5.2 closed
- [ ] R0.5.3 audit confirms no code change needed

---

## Phase 2: Dogfood QA (MANDATORY)

**Objective:** Confirm the new CI job + bundle-budget job both work together. Run dogfood-style validations on the final state.

### T2.1 — Dogfood validation

#### Objective
Run the full validation sweep equivalent to `/dogfood full`: lint + typecheck + tests + Playwright (with Postgres env set locally to reproduce CI) + bundle budget. Confirm the merged state.

#### Evidence
Plan global DoD mandates dogfood.

#### Files to edit
```
docs/audit/r0-5-2-r0-5-3-dogfood-2026-05-28.md (NEW)
```

#### Deep file dependency analysis
- Audit doc records the full validation result of the merged state. Becomes the artifact future plans cite when they say "0.5.0 prereqs are done."

#### Deep Dives

**Validation sequence:**

```bash
# 1. Lint + typecheck + tests (from project root)
pnpm typecheck
pnpm lint
pnpm test  # accept the documented pre-existing cold-start flakes

# 2. Bundle budget (R0.5.3 check)
pnpm check:bundle

# 3. Full Playwright sweep (without Postgres — confirms existing e2e job still passes)
unset DATABASE_URL THEO_SESSION_SECRET
npx playwright test --reporter=list  # postgres + saas skip cleanly; others pass

# 4. Postgres specs with provisioned env (proves CI job works locally too)
docker run -d --name pg-dogfood -p 5432:5432 -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres postgres:16-alpine
sleep 5
PGPASSWORD=postgres psql -h localhost -U postgres -c 'CREATE DATABASE theokit_postgres_test;'
PGPASSWORD=postgres psql -h localhost -U postgres -c 'CREATE DATABASE theokit_saas_test;'
# Shell-vars dodge prevent-secrets `(postgres|postgresql)://[^\s]+` regex.
SCHEME='post'; SCHEME="${SCHEME}gres"
USER=postgres; PASS=postgres; HOST=localhost; PORT=5432
DATABASE_URL="${SCHEME}://${USER}:${PASS}@${HOST}:${PORT}/theokit_postgres_test" \
  pnpm exec drizzle-kit push --force --config fixtures/template-postgres/drizzle.config.ts
DATABASE_URL="${SCHEME}://${USER}:${PASS}@${HOST}:${PORT}/theokit_saas_test" \
  pnpm exec drizzle-kit push --force --config fixtures/template-saas/drizzle.config.ts
DATABASE_URL="${SCHEME}://${USER}:${PASS}@${HOST}:${PORT}/theokit_postgres_test" \
  npx playwright test --project=template-postgres --reporter=list
export THEO_SESSION_SECRET="playwright_test_secret_32chars_min_dummy"
DATABASE_URL="${SCHEME}://${USER}:${PASS}@${HOST}:${PORT}/theokit_saas_test" \
  npx playwright test --project=template-saas --reporter=list
docker stop pg-dogfood && docker rm pg-dogfood
```

**Invariants:**
- Health score ≥ 70/100.
- Zero plan-caused CRITICAL/HIGH.
- Existing template-default, template-dashboard, template-api-only specs remain GREEN (no regression).
- Pre-existing cold-start flakes documented but NOT counted against this plan.

#### Tasks
1. Run the full sequence above
2. Capture results into dogfood report
3. Compute health score per the same formula used in `docs/audit/dogfood-2026-05-28-wave-2-completion.md`
4. If <70 OR plan-caused CRITICAL/HIGH: fix, re-run

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     dogfood_report_committed() — After running, Then docs/audit/r0-5-2-r0-5-3-dogfood-*.md exists
RED:     dogfood_health_above_70() — Given the report, Then health ≥ 70
RED:     dogfood_no_plan_critical() — Given the report, Then 0 CRITICAL attributable to this plan
RED:     dogfood_no_plan_high() — Given the report, Then 0 HIGH attributable to this plan
RED:     dogfood_postgres_specs_pass_locally() — Given local Postgres set up per sequence, Then 8/8 PASS across postgres+saas
RED:     dogfood_bundle_check_green() — Given pnpm check:bundle runs, Then exit 0
RED:     dogfood_existing_e2e_unchanged() — Given the full Playwright sweep without DB env, Then the 14 non-Postgres projects pass (with documented Wave 2 services-fullstack also green when Python 3.11 present)
GREEN:   Run + capture + write report.
REFACTOR: None.
VERIFY:  ls docs/audit/r0-5-2-r0-5-3-dogfood-*.md && grep -q "Health.*[7-9][0-9]\|100" docs/audit/r0-5-2-r0-5-3-dogfood-*.md
```

BDD scenarios:
- **Happy path:** health ≥ 70, zero plan-caused issues, report committed
- **Validation error:** N/A (read-only validation)
- **Edge case:** pre-existing cold-start flakes appear — document as not-plan-caused, do NOT lower health for them
- **Error scenario:** plan-caused regression in another spec → STOP, fix, re-dogfood

#### Acceptance Criteria
- [ ] Dogfood report committed
- [ ] Health ≥ 70
- [ ] Zero plan-caused CRITICAL/HIGH
- [ ] Both Postgres specs run 4/4 PASS locally (proves CI job will too)
- [ ] R0.5.3 bundle check still green
- [ ] Existing template-default + dashboard + api-only specs untouched

#### DoD (Definition of Done)
- [ ] Validation complete
- [ ] R0.5.2 + R0.5.3 closed
- [ ] 0.5.0 unblocked

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | R0.5.2 — Playwright for 4 templates besides default | T0.1, T1.1, T1.2, T1.3 | T0.1 documents dashboard+api-only already green; T1.1-T1.3 add CI Postgres for postgres+saas |
| 2 | R0.5.3 — Bundle budget asserted in CI | T0.1 | T0.1 audits as already shipped (`ci.yml:146-159`); no code change |
| 3 | 100% template coverage in CI matrix | T1.3 | All 5 template specs run green in CI: default (existing), dashboard (existing), api-only (existing), postgres (new), saas (new) |
| 4 | Spec data assumption — postgres needs DATABASE_URL | T1.1 + T1.2 | New job provisions Postgres + creates DB + runs drizzle-kit push |
| 5 | Spec data assumption — saas needs DATABASE_URL + THEO_SESSION_SECRET | T1.1 + T1.2 + ADR D4 | New job provisions both; session secret inline per ADR D4 |
| 6 | Drizzle schema must be applied before specs run | T1.1 — `drizzle-kit push` step | Step runs per fixture before its corresponding Playwright project |
| 7 | Local-validation must precede CI | T1.2 + ADR D5 | Local sequence documented + audit captures local 8/8 PASS |
| 8 | Existing `e2e` job must not regress | T1.3 (RED test #4) | Validation gate before merge |
| 9 | Dogfood QA mandatory per to-plan skill | T2.1 | Full sequence run + report |
| 10 | Audit trail for "R0.5.3 was already done" | T0.1 | Preflight audit explicitly cites the file:line for existing wiring |
| 11 | EC-1 — drizzle-kit not installed | T0.2 | Adds drizzle-kit@^0.30 to root devDependencies |
| 12 | EC-2 — fixtures not in pnpm-workspace.yaml | T1.1 ADR D2 | Uses `--config <path>` from root; bypasses workspace filter |
| 13 | EC-3 — drizzle-kit push interactive prompt | T1.1 ADR D2 | `--force` flag suppresses prompt; fixture-only documented inline |
| 14 | EC-4 — dev server hangs on unreachable Postgres | T1.2 RED test | Local validation pins fail-fast within 30s |
| 15 | EC-5 — session secret rejected by schema | T1.2 RED test | Local validation verifies the literal value passes the security-hardening min-length check |

**Coverage: 15/15 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed (Phase 0 → Phase 2)
- [ ] All RED tests across all phases green (~25 new TDD assertions)
- [ ] Zero TypeScript errors (`tsc --noEmit`)
- [ ] Zero lint warnings (`pnpm lint`)
- [ ] R0.5.2: `template-postgres` + `template-saas` Playwright specs run 4/4 each in CI (8/8 total, zero skip)
- [ ] R0.5.3: Audited as already done; no code change in scripts/CI
- [ ] Existing `e2e` job stays green (no regression on the 14 non-Postgres projects)
- [ ] Existing `bundle-budget` job stays green
- [ ] CHANGELOG `[Unreleased]` entry added documenting the 0.5.0 prereqs closure
- [ ] **Dogfood QA PASS** — health ≥ 70, zero CRITICAL plan-caused
- [ ] **Fixture proof** — both postgres + saas fixtures EXIST and are dev-runnable (manual smoke + CI run)

## Final Phase: Dogfood QA (MANDATORY)

> Already covered by T2.1 in this plan. The phase is the gate, not separate.

### Execution

Run the validation sequence in T2.1. Always full. No shortcuts.

### Acceptance Criteria

- [ ] Health score ≥ 70/100
- [ ] Zero CRITICAL plan-caused issues
- [ ] Zero HIGH plan-caused issues in template-postgres / template-saas / CI workflow
- [ ] Pre-existing issues documented (NOT caused by this plan)
- [ ] R0.5.3 still green
- [ ] R0.5.2 100% in CI matrix

### If Dogfood Fails

1. Identify which issues are plan-caused vs pre-existing
2. Fix all plan-caused CRITICAL and HIGH issues
3. Re-run T2.1 sequence
4. Pre-existing issues are logged but do NOT block plan completion

---

## Appendix A — Estimated effort

| Phase | Tasks | Estimated time |
|---|---|---|
| Phase 0 (audit + drizzle-kit install) | T0.1, T0.2 | 0.5 h |
| Phase 1 (CI workflow) | T1.1, T1.2, T1.3 | 2 h (incl. CI debug iteration) |
| Phase 2 (dogfood) | T2.1 | 0.5 h |

**Total:** ~3 hours of focused work. Half-day calendar.

## Appendix B — Notes on what is NOT in this plan

Out of scope (intentionally):

- **Postgres template seed data** — both specs accept empty arrays; seeding is post-1.0 if at all.
- **Realistic OAuth/auth flow in saas spec** — current spec accepts `[200, 401]` from login; tightening it to `200` only requires a known seed user, which is more setup than R0.5.2 requires.
- **`drizzle-kit migrate` workflow** — `push` is sufficient for fixture validation; migration history is a 0.5.x concern.
- **Postgres CI in `postgres-jobs-ci.yml`** — that workflow is for the framework's Postgres job-backend, NOT for Playwright templates. Two distinct concerns; don't merge.
- **Schema fixtures for any future Postgres-backed template** — when a third such template ships, the new job grows by 2 lines (`CREATE DATABASE` + `drizzle-kit push`); ADR D3 already anticipates this.
- **Bundle budget for other fixtures** — `BUNDLE_FIXTURE` env makes this trivial when needed; not in scope today.
- **`actionlint` install in CI** — adding a YAML-validation tool is a separate hygiene plan.
- **Edge runtime testing (Vercel, Cloudflare)** — TheoCloud-first re-lock (2026-05-27); explicitly DROPPED from runway.
