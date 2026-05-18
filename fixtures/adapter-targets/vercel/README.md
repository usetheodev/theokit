# adapter-vercel

Compile-only fixture for the **`vercel`** build target (Build Output API v3).

```bash
pnpm theokit build --target=vercel
# emits .vercel/output/{config.json, functions/, static/}
```

## What the adapter emits

- `.vercel/output/config.json` — routes + middleware mapping
- `.vercel/output/functions/<route>.func/` — serverless function bundles
- `.vercel/output/static/` — static assets

## Real deploy

```bash
vercel deploy
```

Compile-only — see ADR D2.
