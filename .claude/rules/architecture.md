---
paths:
  - "packages/**/*.ts"
  - "packages/**/*.tsx"
  - "app/**/*.ts"
  - "app/**/*.tsx"
  - "server/**/*.ts"
---

# Architectural Boundaries

> **Version 2 — 2026-05-23.** Updated per ADR-0001 (`docs/adr/0001-update-architecture-rules-to-current-module-layout.md`) to reflect the actual 11-module layout in `packages/theo/src/`. The previous v1 (7 packages) was stale — it predated `cache/`, `devtools/`, `config/`, `adapters/`, `react-query/`. The graph is acyclic (Acyclic Dependencies Principle satisfied, verified by `loop-architecture-review` 2026-05-23) and intentional. The two invariants that never change: **0 cycles** and **`core` depends on nothing**.

## Module Map (v2 — 2026-05-23)

11 top-level modules under `packages/theo/src/`. `kind` classifies the module's role:

| Module | Kind | Public API entry | Notes |
|---|---|---|---|
| `core/` | shared | `theokit` (root) | Foundational types; depends on NOTHING (INVARIANT) |
| `config/` | layer | none (internal) | `theo.config.ts` schema + loader |
| `adapters/` | adapter | `theokit/adapters/web-shim`, `theokit/adapters/ws-shim` | Runtime adapters (Node, Edge, etc.) |
| `router/` | layer | none (internal) | App-router internals (file-system routing) |
| `client/` | layer | `theokit/client` | Typed client (`theoFetch`) |
| `react-query/` | feature | `theokit/react-query` | TanStack Query bridge (consumes `client/`) |
| `cache/` | feature | re-exported via `theokit/server` | Cache primitives shipped 2026-05-22 |
| `devtools/` | feature | none (dev-only) | Dev overlay; consumed by `vite-plugin/` |
| `server/` | layer | `theokit/server` | Backend runtime; re-exports cache + define helpers |
| `vite-plugin/` | layer | `theokit/vite-plugin` | Vite integration (HMR, build, plugins) |
| `cli/` | layer | bin (`theokit dev/build/start/...`) | Process entry point |

## Dependency Direction (INVIOLÁVEL — v2)

The dependency graph is a small DAG. 16 edges across the 11 modules. **Zero cycles, ever.**

```
core           → (nothing)                                      [INVARIANT 1]
config         → core
cache          → core
router         → core
client         → core
react-query    → client
adapters       → core, router
devtools       → (nothing internal — leaf, dev-only)
server         → core, cache, config, devtools                  (defining + observability)
vite-plugin    → core, router, server, config, devtools
cli            → core, vite-plugin, server, config, router, adapters
```

**Invariants (verifiable in CI via `dependency-cruiser`):**

1. **`core` depends on NOTHING outside itself.** Adding any cross-module import in `core/` is a build failure.
2. **Zero cycles ever** (Acyclic Dependencies Principle, Robert Martin 1995 — *consensus*).
3. **Public API only flows through barrels.** Cross-module imports go through `<module>/index.ts`, never reach into `<module>/_internal/`.
4. **Leaf modules stay leaf.** `react-query`, `devtools`, `adapters/*-shim` are consumed but should not consume framework internals beyond their declared edges.

**Standalone packages (outside this graph):**

- `create-theo/` — scaffolding tool, published as `create-theokit`, no runtime dependency on `theokit/*`.

## Application Structure (user-facing — unchanged from v1)

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
- `core` NEVER depends on any other module
- Circular dependencies are FORBIDDEN (consensus — Acyclic Dependencies Principle)
- `agents/`, `memory/`, `mcp/`, `workflows/` are OUT of MVP scope
- No `any` in production code
- No `@ts-ignore` in production code
- Node.js APIs only in adapter layer (use Web Standards in core)

## Enforcement

These rules are encoded in `/.dependency-cruiser.cjs` (Phase 1 of architecture-review-remediation-plan) and run on every PR via `.github/workflows/architecture-guards.yml`. A PR that introduces a cycle, violates the direction graph, or uses an invalid case-style for filenames fails CI before review.
