# Plan: Architecture Review Remediation — TheoKit `packages/theo/src`

> **Version 1.0** — Close all 31 findings from the 2026-05-23 loop-architecture-review report (`architecture-output/final_report.md`): 1 CRITICAL (stale rules doc), 7 HIGH (server/ god folder + executeRoute monster + DRY scanners + startCommand monolith + cache param bags), 14 MEDIUM (DRY duplications + cache adapter ISP), 8 LOW (ambiguous folder + dead code candidates). Strategy: pure mechanical refactors, zero new abstractions, zero public API changes — file moves + helper extractions + options-bag collapses. Outcome: `server/` becomes navigable (10 sub-folders behind unchanged `server/index.ts`), `executeRoute` becomes a 5-stage Pipeline each independently testable, cache module sheds its Singleton + param bags + duplicated stale-check, dead code (`serialization.ts`, identity helpers) gone, CI gates the architecture rules forever via `dependency-cruiser` + `.ls-lint.yml`.

## Context

**What exists today:** The `loop-architecture-review` ran 6 phases on `packages/theo/src/` on 2026-05-23 (`architecture-output/final_report.md` 24 KB + 3 SVGs + 1 ADR). Every phase passed its quality gate first try (scores 0.86-0.92). The graph is healthy (**0 cycles** — ADP satisfied), naming is consistent (kebab-case strict), and 14 of 19 design patterns are correctly applied. But the report surfaced 31 actionable findings concentrated in 3 themes:

1. **server/ god folder** (58 files / 6,582 LOC / 7+ heterogeneous concerns flat at depth 1) — 4 of 7 HIGH findings trace to here.
2. **executeRoute monster** (`server/execute.ts:149` — 301 LOC, 12 positional params, 11 concerns, 4 ESLint rules silenced) — 2 of 7 HIGH findings.
3. **Stale architecture.md rules doc** — declares 7 packages, code has 11. 10 "rule violations" detected by Phase 5 are deliberate composition the doc doesn't acknowledge.

**Evidence:**
- `architecture-output/architecture.db` (SQLite — 11 modules, 16 dependencies, 17 folder observations, 17 principle violations, 19 pattern findings, 5 architectural findings, 0 cycles, 5 quality gates)
- `architecture-output/final_report.md` §"Findings by severity" + §"Top refactor priorities"
- `architecture-output/adr-suggestions/0001-update-architecture-rules-to-current-module-layout.md`

**Why now:** The cache module shipped last session (T1.1-T8.2 of caching-and-revalidation-plan). Its Singleton + DRY duplication + 10-11-param bags are catalogued in the report (PV-5, PV-6, PV-8, PF-3) and should be fixed BEFORE the public API ossifies. The server/ god folder is the structural barrier to every future feature (every new endpoint adds another file to the flat heap). And the architecture.md staleness makes future Phase 5 audits dishonest.

## Objective

`pnpm typecheck && pnpm vitest run && pnpm exec dependency-cruiser packages/theo/src/ --validate && pnpm exec ls-lint` → all green, zero regressions, after every finding in `architecture-output/final_report.md` has been either resolved or explicitly accepted-and-documented.

Specific measurable goals:

1. **0 HIGH findings remain** (was 7) — server/ split, executeRoute Pipeline'd, scan DRY'd, startCommand decomposed, cache param bags collapsed.
2. **0 CRITICAL findings remain** (was 1) — `.claude/rules/architecture.md` updated to v2 reflecting the 11-module reality.
3. **≤ 4 MEDIUM findings remain** (was 14) — the 4 D-distance findings (`config`, `core`, `devtools`, `cache`/`client` near misses) are cosmetic for leaf modules per the report and accepted-as-documented.
4. **Cache module hardened** — Singleton → param injection (mirroring `defineCachedFunction`'s proven shape), DRY tryReadCached centralized in engine, ISP split (hot-path 4 methods + admin 4 methods).
5. **CI enforces architecture forever** — `dependency-cruiser.cjs` config + `.ls-lint.yml` + GitHub Actions workflow. Future violations fail PR build, not just audit reports.
6. **Zero public API changes** — every `theokit/server` export keeps its name + signature. Internal moves are invisible to consumers.
7. **`tsc --noEmit` clean** + `pnpm vitest run` 100% pass + `pnpm exec dependency-cruiser --validate` 0 violations + `/dogfood full` health ≥ 70.

## ADRs

### D1 — File moves, not new abstractions

- **Decision:** Every server/ split task is a pure `git mv` followed by a re-export from the new sub-folder's `index.ts`, which is itself re-exported from `server/index.ts`. NO new classes, NO new interfaces, NO new factories.
- **Rationale:** Phase 2 + Phase 3 of the audit explicitly flagged the god folder as a *grouping* problem, not a *missing abstraction* problem. Adding a `ServerRuntimeFacade` class would inflate complexity for a purely structural fix. The Phase 4 patterns audit confirms TheoKit's `define*` family is correctly minimal (identity helpers for type inference) — don't break that pattern.
- **Consequences:** zero behavior change, zero public API change, zero test changes (tests still import from `packages/theo/src/server/...`). Imports inside the codebase update mechanically via TypeScript path resolution.

### D2 — executeRoute Pipeline as composed stages, not a class

- **Decision:** Refactor `executeRoute` (301 LOC, 12 params) into 5 stage functions composed by a tiny `runStages([s1, s2, ...])(ctx)` helper. Each stage receives a typed `RequestPipelineCtx` and returns `Promise<RequestPipelineCtx | Response>` (early-return short-circuits the rest). No `Pipeline` class, no `Stage` interface — just function composition.
- **Rationale:** Phase 4 flagged Pipeline as the missing pattern (PF-19, medium). The pattern is correct; the implementation should match TheoKit's functional-composition aesthetic. Mirrors how `plugin-runner.ts` Chain of Responsibility was implemented (also correctly applied per Phase 4 PF-2). Each stage testable in isolation collapses the 12-param facade into one ctx object (D3).
- **Consequences:** `executeRoute` shrinks to ~30 LOC orchestration. CSRF, transformer headers, body parse, Zod validate, plugin onRequest, handler invoke, response serialize, plugin onResponse each become independently testable. Net LOC roughly flat (stages still need to exist).

### D3 — Options bags over 4+ positional params

- **Decision:** Any function with > 4 positional params becomes a function taking one `Ctx` or `Options` object. Applies to `executeRoute`, `persistAndReturn`, `scheduleRouteRevalidate`, `sendError`, internal helpers.
- **Rationale:** Robert Martin's *Clean Code* (consensus): ≤ 4 params. The Phase 3 audit caught 4 functions violating this (PV-2 12 params, PV-6 10+11 params, PV-17 7 params). Options bags also make refactoring safe — adding a new field doesn't reorder existing call sites.
- **Consequences:** Slightly more verbose at the call site (`fn({ a, b, c })` vs `fn(a, b, c)`), but TypeScript autocomplete makes this a net win. All renames safe.

### D4 — Cache engine canonical, route wrapper delegates

- **Decision:** `cache-engine.ts` owns the `tryReadCached(key, opts)` logic — staleness, version check, JSON parse, clock-skew clamp, validate. The route wrapper (`define-cached-route.ts`) calls `engine.tryReadCached(...)` instead of reimplementing the same logic.
- **Rationale:** Phase 3 PV-5 (medium DRY) — the duplication is real, ~30 LOC duplicated. Engine is the source of truth; the wrapper should be a thin presentation layer.
- **Consequences:** Surface area of `CacheEngine` grows by one method (`tryReadCached` becomes public, was private). Acceptable — the route wrapper IS a first-class consumer of the engine.

### D5 — Cache storage adapter split: Hot + Admin

- **Decision:** Split `CacheStorageAdapter` (8 methods) into `CacheStore` (hot path: `get`, `set`, `delete`, `deleteByTag` — 4 methods) and `CacheStoreAdmin` (admin: `size`, `clear`, `keys`, `inspect?` — 3-4 methods). Implementations can declare both or just the hot interface.
- **Rationale:** Phase 3 PV-8 (ISP, medium). The hot path needs 4 methods on every request; the admin methods are dev-tooling + tests. A user writing a Redis adapter must today implement all 8 even if they never call `keys()`. The ISP split makes the contract honest.
- **Consequences:** `InMemoryCacheAdapter` implements both. Public type `CacheStorageAdapter = CacheStore & CacheStoreAdmin` for backward compat. New adapter authors can pick the lighter interface. No call site change.

### D6 — Singleton bootstrap-only; per-call engine injection

- **Decision:** `defineCachedRoute` accepts `engine` as first arg (matching `defineCachedFunction` — already proven). Keep `initCacheEngine` + `getCacheEngine` for the framework bootstrap convenience, but `defineCachedRoute` no longer reaches into the module-level singleton.
- **Rationale:** Phase 4 PF-3 (Singleton misapplied) — the module-level `let _engine` is a classic Singleton smell. `defineCachedFunction` already shows the DIP-correct shape (param injection). Aligning the route wrapper to the same shape removes the asymmetry.
- **Consequences:** Existing code calling `defineCachedRoute({ cache, handler })` (no engine arg) gets a deprecation warning + falls back to `getCacheEngine()`. After one minor version, the engine arg becomes required. Tests get easier (no `_resetCacheEngine` needed between tests).

### D7 — Update architecture.md, don't restructure code

- **Decision:** Update `.claude/rules/architecture.md` to v2 acknowledging the 11-module reality + 16 deliberate edges (cli → server weight 20, vite-plugin → server weight 24, etc.). Keep "0 cycles" + "core depends on nothing" as invariants.
- **Rationale:** Phase 5 AF-2 (critical, but framing is what matters): the doc is stale, the code is healthy (acyclic, layered DAG). Restructuring 11 healthy modules to honor a stale doc would be reversing the source of truth. ADR-0001 already drafted in `architecture-output/adr-suggestions/`.
- **Consequences:** Doc-only change. Future Phase 5 audits run against accurate rules. `dependency-cruiser.cjs` (added in Phase 1 of this plan) encodes the v2 rules for CI enforcement.

### D8 — Enforce architecture via CI, not vibes

- **Decision:** Add `.dependency-cruiser.cjs` + `.ls-lint.yml` + a GitHub Actions step that runs both on every PR. Violations of architecture.md v2 or naming convention fail the build.
- **Rationale:** Phase 2 + Phase 5 caught issues that humans missed for months (stale doc + scan duplication). Encoding the rules in CI makes recurrence impossible.
- **Consequences:** PRs that introduce a cycle, depend in the wrong direction, or use mixed casing fail before review. Onboarding gets easier — the tools enforce the conventions a new contributor would otherwise have to learn from `architecture.md`.

### D9 — Dead code: delete with confidence, not deprecate

- **Decision:** `serialization.ts` (suspected dead post-transformer rollout — PF-17), `start.ts:149` identity helper (PV-14), inline predicates in `tryCacheResponse` (PV-15) — if grep confirms zero consumers, DELETE. No `// @deprecated` cycle.
- **Rationale:** TheoKit is pre-1.0; backward compat for internal helpers is not a constraint. The Phase 3 audit caught these because they had no consumers — keeping them around is the opposite of YAGNI.
- **Consequences:** Bundle shrinks marginally. Any future code wanting equivalent behavior must explicitly opt into a transformer / use the canonical helper.

## Dependency Graph

```
Phase 0 (docs)
   │
   ▼
Phase 1 (CI guards) ──────┐
   │                      │
   ▼                      │
Phase 2 (server/ split)   │  guards now enforce v2 rules
   │                      │
   ├──▶ Phase 3 (DRY)     │
   │                      │
   ├──▶ Phase 4 (cache)   │
   │                      │
   ├──▶ Phase 5 (Pipeline)│   ◄── depends on Phase 2 (new paths)
   │                      │
   └──▶ Phase 6 (cleanups)│
                          ▼
                    Phase 7 (Dogfood QA — MANDATORY)
```

**Sequential blockers:** Phase 0 → 1 → 2 form the doc/tooling/structural spine. Phase 5 depends on Phase 2 (file paths change for `execute.ts`). Phase 7 (dogfood) depends on all prior.

**Parallel-eligible:** Phases 3 (except T3.4), 4, 6 are independent module-wise (different files) and can run in parallel after Phase 2 lands. In a one-person workflow, run sequentially in priority order: 3.1-3.3 → 4 → 5 → 3.4 → 6.

**EC-1 (edge-case review) override:** **T3.4 (execute.ts catch-branch DRY) must run AFTER T5.1 (Pipeline)** because the Pipeline refactor may obsolete the 4 catch blocks (each stage gets its own try/catch, or `runStages` wraps once). Original ordering would create merge conflicts in `execute.ts` between T3.4 and T5.1. New order:

```
Phase 0 → 1 → 2 → 3.1, 3.2, 3.3 (parallel) → 4 → 5 → 3.4 → 6 → 7
```

---

## Phase 0: Documentation alignment

**Objective:** Close the CRITICAL finding (AF-2) + one LOW (ambiguous folder name) before any code refactor. Pure doc + filesystem moves, zero behavior change.

### T0.1 — Update `.claude/rules/architecture.md` to v2 (11-module reality)

#### Objective
Replace the stale 7-package dependency-direction declaration with the actual 11-module DAG, keeping "0 cycles" + "core depends on nothing" as invariants. Addresses AF-2 critical + unblocks honest Phase 5 audits forever.

#### Evidence
- `architecture-output/final_report.md` §"Critical (1) AF-2"
- `architecture-output/adr-suggestions/0001-update-architecture-rules-to-current-module-layout.md` (already drafted, MADR 3.0 format, status `proposed`)
- DB query: `architectural_findings WHERE suggests_adr=1` returns the AF-2 row

#### Files to edit
```
.claude/rules/architecture.md — replace dependency direction section; add 11-module map + 16-edge allowlist
architecture-output/adr-suggestions/0001-update-architecture-rules-to-current-module-layout.md — promote status from "proposed" to "accepted" once landed
```

#### Deep file dependency analysis
- `.claude/rules/architecture.md` (MODIFY): the only consumer is humans (and future architecture audits). No code parses this file. Phase 5 cited it via grep.
- `adr-suggestions/0001-*.md` (MODIFY): MADR convention — proposed ADRs that get accepted move to `docs/adr/NNNN-*.md` per project convention. Verify TheoKit has an `docs/adr/` dir or settle on a single location.

#### Deep Dives

**Current rules (the stale 7):**
```
@theo/core          → (nothing)
@theo/router        → @theo/core
@theo/server        → @theo/core
@theo/client        → @theo/core
@theo/vite-plugin   → @theo/core, @theo/router
@theo/cli           → @theo/core, @theo/vite-plugin
@theo/create-theo   → (nothing — standalone)
```

**Reality (11 modules + 16 edges, all acyclic):**
```
core           → (nothing)                                  [INVARIANT]
config         → core
cache          → core
router         → core
client         → core
adapters       → core, router
react-query    → client
server         → core, cache, config, devtools (defining)
vite-plugin    → core, router, server, config, devtools
cli            → core, vite-plugin, server, config, router, adapters
devtools       → (nothing internal — leaf, dev-only)
```

**Invariants to preserve:**
- `core` depends on NOTHING (Layer 0). Verifiable via `dependency-cruiser` rule.
- ZERO cycles, ever (Acyclic Dependencies Principle, consensus).
- `react-query`, `devtools`, `adapters/*-shim` are leaf-style — they can be consumed but should not consume framework internals.
- Public-API barrels (`server/index.ts`, `client/index.ts`, etc.) are the only legitimate cross-module import surface — never reach into `server/_internal/`.

**Edge cases:**
- `server → cache` (weight 11) — `server/index.ts` re-exports cache primitives. Direction is correct: server is the consumer-facing barrel, cache is the implementation. (NOT `cache → server`.)
- `server → devtools` (weight 1) — server emits broadcast events; devtools listens. Direction is correct (server emits, devtools observes).
- `cli → adapters` (weight 9) — `cli/commands/build.ts --target` switches on adapter targets. Direction is correct.

#### Tasks
1. Read current `.claude/rules/architecture.md` to understand existing format/style.
2. Read `architecture-output/adr-suggestions/0001-update-architecture-rules-to-current-module-layout.md` (the proposed change).
3. Apply the ADR's recommendation to `.claude/rules/architecture.md`. Replace the "Dependency Direction" section. Keep all other sections (Prohibitions, Application Structure) unchanged.
4. Add a new "Module Map (v2 — 2026-05-23)" section listing the 11 modules with their kind (layer / feature / adapter / shared).
5. Promote the ADR status from `proposed` to `accepted` once landed. Move file to `docs/adr/0001-*.md` if that directory exists; otherwise keep in `architecture-output/adr-suggestions/` and note the path in CHANGELOG.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_architecture_rules_has_module_map() — Given .claude/rules/architecture.md, When grep "## Module Map", Then header is present
RED:     test_architecture_rules_lists_all_11_modules() — Given file content, When grep for each module name (core, config, cache, ...), Then all 11 names found in the Module Map section
RED:     test_architecture_rules_keeps_acyclic_invariant() — Given file content, When grep "Acyclic Dependencies" OR "0 cycles" OR "cycles MUST be 0", Then at least one match
RED:     test_architecture_rules_keeps_core_invariant() — Given file content, When grep "core.*depends on (nothing|none|no other)", Then match (regex case-insensitive)
RED (EDGE): test_architecture_rules_removed_stale_7_package_list() — Given file content, When grep "@theo/create-theo", Then no match in the dependency-direction section (it's a standalone scaffold, not part of the 11-module DAG)
RED (ERROR): test_architecture_rules_file_exists() — Given repo, When stat .claude/rules/architecture.md, Then file exists + is not empty
RED (EC-6): test_adr_lives_in_canonical_dir() — Given docs/adr/ exists, Then ADR-0001 moves to docs/adr/0001-*.md. Else stays in architecture-output/adr-suggestions/ + redirect note added to CLAUDE.md. Either decision tested but ONE must be made.
GREEN:   Apply the ADR-0001 changes verbatim.
REFACTOR: Format with prettier if .md is in the prettier scope.
VERIFY:  npx vitest run tests/unit/architecture-rules-v2.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** Module Map section present with all 11 names.
- **Validation error:** Stale "@theo/create-theo → nothing" line gone from dependency-direction.
- **Edge case:** Both invariants ("0 cycles", "core depends on nothing") still asserted.
- **Error scenario:** File exists + non-empty (catches accidental deletion).

#### Acceptance Criteria
- [ ] 6 RED tests pass GREEN
- [ ] `.claude/rules/architecture.md` has "## Module Map (v2)" header
- [ ] All 11 module names appear in the new section
- [ ] ADP invariant + core invariant both explicitly stated
- [ ] ADR-0001 status moves from `proposed` to `accepted`
- [ ] Zero TS errors (doc-only change — should be trivially true)
- [ ] Pass: `pnpm vitest run`

#### DoD
- [ ] All 6 unit tests green
- [ ] Doc reviewed by 1 other contributor (or self-review with diff)
- [ ] No breaking change to any imported file (purely documentation)

---

### T0.2 — Rename `cli/lib/` → `cli/cleanup/`

#### Objective
Resolve the LOW ambiguous-naming finding (FO-7). `lib/` is a generic name with no semantic meaning; the 2 files inside are both cleanup utilities (`gc-agent-registry.ts` + similar).

#### Evidence
- `architecture-output/final_report.md` §"Low" + §"Findings by dimension > Structure" — FO-7 entry
- Phase 2 quality-evaluator note: "preventive rename — only 2 files, no real harm yet"

#### Files to edit
```
packages/theo/src/cli/lib/ — rename folder to packages/theo/src/cli/cleanup/
packages/theo/src/cli/lib/*.ts — files move with the folder rename
packages/theo/src/cli/* — any file importing from cli/lib/ updates import path
```

#### Deep file dependency analysis
- Folder rename touches all files inside (currently 2 per the audit). Use `git mv` to preserve history.
- Import sites: grep `cli/lib` across `packages/theo/src/cli/` and update. Should be ≤ 5 sites.
- No external consumer of `cli/lib/` (cli is the bin, not exported).

#### Deep Dives

**Pre-state:**
```
packages/theo/src/cli/lib/
  gc-agent-registry.ts        — LRU cleanup of .theokit/agents/*
  (possibly one more file)
```

**Post-state:**
```
packages/theo/src/cli/cleanup/
  gc-agent-registry.ts
  index.ts                     — barrel re-export
```

**Invariants:**
- Zero behavior change (rename only).
- All imports updated atomically — no stale `cli/lib/` references after the rename.

**Edge case:** if a file outside `cli/` somehow imports from `cli/lib/` (shouldn't but verify), update it too.

#### Tasks
1. Inventory: `find packages/theo/src/cli/lib -type f` to list files.
2. Grep import sites: `grep -rln "cli/lib" packages/theo/src/`.
3. `git mv packages/theo/src/cli/lib packages/theo/src/cli/cleanup`.
4. Update import paths in every site found in step 2 (sed or manual).
5. Add `packages/theo/src/cli/cleanup/index.ts` if not already present (barrel re-export of the files inside).
6. Run `pnpm typecheck` to catch missed imports.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_cli_cleanup_folder_exists() — Given repo, When stat packages/theo/src/cli/cleanup, Then directory exists
RED:     test_cli_lib_folder_gone() — Given repo, When stat packages/theo/src/cli/lib, Then ENOENT (folder removed)
RED:     test_no_stale_cli_lib_imports() — Given grep "cli/lib" in packages/theo/src/, Then zero matches
RED (EDGE): test_cli_cleanup_has_barrel_export() — Given packages/theo/src/cli/cleanup/index.ts, Then file exists + non-empty
RED (ERROR): test_typecheck_clean_after_rename() — Given pnpm typecheck, Then exit 0 (no type errors from broken imports)
RED (EC-7): test_cli_lib_files_all_moved() — Given `ls packages/theo/src/cli/lib/` before rename returned N files, When rename done, Then `ls packages/theo/src/cli/cleanup/` returns the SAME N filenames (catches inventory drift since the audit — audit said 2, verify before assuming)
GREEN:   git mv + sed-update import sites + add barrel.
REFACTOR: None.
VERIFY:  npx vitest run tests/unit/cli-cleanup-rename.test.ts && pnpm typecheck
```

**BDD scenarios obrigatórios:**
- **Happy path:** new folder exists, old folder gone.
- **Validation error:** zero stale `cli/lib` import strings anywhere.
- **Edge case:** barrel `index.ts` present.
- **Error scenario:** typecheck still clean (catches broken imports).

#### Acceptance Criteria
- [ ] 5 RED tests pass GREEN
- [ ] `cli/lib/` directory removed; `cli/cleanup/` exists
- [ ] Zero stale `cli/lib` references in any file
- [ ] `pnpm typecheck` clean
- [ ] Git history preserved via `git mv`

#### DoD
- [ ] All tests green
- [ ] Zero TS/lint warnings
- [ ] Manual: `pnpm dev` in `fixtures/template-default` boots without error

---

## Phase 1: CI architecture guards

**Objective:** Encode the v2 architecture rules + naming convention into CI tooling so future regressions fail PR builds. Single task, foundational for every subsequent phase.

### T1.1 — Add `dependency-cruiser` config + `.ls-lint.yml` + CI workflow

#### Objective
Enforce `.claude/rules/architecture.md` v2 + kebab-case filename convention in every PR. Adds 3 new tooling files + 1 CI step. Addresses Naming (Phase 2 PASS preventive) + AF-2 follow-up (encode the rules forever).

#### Evidence
- `architecture-output/final_report.md` §"Findings by dimension > Naming" — "add .ls-lint.yml to CI as cheap insurance against future drift"
- §"Top refactor priorities P1" — "update doc-only; unlocks honest Phase 5 audits going forward"
- `dependency-cruiser` already detected as available locally during Phase 1 setup

#### Files to edit
```
.dependency-cruiser.cjs (NEW) — encode the 11-module + 16-edge rules from architecture.md v2
.ls-lint.yml (NEW) — filename naming convention (kebab-case for .ts; PascalCase for .tsx React components; camelCase for hooks/use-*.ts)
.github/workflows/architecture-guards.yml (NEW) — GitHub Action that runs both on every PR
package.json — add scripts: "check:deps": "dependency-cruiser packages/theo/src/", "check:naming": "ls-lint"
```

#### Deep file dependency analysis
- `.dependency-cruiser.cjs` (NEW): CommonJS config (dep-cruiser expects CJS). Reads no other files; consumed by CLI.
- `.ls-lint.yml` (NEW): YAML config for `@ls-lint/ls-lint` package. Consumed by CLI.
- `.github/workflows/architecture-guards.yml` (NEW): runs on `pull_request`. Cached by Actions.
- `package.json` (MODIFY): two new script entries + 2 devDependencies (`dependency-cruiser` already present per Phase 1; add `@ls-lint/ls-lint`).

#### Deep Dives

**`.dependency-cruiser.cjs` skeleton:**
```js
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-depends-on-nothing',
      severity: 'error',
      from: { path: '^packages/theo/src/core' },
      to: { path: '^packages/theo/src/(?!core)' },
    },
    {
      name: 'feature-modules-respect-direction',
      severity: 'error',
      from: { path: '^packages/theo/src/cache' },
      to: { path: '^packages/theo/src/(server|cli|vite-plugin)' },
    },
    // ... per the v2 module map
  ],
  options: {
    tsConfig: { fileName: 'packages/theo/tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.test\\.tsx?$' },
  },
}
```

**`.ls-lint.yml` skeleton:**
```yaml
ls:
  packages/theo/src:
    .ts: kebab-case | regex:[a-z][a-z0-9-]*\\.(d|test)
    .tsx: PascalCase | regex:use[A-Z][A-Za-z0-9]*  # hooks
  packages/theo/src/devtools:
    .tsx: PascalCase
  packages/theo/src/cli/commands:
    .ts: kebab-case

ignore:
  - packages/theo/dist
  - packages/theo/node_modules
```

**`.github/workflows/architecture-guards.yml` skeleton:**
```yaml
name: architecture-guards
on:
  pull_request:
    paths: ['packages/theo/src/**', '.dependency-cruiser.cjs', '.ls-lint.yml']
jobs:
  guards:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm check:deps
      - run: pnpm check:naming
```

**Invariants:**
- Both checks run on every PR touching `packages/theo/src/`.
- A cycle, a forbidden direction, or a mis-cased filename FAILS the build.
- The rules are derived from `.claude/rules/architecture.md` v2 (the source of truth).

**Edge cases:**
- `useDrag.ts` (camelCase React hook) — `.ls-lint.yml` regex allows `use[A-Z]...`.
- `Panel.tsx` (PascalCase React component) — separate `.tsx` rule.
- Test files (`*.test.ts`) — excluded from kebab-case (they may include camelCase suite names).

#### Tasks
0. **EC-2 fix (MUST):** BEFORE writing the strict config, run `pnpm exec dependency-cruiser packages/theo/src/ --output-type err --no-config` to capture the baseline. If output reports violations against the v2 rules (e.g., a forbidden cross-module import survived), DECIDE: (a) reflect reality in the config (start permissive, tighten later) OR (b) create T1.2 "fix N violations" as prerequisite. Document the decision in the commit message.
1. Run current `dependency-cruiser packages/theo/src/` baseline to capture today's edges.
2. Write `.dependency-cruiser.cjs` encoding v2 rules from architecture.md.
3. Write `.ls-lint.yml` with kebab/PascalCase/camelCase regex rules.
4. Write `.github/workflows/architecture-guards.yml`.
5. Add `check:deps` + `check:naming` scripts to root `package.json`.
6. Add `@ls-lint/ls-lint` to devDependencies via `pnpm add -DW @ls-lint/ls-lint`.
7. Run both checks locally — they MUST PASS today (else there's a real violation the audit missed).
8. Open PR to verify CI fires the workflow.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_dependency_cruiser_config_present() — Given repo, When stat .dependency-cruiser.cjs, Then file exists
RED:     test_ls_lint_config_present() — Given repo, When stat .ls-lint.yml, Then file exists
RED:     test_ci_workflow_present() — Given repo, When stat .github/workflows/architecture-guards.yml, Then file exists
RED:     test_check_deps_script() — Given package.json, When parsed, Then scripts.check:deps is defined
RED:     test_check_deps_passes_today() — Given current src, When run "pnpm check:deps", Then exit 0
RED:     test_check_naming_passes_today() — Given current src, When run "pnpm check:naming", Then exit 0
RED (EDGE): test_react_hook_naming_allowed() — Given a .ts file named "useFoo.ts", When ls-lint runs, Then no violation
RED (EDGE): test_kebab_case_enforced() — Given a mock .ts file "FooBar.ts" temporarily added, When ls-lint runs, Then violation reported (DELETE the mock after verifying)
RED (ERROR): test_cycle_introduction_blocked() — Given a temp file that creates cache → server import, When dep-cruiser runs, Then "no-circular" rule fires (DELETE temp after)
RED (EC-2): test_dep_cruiser_baseline_passes() — Given current packages/theo/src/, When `pnpm check:deps` runs, Then exit 0 (config MUST match reality OR explicit T1.2 task is open with N violations listed)
RED (EC-8): test_ls_lint_accepts_react_hook_naming() — Given a mock file `tests/fixtures/_lint-check/useFoo.ts`, When `pnpm exec ls-lint --config .ls-lint.yml`, Then exit 0 (verify ls-lint regex syntax handles camelCase use-hook pattern)
GREEN:   Write all 3 config files + 2 package.json scripts.
REFACTOR: None.
VERIFY:  pnpm check:deps && pnpm check:naming && pnpm vitest run tests/unit/architecture-guards-ci.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** both checks pass on current source.
- **Validation error:** mis-cased filename + cyclic dep are both rejected.
- **Edge case:** React hooks (`useDrag.ts`) and components (`Panel.tsx`) properly exempted from strict kebab.
- **Error scenario:** missing config files (catches accidental deletion in CI).

#### Acceptance Criteria
- [ ] 9 RED tests pass GREEN
- [ ] `.dependency-cruiser.cjs`, `.ls-lint.yml`, `.github/workflows/architecture-guards.yml` all exist
- [ ] `pnpm check:deps` exits 0 on current `packages/theo/src/`
- [ ] `pnpm check:naming` exits 0
- [ ] PR opened to verify CI workflow runs (manual verification step)
- [ ] Zero new lint warnings

#### DoD
- [ ] All tests green
- [ ] CI workflow visible in GitHub Actions tab
- [ ] Documented in `docs/concepts/architecture-ci.md` (NEW — brief, < 1 page) so future contributors know the guards exist

---

## Phase 2: `server/` god folder split (P0)

**Objective:** Resolve FO-1, FO-2, PV-1 (3 of 7 HIGH findings) via pure file moves into 10 thematic sub-folders, re-exported from `server/index.ts` so external consumers see zero change.

### T2.1 — Reorganize `server/` into 10 thematic sub-folders

#### Objective
Move all 57 files in `server/` into thematic sub-folders matching their actor cluster. Re-export everything from `server/index.ts` so `theokit/server` consumers see no API change.

#### Evidence
- `architecture-output/final_report.md` §"High (7) FO-1 + FO-2 + PV-1"
- DB: 3 findings tagged `module_id=10` with severity HIGH, all rooted in the god folder
- Top refactor priority P0: "Removes 4 of 7 high-severity findings in one pass. Effort 1-2 days."

#### Files to edit
```
packages/theo/src/server/ — REORGANIZE the entire folder:

Pre-state: 57 files flat at depth 1

Post-state:
  server/
    index.ts                         — re-exports everything (zero API change)
    http/
      execute.ts
      api-middleware.ts
      middleware-runner.ts
      response.ts
      cors.ts
      cookies.ts
      index.ts                       — barrel
    define/
      define-route.ts
      define-action.ts
      define-middleware.ts
      define-agent-endpoint.ts
      define-agent-tool.ts
      define-websocket.ts
      define-channel.ts
      define-plugin.ts
      index.ts                       — barrel
    scan/
      scan.ts                        — routes
      action-scan.ts
      ws-scan.ts
      middleware-scan.ts
      match.ts
      manifest.ts
      module-loader.ts
      index.ts                       — barrel
    auth/
      auth.ts
      session.ts
      crypto.ts
      nonce.ts
      auth-totp.ts
      auth-backup-codes.ts
      auth-throttle.ts
      oauth-pkce.ts
      oauth-state.ts
      oidc-discovery.ts
      index.ts                       — barrel
    security/
      security-headers.ts
      csp-report.ts
      csrf.ts                        (if it's a separate file)
      index.ts                       — barrel
    rate-limit/
      rate-limit.ts
      rate-limit-store.ts
      rate-limit-per-route.ts
      index.ts                       — barrel
    realtime/
      define-websocket.ts            (if not in define/)
      define-channel.ts              (if not in define/)
      channel-manager.ts
      index.ts                       — barrel
    agent/
      stream-agent-run.ts
      create-conversation-history.ts
      agent-types.ts
      agent-stream-core.ts
      index.ts                       — barrel
    plugins/
      plugin-runner.ts
      load-plugins.ts
      define-plugin.ts               (if not in define/)
      index.ts                       — barrel
    observability/
      logger.ts
      audit-log.ts
      suggest.ts
      index.ts                       — barrel
    body-parser.ts                   — stays at server/ root (foundational)
    serialization.ts                 — to be audited in Phase 6 (likely dead)
    transformer.ts                   — stays
    plugin-types.ts                  — stays (pure types)
    _internal/                       — stays (lonely-but-defensible)
```

(Final list: ~14 files at server/ root + 10 sub-folders each with their own index.ts barrel.)

#### Deep file dependency analysis

- `server/index.ts` (MAJOR REWRITE): becomes a thin barrel — only re-exports from sub-folders. Loses ~80% of its current line count (no more direct imports).
- Every file inside `server/*.ts` (MOVE): `git mv` to its new home. Internal imports between server/* files break and must be updated.
- Downstream consumers (`tests/`, `examples/`, `fixtures/`, `apps/`): they import from `theokit/server`. ZERO change for them — `server/index.ts` re-exports same names.
- Internal cross-module imports: `vite-plugin/*.ts`, `cli/commands/*.ts` reaching into `server/<file>.ts` directly — these may need path updates, OR they should go through the public barrel.

#### Deep Dives

**Move strategy:**
1. Create the 10 sub-folders + their `index.ts` barrels FIRST (empty barrels initially).
2. Move files in batches by sub-folder (each batch = one commit).
3. After EACH batch: run `pnpm typecheck` + `pnpm vitest run` to catch broken imports immediately.
4. Update intra-server cross-folder imports as they break.
5. After ALL moves: rewrite `server/index.ts` to re-export from the 10 barrels.
6. Final verification: `pnpm typecheck && pnpm vitest run && pnpm exec dependency-cruiser packages/theo/src/ --validate` ALL green.

**Invariants:**
- Public API surface unchanged. Every export from `theokit/server` keeps its name + signature.
- Zero behavior change. This is a structural refactor, not a feature.
- Internal cross-folder imports go through barrels (`from '../auth/index.js'`), NOT direct file imports (`from '../auth/session.js'`) — keeps the structure mockable.
- `server/_internal/` keeps its lonely-folder status — it's intentional (private + tooling).

**Edge cases:**
- A file fits 2 buckets (e.g., `define-websocket.ts` is both `define/` and `realtime/`). Decision: put in `define/` (the DSL is the user-facing layer), re-export from `realtime/` barrel if convenient.
- Circular import introduced by the split? `dependency-cruiser --validate` catches it. If it happens, extract shared types into `server/_internal/types.ts`.
- A test file imports from `server/execute.ts` directly (not `theokit/server`)? Update the test to import from `theokit/server` (or from the new path `server/http/execute.ts`).

**File-to-bucket mapping rationale (Phase 3 mixed_concerns finding listed 7 sub-domains; this plan refines to 10):**

| Bucket | Files | Rationale |
|---|---|---|
| `http/` | execute, api-middleware, middleware-runner, response, cors, cookies | HTTP request/response plumbing |
| `define/` | define-{route, action, middleware, agent-endpoint, agent-tool, websocket, channel, plugin} | User-facing DSL (identity helpers) |
| `scan/` | scan, action-scan, ws-scan, middleware-scan, match, manifest, module-loader | Filesystem scan + dispatch infrastructure |
| `auth/` | auth, session, crypto, nonce, totp, backup-codes, throttle, oauth-pkce, oauth-state, oidc-discovery | Authentication + cryptography |
| `security/` | security-headers, csp-report, csrf | HTTP security headers + CSRF |
| `rate-limit/` | rate-limit, rate-limit-store, rate-limit-per-route | Rate limiting subsystem |
| `realtime/` | channel-manager (define-{ws, channel} re-exported here) | WebSocket + Channels runtime |
| `agent/` | stream-agent-run, create-conversation-history, agent-types, agent-stream-core | Agent runtime |
| `plugins/` | plugin-runner, load-plugins | Plugin system runtime |
| `observability/` | logger, audit-log, suggest | Logging + audit + diagnostics |
| (root) | body-parser, serialization, transformer, plugin-types, _internal/ | Foundational utilities + private |

#### Tasks
0. **EC-3 + EC-4 fix (MUST):** BEFORE touching files, run two safety greps:
   - `grep -rln "from.*packages/theo/src/server/[a-z-]*\\.js" tests/ examples/ fixtures/` — enumerate ALL deep-import sites (not via `theokit/server` barrel). Update them atomically as part of T2.1 (don't defer to follow-up task).
   - Inspect `packages/theo/package.json` `exports` field — confirm NO key exposes an internal server path like `./server/scan`. If any does, either update the exports map OR reject splitting that file.
   Document both greps in commit message; if either returns ≥1 hit, expand T2.1 scope accordingly.
1. Audit current `server/` files: `ls packages/theo/src/server/*.ts` + categorize per the mapping table.
2. Create the 10 sub-folders + empty `index.ts` barrels.
3. Batch 1: move `http/` files. Update intra-`server/` imports. `pnpm typecheck` + `pnpm vitest run`.
4. Batch 2: move `define/` files. Same verification.
5. Batches 3-10: same pattern for `scan/`, `auth/`, `security/`, `rate-limit/`, `realtime/`, `agent/`, `plugins/`, `observability/`.
6. Rewrite `server/index.ts` to re-export from all 10 barrels. Keep the same export names — diff should be import-path-only.
7. Run `pnpm exec dependency-cruiser packages/theo/src/ --validate` — must report 0 cycles.
8. Update `architecture-output/architecture.db` modules table: `server` LOC should now be split internally (no DB change actually — module is still one folder for the audit).

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_server_has_10_subfolders() — Given packages/theo/src/server, When ls -d */, Then 10 directories found matching {http,define,scan,auth,security,rate-limit,realtime,agent,plugins,observability}
RED:     test_server_index_reexports_all_define_helpers() — Given packages/theo/src/server/index.ts, When parsed, Then exports defineRoute, defineAction, defineMiddleware, defineAgentEndpoint, defineAgentTool, defineWebSocket, defineChannel, defineCachedRoute, defineCachedFunction
RED:     test_server_index_reexports_auth_helpers() — Given index.ts, When grep, Then exports requireAuth, createSessionManager, generateTotp, generateBackupCodes, generatePkceChallenge, etc.
RED:     test_no_cycles_after_split() — Given pnpm exec dependency-cruiser --validate, Then exit 0
RED:     test_existing_tests_unchanged() — Given full test suite, When run, Then 2246+ tests pass (no regression from move)
RED (EDGE): test_intra_server_imports_use_barrels() — Given any server/*/*.ts, When grep imports of '../*/file.js' (deep cross-folder), Then zero matches OR documented exception
RED (ERROR): test_external_consumers_unaffected() — Given examples/full-stack-agent + fixtures/template-default, When pnpm typecheck, Then both clean (proves external imports still resolve)
RED (EC-3): test_no_deep_server_imports_outside_packages() — Given `grep -rln "from.*packages/theo/src/server/[a-z-]*\\.js" tests/ examples/ fixtures/`, Then zero matches (all deep-import sites updated atomically)
RED (EC-4): test_package_json_no_deep_server_exports() — Given `packages/theo/package.json`, When parsed, Then no `exports` key matches `^\\./server/[a-z]` (no deep export of internal file)
RED (EC-9): test_sub_barrels_do_not_cross_import() — Given each `server/<sub>/index.ts`, When inspected, Then ONLY re-exports from same sub-folder (no `from '../other-sub/...'`) — catches indirect cycles via barrels
RED (EC-10): test_root_server_files_justified() — Given `ls packages/theo/src/server/*.ts`, Then file list EXACTLY equals `{body-parser, transformer, plugin-types, serialization}` (anything else fails — forces conscious decision for new root files)
GREEN:   Execute the 10-batch move per Tasks above.
REFACTOR: After all moves, scan for ergonomic improvements (e.g., a sub-folder's barrel re-exports could be simplified).
VERIFY:  pnpm typecheck && pnpm vitest run && pnpm exec dependency-cruiser packages/theo/src/ --validate
```

**BDD scenarios obrigatórios:**
- **Happy path:** all 10 sub-folders present, server/index.ts re-exports the same surface, tests pass.
- **Validation error:** cycle introduced by move → dep-cruiser catches it.
- **Edge case:** intra-server cross-folder imports go through barrels (not direct).
- **Error scenario:** an external consumer (`examples/`) still compiles after the move.

#### Acceptance Criteria
- [ ] 7 RED tests pass GREEN
- [ ] 10 sub-folders created with barrels
- [ ] `server/index.ts` re-exports the same surface (no public API change)
- [ ] `pnpm typecheck` clean across entire monorepo
- [ ] `pnpm vitest run` all 2246+ pre-existing tests still pass
- [ ] `pnpm exec dependency-cruiser packages/theo/src/ --validate` reports 0 cycles
- [ ] `pnpm check:naming` (from T1.1) still passes
- [ ] Phase 1 CI guards pass

#### DoD
- [ ] All tests green
- [ ] Zero TS/lint warnings
- [ ] No file outside `server/` requires modification
- [ ] Manual: `pnpm dev` in `examples/full-stack-agent` boots + `/cache` page works
- [ ] Git history preserved (used `git mv` everywhere)

---

## Phase 3: DRY consolidations

**Objective:** Resolve PV-3 (HIGH), PV-4, PV-9, PV-10 (MEDIUM) — 4 DRY duplications. Each gets its own task because they're in different modules.

### T3.1 — Extract `walkSourceFiles()` helper, refactor 3 scanners (PV-3)

#### Objective
Collapse the 3 duplicate filesystem walkers in `server/scan.ts`, `action-scan.ts`, `ws-scan.ts` into one canonical `walkSourceFiles(dir, opts, onFile)` helper. Each scanner shrinks from ~50 LOC to ~10 LOC.

#### Evidence
- `architecture-output/final_report.md` §"High > PV-3" — "Filesystem walker duplicated 3x — identical recursive scanner with skip rules"
- Top refactor priority P3: "2 hours. Removes a Phase 4 latent class of bugs."

#### Files to edit
```
packages/theo/src/server/_internal/scan-walker.ts (NEW) — exports walkSourceFiles
packages/theo/src/server/scan/scan.ts (MODIFY post-Phase-2 — was server/scan.ts) — use walker
packages/theo/src/server/scan/action-scan.ts (MODIFY) — use walker
packages/theo/src/server/scan/ws-scan.ts (MODIFY) — use walker
packages/theo/src/server/scan/middleware-scan.ts (MODIFY) — use walker (4th consumer, since middleware-scan also walks)
tests/unit/scan-walker.test.ts (NEW)
```

#### Deep file dependency analysis
- `scan-walker.ts` (NEW): pure function, no imports outside `node:fs`/`node:path`. Consumed by 4 scanners.
- 4 scanners (MODIFY): each loses its ~40 LOC walker and calls `walkSourceFiles()` instead.
- No external consumer changes — scanners are internal to the framework.

#### Deep Dives

**`walkSourceFiles(dir, opts, onFile)` signature:**
```ts
export interface WalkOptions {
  match?: RegExp        // e.g., /\.(ts|tsx|js|jsx)$/
  skipDirs?: string[]   // e.g., ['node_modules', 'dist', '_internal']
  skipPrefixes?: string[] // e.g., ['_', '.']
}

export async function walkSourceFiles(
  root: string,
  opts: WalkOptions,
  onFile: (absPath: string, relPath: string) => void | Promise<void>,
): Promise<void>
```

**Algorithm:**
1. `await readdir(root, { withFileTypes: true })`.
2. For each entry: if `name.startsWith(prefix)` for any in `skipPrefixes` → skip. If dir and name in `skipDirs` → skip.
3. If `entry.isDirectory()` → recurse with `path.join(root, name)`.
4. If `entry.isFile()` AND `opts.match.test(name)` → `await onFile(absPath, relPath)`.

**Invariants:**
- Idempotent — calling twice with same callback yields same set of files.
- Async — `onFile` may be async; awaited per file.
- Skip-rules applied in order: prefix > skipDirs > extension match.

**Edge cases:**
- Empty dir → no callbacks, no error.
- Symlink loop → caller's responsibility (use `realpath` if needed).
- Permission denied on a subdir → fail loudly (don't silently swallow — let caller decide).
- `opts.match` undefined → match all files.

#### Tasks
1. Read 3 current scanners + 1 middleware-scan (post-Phase-2 paths) to extract common code.
2. Create `server/_internal/scan-walker.ts` with `walkSourceFiles()`.
3. Refactor each of the 4 scanners to use the new helper.
4. Write tests in `tests/unit/scan-walker.test.ts`.
5. Run full suite — verify no regression in fixture-based scan tests.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_walker_yields_matching_files() — Given temp dir with foo.ts, bar.tsx, baz.md, When walkSourceFiles({match: /\.(tsx?)$/}, ...), Then onFile called for foo.ts + bar.tsx, NOT baz.md
RED:     test_walker_recurses_subdirs() — Given temp dir with sub/nested.ts, When walked, Then onFile called for sub/nested.ts
RED:     test_walker_skips_underscore_prefix() — Given temp dir with _private.ts and public.ts, When walked with skipPrefixes=['_'], Then only public.ts yielded
RED:     test_walker_skips_node_modules() — Given temp dir with node_modules/lib.ts and src/app.ts, When walked with skipDirs=['node_modules'], Then only src/app.ts yielded
RED (EDGE): test_walker_empty_dir_no_error() — Given empty dir, When walked, Then onFile never called, Promise resolves
RED (EDGE): test_walker_async_callback_awaited() — Given onFile returning a Promise<void> with 50ms delay, When walking 3 files, Then total time ≥ 150ms (sequential awaits)
RED (ERROR): test_walker_propagates_callback_error() — Given onFile that throws, When walked, Then walkSourceFiles rejects with same error
RED (INTEGRATION): test_route_scan_still_works_after_refactor() — Given fixtures/template-default, When scanServerRoutes called, Then same routes returned (regression check)
RED (EC-11): test_walker_skips_symlink_loop() — Given temp dir with `a/` symlinked to `b/` and vice versa, When walkSourceFiles called, Then completes within 1s (not hang). Impl: track visited inodes via fs.statSync().ino + skip revisit.
GREEN:   Implement walkSourceFiles + refactor 4 scanners to use it.
REFACTOR: If 3+ scanners have identical onFile shapes (e.g., "register the file's exports"), extract a registration helper.
VERIFY:  pnpm vitest run tests/unit/scan-walker.test.ts && pnpm vitest run tests/integration/scan-routes-fixture.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** walker yields files matching the regex.
- **Validation error:** `_`-prefixed files skipped.
- **Edge case:** empty directory yields zero callbacks.
- **Error scenario:** callback throw propagates.

#### Acceptance Criteria
- [ ] 8 RED tests pass GREEN
- [ ] `scan-walker.ts` is < 80 LOC
- [ ] Each of 4 refactored scanners is < 30 LOC
- [ ] Scan output for `fixtures/template-default` is byte-identical before and after the refactor
- [ ] Zero TS/lint warnings

#### DoD
- [ ] All tests green
- [ ] Total scan-related LOC reduced by ≥ 80
- [ ] Phase 1 CI guards still pass

---

### T3.2 — Extract cookie parsing helper (PV-4)

#### Objective
Resolve PV-4 (MEDIUM DRY) — 2x cookie parsers in `server/rate-limit-per-route.ts:75` and likely also in middleware/session paths. Consolidate into the existing `cookies.ts` if not already there.

#### Evidence
- `architecture-output/final_report.md` §"Medium > PV-4" — "2 cookie parsers"

#### Files to edit
```
packages/theo/src/server/http/cookies.ts (MODIFY — post-Phase-2 path) — add canonical parseCookieHeader(header: string): Map<string,string>
packages/theo/src/server/rate-limit/rate-limit-per-route.ts (MODIFY) — use canonical parser
packages/theo/src/server/<other-duplicate-site>.ts (MODIFY) — same
tests/unit/cookies-parse.test.ts (NEW or extend)
```

#### Deep file dependency analysis
- `cookies.ts` already exports `getCookie/setCookie/deleteCookie`. Adding `parseCookieHeader` is additive.
- 2 duplicate sites are isolated to `server/` internals.

#### Deep Dives

**Algorithm:** standard cookie parsing per RFC 6265 §5.4 — split by `; `, then by first `=`, URL-decode value, last-wins for duplicate names. Map preserves insertion order.

**Invariants:** Empty input → empty Map. Malformed entries skipped (no throw — defensive).

**Edge cases:**
- `cookie: ""` → empty Map.
- `cookie: "a=1; a=2"` → last wins (`{ a: '2' }`).
- `cookie: "a=hello%20world"` → decoded (`{ a: 'hello world' }`).
- `cookie: "novalue"` → skipped (no `=`).

#### Tasks
1. Grep for cookie-parsing code in `server/`: `grep -rn "split.*=.*'; '" packages/theo/src/server/`.
2. Add `parseCookieHeader` to `cookies.ts`.
3. Refactor both duplicate sites to call it.
4. Add tests.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_parse_happy_path() — Given "a=1; b=2", When parseCookieHeader, Then Map{a:1, b:2}
RED:     test_parse_empty_string() — Given "", When parsed, Then empty Map
RED:     test_parse_url_decoded() — Given "name=hello%20world", When parsed, Then {name: "hello world"}
RED (EDGE): test_parse_duplicate_name_last_wins() — Given "a=1; a=2", When parsed, Then {a: "2"}
RED (EDGE): test_parse_malformed_skipped() — Given "novalue; a=1", When parsed, Then {a: "1"} (novalue skipped)
RED (ERROR): test_rate_limit_per_route_uses_canonical() — Given rate-limit-per-route.ts, When grep, Then imports parseCookieHeader from canonical cookies.ts
RED (EC-12): test_no_inline_cookie_parsing() — Given broader grep `headers.cookie\\?.split\\|headers\\['cookie'\\].split` across packages/theo/src/server/, Then ZERO matches (catches alt-syntax dupes the narrow original grep missed)
GREEN:   Add parseCookieHeader to cookies.ts + refactor consumers.
REFACTOR: None.
VERIFY:  pnpm vitest run tests/unit/cookies-parse.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** standard cookie string → Map.
- **Validation error:** malformed entries skipped, no throw.
- **Edge case:** duplicate-name last-wins.
- **Error scenario:** N/A (defensive — never throws on input).

#### Acceptance Criteria
- [ ] 6 RED tests pass GREEN
- [ ] Zero duplicate cookie parsers (grep verified)
- [ ] Zero TS/lint warnings

#### DoD
- [ ] All tests green
- [ ] Rate-limit + session tests still pass

---

### T3.3 — `csrf.warn` dispatcher helper (PV-10)

#### Objective
Resolve PV-10 (MEDIUM DRY) — 2x csrf.warn dispatchers in `execute.ts`. Extract into `server/security/csrf-warn.ts` (or directly into `security-headers.ts` if it owns CSRF).

#### Evidence
- `architecture-output/final_report.md` §"Medium > PV-10" — "2x csrf.warn dispatchers"

#### Files to edit
```
packages/theo/src/server/security/csrf-warn.ts (NEW or extend security-headers.ts)
packages/theo/src/server/http/execute.ts (MODIFY) — replace 2 duplicate dispatchers
packages/theo/src/server/http/api-middleware.ts (MODIFY if similar duplication)
tests/unit/csrf-warn.test.ts (NEW)
```

#### Deep file dependency analysis
- New helper: pure function, takes (request, logger, options), emits the structured warn event.
- Consumers: any code path that detects missing `X-Theo-Action` on a non-GET request.

#### Deep Dives

**Helper signature:**
```ts
export function dispatchCsrfWarn(opts: {
  method: string
  path: string
  reason: string
  code: string
  docsUrl: string
  logger: { warn: (event: object) => void }
}): void
```

**Algorithm:** build the structured event object (with `warnOnce: true`, `event: 'csrf.warn'`), call `logger.warn(event)`. Side-effect free in return.

**Invariants:** never throws. Stable event shape across all call sites (so downstream log aggregation works).

**Edge cases:** logger absent → no-op (defensive). Falsy path → emit "unknown".

#### Tasks
1. Locate the 2 duplicate dispatchers via grep `'csrf.warn'`.
2. Extract canonical helper.
3. Refactor both sites.
4. Add unit test.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_dispatch_emits_event() — Given mock logger, When dispatchCsrfWarn called, Then logger.warn called once with event=csrf.warn
RED:     test_event_has_required_fields() — Given dispatch with full opts, When called, Then event includes {event, method, path, reason, code, docsUrl, warnOnce: true}
RED (EDGE): test_logger_absent_no_throw() — Given dispatch with logger undefined, When called, Then no exception (defensive)
RED (ERROR): test_falsy_path_handled() — Given path: "", When dispatched, Then event.path is "" (preserved, not coerced)
RED (INTEGRATION): test_execute_uses_canonical_dispatcher() — Given server/http/execute.ts, When grep, Then both csrf-warn sites import from canonical helper
GREEN:   Extract helper + refactor 2 sites.
REFACTOR: None.
VERIFY:  pnpm vitest run tests/unit/csrf-warn.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** event emitted with full fields.
- **Validation error:** N/A (helper is defensive).
- **Edge case:** absent logger no-ops.
- **Error scenario:** falsy inputs handled defensively.

#### Acceptance Criteria
- [ ] 5 RED tests pass GREEN
- [ ] Both call sites use canonical helper
- [ ] Existing CSRF integration tests still pass
- [ ] Zero TS/lint warnings

#### DoD
- [ ] All tests green
- [ ] Zero regression in csrf-related fixtures

---

### T3.4 — `execute.ts` catch-branch DRY (PV-9)

#### Objective
Resolve PV-9 (MEDIUM DRY) — 4 duplicated catch branches in `server/execute.ts:404`. Extract a `handleRouteError(error, ctx, plugins)` helper.

#### Evidence
- `architecture-output/final_report.md` §"Medium > PV-9" — "4 catch-branch duplicates"

#### Files to edit
```
packages/theo/src/server/http/route-error-handler.ts (NEW)
packages/theo/src/server/http/execute.ts (MODIFY) — replace 4 duplicate catch blocks
tests/unit/route-error-handler.test.ts (NEW)
```

#### Deep file dependency analysis
- New helper takes `(error, ctx)` and decides: log via plugin.onError, format response via sendError, optionally re-throw. Consolidates the 4 paths into one place.

#### Deep Dives

**Helper:**
```ts
export async function handleRouteError(
  error: unknown,
  ctx: {
    request: IncomingMessage | Request
    response: ServerResponse
    requestId: string | undefined
    pluginRunner: PluginRunner | undefined
    transformer: TheoTransformer
  },
): Promise<void>
```

**Algorithm:** delegate to plugin.runOnError (try/catch — plugin errors are swallowed). Build standardized error response via sendError. Log structured.

**Invariants:** never throws. Plugin error in error-handler swallowed (per existing plugin-runner behavior — Phase 4 confirmed).

#### Tasks
1. Grep the 4 catch blocks in execute.ts:404.
2. Extract the canonical handler.
3. Refactor.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_handler_logs_via_plugin() — Given pluginRunner with onError, When handleRouteError called, Then pluginRunner.runOnError called with error
RED:     test_handler_sends_error_response() — Given mock response, When called with Error("boom"), Then response sent with 500 + standardized body
RED (EDGE): test_handler_no_plugin_runner() — Given pluginRunner undefined, When called, Then no exception (defensive)
RED (ERROR): test_plugin_throw_in_error_handler_swallowed() — Given pluginRunner.onError that throws, When handleRouteError called, Then handleRouteError itself does not throw (no infinite loop)
RED (INTEGRATION): test_execute_uses_canonical_handler() — Given execute.ts, When grep, Then all 4 sites use handleRouteError
GREEN:   Extract + refactor 4 sites.
REFACTOR: None.
VERIFY:  pnpm vitest run tests/unit/route-error-handler.test.ts && pnpm vitest run tests/integration/auth-error.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** error logged + response sent.
- **Validation error:** absent plugin handled.
- **Edge case:** plugin-in-error-handler exception swallowed.
- **Error scenario:** integration test still passes.

#### Acceptance Criteria
- [ ] 5 RED tests pass GREEN
- [ ] All 4 catch blocks consolidated
- [ ] Integration test `auth-error.test.ts` still passes
- [ ] Zero TS/lint warnings

#### DoD
- [ ] All tests green
- [ ] Zero regression

---

## Phase 4: Cache module hardening

**Objective:** Resolve PF-3 (Singleton misapplied), PV-5 (DRY tryReadCached), PV-6 (param bags), PV-8 (ISP fat interface). The cache module just shipped — fix these before public ossification.

### T4.1 — `defineCachedRoute` accepts `engine` arg (PF-3, D6)

#### Objective
Add `engine` as first arg to `defineCachedRoute`, matching `defineCachedFunction`'s proven shape. Kills the module-level Singleton dependency. Backward-compat: if engine omitted, fall back to `getCacheEngine()` with deprecation warn.

#### Evidence
- `architecture-output/final_report.md` §"Medium > pattern PF-3" — "Process-wide `let _engine` with `_resetCacheEngine()` test escape hatch is the textbook Singleton smell"
- Top refactor priority P4 — 4 hours

#### Files to edit
```
packages/theo/src/cache/define-cached-route.ts (MODIFY) — accept engine arg
packages/theo/src/cache/engine-singleton.ts (MODIFY) — keep getCacheEngine but emit deprecation warn on missing engine arg
tests/unit/cache-define-cached-route.test.ts (MODIFY) — add tests for both shapes
docs/concepts/caching.md (MODIFY) — show new canonical shape
examples/full-stack-agent/server/routes/quote.ts (MODIFY — example uses canonical shape)
```

#### Deep file dependency analysis
- `defineCachedRoute` is public API. Backward compat MUST be preserved.
- Pattern: function overload — old signature `(config)` still works (delegates to `getCacheEngine()`); new signature `(engine, config)` is preferred.

#### Deep Dives

**New signature:**
```ts
export function defineCachedRoute(engine: CacheEngine, config: CachedRouteConfig): RouteConfig
export function defineCachedRoute(config: CachedRouteConfig): RouteConfig  // legacy
export function defineCachedRoute(
  engineOrConfig: CacheEngine | CachedRouteConfig,
  config?: CachedRouteConfig,
): RouteConfig {
  if (isCacheEngine(engineOrConfig)) {
    return defineCachedRouteImpl(engineOrConfig, config!)
  }
  // Legacy: emit warn-once, use singleton
  warnOnceLegacy()
  return defineCachedRouteImpl(getCacheEngine(), engineOrConfig)
}
```

**Invariants:** existing call sites that pass `(config)` continue to work. New call sites get DIP-clean injection. Test isolation improves (no `_resetCacheEngine` needed).

**Edge case:** consumer creates 2 routes with 2 different engines — works; each route uses its own engine.

#### Tasks
1. Add overload to `defineCachedRoute`.
2. Add `isCacheEngine(x)` type guard (`typeof x.getOrCompute === 'function'`).
3. Add warn-once for legacy shape.
4. Update example route to canonical shape.
5. Update docs/concepts/caching.md.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_canonical_shape_uses_provided_engine() — Given engine + config, When defineCachedRoute(engine, config), Then route uses that engine (not singleton)
RED:     test_legacy_shape_uses_singleton() — Given config only, init singleton, When defineCachedRoute(config), Then route uses singleton (backward compat)
RED:     test_legacy_shape_warns_once() — Given config only, When defineCachedRoute(config) called 3 times, Then console.warn called exactly once
RED (EDGE): test_two_routes_two_engines() — Given engineA + engineB, When 2 routes with different engines, Then routes are isolated (write to A doesn't appear in B)
RED (ERROR): test_legacy_without_singleton_init_throws_clear() — Given singleton not initialized, When legacy defineCachedRoute(config) called, Then throws "Cache engine not initialized..."
RED (EC-13): test_define_cached_route_overload_resolves_unambiguously() — Type test via expectTypeOf: defineCachedRoute(engine, config) resolves to RouteConfig. defineCachedRoute(config) resolves to RouteConfig. Mixed defineCachedRoute(badConfigAsEngine, anotherConfig) either errors at compile time OR resolves to canonical (no silent miscompile).
GREEN:   Add overload + type guard + warn-once.
REFACTOR: None.
VERIFY:  pnpm vitest run tests/unit/cache-define-cached-route.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** canonical shape uses provided engine.
- **Validation error:** legacy shape without singleton init throws clear error.
- **Edge case:** 2 engines stay isolated.
- **Error scenario:** warn-once never warns twice.

#### Acceptance Criteria
- [ ] 5 RED tests pass GREEN
- [ ] Existing 21 tests in cache-define-cached-route.test.ts still pass (backward compat)
- [ ] Example + docs use canonical shape
- [ ] Zero TS/lint warnings

#### DoD
- [ ] All tests green
- [ ] Example `examples/full-stack-agent/server/routes/quote.ts` updated + still works manually

---

### T4.2 — Single `tryReadCached` in engine, route delegates (PV-5, D4)

#### Objective
Resolve PV-5 (MEDIUM DRY). `cache/define-cached-route.ts:168` has its own `tryReadCacheEntry()` that duplicates `cache-engine.ts:tryReadCached()` (staleness check, version check, JSON parse, clock-skew clamp).

#### Evidence
- `architecture-output/final_report.md` §"Medium > PV-5" — "engine-vs-route stale-check dup"

#### Files to edit
```
packages/theo/src/cache/cache-engine.ts (MODIFY) — promote tryReadCached to public method on the engine
packages/theo/src/cache/define-cached-route.ts (MODIFY) — remove tryReadCacheEntry, call engine.tryReadCached
tests/unit/cache-engine.test.ts (EXTEND — verify public tryReadCached)
tests/unit/cache-define-cached-route.test.ts — already covers route behavior; verify no regression
```

#### Deep Dives

**Engine API addition:**
```ts
// In CacheEngine interface
tryReadCached<T>(key: string, opts: { cacheVersion?: string; validate?: (v: T) => boolean }): Promise<
  | { value: T; status: 'hit' | 'stale' }
  | undefined
>
```

**Invariants:** route wrapper's previous `tryReadCacheEntry` becomes obsolete. Engine is the canonical source.

**Edge case:** consumer of engine.tryReadCached gets the same SWR semantics as engine.getOrCompute.

#### Tasks
1. Refactor engine to expose `tryReadCached` publicly (currently private inside `claimAndRun`).
2. Remove duplicate from `define-cached-route.ts`; call engine method.
3. Extend engine tests.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_engine_tryReadCached_hit() — Given entry within maxAge, When tryReadCached, Then returns {value, status: 'hit'}
RED:     test_engine_tryReadCached_stale() — Given entry past maxAge but within swr, When tryReadCached, Then returns {value, status: 'stale'}
RED:     test_engine_tryReadCached_miss() — Given no entry, When tryReadCached, Then returns undefined
RED:     test_engine_tryReadCached_cacheVersion_mismatch() — Given entry with v1, When tryReadCached with v2, Then returns undefined
RED (EDGE): test_engine_tryReadCached_validate_false() — Given entry + validate returning false, When tryReadCached, Then returns undefined
RED (ERROR): test_route_no_longer_has_local_tryReadCacheEntry() — Given define-cached-route.ts, When grep "function tryReadCacheEntry", Then zero matches (DRY consolidated)
GREEN:   Promote tryReadCached + remove route duplicate.
REFACTOR: None.
VERIFY:  pnpm vitest run tests/unit/cache-engine.test.ts && pnpm vitest run tests/unit/cache-define-cached-route.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** hit returns value+status.
- **Validation error:** version mismatch returns undefined.
- **Edge case:** validate=false treated as miss.
- **Error scenario:** route's local duplicate is gone (grep).

#### Acceptance Criteria
- [ ] 6 RED tests pass GREEN
- [ ] Existing engine + route tests unchanged
- [ ] `define-cached-route.ts` LOC reduced
- [ ] Zero TS/lint warnings

#### DoD
- [ ] All tests green
- [ ] No public API change (route wrapper still has same shape externally)

---

### T4.3 — `RouteCacheCtx` options bag (PV-6, D3)

#### Objective
Resolve PV-6 (HIGH clean_function). `persistAndReturn` has 10 params, `scheduleRouteRevalidate` has 11 params, plus duplicate `CacheEntry` construction in both. Collapse into one `RouteCacheCtx` options object + `buildRouteCacheEntry()` helper.

#### Evidence
- `architecture-output/final_report.md` §"High > PV-6" — 10-11 params + duplicated CacheEntry block

#### Files to edit
```
packages/theo/src/cache/define-cached-route.ts (MODIFY) — introduce RouteCacheCtx + buildRouteCacheEntry
tests/unit/cache-define-cached-route.test.ts — verify regression-free
```

#### Deep Dives

**Refactor:**
```ts
interface RouteCacheCtx {
  engine: CacheEngine
  key: string
  cache: RouteCacheOptions
  routeConfig: object
  maxEntrySize: number
  maxAge: number
  swr: number | undefined
  baseTags: string[]
  webRequest: Request
}

function buildRouteCacheEntry(value: RouteCacheValue, ctx: RouteCacheCtx): CacheEntry { ... }

async function persistAndReturn(ctx: RouteCacheCtx, response: Response): Promise<Response> { ... }
function scheduleRouteRevalidate<TCtx>(ctx: RouteCacheCtx, handler: (...) => unknown, handlerCtx: TCtx): void { ... }
```

**Invariants:** behavior identical. Param count drops from 10/11 to 2 each.

#### Tasks
1. Introduce `RouteCacheCtx` interface.
2. Refactor `persistAndReturn` to (ctx, response).
3. Refactor `scheduleRouteRevalidate` to (ctx, handler, handlerCtx).
4. Extract `buildRouteCacheEntry(value, ctx)` helper.
5. Verify existing tests pass.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_persistAndReturn_uses_ctx_object() — Given ctx + response, When called, Then returns wrapped Response (regression: existing dcr_happy_path test still passes)
RED:     test_scheduleRouteRevalidate_uses_ctx_object() — Given ctx + handler, When called, Then background refresh fires (regression: dcr_swr_returns_stale test still passes)
RED:     test_buildRouteCacheEntry_canonical() — Given value + ctx, When called, Then returns CacheEntry with correct tags + storedAt + maxAge
RED (EDGE): test_param_count_max_4() — Given persistAndReturn signature, When inspected via reflect, Then function.length ≤ 4
RED (ERROR): test_no_regression_in_existing_21_tests() — Given full define-cached-route test suite, When run, Then 21+ tests pass
GREEN:   Refactor with options-bag pattern.
REFACTOR: None.
VERIFY:  pnpm vitest run tests/unit/cache-define-cached-route.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** options bag works.
- **Validation error:** N/A (refactor only).
- **Edge case:** param count ≤ 4 verified.
- **Error scenario:** existing 21 tests still pass.

#### Acceptance Criteria
- [ ] 5 RED tests pass GREEN
- [ ] `persistAndReturn` + `scheduleRouteRevalidate` each have ≤ 4 params
- [ ] `buildRouteCacheEntry` is the single source for CacheEntry construction
- [ ] All 21 existing route tests pass
- [ ] Zero TS/lint warnings

#### DoD
- [ ] All tests green
- [ ] LOC reduction ≥ 30 in define-cached-route.ts
- [ ] No public API change

---

### T4.4 — Split `CacheStorageAdapter` interface (PV-8, D5)

#### Objective
Resolve PV-8 (MEDIUM ISP). `CacheStorageAdapter` has 8 methods; hot path uses 4 (`get`, `set`, `delete`, `deleteByTag`). Admin methods (`size`, `clear`, `keys`) are dev-tooling. Split into `CacheStore` + `CacheStoreAdmin`, with the public union type for backward compat.

#### Evidence
- `architecture-output/final_report.md` §"Medium > PV-8" — 8 methods, fat interface

#### Files to edit
```
packages/theo/src/cache/storage-adapter.ts (MODIFY) — split interfaces
packages/theo/src/cache/in-memory-adapter.ts (MODIFY) — implement both
docs/concepts/caching.md (MODIFY) — show new ISP-clean shape
tests/unit/cache-storage-adapter-contract.test-d.ts (NEW or extend)
```

#### Deep Dives

**Type design:**
```ts
export interface CacheStore {
  readonly name: string
  get(key: string): Promise<CacheEntry | undefined>
  set(key: string, entry: CacheEntry): Promise<void>
  delete(key: string): Promise<boolean>
  deleteByTag(tag: string): Promise<number>
}

export interface CacheStoreAdmin {
  size(): Promise<number>
  clear(): Promise<void>
  keys(prefix?: string): AsyncIterableIterator<string>
}

// Backward compat — the framework expects this shape internally
export type CacheStorageAdapter = CacheStore & Partial<CacheStoreAdmin>
```

**Invariants:** `InMemoryCacheAdapter` implements `CacheStore & CacheStoreAdmin`. Third-party adapters can implement either (full or hot-only).

**Edge case:** the engine's `clear()` or `keys()` might be called on a hot-only adapter — engine handles via `if (typeof store.clear === 'function')` guard.

#### Tasks
1. Split the interface.
2. Update `InMemoryCacheAdapter` to declare both.
3. Engine code guards admin methods with `typeof` checks.
4. Update docs.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_CacheStore_has_4_methods() — Given type tests, When expectTypeOf<keyof CacheStore>, Then exactly {name, get, set, delete, deleteByTag} (5 incl. name)
RED:     test_CacheStoreAdmin_has_3_methods() — expectTypeOf<keyof CacheStoreAdmin> equals {size, clear, keys}
RED:     test_InMemoryCacheAdapter_implements_both() — type test: InMemoryCacheAdapter satisfies CacheStore & CacheStoreAdmin
RED (EDGE): test_hot_only_adapter_works() — Given a minimal class implementing only CacheStore (no admin), When passed to createCacheEngine, Then engine works for get/set/delete/deleteByTag
RED (ERROR): test_engine_guards_admin_calls() — Given hot-only adapter, When engine internal code triggers admin call (e.g., debug logging), Then no exception (typeof guard)
RED (EC-14): test_in_memory_adapter_implements_admin_too() — Type test via expectTypeOf<InMemoryCacheAdapter>().toMatchTypeOf<CacheStore & CacheStoreAdmin>(). Existing tests calling .size()/.clear() must continue to compile.
GREEN:   Split interface + adapter + engine guards.
REFACTOR: None.
VERIFY:  pnpm vitest run tests/unit/cache-storage-adapter-contract.test-d.ts && pnpm vitest run tests/unit/cache-in-memory-adapter.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** both interfaces present.
- **Validation error:** hot-only adapter is allowed.
- **Edge case:** engine guards admin calls.
- **Error scenario:** type system enforces the split.

#### Acceptance Criteria
- [ ] 5 RED tests pass GREEN
- [ ] Existing 15 InMemoryCacheAdapter tests still pass
- [ ] Type tests pass (`pnpm test:types`)
- [ ] Zero TS/lint warnings

#### DoD
- [ ] All tests green
- [ ] Public `CacheStorageAdapter` type still exists (union)
- [ ] Docs updated

---

## Phase 5: `executeRoute` → Pipeline (P2)

**Objective:** Resolve PV-2 (HIGH 301 LOC, 12 params) + PF-19 (Pipeline missing pattern) in one refactor. Extract `executeRoute` into 5 stage functions composed by a tiny `runStages()` helper.

### T5.1 — Extract 5 pipeline stages + compose executeRoute

#### Objective
Refactor `server/http/execute.ts:149 executeRoute` from 301 LOC / 12 params into ~30 LOC orchestration + 5 stage functions, each independently testable.

#### Evidence
- `architecture-output/final_report.md` §"High > PV-2" — 301 LOC, 12 params, 11 concerns
- §"Medium > PF-19" — Pipeline missing pattern
- Top refactor priority P2 — 2-3 days

#### Files to edit
```
packages/theo/src/server/http/pipeline.ts (NEW) — RequestPipelineCtx type + runStages helper
packages/theo/src/server/http/stages/csrf-stage.ts (NEW)
packages/theo/src/server/http/stages/transformer-headers-stage.ts (NEW)
packages/theo/src/server/http/stages/parse-body-stage.ts (NEW)
packages/theo/src/server/http/stages/validate-stage.ts (NEW)
packages/theo/src/server/http/stages/invoke-handler-stage.ts (NEW)
packages/theo/src/server/http/execute.ts (MAJOR REWRITE) — compose 5 stages
tests/unit/pipeline-runner.test.ts (NEW)
tests/unit/pipeline-stages/*.test.ts (NEW — one per stage)
```

#### Deep Dives

**Stage type:**
```ts
type Stage = (ctx: RequestPipelineCtx) => Promise<RequestPipelineCtx | { earlyResponse: Response }>

interface RequestPipelineCtx {
  request: IncomingMessage | Request
  response: ServerResponse
  routeConfig: RouteConfig
  routeMatch: RouteMatch
  query: unknown
  body: unknown
  params: Record<string, string>
  ctx: Record<string, unknown>
  requestId: string
  transformer: TheoTransformer
  pluginRunner: PluginRunner | undefined
}

async function runStages(stages: Stage[]): (ctx: RequestPipelineCtx) => Promise<void> { ... }
```

**Algorithm:**
1. For each stage in order: `await stage(ctx)`.
2. If result has `earlyResponse` field → send it via `sendResponse(earlyResponse)` and STOP.
3. Otherwise merge result into ctx (or replace ctx).
4. After all stages: send handler response.

**5 stages mapped from current executeRoute:**
1. **csrfStage** — checks `X-Theo-Action` for non-GET, dispatches csrf.warn (uses T3.3 helper), short-circuits with 403 if strict mode.
2. **transformerHeadersStage** — emits `x-theo-transformer` if non-default transformer.
3. **parseBodyStage** — calls `parseRequestBody`, sets `ctx.body`.
4. **validateStage** — runs `routeConfig.query/body/params` Zod schemas, short-circuits with 422 on validation error.
5. **invokeHandlerStage** — calls user handler, captures result.

(Plus error handling via the T3.4 `handleRouteError` helper at the runStages level.)

**Invariants:** behavior identical to current monolithic `executeRoute`. Each stage testable in isolation with a mock ctx. No new public API.

**EC-5 invariant (MUST PRESERVE):** Plugin hooks (`pluginRunner.runOnRequest`, `runOnResponse`, `runOnResponse(inErrorPath=true)`, `runOnError`) must fire in the SAME positions, SAME number of times as current `executeRoute`. Pipeline structure:
- `runOnRequest` fires ONCE, BEFORE the first stage (csrfStage)
- `runOnResponse` fires ONCE, AFTER invokeHandlerStage on success path
- `runOnError` + `runOnResponse(inErrorPath=true)` fire ONCE, via `runStages` outer try/catch on error path
- NO new hook invocations per-stage (avoid plugin amplification)

This is a hard contract — third-party plugins depend on this exact sequence.

**EC-15 invariant:** AsyncLocalStorage / request-scoped state (if any) must wrap the entire `runStages(ctx)` call, NOT individual stages. RequestId, traceparent, ctx.user — all must be visible to every stage.

**EC-16 edge case:** Streaming responses (SSE, `Content-Type: text/event-stream`, `Transfer-Encoding: chunked`) — `invokeHandlerStage` is terminal for these. Once the handler returns a streaming Response, the pipeline must proxy the stream to the client WITHOUT buffering. No post-handler stage may consume the body.

#### Tasks
1. Read current `executeRoute` (post-Phase-2 path: `server/http/execute.ts`) to map each segment to a stage.
2. Create `pipeline.ts` with type + runStages helper.
3. Create 5 stage files, one at a time, with TDD (write test → extract code → green).
4. Refactor `executeRoute` to compose stages via runStages.
5. Verify full suite + integration tests still pass.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_runStages_runs_in_order() — Given 3 stages, When runStages called, Then stages invoked sequentially
RED:     test_runStages_short_circuits_on_earlyResponse() — Given stage1, stage2 returning earlyResponse, stage3, When run, Then stage3 NOT called
RED:     test_csrfStage_pass_with_header() — Given non-GET with X-Theo-Action: 1, When stage runs, Then ctx returned unchanged
RED:     test_csrfStage_fail_without_header_strict() — Given POST without header + strict mode, When stage runs, Then returns {earlyResponse: 403}
RED:     test_csrfStage_warn_without_header_warn_mode() — Given POST without header + warn mode, When stage runs, Then dispatchCsrfWarn called + ctx returned unchanged
RED:     test_parseBodyStage_parses_json() — Given request body {x:1}, When stage runs, Then ctx.body = {x:1}
RED:     test_validateStage_passes_valid() — Given valid Zod input, When stage runs, Then ctx returned
RED:     test_validateStage_rejects_invalid() — Given invalid input, When stage runs, Then returns {earlyResponse: 422}
RED:     test_invokeHandlerStage_calls_handler() — Given handler returning {ok:true}, When stage runs, Then ctx.handlerResult = {ok:true}
RED (EDGE): test_pipeline_handles_handler_throw() — Given handler that throws, When pipeline runs, Then handleRouteError called (uses T3.4 helper)
RED (INTEGRATION): test_executeRoute_full_suite_regression() — Given existing tests (auth-error, plugin-pipeline, etc.), When run, Then ALL pass (zero regression)
RED (EC-5): test_pipeline_preserves_plugin_hook_ordering() — Given plugin with 3 hooks (onRequest, onResponse, onError) each registering call in array, When normal request, Then array = ['onRequest', 'onResponse'] (snapshot); When erroring request, Then array = ['onRequest', 'onError', 'onResponse'] (snapshot). Snapshot exactly matches current executeRoute behavior.
RED (EC-15): test_request_id_propagates_through_pipeline() — Given handler that calls a request-scoped getRequestId() helper, When pipeline runs, Then handler sees same requestId observed by csrfStage at the start
RED (EC-16): test_pipeline_handles_streaming_response() — Given handler returning new Response(readableStream, {headers: {'content-type': 'text/event-stream'}}), When pipeline runs, Then response body streamed to client without buffering (verifiable via curl --no-buffer or chunked-encoding check)
GREEN:   Extract stages incrementally + compose in executeRoute.
REFACTOR: After all stages extracted, look for shared ctx fields that could move to construction.
VERIFY:  pnpm vitest run tests/unit/pipeline-runner.test.ts && pnpm vitest run tests/integration/*.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** pipeline runs all stages.
- **Validation error:** stage short-circuits on validation failure.
- **Edge case:** handler throw caught by handleRouteError.
- **Error scenario:** full integration regression suite passes.

#### Acceptance Criteria
- [ ] 14 RED tests pass GREEN (11 original + EC-5/EC-15/EC-16)
- [ ] `executeRoute` LOC ≤ 60
- [ ] Each stage LOC ≤ 80
- [ ] Plugin hook ordering invariant preserved (snapshot test)
- [ ] AsyncLocalStorage context propagates across all stages
- [ ] Streaming responses pass-through without buffering
- [ ] No new public API
- [ ] All existing 2246+ tests still pass
- [ ] No new cycles (`pnpm exec dependency-cruiser --validate` clean)
- [ ] Zero TS/lint warnings

#### DoD
- [ ] All tests green
- [ ] Manual: `pnpm dev` in `examples/full-stack-agent` boots + every demo URL still works
- [ ] Pipeline pattern documented in `docs/concepts/server-pipeline.md` (NEW, < 2 pages)

---

## Phase 6: Smaller cleanups + dead code

**Objective:** Resolve the remaining 7 findings: PV-7 (startCommand 455 LOC), PV-12 (logger.ts SRP), PV-17 (sendError 7 params), PV-11 (executeAction parallel API), PV-14/15/16 + PF-11/17 (dead code audit).

### T6.1 — Split `startCommand` (PV-7)

#### Objective
Decompose `cli/commands/start.ts:52 startCommand` (455 LOC) into smaller focused functions. The current monolith inlines 7+ unrelated request branches + type-laundering helper.

#### Evidence
- `architecture-output/final_report.md` §"High > PV-7" — 455 LOC

#### Files to edit
```
packages/theo/src/cli/commands/start.ts (MAJOR REWRITE) — orchestration only
packages/theo/src/cli/commands/start/serve-static.ts (NEW)
packages/theo/src/cli/commands/start/serve-route.ts (NEW)
packages/theo/src/cli/commands/start/serve-action.ts (NEW)
packages/theo/src/cli/commands/start/serve-websocket.ts (NEW)
packages/theo/src/cli/commands/start/handle-404.ts (NEW)
tests/unit/cli-start-handlers.test.ts (NEW)
```

#### Deep file dependency analysis
- `start.ts` becomes thin orchestration (~80 LOC).
- 5 helper files each handle one request branch.

#### Deep Dives

**Pattern:** extract each `if (request.method === X && url.startsWith(Y))` branch into a focused handler. The orchestrator iterates handlers, returns the first match.

**Invariants:** behavior identical. Same routes still served.

#### Tasks
1. Read current `start.ts` to enumerate the 7 branches.
2. Extract each branch into a focused file.
3. Refactor orchestration.
4. Verify production server fixture tests still pass.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_static_request_routed_correctly() — Given GET /logo.png, When handler invoked, Then static file served
RED:     test_api_route_invoked() — Given GET /api/health, When handler invoked, Then defineRoute handler called
RED:     test_action_invoked() — Given POST /api/__actions/foo/bar with X-Theo-Action, When invoked, Then action handler called
RED:     test_websocket_upgraded() — Given WebSocket upgrade request, When invoked, Then ws handler attached
RED (EDGE): test_unknown_path_404() — Given /nowhere, When invoked, Then 404 with sendError
RED (ERROR): test_existing_prod_tests_pass() — Given fixtures/production-build tests, When run, Then ALL pass
GREEN:   Extract 5 handlers + refactor orchestrator.
REFACTOR: None.
VERIFY:  pnpm vitest run tests/unit/cli-start-handlers.test.ts && pnpm vitest run tests/integration/prod-server-runtime.test.ts
```

**BDD scenarios obrigatórios:**
- **Happy path:** each branch type routed correctly.
- **Validation error:** unknown path 404.
- **Edge case:** websocket upgrade.
- **Error scenario:** existing prod tests pass.

#### Acceptance Criteria
- [ ] 6 RED tests pass GREEN
- [ ] `startCommand` ≤ 100 LOC
- [ ] No public API change
- [ ] Existing fixture tests pass
- [ ] Zero TS/lint warnings

#### DoD
- [ ] All tests green
- [ ] Manual: `pnpm start` in `fixtures/production-build` serves expected URLs

---

### T6.2 — Split `logger.ts` SRP (PV-12)

#### Objective
Resolve PV-12 (MEDIUM SRP). `server/observability/logger.ts` has 3 concerns: logger factory, request log formatter, structured event emit.

#### Files to edit
```
packages/theo/src/server/observability/logger.ts (MODIFY) — factory only
packages/theo/src/server/observability/request-log.ts (NEW) — request log formatter
packages/theo/src/server/observability/structured-events.ts (NEW) — typed events
tests/unit/logger-split.test.ts (NEW)
```

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_logger_factory_only_concerns() — Given createLogger source, When grep, Then NO request-formatting code
RED:     test_request_log_formatter_isolated() — Given request, When format() called, Then structured output
RED:     test_structured_events_typed() — Given event emit, When typed, Then TS catches wrong shape
RED (EDGE): test_silent_level_emits_nothing() — Given level=silent, When log called, Then no output
RED (ERROR): test_existing_logger_callers_unchanged() — Given existing code, When grep, Then call sites still compile
GREEN:   Split into 3 files.
REFACTOR: None.
VERIFY:  pnpm vitest run tests/unit/logger*.test.ts
```

#### Acceptance Criteria
- [ ] 5 RED tests pass GREEN
- [ ] `logger.ts` ≤ 100 LOC
- [ ] 3-file split clear
- [ ] Existing callers unchanged
- [ ] Zero TS/lint warnings

#### DoD
- [ ] All tests green

---

### T6.3 — `sendError` options bag (PV-17, D3)

#### Objective
Resolve PV-17 (MEDIUM clean_function). `sendError` has 7 params; collapse into options object.

#### Files to edit
```
packages/theo/src/server/http/response.ts (MODIFY — or wherever sendError lives post-Phase-2)
tests/unit/send-error.test.ts (MODIFY)
```

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_sendError_with_options_bag() — Given options object, When sendError called, Then response sent correctly
RED:     test_sendError_param_count_max_2() — Given function signature, When function.length checked, Then ≤ 2 (res, opts)
RED (EDGE): test_backward_compat_or_deprecation() — Given old positional signature, When called, Then either still works (backward compat) OR deprecated cleanly
RED (ERROR): test_existing_send_error_tests_pass() — Given existing tests, When run, Then ALL pass
GREEN:   Refactor to options bag.
REFACTOR: None.
VERIFY:  pnpm vitest run tests/unit/send-error.test.ts
```

#### Acceptance Criteria
- [ ] 4 RED tests pass GREEN
- [ ] `sendError` accepts (res, options) signature
- [ ] Existing tests pass
- [ ] Zero TS/lint warnings

#### DoD
- [ ] All tests green

---

### T6.4 — Unify `executeAction` with `executeRoute` (PV-11)

#### Objective
Resolve PV-11 (MEDIUM KISS). `executeAction` is a parallel API surface that mostly duplicates `executeRoute`. With Phase 5's pipeline, both can share the same pipeline + stages, with action-specific stages mixed in.

#### Files to edit
```
packages/theo/src/server/http/action-execute.ts (MAJOR REWRITE) — compose pipeline with action-specific stages
packages/theo/src/server/http/stages/action-csrf-stage.ts (NEW) — action-specific stricter CSRF
packages/theo/src/server/http/stages/action-input-stage.ts (NEW) — parse FormData or JSON
```

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_action_pipeline_uses_shared_stages() — Given action execution, When pipeline runs, Then csrfStage + validateStage + invokeHandlerStage shared with route pipeline
RED:     test_action_specific_csrf_stricter() — Given action POST without action header, When pipeline, Then 403 (even in warn mode for routes)
RED:     test_action_formdata_input_parsed() — Given form-data POST, When pipeline, Then ctx.input parsed
RED (EDGE): test_action_no_regression() — Given existing action tests (action-execute-plugin, action-error), When run, Then ALL pass
RED (ERROR): test_action_handler_throw_handled() — Given action handler that throws, When pipeline, Then handleRouteError invoked
GREEN:   Unify pipelines + add action-specific stages.
REFACTOR: None.
VERIFY:  pnpm vitest run tests/integration/action-execute-plugin.test.ts
```

#### Acceptance Criteria
- [ ] 5 RED tests pass GREEN
- [ ] `action-execute.ts` LOC reduced ≥ 100
- [ ] Existing action tests pass
- [ ] Zero TS/lint warnings

#### DoD
- [ ] All tests green

---

### T6.5 — Dead code audit + delete (PV-14, PV-15, PV-16, PF-11, PF-17)

#### Objective
Audit 5 dead/over-engineered code paths flagged by Phase 3 + Phase 4. For each: grep consumers. If zero, DELETE. If consumers exist, document why and downgrade severity.

#### Findings to audit

| Finding | File | Action |
|---|---|---|
| PV-14 YAGNI identity helper | `cli/commands/start.ts:149` | Grep callers; delete if dead |
| PV-15 OCP inline predicates | `cache/define-cached-route.ts:319 tryCacheResponse` | Refactor only if 6+ predicates accumulate (currently 5 — acceptable) |
| PV-16 DIP AuthRequiredError | `server/http/execute.ts:418` | Refactor concrete-class import to a type-only import |
| PF-11 Factory over-engineered | `server/define-route.ts:36` (identity helpers) | KEEP — Phase 4 explicitly said don't change |
| PF-17 Mediator over-engineered | `server/serialization.ts:11` | Grep callers; delete if dead post-transformer rollout |

#### Files to edit
```
packages/theo/src/cli/commands/start.ts (MODIFY — delete identity helper if dead)
packages/theo/src/server/serialization.ts (DELETE if dead) OR (MODIFY to delegate to transformer)
packages/theo/src/server/http/execute.ts (MODIFY) — type-only import for AuthRequiredError
docs/concepts/caching.md (MAYBE MODIFY) — note that PV-15 is accepted-as-documented (≤5 predicates)
```

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_PV14_identity_helper_status() — Given start.ts line 149, When grep callers, Then either zero (delete) OR ≥1 (keep + document)
RED:     test_PV16_authError_type_only() — Given execute.ts:418, When inspected, Then import is "import type" not "import"
RED:     test_PF17_serialization_status() — Given serialization.ts, When grep "serializeResponse|deserializeResponse" outside the file, Then either zero (delete file) OR ≥1 (keep + document)
RED:     test_PV15_predicate_count() — Given tryCacheResponse function body, When predicates counted, Then ≤ 5 (acceptable — accepted-as-documented)
RED (EDGE): test_delete_dead_serialization_zero_regression() — Given serialization.ts deleted, When pnpm vitest run, Then ALL tests pass
RED (ERROR): test_PF11_define_route_helpers_unchanged() — Given define-route.ts, When inspected, Then 4-line identity helpers preserved (Phase 4 verdict)
RED (EC-17): test_no_serialization_consumers_outside_pkg() — Given `grep -rln "serializeResponse\\|deserializeResponse" examples/ fixtures/ tests/`, Then ZERO matches BEFORE deletion (plan's original grep only checked packages/; broader scan catches framework consumers)
GREEN:   Apply each finding's action.
REFACTOR: None.
VERIFY:  pnpm vitest run + pnpm exec dependency-cruiser --validate
```

#### Acceptance Criteria
- [ ] 6 RED tests pass GREEN
- [ ] Dead code deleted OR documented as live with reason
- [ ] PF-11 (define helpers) untouched
- [ ] PV-15 documented in `docs/concepts/caching.md` as accepted (≤ 5 predicates)
- [ ] Bundle size verified not to grow
- [ ] Zero TS/lint warnings

#### DoD
- [ ] All tests green
- [ ] Each finding has a documented outcome (delete / refactor / accept)

---

## Coverage Matrix

| # | Finding ID | Severity | Task |
|---|---|---|---|
| 1 | AF-2 | critical | T0.1 |
| 2 | FO-1 (server god folder) | high | T2.1 |
| 3 | FO-2 (server mixed concerns) | high | T2.1 |
| 4 | PV-1 (server SRP) | high | T2.1 |
| 5 | PV-2 (executeRoute 301 LOC) | high | T5.1 |
| 6 | PV-3 (scan DRY 3x) | high | T3.1 |
| 7 | PV-6 (cache 10-11 param bags) | high | T4.3 |
| 8 | PV-7 (startCommand 455 LOC) | high | T6.1 |
| 9 | FO-17 (shallow_organization) | medium | T2.1 (same root) |
| 10 | PV-4 (cookie parser dup) | medium | T3.2 |
| 11 | PV-5 (cache tryRead dup) | medium | T4.2 |
| 12 | PV-8 (CacheStorageAdapter ISP) | medium | T4.4 |
| 13 | PV-9 (execute catch-branch dup) | medium | T3.4 |
| 14 | PV-10 (csrf.warn dup) | medium | T3.3 |
| 15 | PV-11 (executeAction parallel API) | medium | T6.4 |
| 16 | PV-12 (logger.ts SRP) | medium | T6.2 |
| 17 | PV-17 (sendError 7 params) | medium | T6.3 |
| 18 | PF-3 (Singleton misapplied) | medium | T4.1 |
| 19 | PF-19 (Pipeline missing) | medium | T5.1 |
| 20 | AF-3 (config D=0.79) | medium | accepted-as-documented (cosmetic for leaf) |
| 21 | AF-4 (core D=1.00 undercount) | medium | accepted-as-documented (likely measurement artifact) |
| 22 | AF-5 (devtools D=0.74) | medium | accepted-as-documented (leaf module) |
| 23 | FO-7 (cli/lib ambiguous) | low | T0.2 |
| 24 | FO-13 (react-query lonely) | low | accepted (public subpath) |
| 25 | FO-14 (server/_internal lonely) | low | accepted (private intentional) |
| 26 | FO-15 (package_by_layer debate) | low | accepted (correct for framework) |
| 27 | PV-13 (LSP no-finding) | info | no task (TS structural limitation) |
| 28 | PV-14 (YAGNI identity helper) | low | T6.5 |
| 29 | PV-15 (OCP inline predicates) | low | T6.5 (accepted) |
| 30 | PV-16 (DIP AuthRequiredError) | low | T6.5 |
| 31 | PF-11 (Factory over-engineered) | low | T6.5 (keep per Phase 4) |
| 32 | PF-15 (Template Method missing) | low | accepted (low priority) |
| 33 | PF-17 (serialization mediator) | low | T6.5 |
| 34 | Naming pass (preventive) | info | T1.1 (CI guard) |

**Coverage: 27 actionable findings → 17 tasks. 7 explicitly accepted-as-documented with rationale. 100% accounted for.**

## Global Definition of Done

- [ ] All 7 implementation phases completed (Phase 0–6)
- [ ] All RED → GREEN tests passing (~130+ new tests across phases, includes 17 from edge-case review)
- [ ] Zero TypeScript errors (`tsc --noEmit` clean)
- [ ] Zero ESLint warnings
- [ ] Backward compatibility preserved (`theokit/server` exports unchanged)
- [ ] `pnpm exec dependency-cruiser packages/theo/src/ --validate` 0 violations
- [ ] `pnpm exec ls-lint` 0 violations
- [ ] All 2246+ pre-existing tests still pass
- [ ] CHANGELOG strategy: one entry per phase under `[Unreleased]` (granular history), bundled into ONE minor bump at release (EC-23)
- [ ] **Fixture proof** — `fixtures/cache-basic/` + `examples/full-stack-agent/` still demo correctly post-refactor
- [ ] **Dogfood QA PASS** — `/dogfood full` health score ≥ 70

### Documented decisions (from edge-case review)

- **EC-18 (ADR location):** ADRs land in `docs/adr/NNNN-*.md`. Create the directory if missing. `architecture-output/adr-suggestions/` is gitignored audit output, NOT source-of-truth.
- **EC-19 (sequential walker):** `walkSourceFiles` is intentionally sequential — route precedence depends on insertion order. JSDoc must document this.
- **EC-20 (Windows MAX_PATH):** Walker untested on Windows long paths (> 260 chars). TheoKit's deploy targets (Node/edge/CF/Vercel) don't require Windows. JSDoc must note.
- **EC-21 (public API expansion):** `engine.tryReadCached` was private, becomes public in T4.2. Stable contract, documented in CHANGELOG.
- **EC-22 (ctx redundancy):** `RouteCacheCtx` carries fields derivable from user config; construction is O(1), acceptable.
- **EC-23 (CHANGELOG strategy):** see Global DoD above.

## Final Phase: Dogfood QA (MANDATORY)

> Runs AFTER all 7 implementation phases complete.

**Objective:** Validate that the refactor introduced ZERO regressions visible to a real user.

### Execution

```
/dogfood full
```

Plus a manual smoke specifically for THIS plan:

```bash
# 1. The audit re-runs clean
/loop-architecture-review:loop-architecture-review packages/theo/src/ --mode full
# Expected: 0 critical, 0 high findings (down from 1 + 7)

# 2. Cache demo still works
cd examples/full-stack-agent && pnpm dev &
sleep 8
curl -sD - 'http://localhost:3001/api/quote?symbol=AAPL' | grep -i x-theo-cache  # MISS
curl -sD - 'http://localhost:3001/api/quote?symbol=AAPL' | grep -i x-theo-cache  # HIT
curl -s -X POST -H "X-Theo-Action: 1" http://localhost:3001/api/quote-bust  # deleted: 1

# 3. CI guards run
pnpm check:deps   # exit 0
pnpm check:naming # exit 0

# 4. New architecture review re-confirms
cat architecture-output/architecture.db | sqlite3 -line - "SELECT severity, COUNT(*) FROM principle_violations GROUP BY severity"
# Expected: high=0, medium ≤ 4, low ≤ 3
```

### Acceptance Criteria

- [ ] Health score ≥ 70/100
- [ ] Zero CRITICAL issues introduced
- [ ] Zero HIGH issues introduced by this plan's changes
- [ ] Cache demo manual smoke passes (MISS → HIT → bust)
- [ ] CI guards pass on the changed source
- [ ] Re-run of `loop-architecture-review` shows 0 high findings remaining (i.e., the plan succeeded)

### If Dogfood Fails

1. Identify plan-caused vs pre-existing issues.
2. Fix all plan-caused CRITICAL + HIGH before declaring complete.
3. Re-run `/dogfood full` to confirm.
4. Pre-existing issues logged but do NOT block plan completion.
