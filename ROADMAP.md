# ROADMAP — framework surface parity

Sixteen milestones, one per framework surface. Each surface is a `*-specialist` skill under
`.claude/skills/`; a milestone closes when the published packages meet that surface's contract and
`/acceptance` says so against the released artifact.

**Revised 2026-08-21: the surfaces are not held to one standard.** Five must reach parity, ten must
meet a declared minimum contract, one is delisted. The criterion that sorts them is in § Two bands,
and the measured state each assignment was made from is in the table below it.

## What "done" means here

**The target is the specification, not a competitor's release.** Parity is measured against
WHATWG / W3C / RFC where a specification exists, and against the surface's own documented contract
where one does not. "Next.js does it this way" is prior art; it is never the criterion — the same
rule gate G5 enforces at intake (`.claude/rules/cycle-backlog.md § Hard gates`).

**The artifact is the released build, never the working tree.** These are internal packages, so
`/acceptance` builds from the released tag in a clean checkout and consumes the result the way a
real consumer does (`.claude/rules/cycle-acceptance.md § Target kinds`). `pnpm dev` against a dirty
tree is not an acceptance run.

**The checkbox is flipped by `/acceptance`, never by hand.** `[x]` claims *"we shipped it and
watched it work"*. Only `ACCEPTED` or `ACCEPTED_WITH_CAVEATS` may flip it, and only one flips per
release (`.claude/rules/cycle-acceptance.md § Hard gates`).

## Three-target parity is transversal

`.claude/rules/three-target-parity.md` (owner-declared, 2026-08-19) constrains every milestone
rather than adding one of its own. Each Definition of done therefore carries three lines naming
which targets the surface applies to and how the other two reach it.

They are written as gradeable criteria rather than as plain declarations on purpose: the rule's own
anti-patterns say that *"declaring a target supported because a package exists for it"* is the
failure mode, and that *"the evidence is an exercised path"*. A line `/acceptance` cannot grade is a
declaration, which is exactly what the rule refuses to accept.

`not applicable` is a complete answer when the reason is intrinsic — a terminal has no viewport. It
is not an answer when the reason is that nobody wired it.

The instrument for those lines is the north-star application
(`.claude/rules/northstar-app.md`): one backend, one presenter, a Web and a TUI front-end rendering
the same runs. It is what turns *"Tauri reaches this in-process"* from a declaration into an
exercised path.

**One open decision gates two milestones.** `three-target-parity.md § The authorization seam` records
that `callProcedure` runs no middleware and no auth by deliberate design, and that the fix is an ADR
rather than an issue: authorization either lives in a transport-independent context contract both
paths execute, or each surface stays responsible with a primitive the framework provides. M1 and M13
cannot close before that ADR is decided, and their target lines say so instead of assuming an answer.

It does not replace `/acceptance`. Acceptance grades the **released** artifact against the criteria
below; the north-star app runs continuously against the working framework and catches the
regression before it ships. A milestone naming the app as its instrument still has to pass
acceptance against the published build.

## The gap files are not evidence

Eleven of the sixteen `theokit-gap.md` files came back materially wrong on re-measurement
(2026-08-19): capabilities listed as missing that exist, capabilities listed as present that are
dead code. Building this roadmap on them would have scheduled the reimplementation of finished work
and declared finished what was never built.

**No criterion below cites a gap file.** Each cites the measurement, an issue, or a `file:line`.
Four surfaces re-measured clean (i18n, asset-optimization, dev-experience, multi-zone) and two with
fine corrections (navigation-prefetching, route-conventions).

## Two bands — parity where it decides, a minimum contract everywhere else

Revised 2026-08-21 on the owner's instruction: **every surface must be implemented; only the
principal ones must reach parity.** Sixteen surfaces held to a single standard was the programme
declaring an ambition rather than a plan. Ten of them hold measured defects worth fixing and no
measured need for a competitor's full surface area — and a criterion nobody intends to schedule
reads exactly like one nobody has got to yet, which is the failure this repository spends most of
its gates preventing elsewhere.

**The criterion that separates the bands is declared, not felt.** A surface is in the **parity
band** when the framework's own thesis fails without it:

1. an agent or a page is served **wrongly or unsafely** — a defect, not a missing convenience; or
2. the **three-target split** (`.claude/rules/three-target-parity.md`) breaks, so a capability is
   reachable from one target only; or
3. a **benchmark journey already measured as lost or tied** (`docs/program/dx-benchmark.md`)
   depends on it.

Everything else is in the **minimum-contract band**. A minimum contract is not a lowered bar — it
is a different one: what the surface must **do, document and refuse**, graded exactly the same way,
with no competitor's surface as the reference. A surface in this band ships a working, honest
subset and says in its own documentation what it does not do. *"We do not transform images"* in the
docs is a met contract; the same absence undocumented is a defect.

| Band | Surfaces | What closes it |
|---|---|---|
| **Parity required** | M1, M2, M3, M8, M14 | the full Definition of done, then `/acceptance` against the released artifact |
| **Minimum contract** | M4, M5, M6, M7, M9, M10, M11, M12, M13, M15 | the minimum contract, then `/acceptance` against the released artifact |
| **Delisted** | M16 | nothing — it is not scheduled and not counted |

**A deferred criterion is recorded, never deleted.** Every minimum-contract milestone keeps its
original criteria under *"Parity criteria — recorded, not scheduled"*. They are the answer to
*"what would parity have meant here"*, and picking one up later costs a `/backlog-item` rather than
an excavation.

**The three-target lines stay binding in both bands.** `three-target-parity.md` is transversal by
construction: a surface that works on Web only is not a smaller surface, it is a broken one. So
`Applies to` / `Tauri` / `TUI` move **into** each minimum contract rather than into its deferred
list.

**What this revision does not do.** It flips no checkbox and closes no milestone. Narrowing scope
is the owner's call; deciding that a surface is done is `/acceptance`'s, against a released
artifact (`.claude/rules/cycle-acceptance.md`). Every box below is still `[ ]`.

### The state each assignment was made from, measured 2026-08-21

Read from source against the working tree, not from the milestone prose that preceded it. Several
rows contradict the text of their own milestone, which is why each is dated and cited — and why the
contradictions below are corrected in place rather than edited away.

| Surface | Measured state | Evidence |
|---|---|---|
| M1 | CSRF default-on, server-only import gate and policy seam all present | `packages/theo/src/server/web-handler.ts:508`, `packages/theo/src/vite-plugin/server-boundary.ts`, `packages/theo/src/core/contracts/route-policy.ts:65,86` |
| M2 | document, head and hydration script emitted; the TDZ B-002 records is gone | `packages/theo/src/router/entry-server.ts:70,226-230` |
| M3 | the route scan sorts by code unit, **the consolidated walker does not**, and no CI job grades reproducibility | `packages/theo/src/router/scan.ts:142` vs `packages/theo/src/server/_internal/scan-walker.ts:36` |
| M4 | per-segment precedence exists as a named comparator | `packages/theo/src/server/_internal/compare-by-code-unit.ts`, `packages/theo/src/server/scan/scan.ts:209` |
| M5 | engine initialised at boot in `start` and `dev`; `defaults` reaches it | `packages/theo/src/server/cache-bootstrap.ts:28`, `packages/theo/src/cache/cache-engine.ts:109` |
| M6 | `Link` prefetches on intent and viewport; `ScrollRestoration` appears in **no file** under `packages/` | `packages/theo/src/client/link.tsx:4-10` |
| M7 | a prod-like local run is still `build` then `start` | `packages/create-theokit/templates/default/package.json.tmpl:7-9` |
| M8 | **the trace exists now** — identity is on the span and the serializer reads it, so B-019 is closed in code | `packages/theo/src/server/observability/span.ts:9-22`, `packages/theo/src/server/observability/otlp-serializer.ts:80` |
| M9 | head hoisting and a metadata component both exist | `packages/theo/src/vite-plugin/hoist-head-tags.ts`, `packages/theo/src/client/metadata.tsx` |
| M10 | `srcSet`/`sizes` forwarded; **no transform pipeline, no fonts module, no `sharp`** | `packages/theo/src/client/image.tsx:8,24-25` |
| M11 | the pipeline lives in `@theokit/ui`, outside this repository | — |
| M12 | `lang=` appears in **no file** under `packages/theo/src` | — |
| M13 | the published builder's shape is not the shape the runner invokes | `packages/theo/src/server/define/middleware-builder.ts:26` vs `packages/theo/src/server/http/middleware-runner.ts:35-36` |
| M14 | streaming and security headers landed; **`agent` appears in zero adapter files** | `packages/theo/src/adapters/` |
| M15 | `noindex` and `robots` appear in **no file** under `packages/theo/src` | — |
| M16 | nothing to fix was ever measured | § M16 |

**Two rows move a milestone's own text, and both move it in the same direction.** M8's harder half
— the trace, not the span — is done while its criterion below still says it is not, and M5's two
named blockers are both wired. Neither is a checkbox: implemented is not accepted, and the boxes
stay `[ ]` until `/acceptance` runs against a released artifact.

**One row is worse than its milestone claims.** M3's determinism fix landed in the route scanner and
not in the walker three other scanners share, so the milestone reads as half-fixed and is closer to
a quarter.

### Coverage — every open criterion has registered work

The band table above is a scope decision; on its own it guarantees nothing. What makes it a plan is
that no criterion in it is an unowned promise. Checked 2026-08-21 against `BACKLOG.md`, and the
check found four criteria nobody was carrying — M3's manifest, M11's two markdown bullets, and the
documentation halves of M4 and M5. All four are registered now (`B-035`, `B-036`, and folded into
`B-006` and `B-009`), because a finding that stays in a report and never reaches the registry is the
orphaned-finding failure the single registry exists to prevent.

| Surface | Band | Registered work |
|---|---|---|
| M1 | parity | `B-005`, `B-007`, `B-011`, `B-016` |
| M2 | parity | `B-001`, `B-002` |
| M3 | parity | `B-004`, `B-035` |
| M4 | contract | `B-006` |
| M5 | contract | `B-009` |
| M6 | contract | `B-029` |
| M7 | contract | `B-030` |
| M8 | parity | `B-010`, `B-019`, `B-028` |
| M9 | contract | `B-031` |
| M10 | contract | `B-032` |
| M11 | contract | `B-036` |
| M12 | contract | `B-033` |
| M13 | contract | `B-003` |
| M14 | parity | `B-018`, `B-023`, `B-026`, `B-027` |
| M15 | contract | `B-034` |
| M16 | delisted | none, deliberately |

**Registered is not implemented, and the table does not claim otherwise.** All thirty-six items are
`triaged`: measured, owned, and not yet built. What the table rules out is the other failure — a
criterion that closes by nobody noticing it was never scheduled.

**`B-019` is listed while its defect is closed in code.** Its status advances when the cycle says so
(`.claude/rules/cycle-maintenance.md`), not because a re-measurement found the code fixed. Editing
the registry by hand is how `shipped` stops meaning anything.

## Wave 0.5 — wire what exists, first

The re-measurement found a pattern rather than a gap: **subsystems built, tested, and never
connected.** `initCacheEngine` has zero production callers; the cache's `defaults` never reaches the
engine; `createObservabilityPlugin` and the observability `resolveAdapter` appear only in tests;
`trackAgentRun` has no production caller; `csrf-multi-header` is implemented and never exported;
`action-encryption` is exercised only by its own test. The repository already records the shape:
*"1,715 LOC of observability and cost … none of it was reachable"*.

**Two corrections to that sentence, measured 2026-08-20** — recorded rather than edited away,
because the first one would have destroyed working code:

- *"`resolveAdapter` appears only in tests"* named two different symbols. The **deploy** registry's
  `resolveAdapter` (`packages/theo/src/adapters/registry.ts:41`) is wired and is how `build --target`
  dispatches (`packages/theo/src/cli/commands/build.ts:222`); deleting it as dead code would break
  every deploy target. Only the **observability** one
  (`packages/theo/src/server/observability/adapter-registry.ts:26`) is orphaned.
- *"`trackAgentRun` appears only in comments"* understated it: it has a unit test and a build
  assertion, so the code runs. What it has is no production caller — which is the claim that matters
  and the one the criterion should grade.

Wiring was cheaper than building and it was **not** the trivial work the first reading suggested.
Two subsystems could not be wired as they stood: `createObservabilityPlugin` returned
`{ name, onRequest, onResponse, onError }` while the plugin loader requires `{ name, register }` and
throws `InvalidPluginShapeError` otherwise (`packages/theo/src/server/plugins/load-plugins.ts:20`),
and the `observability` key the adapter registry documents as its first configuration source did not
exist in the config schema at all.

**Both were fixed on 2026-08-20, and this paragraph is corrected rather than deleted.** The plugin
now returns `{ name, register }` and is registered at boot in production and in dev; the key exists
at `packages/theo/src/config/schema.ts:198`. The sentences above are kept in the past tense because
the shape of the obstacle is the lesson: two subsystems were unreachable not for want of code but
because their published shape did not match the contract that would consume them, and nothing
anywhere failed to say so.

The precondition it named has been paid. M8's central criterion — spans for run start and end, every
tool call, every HITL pause and resume, and token usage — measured **0 of 4** on the morning of
2026-08-20 and **4 of 4 by span, not yet by trace,** that afternoon
(`packages/theo/src/server/agent/observe-agent-run.ts`). The qualifier is load-bearing and was added
after the fact: the four spans exist and reach an exporter, and they do NOT form a trace. The OTLP
serializer mints a fresh `traceId` per span
(`packages/theo/src/server/observability/otlp-serializer.ts:65`) and `SpanData` carries no parent
(`packages/theo/src/server/observability/span.ts:8`), so one run arrives at a collector as several
unrelated records. Counting spans instead of counting usable telemetry is exactly the move this
programme exists to refuse, so the count is stated with its limit
(usetheokit/theokit#368). Three further caveats travel with it and are not footnotes: the token attributes were initially read from a shape the producer never emits and had
to be re-fixed, and the HITL pause span still cannot correlate its resume
(usetheokit/theokit#361), so it records that it could not rather than reporting a duration it did
not measure.

It is tracked as items in [`BACKLOG.md`](BACKLOG.md), not as a milestone, because it is repair
spread across surfaces rather than a surface of its own. Wave 1 criteria that depend on a wired
subsystem say so explicitly.

## Dependencies

Only dependencies on the three core milestones are declared, and each is a mechanism rather than a
sequencing preference: a surface depends on M1 when it crosses the server boundary, on M2 when it
consumes or alters rendered output, on M3 when it depends on what the build emits. Wave order is
not itself a dependency — two milestones in the same wave may run in either order.

## Wave 1 — the core

### M1 — [ ] server-boundary-security

**Surface:** `.claude/skills/server-boundary-security-specialist/` — what may cross from server to client, and what must never be reachable from a browser.
**Dependencies:** none — core surface

**Band: parity required.** An unsafe boundary is a defect rather than a missing convenience, and J8 (tenant) is one of the three journeys the benchmark measures as an outright loss.

**Measured 2026-08-21:** CSRF is enforced by absence (`packages/theo/src/server/web-handler.ts:508`), the server-only import gate exists (`packages/theo/src/vite-plugin/server-boundary.ts`), and the policy seam is a named contract (`packages/theo/src/core/contracts/route-policy.ts:65,86`). What is open is the advisory and the acceptance run, not the mechanism.

**Definition of done (all must hold):**

- [ ] the HITL approval path rejects an unauthenticated caller and an authenticated non-owner, verified against the published build; the open private security advisory is resolved and its fix released
- [ ] an owner check exists and is exercised: approving a run as a caller who does not own it is refused, not merely undocumented. **Implemented 2026-08-20, and the gap this bullet described is closed in code.** The morning's state was that routes had a policy seam and the agent endpoint ignored it. That was measured end to end and confirmed worse than written — an unauthenticated request naming another tenant's conversation key was answered with that tenant's content, and a separate process settled a pending HITL approval and the gated tool ran. Both are recorded against the private advisories, not here. The declaration now travels with the agent (`export const policy`, read where the module is loaded) rather than being an option every call site could forget, and the scanner refuses an agent that declares none. Two limits stay named: `requireOwner` answers ownership and a tenant is a *scope*, so there is still no key contract; and the approval ledger records no owner, so two subjects admitted to one agent can settle each other's approvals. The bullet stays `[ ]` — only `/acceptance` against a published build may tick it
- [ ] importing a server-only module from client code fails the build with an error naming both the module and the importing file. **Implemented 2026-08-20** (usetheokit/theokit#373): a `resolveId` hook at `enforce: 'pre'` refuses the umbrella, every published `theokit/server/*` subpath and every module under the project's server directory, naming the module, the importing file, why that module is server-only, and the three ways out. The measured before was `"resolve" is not exported by "__vite-browser-external"` and an `ENOTDIR`, naming neither. Detection is by resolved path as well as by specifier, because Vite's alias plugin rewrites the specifier first — caught by the integration test, which spawns the real CLI and asserts on terminal output. Two of its five cases must stay *green*: `@theo/actions` pulls an isomorphic schema out of `server/` by design, and `import type` is the remedy the message names. The bullet stays `[ ]` — implemented is not accepted
- [ ] CSRF protection on the Web handler is on by default — a cross-origin POST with no token is rejected by a build that sets no CSRF option. **Implemented 2026-08-20:** `shouldEnforceCsrf` now reads absence as enforced, and only an explicit `'off'` disables it (`packages/theo/src/server/web-handler.ts:508`). The bullet stays `[ ]` on purpose — implemented is not accepted, and only `/acceptance` against a published build may tick it
- [ ] Applies to: Web, Tauri, TUI — each listed target is exercised in acceptance, not merely declared
- [ ] Tauri: the authorization ADR is decided and implemented — **decided, and its core guarantee is implemented as of 2026-08-20**: `RouteConfig.policy` is evaluated by both HTTP executors AND `callProcedure` from one function, verified by `tests/unit/access-decision-parity.test.ts`. The sentence this criterion was written from — "`callProcedure` runs no middleware and no auth" — no longer describes the code. What remains is the ADR's breaking half (absence stops meaning open; `session.ts` loses `ServerResponse`), which is why the box stays `[ ]` — that, and the fact that only `/acceptance` against a published build may flip it. See `docs/adr/0001-authorization-is-transport-independent.md` § Implementation status
- [ ] TUI: same ADR, same seam — the route's access rules are enforced off-web rather than re-invented per surface. CSRF is *not applicable*: there is no browser origin to forge a request from

### M2 — [ ] rendering-pipeline

**Surface:** `.claude/skills/rendering-pipeline-specialist/` — where markup is produced, when it streams, and what the client re-executes.
**Dependencies:** none — core surface

**Band: parity required.** Every Web criterion on every other surface is graded against the document this pillar produces. When it is malformed, nothing downstream is measurable.

**Measured 2026-08-21:** The document, the head and the hydration script are emitted, and the TDZ B-002 records is gone (`packages/theo/src/router/entry-server.ts:70,226-230`). What is open is observing it over the wire, chunk by chunk.

**Definition of done (all must hold):**

- [ ] `curl` of the root route against a published build with `ssrStreaming: true` returns a parseable document containing both `<head>` and the hydration data script (#343)
- [ ] the generated Web entry is executed against a real `Request` in a test and returns a `Response` without throwing — asserting `toContain` over the template string is what let #344 ship, and does not satisfy this
- [ ] the first streamed chunk carries `<head>`, observed chunk-by-chunk rather than on the final buffered document
- [ ] Applies to: Web, Tauri, TUI — each listed target is exercised in acceptance, not merely declared
- [ ] Tauri: the webview renders through the same pipeline; no Tauri-specific renderer
- [ ] TUI: *not applicable* — a terminal has no HTML document. The same run renders through `packages/presenter`'s terminal presenter, and that path is exercised

### M3 — [ ] bundler-architecture

**Surface:** `.claude/skills/bundler-architecture-specialist/` — how modules are graphed, split, transformed and emitted.
**Dependencies:** none — core surface

**Band: parity required.** What M14 deploys is what this emits, and reproducibility is the floor under every other measurement in the programme.

**Measured 2026-08-21, and corrected the same day after the first count was taken without checking the call sites.** The client-router scan sorts by code unit (`packages/theo/src/router/scan.ts:142`); the consolidated walker does not (`packages/theo/src/server/_internal/scan-walker.ts:36`), and **six scanners consume it** — routes, actions, websockets, cron, agents and jobs. Only one of the six re-orders afterwards: `packages/theo/src/server/scan/scan.ts:173` sorts by route specificity, ending in a code-unit fallback (`:209`), which is a total order and therefore independent of walk order. The other five carry the filesystem's creation order into their output. No CI job grades reproducibility, and `modulepreload` is emitted nowhere.

**Definition of done (all must hold):**

- [ ] two clean builds of the same commit, with different on-disk file creation order, produce byte-identical client bundles (#346)
- [ ] the build emits a manifest and the served document carries `modulepreload` for the route's chunks, observed over the wire against the published build
- [ ] a determinism check runs in CI and fails the build when output is not reproducible
- [ ] Applies to: Web, Tauri, TUI — each listed target is exercised in acceptance, not merely declared
- [ ] Tauri: consumes the same emitted assets as Web; no separate build
- [ ] TUI: *not applicable* — no client bundle is shipped to a terminal. The core it imports is the same build output, and that is what the parity check covers

## Wave 2

### M4 — [ ] route-conventions

**Surface:** `.claude/skills/route-conventions-specialist/` — how a file path becomes a URL, and what a route file is allowed to export.
**Dependencies:** M2, M3

**Band: minimum contract.** Full parity on this surface is not sought. A wrong resolution serves the wrong handler, so the correctness half is kept; matching another router's full convention surface is not.

**Measured 2026-08-21:** Per-segment precedence exists as a named comparator (`packages/theo/src/server/_internal/compare-by-code-unit.ts`, applied at `packages/theo/src/server/scan/scan.ts:209`). The mechanism is built; the acceptance run is not.

**Definition of done — minimum contract (all must hold):**

- [ ] `/api/users/settings` resolves to `/api/users/:id` rather than to `/api/:resource/settings` against a published build, and a regression test fails when the tiebreak becomes a whole-path comparison (#348)
- [ ] the precedence rule is documented as a contract rather than left to sort order
- [ ] Applies to: Web, Tauri, TUI — each listed target is exercised in acceptance, not merely declared
- [ ] Tauri: reaches the same route table through the in-process caller
- [ ] TUI: reaches the same route table through the in-process caller

**Parity criteria — recorded, not scheduled.** Kept so that "what would parity have meant here" has an answer, and so picking one up later costs a `/backlog-item` rather than an excavation:

- [ ] `/api/users/settings` resolves to `/api/users/:id` and not to `/api/:resource/settings` against a published build (#348)
- [ ] precedence is compared per segment, and a regression test fails when the tiebreak is a whole-path `localeCompare`
- [ ] route precedence is documented as a specified contract rather than left to sort order

### M5 — [ ] caching-revalidation

**Surface:** `.claude/skills/caching-revalidation-specialist/` — what is cached, under which key, for how long, and who may invalidate it.
**Dependencies:** M2

**Band: minimum contract.** Full parity on this surface is not sought. Caching is not on the agent axis: no benchmark journey grades it, and nothing about it is reachable from one target only. What it must not be is wired-but-broken.

**Measured 2026-08-21:** **Both blockers this milestone was written around are closed.** The engine is initialised at boot in `start` and in `dev` (`packages/theo/src/server/cache-bootstrap.ts:28`, `packages/theo/src/cli/commands/start/index.ts:68`, `packages/theo/src/cli/commands/dev.ts:36`), and `defaults` reaches it (`packages/theo/src/cache/cache-engine.ts:109`).

**Definition of done — minimum contract (all must hold):**

- [ ] a scaffolded app calls `revalidateTag` against a published build without throwing (#347)
- [ ] the cache's documented surface states which of TTL, stale-while-revalidate and tag invalidation it serves, and which it does not
- [ ] Applies to: Web, Tauri, TUI — each listed target is exercised in acceptance, not merely declared
- [ ] Tauri: the same cache engine runs in-process; entries are not re-implemented per target
- [ ] TUI: the same cache engine runs in-process

**Parity criteria — recorded, not scheduled.** Kept so that "what would parity have meant here" has an answer, and so picking one up later costs a `/backlog-item` rather than an excavation:

- [ ] `initCacheEngine` has a production caller and a cached route serves a hit on the second request, observed through the cache signal in a published build (#347)
- [ ] `opts.defaults` reaches the engine — a cache configured only through defaults produces the configured TTL behaviour, where today the option is destructured away
- [ ] N concurrent requests against a stale entry trigger exactly one background refresh, counted at the route layer
- [ ] `defineCachedFunction` refuses by name a function capturing a value that is not part of its cache key

### M6 — [ ] navigation-prefetching

**Surface:** `.claude/skills/navigation-prefetching-specialist/` — what a client transition fetches, keeps, and shows in between.
**Dependencies:** M2, M3

**Band: minimum contract.** Full parity on this surface is not sought. Prefetching already works; what is missing is a declared cost and an honest absence. Neither needs a competitor's budget to be graded.

**Measured 2026-08-21:** `Link` prefetches on intent and on viewport (`packages/theo/src/client/link.tsx:4-10`). `ScrollRestoration` appears in **no file** under `packages/`, and no document says so.

**Definition of done — minimum contract (all must hold):**

- [ ] the three prefetch strategies are documented with the request cost of each
- [ ] scroll restoration is either mounted in the generated entry or named as absent in the documentation — today it is neither
- [ ] Applies to: Web, Tauri, TUI — each listed target is exercised in acceptance, not merely declared
- [ ] Tauri: the same client router runs in the webview
- [ ] TUI: *not applicable* — a terminal has no viewport to observe and no scroll position to restore

**Parity criteria — recorded, not scheduled.** Kept so that "what would parity have meant here" has an answer, and so picking one up later costs a `/backlog-item` rather than an excavation:

- [ ] a viewport containing N prefetchable links issues at most the configured budget of requests, counted in the network log against a published build
- [ ] scroll position is restored on back navigation — `<ScrollRestoration/>` is mounted in the generated entry
- [ ] the prefetch budget is a declared, documented number rather than an implicit consequence of viewport size

### M7 — [ ] dev-experience

**Surface:** `.claude/skills/dev-experience-specialist/` — how fast a change is visible, what state survives it, and what an error says.
**Dependencies:** M3

**Band: minimum contract.** Full parity on this surface is not sought. Developer experience is graded by its own users, not against another framework's dev server.

**Measured 2026-08-21:** A prod-like local run is still two steps, `build` then `start` (`packages/create-theokit/templates/default/package.json.tmpl:7-9`).

**Definition of done — minimum contract (all must hold):**

- [ ] a prod-like local run is one documented command
- [ ] Applies to: Web, Tauri, TUI — each listed target is exercised in acceptance, not merely declared
- [ ] Tauri: the same dev server drives the desktop shell
- [ ] TUI: the same dev server drives the terminal client

**Parity criteria — recorded, not scheduled.** Kept so that "what would parity have meant here" has an answer, and so picking one up later costs a `/backlog-item` rather than an excavation:

- [ ] a prod-like local run is one documented command, not two steps
- [ ] each of the three `full-reload` sites either preserves state across HMR or emits a named reason for the reload
- [ ] the share of errors naming the failing action does not regress below the 72% measured on 2026-08-19 (29 of a 179-error sample), and the measurement is re-run and recorded rather than assumed

### M8 — [ ] observability

**Surface:** `.claude/skills/observability-specialist/` — what a running application emits, and how a request is followed across a boundary.
**Dependencies:** M1

**Band: parity required.** It is the programme's own instrument: the benchmark cannot be run without it, and J9 is the journey where the largest margins the framework has produced still failed to become a win.

**Measured 2026-08-21:** **The trace exists now, and this milestone's own text below says it does not.** Identity is decided when a span starts (`packages/theo/src/server/observability/span.ts:9-22`) and the serializer reads it instead of minting one (`packages/theo/src/server/observability/otlp-serializer.ts:80`), so B-019 is closed in code. The dev agent path still mints its own (`packages/theo/src/vite-plugin/agent-middleware.ts`), and only `/acceptance` may tick the box.

**Definition of done (all must hold):**

- [ ] a request carrying a W3C `traceparent` produces spans continuing that trace id — no `randomUUID()` is minted where a parent context exists. **Half done, measured 2026-08-20:** the production start path now resolves the trace from the header (`packages/theo/src/cli/commands/start/request-handler.ts:233`) and the `randomUUID()` this criterion was written against is gone from that file. `packages/theo/src/vite-plugin/agent-middleware.ts:122,199` still mints one, so the dev agent path still starts a new trace
- [ ] a run emits spans for run start and end, every tool call, every HITL pause and resume, and token usage, read back from an exported trace against a published build. **The spans now exist** — `packages/theo/src/server/agent/observe-agent-run.ts` translates the wire chunks into `agent.run` / `agent.tool` / `agent.hitl` spans, including token usage read from the producer's own shape. **The trace does not.** `serializeSpansToOtlp` mints a fresh `traceId` per span (`packages/theo/src/server/observability/otlp-serializer.ts:65`) and `SpanData` carries no parent (`packages/theo/src/server/observability/span.ts:8`), so an exported run arrives at the collector as N unrelated single-span traces and "read back from an exported trace" has nothing to read back (usetheokit/theokit#368). The criterion says *trace*, not *span*, and it is the harder half
- [ ] the exported signal is produced by a production caller, not only by a test
- [ ] Applies to: Web, Tauri, TUI — each listed target is exercised in acceptance, not merely declared
- [ ] Tauri: emits the same spans over the in-process path, with the trace continuing across the IPC boundary
- [ ] TUI: emits the same spans over the in-process path

## Wave 3

### M9 — [ ] metadata

**Surface:** `.claude/skills/metadata-specialist/` — titles, canonicals, social cards, robots directives and structured data.
**Dependencies:** M2

**Band: minimum contract.** Full parity on this surface is not sought. A crawler reads the document M2 produces; the parity surface beyond that (structured data, per-route social cards) has no measured need behind it.

**Measured 2026-08-21:** Head hoisting and a metadata component both exist (`packages/theo/src/vite-plugin/hoist-head-tags.ts`, `packages/theo/src/client/metadata.tsx`).

**Definition of done — minimum contract (all must hold):**

- [ ] the served document carries the resolved `<title>` and `og:` tags against a published build
- [ ] a relative `og:image` under a configured base URL is refused by name at build time rather than shipped broken
- [ ] Applies to: Web, Tauri, TUI — each listed target is exercised in acceptance, not merely declared
- [ ] Tauri: the webview document carries the same resolved tags
- [ ] TUI: *not applicable* — a terminal is not crawled and has no document head

**Parity criteria — recorded, not scheduled.** Kept so that "what would parity have meant here" has an answer, and so picking one up later costs a `/backlog-item` rather than an excavation:

- [ ] with streaming on, the first flushed chunk contains the resolved `<title>` and `og:` tags — the same hoist defect as #343, measured on the first chunk
- [ ] a configured base URL makes `og:image` absolute in the served document, and a relative value is refused by name at build time rather than shipped broken

### M10 — [ ] asset-optimization

**Surface:** `.claude/skills/asset-optimization-specialist/` — how images, fonts and static files are processed, addressed and cached.
**Dependencies:** M3

**Band: minimum contract.** Full parity on this surface is not sought. Parity with an image-optimisation pipeline is explicitly not sought — there is no transform layer and building one is a product decision nobody has taken.

**Measured 2026-08-21:** `Image` forwards `srcSet` and `sizes` (`packages/theo/src/client/image.tsx:8,24-25`) and nothing is resized or re-encoded: `sharp` is not a dependency, and `packages/theo/src/client/` holds no fonts module.

**Definition of done — minimum contract (all must hold):**

- [ ] `Image` reserves its space before the pixels arrive, so a page does not shift while it loads
- [ ] declaring `srcSet` without `sizes` fails by name at build time
- [ ] the documentation states that no image transform and no fonts module ship, so a reader learns it from the docs instead of from a blurry logo
- [ ] Applies to: Web, Tauri, TUI — each listed target is exercised in acceptance, not merely declared
- [ ] Tauri: the webview consumes the same optimized assets
- [ ] TUI: *not applicable* — a terminal renders neither raster images nor webfonts

**Parity criteria — recorded, not scheduled.** Kept so that "what would parity have meant here" has an answer, and so picking one up later costs a `/backlog-item` rather than an excavation:

- [ ] a published build serves a transformed image — resized and re-encoded — for a declared source image
- [ ] declaring `srcSet` without `sizes` fails by name at build time
- [ ] a fonts module exists and emits preload links with the correct `crossorigin` attribute

### M11 — [ ] content-pipeline

**Surface:** `.claude/skills/content-pipeline-specialist/` — how authored content becomes a route and a rendered document.
**Dependencies:** M2, M3

**Status:** The safe pipeline **already exists** — `@theokit/ui` in the scaffold does sanitize-then-jsx with a streaming preprocess. This milestone closes two gaps in it and must not re-plan what is built.

**Band: minimum contract.** Full parity on this surface is not sought. The two gaps are small and the pipeline is already safe; the rest of a content platform is not this repository's surface.

**Measured 2026-08-21:** The pipeline lives in `@theokit/ui`, outside this repository, and already does sanitize-then-jsx with a streaming preprocess.

**Definition of done — minimum contract (all must hold):**

- [ ] markdown `![]()` renders through the framework `Image` component in a scaffolded project's published build
- [ ] markdown `[]()` pointing at an external origin renders through `Link` and carries `rel="noopener noreferrer"`
- [ ] Applies to: Web, Tauri, TUI — each listed target is exercised in acceptance, not merely declared
- [ ] Tauri: the webview renders the same sanitized output
- [ ] TUI: the same content is parsed once in the core and rendered through the terminal presenter

### M12 — [ ] i18n

**Surface:** `.claude/skills/i18n-specialist/` — how a locale is negotiated, routed, and carried through rendering.
**Dependencies:** M2

**Status:** Nothing exists yet. This milestone is a build, not a repair.

**Band: minimum contract.** Full parity on this surface is not sought. A document that does not declare its language is wrong for assistive technology regardless of how many locales ship. Locale routing, catalogues and formatting are a build nobody has asked for.

**Measured 2026-08-21, and the first version of this line over-read its own grep.** `lang=` appears in no file under `packages/theo/src`, and the document an application serves is its own `index.html`, where all three shipped templates declare `lang="en"` (`packages/create-theokit/templates/default/index.html:2`). So the first contract bullet below is close to met already, and what this surface actually owns is that the value is a template literal nobody can configure and nothing negotiates. The framework's own fallback document declares neither head nor language, which is `B-033` and is not this milestone.

**Definition of done — minimum contract (all must hold):**

- [ ] the served document carries `<html lang>` matching the negotiated locale
- [ ] the negotiated locale is reachable in a route handler
- [ ] the documentation states that no locale routing scheme, no catalogue loading and no plural or number formatting layer ship
- [ ] Applies to: Web, Tauri, TUI — each listed target is exercised in acceptance, not merely declared
- [ ] Tauri: the webview document carries the same negotiated `lang`
- [ ] TUI: negotiation is reachable in-process; `<html lang>` is *not applicable* — there is no document

**Parity criteria — recorded, not scheduled.** Kept so that "what would parity have meant here" has an answer, and so picking one up later costs a `/backlog-item` rather than an excavation:

- [ ] the served document carries `<html lang>` matching the negotiated locale — today the served template has no `lang` attribute at all
- [ ] a locale negotiated from the request is reachable both in a route handler and inside an agent run, against a published build

### M13 — [ ] middleware-edge

**Surface:** `.claude/skills/middleware-edge-specialist/` — what runs before a route resolves, and under which runtime constraints.
**Dependencies:** M1

**Band: minimum contract.** Full parity on this surface is not sought. A published builder whose output the runner cannot invoke is a broken contract, and that half stays. Edge-runtime parity — matchers, per-runtime constraints, a transport-independent chain — is not sought; nobody has named the use case it would serve.

**Measured 2026-08-21:** The builder returns `(request, next) => Response` (`packages/theo/src/server/define/middleware-builder.ts:26`) while the file-scan runner types `(req, res, next)` (`packages/theo/src/server/http/middleware-runner.ts:35-36`). The public path is unusable as published.

**Definition of done — minimum contract (all must hold):**

- [ ] a middleware authored with the published `middleware()` builder is invoked by the file-scan runner in a published build (#345)
- [ ] a middleware that cannot run on a target is refused by name rather than silently skipped
- [ ] Applies to: Web, Tauri, TUI — each listed target is exercised in acceptance, not merely declared
- [ ] Tauri: the middleware chain is reachable off-HTTP — both runners are transport-bound today (`packages/theo/src/server/http/middleware-runner.ts:6-7`, `packages/theo/src/server/http/web-middleware-runner.ts:19`), and that is unchanged. What the authorization ADR settled is narrower than this criterion assumed: **access control** is now transport-independent and evaluated by `callProcedure`, while the middleware CHAIN stays on the transport by design — CORS, cookies and CSP are meaningless in a terminal. So this criterion is no longer waiting on that ADR; it is waiting on whatever transport-independent thing the remaining middleware use cases actually need, which nobody has yet named
- [ ] TUI: same transport-bound blocker, same ADR; a terminal surface must not reach a route with the middleware silently skipped

**Parity criteria — recorded, not scheduled.** Kept so that "what would parity have meant here" has an answer, and so picking one up later costs a `/backlog-item` rather than an excavation:

- [ ] a middleware authored with the public `middleware()` builder is invoked by the file-scan runner in a published build (#345)
- [ ] a middleware declares a path matcher and runs only for the routes it matches
- [ ] a middleware requiring a runtime capability the target lacks is refused by name rather than skipped

## Wave 4

### M14 — [ ] build-adapters

**Surface:** `.claude/skills/build-adapters-specialist/` — what the build emits, and what a deploy target consumes.
**Dependencies:** M3

**Status, measured 2026-08-20:** the third criterion below turns out to be the whole milestone. Two
findings, and the second contains the first:

- **No adapter serves an agent.** The string `agent` appears zero times across all fourteen files in
  `packages/theo/src/adapters/`. Agents are a separate scan (`scanAgents`) served by `mountAgent`,
  which no adapter knows and which only the internal contract exports (usetheokit/theokit#367). For a
  framework whose thesis is that an agent ships through the same pipeline as a page, this is the
  criterion that decides whether the thesis holds.
- **The Cloudflare worker discovers routes by reading a directory at runtime.** It calls
  `scanServerRoutes` (a `readdirSync`) and loads modules through `import()` of a file path, in a
  runtime with no filesystem — and the generated `wrangler.toml` uploads `.theokit/client`, never
  `server/` (usetheokit/theokit#369). Marked needs-repro: inferred from three agreeing sites, not
  from a deploy.

**And nothing would have caught either.** `tests/integration/wrangler-smoke.test.ts` runs a real
`wrangler dev`, against a fixture worker that imports its route statically and calls
`executeWebRequest` directly — so it proves the executor runs on Workers and never touches the two
mechanisms above. Its own header already records the posture: *"Cloudflare Workers is a future /
opt-in compatibility surface — TheoCloud is the only end-to-end-validated deploy target."*

**Band: parity required.** The thesis is that an agent ships through the same pipeline as a page, and `agent` appears in zero of the fourteen adapter files.

**Measured 2026-08-21:** Streaming and the security headers landed. The decisive criterion did not: `agent` appears in zero of the files under `packages/theo/src/adapters/`, so no listed target serves the thing the framework exists to ship.

**Definition of done (all must hold):**

- [ ] a streaming `/api/*` route streams on every listed adapter — chunks observed arriving before the response completes — or the adapter is delisted; the `web-shim` buffering the whole response is the current blocker across six targets. **Addressed 2026-08-20** (usetheokit/theokit#382), and the measurement corrected the criterion's own count: **all six** emitted handlers buffered a second time, not two — each awaited `executeRoute` before calling `toResponse()`, and `executeRoute` does not return until it has drained the body. Measured through the shim, before and after: one chunk at millisecond 1123 of an 1123 ms run, against 9 chunks with headers at 1 ms and the first at 121 ms. **AWS Lambda is delisted for streaming**, which this bullet authorises in writing, and the delisting is audible three ways rather than silent: the build refuses by name on `ssrStreaming`, the emitted handler logs the route when it buffers a `text/event-stream`, and every one of the nine targets is now forced to declare whether it streams. `node` is exercised end to end; the other five are correct in the emitted contract and **unproven on the platform**, because no deploy exists in CI — which is what this bullet's `/acceptance` has to settle
- [ ] declaring a capability the target cannot serve (WebSockets on a target without them) fails the build by name instead of deploying silently degraded
- [ ] no adapter is listed that nobody exercises in acceptance — **the sharpest criterion here, and the measurement above says the list currently contains adapters nobody exercises.** Delisting is a legitimate way to satisfy it, and cheaper than pretending
- [ ] an agent endpoint answers on every listed adapter, or the adapter is delisted for agents specifically — a target that serves pages and not agents is a partial target, and saying which half works beats listing it whole
- [ ] Applies to: Web, Tauri, TUI — each listed target is exercised in acceptance, not merely declared
- [ ] Tauri: the desktop build is produced by the same emitted output
- [ ] TUI: *not applicable* — the terminal client runs the core in-process and consumes no adapter; there is no hop for an adapter to bridge

### M15 — [ ] draft-preview

**Surface:** `.claude/skills/draft-preview-specialist/` — how unpublished content is rendered for an authorized reader only.
**Dependencies:** M1, M2

**Status:** Nothing exists yet. There is no `robots` or `noindex` field anywhere in `packages/theo/src`.

**Band: minimum contract.** Full parity on this surface is not sought. Nothing exists, nobody has asked for it, and the honest options are to build the smallest safe version or to say it is not there. Both are gradeable; leaving it implied is not.

**Measured 2026-08-21:** `noindex` and `robots` appear in **no file** under `packages/theo/src`.

**Definition of done — minimum contract (all must hold):**

- [ ] the surface is either implemented behind a preview credential whose response carries `noindex`, or declared unimplemented in the documentation so nobody builds on an assumption
- [ ] Applies to: Web, Tauri, TUI — **when the first bullet is met by building it.** Met by declaring it absent, the declaration itself is what must reach all three: one sentence in the shared documentation, not a note on the Web page, so a desktop or terminal reader is not left to infer that preview exists
- [ ] Tauri: the webview reaches preview through the same authorized path, or the declaration covers it
- [ ] TUI: the authorization check is reachable in-process, or the declaration covers it; `noindex` is *not applicable* — a terminal is not crawled

**Parity criteria — recorded, not scheduled.** Kept so that "what would parity have meant here" has an answer, and so picking one up later costs a `/backlog-item` rather than an excavation:

- [ ] an unpublished document is served only to a request carrying a valid preview credential; without it the published build serves the published version or 404, never the draft
- [ ] a preview response carries `noindex`, so a leaked preview URL is not indexed

### M16 — [ ] multi-zone

**Surface:** `.claude/skills/multi-zone-specialist/` — how independently built applications compose behind one origin.
**Dependencies:** M3

**Band: delisted.** Deprioritized on 2026-08-19 and **delisted on 2026-08-21**: it is no longer
counted in the programme's completion condition. Nothing changed about the surface — what changed is
that a milestone nobody schedules, still counted as outstanding, makes the programme permanently
incomplete for a reason that is not a gap. Re-list it through `/backlog-item` when a second zone
exists.

**Status:** **Deprioritized, deliberately.** No blocker was measured on 2026-08-19 — this is the one surface where measurement found nothing to fix. It stays declared so the surface is not forgotten, and it is not scheduled. Pick it up only when a second zone actually exists; until then, every criterion below grades a need nobody has.

**Criteria — recorded, not scheduled.** Delisted means these grade nothing until a second zone exists:

- [ ] two independently built zones compose behind one origin and a client navigation across the boundary preserves the session
- [ ] a zone boundary is declared explicitly rather than inferred from a path prefix
- [ ] Applies to: Web, Tauri, TUI — each listed target is exercised in acceptance, not merely declared
- [ ] Tauri: *not applicable while deprioritized* — a desktop shell composes no zones today
- [ ] TUI: *not applicable* — there is no origin behind which to compose

## Programme completion

**Revised 2026-08-21.** The condition is no longer sixteen milestones: it is the five parity
milestones at full Definition of done, the ten minimum contracts met, and M16 delisted — fifteen
counted, one not (§ Two bands). Closing them satisfies the **parity** condition. It does not close the programme:
the second condition is **measured superiority on the agent axis**, and it is deliberately not a
milestone here because it spans every surface rather than any one of them.

The agent-axis benchmark measures ten canonical journeys — tool call, human-in-the-loop, streaming,
thread, multi-step, retry, rate limit, tenant, observability, deploy — on four dimensions:

| Dimension | Unit |
|---|---|
| Files touched | count |
| Glue lines written | count |
| Concepts required before the first run | count |
| Time to first green run | wall-clock |

It has no milestone block and no checkbox, so nothing here flips on it. It cannot run before Wave
0.5 wires observability — the benchmark needs an instrument. When it is ready to be run and graded,
it earns its own milestone through `/backlog-item` and `/discover`, not by being asserted here.

## Explicitly out of scope

- Cloning the App Router.
- Writing an in-house bundler.
- Treating RSC as a premise. If it is adopted, it is adopted through a measured ADR.
- Listing a deploy adapter nobody can exercise — M14 grades what is exercised, not what is named.

## Cross-references

- Transversal target constraint: `.claude/rules/three-target-parity.md`
- Acceptance contract that grades these criteria: `.claude/rules/cycle-acceptance.md`
- Checkbox flip invariant: `.claude/skills/release/scripts/flip_milestone_checkbox.py`
- Session binding for a milestone: `.claude/skills/cycle-goal/SKILL.md`
- Maintenance registry, including all Wave 0.5 items: `BACKLOG.md`
