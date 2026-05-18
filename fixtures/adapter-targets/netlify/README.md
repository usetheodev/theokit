# adapter-netlify

Compile-only fixture for the **`netlify`** build target.

```bash
pnpm theokit build --target=netlify
# emits .netlify/functions/theo.mjs and merges netlify.toml
```

## EC-2 non-destructive merge

The adapter **preserves** existing user content in `netlify.toml`:

- `[build]` blocks → untouched
- `[[headers]]` blocks → untouched
- `[[redirects]]` blocks → only adds `/api/* → /.netlify/functions/theo` if not present

If an existing `[[redirects]]` from `/api/*` points somewhere else, the build aborts with `NetlifyConflictError` rather than overwriting silently.

The merge is **idempotent** — running the build twice does not duplicate the redirect.

Compile-only — see ADR D2.
