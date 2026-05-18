# adapter-deno-deploy

Compile-only fixture for the **`deno-deploy`** build target.

```bash
pnpm theokit build --target=deno-deploy
# emits .theo/deno/server.ts (Deno.serve entry, npm: specifiers)
```

## What the adapter emits

- `.theo/deno/server.ts` — TypeScript directly, Deno Deploy consumes TS natively
- `Deno.serve()` request handler
- `Deno.env.get(...)` for env access
- Runtime guard: `typeof Deno === 'undefined'` aborts on Node
- Imports use `npm:theokit` specifiers (Deno Deploy ≥ 1.40)

Compile-only — see ADR D2 in `docs/plans/full-coverage-examples-plan.md`.
