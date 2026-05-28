# Migrating from `theo-stacks` (`create-theo`) to `create-theokit`

> 2026-05-27 — Per [ADR-0013](../adr/0013-theocreate-absorbed-into-create-theokit.md), `theo-stacks` is being absorbed into `create-theokit`. This guide maps the prior templates to Wave 2 paths.

## What changed

`theo-stacks` shipped 19 templates across 7 languages (Node, Go, Python, Rust, Java, Ruby, PHP). Wave 2 absorbs **Python + Node ONLY** into TheoKit's `create-theokit` scaffolder. The other 5 languages are **archived** in `theo-stacks` (read-only) — community can fork.

## Migration map

| `theo-stacks` command | `create-theokit` equivalent |
|---|---|
| `npm create theo@latest -- python-fastapi` | `npx create-theokit my-app --backend python` |
| `npm create theo@latest -- node-fastify` | `npx create-theokit my-app --backend node` (replaces Fastify with **Hono** — fetch-handler-native, Like-Vercel contract) |
| `npm create theo@latest -- node-express` | Same as above — Hono replaces Express |
| `npm create theo@latest -- node-nestjs` | Same as above — Hono replaces NestJS |
| `npm create theo@latest -- go-api` | **No equivalent in Wave 2.** Stays in `theo-stacks` (archived). Community can fork. |
| `npm create theo@latest -- rust-axum` | Same — archived. |
| `npm create theo@latest -- java-spring` | Same — archived. |
| `npm create theo@latest -- ruby-sinatra` | Same — archived. |
| `npm create theo@latest -- php-slim` | Same — archived. |
| `npm create theo@latest -- monorepo-*` | **No equivalent.** TheoKit's monorepo story is the workspace itself, not a generated Turbo/uv/Cargo monorepo. |
| `npm create theo@latest -- node-worker` | Deferred to Wave 3+ — may become `services/worker-node/` with `defineJob` integration |
| `npm create theo@latest -- node-nextjs` / `-- fullstack-nextjs` | Use `npx create-theokit` directly — TheoKit IS the fullstack TS surface. |

## Why narrow to 2 languages?

[ADR-0013](../adr/0013-theocreate-absorbed-into-create-theokit.md) records the scope reasoning:

- **JHipster's matrix-explosion failure** is documented. 7 languages × tests × CI × docs is unmaintainable for one team.
- Wave 2 ships **Python + Node** because both are the lowest-friction validation of the Like-Vercel runtime contract (Python via ASGI/uvicorn; Node via Hono fetch-handler).
- Future waves can add Go/.NET/Rust/Java/Ruby/PHP with fresh ADRs and demand evidence (per [ADR-0011](../adr/0011-moderate-plugin-roadmap-strategy.md)-style gates).

## What stays the same

If you used `theo-stacks` for one of the templates that DOES migrate (`python-fastapi`, `node-fastify`), the runtime contract concepts are familiar — health probes, structured logs, graceful shutdown, Dockerfile. Wave 2's templates make these EXPLICIT and uniform across languages per [ADR-0015](../adr/0015-services-runtime-contract-like-vercel.md).

## Deprecation timeline for `create-theo` (npm)

1. Wave 2 ships with `create-theokit --backend python|node` working end-to-end.
2. `create-theo@final` published with a `console.warn` pointing to `create-theokit`.
3. ~6 weeks after Wave 2 ships: `npm deprecate create-theo "Use create-theokit instead"`.
4. `theo-stacks` repo moves to read-only archive with a `MOVED.md` pointing here.
5. **`create-theo` is NEVER unpublished** — keeps old `npm create theo@x.y.z` working for pinned-version users.

## Stranded users

If your previous template (Go, Rust, Java, Ruby, PHP, or any monorepo-*) is not migrating:

- **Short-term:** keep pinning `create-theo@<last-good-version>`. It still works.
- **Long-term:** fork `theo-stacks` (archived but readable). Community can maintain forks independently.
- **If you have a real production app on one of the archived templates AND want first-party support:** open a discussion on TheoKit GitHub with use case + concrete user count. A fresh ADR with demand evidence is the path to reopening any of the archived languages.

## Questions

- "Why Hono and not Fastify/Express?" — Hono is fetch-handler-native ([ADR-0015](../adr/0015-services-runtime-contract-like-vercel.md) invariant #1). Express/Fastify use Node's `IncomingMessage` API which doesn't fit the universal-fetch-handler contract TheoCloud (Wave 3) consumes. Hono is the lightest path that satisfies the contract uniformly across local docker-compose and TheoCloud.
- "What about the `services` config — was it in `theo-stacks`?" — No, it's a new Wave 2 primitive in `theokit`. See [`docs/concepts/services.md`](../concepts/services.md).
- "Can I generate just the FastAPI service without the TheoKit TS app?" — Wave 2 always pairs them (the app is the wedge). For service-only scaffolds, fork the archived templates in `theo-stacks`.
