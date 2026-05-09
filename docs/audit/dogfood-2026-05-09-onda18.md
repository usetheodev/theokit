# Dogfood Report — 2026-05-09 (Onda 18, Deploy Adapters)

## Environment
- Node: v20.19.2
- pnpm: 9.15.0
- Mode: full

## Health Score: 100/100

| Phase | Score | Max | Status |
|-------|-------|-----|--------|
| Pre-flight | 10 | 10 | PASS |
| Scaffold Default | 5 | 5 | PASS |
| Scaffold Templates | 10 | 10 | PASS |
| Frontend | 7 | 7 | PASS |
| API+Actions | 10 | 10 | PASS |
| Cookies | 5 | 5 | PASS |
| Build | 8 | 8 | PASS |
| Production | 10 | 10 | PASS |
| E2E | 10 | 10 | PASS |
| HMR | 5 | 5 | PASS |
| DX | 12 | 12 | 5/5 |
| Regression | 8 | 8 | PASS |

## Issues

Zero issues found.

## Onda 18 — Deploy Adapters
- [x] DeployAdapter interface (name + build function)
- [x] VALID_TARGETS: node, vercel, cloudflare
- [x] `--target` flag on build command
- [x] Invalid target → clear error message
- [x] Node adapter (refactored from build.ts, backward compat)
- [x] `theo build` (no target) = same as before
- [x] `theo docker` generates Dockerfile + .dockerignore
- [x] Dockerfile: multi-stage, node:22-alpine
- [x] Dockerfile: detects pnpm/npm/yarn from lockfile
- [x] Dockerfile: skip if exists (--force to overwrite)
- [x] Vercel adapter generates .vercel/output/ structure
- [x] Vercel: config.json, static/, functions/api.func/
- [x] Vercel: .vc-config.json with nodejs22.x runtime
- [x] Vercel: env vars remain as process.env runtime lookups (EC-1)
- [x] Cloudflare adapter generates worker.mjs + wrangler.toml
- [x] Cloudflare: nodejs_compat = true
- [x] Cloudflare: compatibility_date >= 2025-09-01
- [x] Cloudflare: static assets via [site] bucket
- [x] Zero breaking changes

## Test Counts
- Unit/integration/smoke: 476
- Type tests: 34
- E2E: 13
- **Total: 523**

## Verdict

**100/100 — Ship it.** 18 ondas completas. 3 deploy adapters (Docker, Vercel, Cloudflare). Zero issues.
