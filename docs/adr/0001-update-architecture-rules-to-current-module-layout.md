# 0001. Update `.claude/rules/architecture.md` to reflect the current 11-module layout

* Status: accepted
* Date: 2026-05-23
* Accepted: 2026-05-23 (implemented in T0.1 of architecture-review-remediation-plan)
* Deciders: [TheoKit team]
* Tags: [architecture, documentation, dependency-rules]

## Context and Problem Statement

The repository file `.claude/rules/architecture.md` declares the canonical
allowed dependency direction for `packages/theo/src/`. It currently lists
**7 packages**:

```
core         → (nothing)
router       → core
server       → core
client       → core
vite-plugin  → core, router
cli          → core, vite-plugin
```

Phase 1 of the architecture review enumerated **11 top-level modules** in
the same tree — the rules file predates `adapters`, `cache`, `config`,
`devtools`, and `react-query`. Phase 5 (dependency cartography) measured
16 import edges across those 11 modules and found:

- **Zero cycles** — the Acyclic Dependencies Principle is satisfied.
- **Ten edges that are not declared in the rules file**, e.g.:
  - `cli → server` (weight 20), `cli → adapters` (weight 9),
    `cli → config` (weight 8), `cli → router` (weight 2)
  - `vite-plugin → server` (weight 24), `vite-plugin → config` (weight 1),
    `vite-plugin → devtools` (weight 1)
  - `server → cache` (weight 11), `server → config` (weight 1),
    `server → devtools` (weight 1)

These are not architecture defects — they are deliberate composition that
shipped after the rules file was last edited. The graph is healthy
(acyclic, layered, sparse). The **rules file is stale, not the code**.

Letting the gap persist creates three concrete problems:

1. Phase 5 auditors (human and automated) keep raising the same "10
   violations" finding on every review cycle because the linter has no
   way to distinguish "intended composition" from "rule violation".
2. New contributors reading `.claude/rules/architecture.md` get an
   inaccurate mental model of the codebase, which makes the rules file a
   net negative.
3. The honest signal — that we have 11 modules in a clean DAG with a
   single god folder concentrated in `server/` — is buried under noise.

## Considered Options

* **Option 1 — Update the rules to match reality (recommended).**
  Acknowledge the five additional modules and the deliberate composition
  edges. Re-lock as v2.
* **Option 2 — Restructure the code to honor the rules as written.**
  Extract shared types into `core`, invert `vite-plugin → server`
  (server depends on vite-plugin interfaces in core), route every
  `cli → server` import through the `server/index.ts` public re-export.
  Mechanical refactor, large blast radius (≥ 60 import sites), no
  functional benefit because the graph is already acyclic.
* **Option 3 — Delete the rules file.** Acknowledge that we do not
  enforce a static dependency policy and rely on review.

## Decision Outcome

Chosen option: **Option 1 — update the rules to match reality.**

Rationale:

- KISS: the smallest change that removes the false-positive signal.
- The actual graph is already a clean DAG (Phase 5 verified 0 cycles via
  NetworkX `simple_cycles`). The rules are the artifact that is wrong,
  not the structure.
- Option 2 spends weeks of refactor budget to preserve a doc that nobody
  uses as a build-time linter today. YAGNI.
- Option 3 throws away a valuable artifact. The rules file is a real
  contract — it just needs to reflect the real shape of the codebase.

### Proposed v2 (sketch — finalize during the PR)

```
core         → (nothing)               # unchanged
config       → (nothing)               # NEW; shared infra
router       → core
adapters     → router, vite-plugin     # NEW; deploy targets
cache        → (nothing)               # NEW; feature module
server       → core, cache, config, devtools  # devtools dev-only
client       → core
react-query  → client                  # NEW; single-file re-export
devtools     → (nothing)               # dev-only, tree-shaken in prod
vite-plugin  → core, router, server, config, devtools
cli          → core, vite-plugin, server, adapters, config, router
```

Notes for the v2 doc:

- Add an explicit **forbidden** section: no cycles, `core` must remain
  zero-deps, no module may depend on `cli`.
- Note that `devtools` is dev-only and tree-shaken in prod (verified by
  `tests/unit/devtools-treeshake.test.ts`), so `server → devtools` and
  `vite-plugin → devtools` are intentionally permitted.

## Consequences

* **Good:** the rules file becomes truthful; future Phase 5 audits stop
  re-raising the same critical finding; new contributors get an accurate
  map; the door opens to wire this into a real lint via
  `dependency-cruiser` or `import-linter` later.
* **Bad:** loses some of the original "minimal core" aspirational shape
  (it always was aspirational — the code never matched it).
* **Neutral:** does not change any runtime behavior or bundle size.

## Related findings

- `architectural_findings.id = 2` — *dependency direction violated
  (10 edges)*, severity critical, `suggests_adr = 1`.
- Phase 1 inventory (`architecture-output/baseline/phase1-inventory.md`)
  records the 11-module reality the rules file does not yet acknowledge.
- Phase 5 gate (`quality_gates.phase = 5`) passed with the explicit note
  that the violations are doc-staleness, not code defects.
