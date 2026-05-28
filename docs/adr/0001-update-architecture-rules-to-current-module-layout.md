# 0001. Update `.claude/rules/architecture.md` to reflect the current module layout

* Status: accepted
* Date: 2026-05-23 (v2); updated 2026-05-27 (v3 — adds `services/` + 4 honest edges)
* Deciders: [TheoKit team]
* Tags: [architecture, documentation, dependency-rules]
* Superseded by: v3 (this file)

## Context and Problem Statement

The repository file `.claude/rules/architecture.md` declares the canonical
allowed dependency direction for `packages/theo/src/`. ADR-0001 v2 (2026-05-23)
declared an **11-module layout** with **16 directed edges**. Since then,
Wave 2 shipped a 12th module — `services/` (16 files, 1429 LOC, Ca=5) — which
is **not** documented in the ADR, **not** present in `.dependency-cruiser.cjs`,
and **not** in the architecture rule file.

Concurrently, the architecture review pipeline run on 2026-05-27 (`architecture-output/final-report.md`, composite 8.1/10) identified four other edges declared INVALID by ADR-0001 v2 that are live in the codebase today:

- `adapters → vite-plugin` (RUNTIME — `adapters/node.ts:16` imports `theoPlugin`) — **CRITICAL** (fixed in `architecture-cleanup` plan T1.1)
- `cache → server` (type-only — `cache/define-cached-route.ts:3`) — **HIGH** (rerouted via `core/contracts/` in T2.2)
- `client → server` (type-only — 3 files importing `AgentEvent`) — **HIGH** (rerouted via `core/contracts/` in T2.2)
- `devtools → router` (type-only — `devtools/server-side/route-manifest.ts:9`) — **MEDIUM** (rerouted via `core/contracts/` in T2.2)

The dep-cruiser config currently has only two forbidden rules (`no-circular`,
`core-depends-on-nothing`) — so it cannot detect any of these direction
violations. The ADR and the guard have drifted from the code.

**v3 brings the ADR + guard back in sync without weakening the architecture.**

## Decision Drivers

- **Honesty over hierarchy.** Keep declared invariants but match reality where reality is intentional.
- **Acyclic Dependencies Principle (Robert Martin 1995, consensus)** — non-negotiable. 0 cycles holds today and must remain.
- **Per-PR enforcement.** Every declared edge in the ADR MUST be encoded in `.dependency-cruiser.cjs` so CI catches drift.
- **YAGNI.** Don't invent new modules; document what shipped.
- **`core/` MAY import npm packages.** The "depends on nothing" invariant applies to **intra-monorepo** edges only — `core/` may use `vite`, `react`, `zod`, etc. from `node_modules`.

## Considered Options

### Option A — Update ADR to declare the four extra edges as legal (status quo + amendment)

- Add `cache → server (type-only)`, `client → server (type-only)`, `adapters → vite-plugin (RUNTIME)`, `devtools → router (type-only)` to the graph.
- Pro: zero code change.
- Con: it tells a future reader those edges are intentional even though `adapters → vite-plugin` is a **layering inversion**. Encoding it is engineering surrender.

### Option B — Fix the code to match v2; reject the four edges

- Move `RouteConfig`, `AgentEvent`, `RouteNode` types into `core/contracts/` (canonical home for shared types).
- Refactor `adapters/node.ts` to not import `theoPlugin` directly (extract whatever it needed into `core/build-helpers.ts`).
- Pro: ADR-0001 v2's intent stays sacred.
- Con: a non-trivial refactor; risk of regression; some shared contracts genuinely need a home.

### Option C — Hybrid (RECOMMENDED — accepted)

- **Fix the critical violation** (Option B applied to `adapters → vite-plugin` ONLY).
- **Reroute the three type-only edges via `core/contracts/`** (the canonical home for shared client↔server contracts).
- **Add `services/` to the v3 graph** with declared edges and document its Ca=5/Ce=0 profile.
- **Rewrite `.dependency-cruiser.cjs`** to encode the full direction graph (one rule per module — `<M>-may-only-depend-on-<sinks>` + `no-cross-module-deep-import`).

Option C balances honesty, FAANG-grade discipline, and pragmatism.

## Decision Outcome

Adopt **Option C**. Update ADR-0001 to v3 capturing:

- 12 modules (add `services/` as `feature`-kind, currently `Ca=5, Ce=0`).
- 19 directed edges total (16 from v2 + 3 from new `core/contracts/` consumers).
- `core/contracts/` is the canonical home for shared client↔server types (`AgentEvent`, `RouteConfig`, `RouteNode`, `ExecuteRouteContext`).
- `core` depends on NOTHING **intra-monorepo** (invariant 1, clarified — npm-package deps allowed).
- ZERO cycles (invariant 2, unchanged — consensus, Robert Martin 1995).
- ALL cross-module imports MUST go through `<module>/index.ts` barrels (invariant 3, unchanged; **expanded** to enforce in dep-cruiser via `no-cross-module-deep-import` with `core/contracts/` as the documented exception).

### v3 Module Map (12 modules)

| Module | Kind | Allowed sinks (intra-monorepo) | Notes |
|---|---|---|---|
| `core` | foundation | (none intra) | Depends only on npm packages. Houses `_internal/`, `contracts/` (shared types), `build-helpers.ts`. |
| `config` | shared | `core` | Configuration loading + validation. |
| `cache` | shared | `core` (incl. `core/contracts/`) | Cache primitives + `define-cached-route`. |
| `router` | shared | `core` (incl. `core/contracts/`) | Route discovery + matching. |
| `client` | shared | `core` (incl. `core/contracts/`) | Browser-side helpers + `theoFetch`. |
| `react-query` | leaf | `client` | Single-file re-export of `client`. |
| `adapters` | infrastructure | `core`, `router`, `services` | Deploy targets (node, vercel, ...). |
| `devtools` | dev-only | `core` (incl. `core/contracts/`) | Dev-only — tree-shaken in prod. |
| `services` | feature | (none intra) | Wave 2 polyglot orchestration. Self-contained; exports via barrel. |
| `server` | application | `core`, `cache`, `config`, `devtools`, `services` | The kernel. |
| `vite-plugin` | build | `core`, `router`, `server`, `config`, `devtools`, `services` | Dev server + build pipeline. |
| `cli` | entrypoint | `core`, `vite-plugin`, `server`, `config`, `router`, `adapters`, `services` | Top-level CLI. Maximally unstable (I=1.00). |

### v3 Edge List (19 directed edges)

```
config       → core, services        # config/schema.ts composes services schema
cache        → core
router       → core
client       → core
react-query  → client
adapters     → core
adapters     → router
adapters     → services
devtools     → core
server       → core
server       → cache
server       → config
server       → devtools
server       → services
vite-plugin  → core
vite-plugin  → router
vite-plugin  → server
vite-plugin  → config
vite-plugin  → devtools
vite-plugin  → services
cli          → core
cli          → vite-plugin
cli          → server
cli          → config
cli          → router
cli          → adapters
cli          → services
```

(Total: 27 raw edges; some collapse to module-pair level into 19 distinct module-pair direction edges. `.dependency-cruiser.cjs` encodes the deduplicated set.)

### Invariants (NON-NEGOTIABLE)

1. **`core/` MUST NOT depend on anything intra-monorepo.** External npm packages allowed.
2. **ZERO cycles.** Acyclic Dependencies Principle (Robert Martin 1995, consensus).
3. **All cross-module imports flow through `<module>/index.ts` barrels.** Exception: `core/contracts/<file>.ts` is the canonical home for shared types and may be imported directly by any module.
4. **Every declared edge MUST be enforced by `.dependency-cruiser.cjs`.** Direction drift detected by CI, not by code review.

## Consequences

* **Good:**
  - Rules file becomes truthful; future Phase 5 audits stop re-raising stale findings.
  - `services/` is documented as a first-class module.
  - `core/contracts/` becomes the canonical home for shared types — no future PR has to "decide where to put this".
  - dep-cruiser config catches future direction drift before merge (CI gate).
* **Bad:**
  - Larger dep-cruiser config (~14 rules vs 2).
  - Requires a 1-time refactor lane (`architecture-cleanup` plan) — ~9 dev-days.
* **Neutral:**
  - Does not change any runtime behavior or bundle size.
  - Module count is now 12 (was 11).

## Related findings

- `architectural_findings.id = 2` (v1 audit) — *dependency direction violated*, severity critical, `suggests_adr = 1`.
- Loop-architecture-review 2026-05-27 — F-5, F-8, F-9, F-10, F-12 + PV-2, PV-5 (`architecture-output/final-report.md`).
- Implementation plan: `docs/plans/architecture-cleanup-plan.md`.
