# adapter-cloudflare

Compile-only fixture for the **`cloudflare`** Workers build target.

```bash
pnpm theokit build --target=cloudflare
# emits .theo/cloudflare/worker.mjs
```

## What the adapter emits

- `.theo/cloudflare/worker.mjs` — `export default { async fetch(request, env, ctx) {...} }`
- Uses the shared web-shim (`theokit/adapters/web-shim`) so the standard executeRoute pipeline runs against Web Standard Request/Response
- No `node:*` imports

## Real deploy

```bash
npx wrangler deploy
```

`wrangler.toml` is included for reference. Real deploy needs a Cloudflare account; the fixture is compile-only (ADR D2).

Static assets need Workers Sites or R2 — see the framework adapter docs.
