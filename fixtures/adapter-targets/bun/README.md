# adapter-bun

Compile-only fixture for the **`bun`** build target.

```bash
pnpm theokit build --target=bun
# emits .theo/bun/server.mjs (Bun.serve entry, no node:http)
```

## What the adapter emits

- `.theo/bun/server.mjs` — uses `Bun.serve()` + `Bun.file()`
- Runtime guard: `typeof Bun === 'undefined'` aborts on Node
- Bun version check: requires `Bun.version >= 1.1`
- No `node:http` imports

## Compile-only (ADR D2)

This fixture validates only that the adapter emits the expected file shape. Real deploy to Bun runtime would need a separate test environment. The integration test asserts:

1. Build command exits 0
2. Emitted file references `Bun.serve`
3. Emitted file contains no `node:http` import

See `fixtures/adapter-targets/_base/` for the shared app this fixture exercises.

## Run

```bash
npx vitest run tests/unit/fixture-adapter-bun.test.ts
```
