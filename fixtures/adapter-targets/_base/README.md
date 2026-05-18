# adapter-targets/_base

Shared app code consumed by every adapter fixture under `adapter-targets/<target>/`. Symlinked into each target-specific subdirectory; only `theo.config.ts` (and any target-specific config like `wrangler.toml`) differs per target.

This shared base proves that **the same TheoKit app code deploys to 8 different targets** without per-target source changes — the adapter is the variable, not the user code.
