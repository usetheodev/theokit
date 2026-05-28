# 0013. TheoCreate (`theo-stacks` / `create-theo`) absorbed into `create-theokit`

* Status: accepted
* Date: 2026-05-27
* Accepted: 2026-05-27
* Deciders: [TheoKit owner]
* Tags: [scope, scaffolding, theocreate, theo-stacks, cli, deprecation]

## Context and Problem Statement

`theo-stacks` (the repo) publishes `create-theo` (the npm package), a polyglot scaffolder that ships **19 templates in 7 languages**:

- **API/Backend:** `node-express`, `node-fastify`, `node-nestjs`, `go-api`, `python-fastapi`, `rust-axum`, `java-spring`, `ruby-sinatra`, `php-slim`
- **Frontend/Fullstack:** `node-nextjs`, `fullstack-nextjs`
- **Monorepo:** `monorepo-turbo`, `monorepo-go`, `monorepo-python`, `monorepo-rust`, `monorepo-java`, `monorepo-ruby`, `monorepo-php`
- **Worker:** `node-worker`

In parallel, TheoKit already owns `packages/create-theo/` which publishes `create-theokit` and ships its own templates (`default`, `dashboard`, `api-only`, `postgres`, `saas`).

**Two scaffolders, two npm packages, two release cadences, two test matrices, two docs surfaces.** The owner decided 2026-05-27 to collapse this to one.

**Strategic context — this absorption is mechanism, not motive.** The cross-product moat established in [ADR-0012](./0012-mission-expansion-agent-products-on-like-vercel-runtime.md) (invariant #4) requires the SAME Like-Vercel contract running unchanged across `create-theokit` + TheoKit + TheoCloud. As long as `create-theo` ships standalone, the scaffolded code is governed by `theo-stacks` conventions; the framework code by TheoKit conventions; and the deploy by TheoCloud conventions. **Three sources of truth = no moat.** Absorbing `create-theo` into `create-theokit` is the operational step that makes one contract governable across all three surfaces.

## Decision Drivers

- **Owner decision (2026-05-27)** — TheoCreate absorbed into TheoKit
- **Mission expansion ([ADR-0012](./0012-mission-expansion-agent-products-on-like-vercel-runtime.md))** — TheoKit now formally owns the scaffolding role for agent products including polyglot services
- **Cross-product moat preservation** — without absorption, the Like-Vercel contract ([ADR-0015](./0015-services-runtime-contract-like-vercel.md)) cannot be enforced uniformly across scaffold → framework → cloud
- **Single-maintainer reality** — maintaining 19 templates × tests × CI is unsustainable; narrowing is mandatory
- **Avoid scaffold drift** — bug fixes splitting between `create-theo` and `create-theokit` would diverge user experience
- **TheoCloud strategic alignment** — TheoCloud will provision the polyglot services TheoKit scaffolds; one CLI = one contract = one deploy target

## Considered Alternatives

| Alternative | Rejected because |
|---|---|
| Keep `create-theo` standalone, document it as the polyglot path next to `create-theokit` | Two CLIs + two npm packages = doubled support cost + confused users. Owner explicitly rejected. |
| Absorb all 19 templates into TheoKit | Matrix explosion. 7 languages × tests × CI × docs is unmaintainable. JHipster's documented failure mode. |
| Absorb only Python templates in Wave 2 (defer Node service templates to Wave 3) | Owner explicitly said Python AND Node. Node service template is the lowest-friction validation (fetch handler is native) — dropping it would lose validation signal. |
| Absorb but keep `create-theo` as a thin alias to `create-theokit --polyglot-template <name>` | Keeps two npm package names alive. Bug surface for "which one should I use". Deprecate cleanly. |
| Migrate templates verbatim (preserve `node-fastify`, etc.) | Fastify uses Node's IncomingMessage I/O API, not fetch-handler. Replace with Hono (fetch-native) for Wave 2 to fit the Like-Vercel contract (ADR-0015). Fastify can return later if demand. |

## Decision

**Absorption scope (Wave 2):**

| `theo-stacks` template | Action in absorption | Why |
|---|---|---|
| `python-fastapi` | **Absorb as `services/agent-python/`** in `create-theokit --backend python` | Python is Wave 2 priority; FastAPI is ASGI-shaped → fits Like-Vercel contract via uvicorn |
| `node-fastify` / `node-express` / `node-nestjs` | **Replace with new `node-hono` template**, absorbed as `services/agent-node/` in `create-theokit --backend node` | Hono is fetch-handler-native (Web Standards Request/Response). Express/Fastify use Node's IncomingMessage. Like-Vercel contract requires fetch-handler-native. |
| `node-nextjs` / `fullstack-nextjs` | **Discard.** TheoKit IS the fullstack TS surface. | Redundant with TheoKit's own `default` / `dashboard` / `saas` templates |
| `node-worker` | **Defer to Wave 3+** — may become `services/worker-node/` with `defineJob` integration | Not in Wave 2 scope; jobs primitive (R0.5.5) handles workers natively |
| `go-api`, `monorepo-go` | **Archive.** Not in Wave 2 scope. | Wave 2 restricted to Python + Node per [ADR-0012](./0012-mission-expansion-agent-products-on-like-vercel-runtime.md) |
| `rust-axum`, `monorepo-rust` | **Archive.** | Same reason |
| `java-spring`, `monorepo-java` | **Archive.** | Same reason |
| `ruby-sinatra`, `monorepo-ruby` | **Archive.** | Same reason |
| `php-slim`, `monorepo-php` | **Archive.** | Same reason |
| `monorepo-turbo`, `monorepo-python` | **Reference-only.** TheoKit's monorepo story is the workspace itself, not a generated Turbo monorepo. | Not absorbed; reference if a monorepo template is later needed |

**CLI surface change:**

`create-theokit my-app` (today) stays — generates the TS-only TheoKit app.

`create-theokit my-app --backend python` (Wave 2) — generates:
- TheoKit TS app (frontend + server/routes)
- `services/agent-python/` (FastAPI + uv + healthcheck + Dockerfile)
- `theo.config.ts > services: { agent: { runtime: 'python', port: 8001, openapi: 'http://localhost:8001/openapi.json', proxy: '/api/agent' } }`
- Generated `docker-compose.yml` wiring web + service + Postgres + Redis (TheoCloud-shape harness — [ADR-0015](./0015-services-runtime-contract-like-vercel.md))

`create-theokit my-app --backend node` (Wave 2) — generates the same structure with `services/agent-node/` running Hono.

`create-theokit my-app --backend python --backend node` (Wave 2 stretch) — both services, both proxied, both in compose.

**Deprecation timeline for `create-theo` (npm):**

1. Wave 2 ships with `create-theokit --backend python|node` working end-to-end.
2. `create-theo@final` published with a `console.warn` pointing to `npx create-theokit my-app --backend <lang>`.
3. After 1 release cycle (~1–2 months), `create-theo` deprecation marker on npm (`npm deprecate`).
4. `theo-stacks` repo moves to read-only archive with a `MOVED.md` pointing to `theokit/packages/create-theo/`.
5. **Do not unpublish** — keeps old `npm create theo@x.y.z` working for users who have it pinned in CI.

**Cross-repo coordination:**

- `theo-opendocs/content/theocreate/` — content migrates to TheoKit docs (under `docs/concepts/services.md` and similar). Stale Markdown gets a redirect note.
- `theo-website/dist/theocreate/` — landing card retargets to `usetheo.dev/theokit#services`.
- Monorepo `usetheo/README.md` — update "Family" section to remove TheoCreate as separate product.

## Consequences

**Positive:**

- One scaffolder, one CLI, one release cadence
- Maintenance surface shrinks from 19 templates × 7 languages to 5 TS templates + 2 polyglot service templates
- Users get the agent product story end-to-end in one command
- Wave 3 TheoCloud adapter consumes a single manifest shape, no need to bridge two scaffold ecosystems

**Negative:**

- Existing `create-theo` users in Go/Rust/Java/Ruby/PHP lose first-party path. **Mitigation:** the archived `theo-stacks` repo remains readable; community can fork.
- Migration effort for users currently on `create-theo node-fastify` — they must switch to Hono for the absorbed path (or stay on the archived Fastify template forever).
- `theo-website` and `theo-opendocs` need content updates to remove TheoCreate framing.

**Neutral:**

- The Voice and Tone vocabulary table (CLAUDE.md, 2026-05-27 edit) already added the line `"Replaces TheoCreate" / "TheoKit + TheoCreate" → say "scaffolding is in create-theokit"` to prevent public copy from contradicting the absorption.

## Implementation outline (not part of this decision; for sequencing only)

1. **Read-only inventory** — read each absorbed template from `../theo-stacks/templates/python-fastapi/` and decide what stays / what changes
2. **Hono template authoring** — new `services/agent-node/` template from scratch; Hono+TypeScript, healthcheck, structured logs, OpenAPI generation (e.g., `@hono/zod-openapi`)
3. **FastAPI template adaptation** — copy `python-fastapi/`, strip `theo-stacks`-specific bits, add Like-Vercel contract bits (structured stdout logs, healthcheck shape)
4. **`--backend` flag in `create-theokit`** — multi-value flag; each occurrence appends a service to `services: {}`
5. **`docker-compose.yml` generator** — wires services + postgres + redis + (optional) caddy ingress
6. **Test matrix** — fixture-level test per `--backend` combination; smoke test asserting web→service proxy works
7. **`create-theo@final` warn-release**
8. **`theo-stacks` archive + redirects**

## Related ADRs

- [ADR-0012](./0012-mission-expansion-agent-products-on-like-vercel-runtime.md) — mission expansion (this absorption is one of the three forces)
- [ADR-0014](./0014-services-as-external-processes.md) — services as external processes (what the absorbed templates produce)
- [ADR-0015](./0015-services-runtime-contract-like-vercel.md) — Like-Vercel runtime contract (the shape every absorbed template ships)

## References

- `../theo-stacks/README.md` — current state of the absorbed sibling
- `../theo-stacks/templates/` — source of truth for templates being absorbed/archived
- `packages/create-theo/` — current TheoKit scaffolder receiving the absorption
- Owner direction, 2026-05-27 conversation transcript
