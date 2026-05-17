# Adapters — System Context

> Baseline snapshot — Phase 0 of cross-domain-uplift-plan. Captures the state of `packages/theo/src/adapters/` **before** Phase 1 changes.

## Scope

The `adapters` domain translates a TheoKit application (config + scanned routes + Vite build output) into the artifacts each deploy target consumes. Adapters are **build-time only**: they do not host the HTTP runtime themselves. Runtime is either:

- `theokit start` (for Node, reading `.theo/client/` and serving via `node:http`), or
- A target-specific runtime that consumes the entry-point the adapter emitted (Vercel functions, Cloudflare Worker, etc.).

## Contract (current)

```typescript
// packages/theo/src/adapters/types.ts
export interface DeployAdapter {
  name: string
  build(config: TheoConfig, cwd: string): Promise<void>
}

export type BuildTarget = 'node' | 'vercel' | 'cloudflare'
export const VALID_TARGETS: BuildTarget[] = ['node', 'vercel', 'cloudflare']
```

That is the entire surface. Three knobs: name, build function, target enum.

## Implementations (current)

| Adapter | What `build()` emits | Runtime that consumes it |
|---|---|---|
| `node` | `.theo/client/` (Vite client build) + optional `.theo/server/` (SSR bundle) | `theokit start` (Node `node:http`) |
| `vercel` | `.vercel/output/static/` + `.vercel/output/functions/api.func/index.mjs` + `.vc-config.json` + `config.json` | Vercel serverless runtime invokes `index.mjs` |
| `cloudflare` | `.theo/cloudflare/worker.mjs` (Worker handler as string-emitted module) + `wrangler.toml` + reuses `.theo/client/` from Node build | `wrangler dev`/`wrangler deploy` invokes the Worker |

Adapters compose: `vercel` and `cloudflare` both call `nodeAdapter.build()` first, then layer their target-specific outputs on top.

## Coupling

- All three adapters depend on `vite-plugin/index.ts` (via `nodeAdapter`) and on `config/schema.ts` for the `TheoConfig` type.
- `cli/commands/build.ts` is the only consumer — it dispatches to the right adapter based on `target` flag or `theo.config.ts`.
- Adapters do **not** depend on the server runtime. The runtime they ship (Vercel function, Cloudflare Worker) lazy-imports `theokit/server` modules at the user's installed location.

## Strengths

- Minimal contract (1 method) — easy to extend with new targets.
- Build-only scope = no runtime API to keep stable across deploy targets.
- Each adapter is self-contained: ~40–90 LOC, no shared adapter framework to maintain.

## Limitations (motivating Phase 1)

- Only 3 targets — Bun, Deno Deploy, Netlify, AWS Lambda, Static are absent.
- Emitting Worker code as string-concatenated lines (see `cloudflare.ts` line 18-66) is fragile: no type-check on emitted code, no test on emitted runtime behavior beyond manual `wrangler dev`.
- No mechanism for the user to deploy with multiple targets simultaneously (each `build` overwrites the previous).
- `node` adapter SSR build is gated on `config.ssr`; streaming SSR (T6.1) will need a new gate (`config.ssr.streaming`).

## C1 — Context diagram

```mermaid
flowchart LR
    User[Developer] -->|theokit build --target X| CLI[cli/commands/build.ts]
    CLI -->|invokes adapter.build| Adapter[adapters/{X}.ts]
    Adapter -->|calls Vite| Vite[Vite build pipeline]
    Adapter -->|writes artifacts| FS[(File system: .theo/, .vercel/, wrangler.toml)]
    DeployTarget[Vercel / Cloudflare / Custom host] -->|reads artifacts| FS
```

## Open questions tracked elsewhere

See `docs/plans/cross-domain-uplift-progress.md` for OD-1 (resolved: build-only contract preserved; Phase 1 adapters will emit entry-points as the existing ones do).
