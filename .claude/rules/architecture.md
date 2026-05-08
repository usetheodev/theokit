---
paths:
  - "packages/**/*.ts"
  - "packages/**/*.tsx"
  - "app/**/*.ts"
  - "app/**/*.tsx"
  - "server/**/*.ts"
---

# Architectural Boundaries

## Package Structure

```
packages/
├── core/           # Pure types, definitions, contracts (ZERO deps on other @theo)
├── router/         # File-system router for app/
├── server/         # Backend runtime (routes, actions, middleware, context)
├── client/         # Typed client for consuming routes/actions
├── vite-plugin/    # Vite integration, HMR, build
├── cli/            # theo dev, build, start
└── create-theo/    # Scaffolding tool (standalone)
```

## Dependency Direction (INVIOLÁVEL)

```
@theo/core          → (nothing)
@theo/router        → @theo/core
@theo/server        → @theo/core
@theo/client        → @theo/core
@theo/vite-plugin   → @theo/core, @theo/router
@theo/cli           → @theo/core, @theo/vite-plugin
@theo/create-theo   → (nothing — standalone)
```

## Application Structure

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
- `@theo/core` NEVER depends on any other @theo package
- Circular dependencies are FORBIDDEN
- `agents/`, `memory/`, `mcp/`, `workflows/` are OUT of MVP scope
- No `any` in production code
- No `@ts-ignore` in production code
- Node.js APIs only in adapter layer (use Web Standards in core)
