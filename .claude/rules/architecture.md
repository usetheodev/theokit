---
paths:
  - "packages/**/*.ts"
  - "packages/**/*.tsx"
  - "app/**/*.ts"
  - "app/**/*.tsx"
  - "server/**/*.ts"
---

# Architectural Boundaries

> **Version 3.1 — 2026-05-27.** Patch on v3 adding the **Naming convention exceptions** section (last section of this doc) — codifies that `.tsx` files use PascalCase (React community convention) so future audits don't re-flag `devtools/components/Tabs/<TabName>Tab.tsx`-style structures. No code changes; `.ls-lint.yml` already permits both `PascalCase | kebab-case` for `.tsx`. See `docs/audit/architecture-rules-v3.1-pascal-case-exception-2026-05-27.md` for the decision rationale.
>
> **Version 3 — 2026-05-27.** Updated per ADR-0001 (`docs/adr/0001-update-architecture-rules-to-current-module-layout.md`) to reflect the actual 12-module layout in `packages/theo/src/` after Wave 2 polyglot services shipped. The previous v2 (11 packages) was stale — it predated `services/`. The graph is acyclic (Acyclic Dependencies Principle satisfied, verified by `loop-architecture-review` 2026-05-27) and intentional. The four invariants that never change: **0 cycles**, **`core` depends on nothing intra-monorepo**, **public API flows through barrels**, **`core/contracts/` is the canonical home for shared client↔server types**.

## Module Map (v3 — 2026-05-27)

12 top-level modules under `packages/theo/src/`. `kind` classifies the module's role:

| Module | Kind | Public API entry | Notes |
|---|---|---|---|
| `core/` | foundation | `theokit` (root) | Foundational types; depends on NOTHING intra-monorepo. Houses `_internal/`, `contracts/` (shared types), `build-helpers.ts`. May import npm packages (vite, react, zod, etc). |
| `config/` | shared | none (internal) | `theo.config.ts` schema + loader |
| `adapters/` | infrastructure | `theokit/adapters/web-shim`, `theokit/adapters/ws-shim` | Runtime adapters (Node, Vercel, CF Workers, etc.) |
| `router/` | shared | none (internal) | App-router internals (file-system routing) |
| `client/` | shared | `theokit/client` | Typed client (`theoFetch`) |
| `react-query/` | leaf | `theokit/react-query` | TanStack Query bridge (consumes `client/`) |
| `cache/` | shared | re-exported via `theokit/server` | Cache primitives shipped 2026-05-22 |
| `devtools/` | dev-only | none (dev-only) | Dev overlay; consumed by `vite-plugin/` |
| `services/` | feature | `theokit` re-exports | Wave 2 polyglot orchestration (Python/Node sidecars). Self-contained — no intra-monorepo deps. |
| `server/` | application | `theokit/server` + sub-barrels (`/auth`, `/cache`, `/jobs`, `/crons`, `/cost`) | Backend runtime kernel |
| `vite-plugin/` | build | `theokit/vite-plugin` | Vite integration (HMR, build, plugins) |
| `cli/` | entrypoint | bin (`theokit dev/build/start/...`) | Process entry point. Maximally unstable (I=1.00). |

## Dependency Direction (INVIOLÁVEL — v3)

The dependency graph is a small DAG. 19 directed module-pair edges across the 12 modules. **Zero cycles, ever.**

```
core           → (nothing intra-monorepo)                       [INVARIANT 1]
config         → core, services         # config/schema.ts composes services schema
cache          → core (incl. core/contracts/)
router         → core (incl. core/contracts/)
client         → core (incl. core/contracts/)
react-query    → client
adapters       → core, router, services
devtools       → core (incl. core/contracts/)
services       → (nothing intra-monorepo)                       [Wave 2 leaf]
server         → core, cache, config, devtools, services
vite-plugin    → core, router, server, config, devtools, services
cli            → core, vite-plugin, server, config, router, adapters, services
```

**Invariants (verifiable in CI via `dependency-cruiser`):**

1. **`core` depends on NOTHING intra-monorepo.** Adding any cross-module import in `core/` is a build failure. External npm packages (vite, react, zod, etc.) are allowed — the invariant is about internal layering, not about bundle isolation.
2. **Zero cycles ever** (Acyclic Dependencies Principle, Robert Martin 1995 — *consensus*).
3. **Public API only flows through barrels.** Cross-module imports go through `<module>/index.ts`, never reach into `<module>/<file>.ts`. **Exception:** `core/contracts/<file>.ts` is the canonical home for shared client↔server types (`AgentEvent`, `RouteConfig`, `RouteNode`, `ExecuteRouteContext`) and may be imported directly by any module.
4. **Leaf modules stay leaf.** `react-query`, `devtools`, `services` are consumed but should not consume framework internals beyond their declared edges.

**Standalone packages (outside this graph):**

- `create-theo/` — scaffolding tool, published as `create-theokit`, no runtime dependency on `theokit/*`.

## Application Structure (user-facing — unchanged from v2)

```
app/                # Frontend — file-based routing
├── page.tsx        # Route component
├── layout.tsx      # Layout wrapper
├── loading.tsx     # Suspense fallback
├── error.tsx       # Error boundary
└── not-found.tsx   # 404

server/             # Backend — explicit routes & actions
├── routes/         # HTTP API routes (defineRoute)
├── actions/        # Server actions (defineAction)
├── middleware.ts   # Middleware stack
├── context.ts      # Request context factory
└── errors.ts       # Domain error types
```

## Prohibitions

- `app/` NEVER imports `server/` internals directly (use typed client or actions)
- `core` NEVER depends on any other intra-monorepo module
- Circular dependencies are FORBIDDEN (consensus — Acyclic Dependencies Principle)
- Cross-module deep imports (`from '../<otherModule>/<file>.js'`) FORBIDDEN — flow through barrels. Exception: `core/contracts/<file>.ts`.
- `agents/`, `memory/`, `mcp/`, `workflows/` are OUT of MVP scope
- No `any` in production code
- No `@ts-ignore` in production code
- Node.js APIs only in adapter layer (use Web Standards in core)

## Enforcement

These rules are encoded in `/.dependency-cruiser.cjs` (rewritten per ADR-0001 v3 with 14 rules: `no-circular`, `core-depends-on-nothing`, 12 `<module>-may-only-depend-on-<sinks>` rules) and run on every PR via `.github/workflows/architecture-guards.yml`. A PR that introduces a cycle, violates the direction graph, deep-imports across modules, or uses an invalid case-style for filenames fails CI before review.

---

## Naming convention exceptions (v3.1)

`.ls-lint.yml` encodes the canonical conventions; this section documents the **why** behind exceptions so future audits don't re-flag them as inconsistency.

### React component files — PascalCase

`.tsx` files that export a React component use PascalCase by community convention. Example: `<MyComponent>.tsx` exports `MyComponent`. This is encoded in `.ls-lint.yml`:

```yaml
ls:
  packages/theo/src:
    .tsx: PascalCase | kebab-case | regex:use[A-Z][A-Za-z0-9]* | regex:[A-Z]{2,}[A-Za-z0-9]*
```

**Examples in the codebase:**
- `packages/theo/src/devtools/components/Tabs/{CsrfReadinessTab,ErrorsTab,RequestsTab,RoutesTab,SettingsTab}.tsx`
- `packages/theo/src/devtools/components/ui/{Button,Badge}.tsx` and other UI primitives

The directory `Tabs/` is also PascalCase **by intent** — it mirrors the React component family it contains. This is canonical React structure (`MyComponentGroup/MyComponent.tsx`) and **NOT** a naming inconsistency that auditors should flag.

### React hooks — camelCase `use*`

Functions starting with `use` are React hooks. `.ls-lint.yml` admits `regex:use[A-Z][A-Za-z0-9]*`. Examples: `useAgentStream.ts`, `useDrag.ts`.

### TypeScript `.ts` files — kebab-case (default)

All other `.ts` files default to kebab-case (`adapter-support.ts`, `define-cached-route.ts`). Exceptions:
- Type-test files: `<Name>.test-d.ts` (mirror the type they test) — admitted via `regex:[A-Z][A-Za-z0-9]*\.test-d` rule
- Acronym-prefix PascalCase TSX (e.g., `JSONExplorer.tsx`) — admitted via `regex:[A-Z]{2,}[A-Za-z0-9]*` rule

### Decision rationale (P-3 of architecture-medium-deferrals plan)

The `/loop-architecture-review` 2026-05-27 audit flagged `Tabs/` as a naming violation. The flag is a **false positive on the heuristic side** — `.ls-lint.yml` ALREADY permits both casings; the audit's expectation of uniform case-style is too strict for React conventions. Decision: **document the exception, do not rename**.

See `docs/audit/architecture-rules-v3.1-pascal-case-exception-2026-05-27.md` for the full audit trail.
