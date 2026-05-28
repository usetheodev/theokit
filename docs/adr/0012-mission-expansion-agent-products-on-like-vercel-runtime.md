# 0012. Mission expansion — TheoKit becomes the framework for agent products on a Like-Vercel runtime

* Status: accepted
* Date: 2026-05-27
* Accepted: 2026-05-27
* Deciders: [TheoKit owner]
* Tags: [mission, scope, polyglot, runtime, theocreate-absorbtion, moat]

## Context and Problem Statement

The original mission locked 2026-05-21 stated:

> TheoKit is the Next.js for agents. The framework where someone builds *their own* agent app. Not a coding agent itself.

That mission held for the maturation phase (storage, plugins, jobs, security primitives). Three forces now demand expansion:

1. **`theo-stacks` / `create-theo` (the standalone polyglot scaffolder) is being absorbed into TheoKit.** It currently ships 19 templates in 7 languages from `../theo-stacks/`. The owner's decision (2026-05-27) is to fold its scaffolding role into `create-theokit` rather than maintain two CLIs and two npm packages.
2. **TheoCloud (the principal deploy target) is being provisioned in early environments.** The owner wants to validate the runtime contract against a TheoCloud-shaped local harness **before** the TheoCloud adapter ships — chicken-and-egg avoidance.
3. **The "just swap the server" intuition.** The owner stated: "eu achei que era só trocar o server". That intuition reflects how Vercel/CF Workers/Bun/Deno already work — a fetch handler is the universal entry, and the adapter wraps it for the platform. TheoKit should make that intuition literally true, including for polyglot service sidecars.

A narrow "Next.js for agents" mission cannot absorb these forces without contradicting itself. Either the mission expands or `create-theokit` becomes a parallel surface that contradicts the locked mission.

## Strategic framing — polyglot is the Theo product-mark moat, not a TheoKit feature

**This is the corrected enframing of the expansion** (clarified by the owner 2026-05-27, after an initial analysis that mis-framed polyglot as a TheoKit-only choice):

> **Polyglot is the differential of the Theo product-mark (the family of products under `usetheo`), not a feature TheoKit individually adopts.** The Theo identity has always been polyglot — `theo-stacks` shipped 19 templates in 7 languages precisely because Theo's wedge is "agent products in the language your team already uses". TheoKit was NARROW relative to that identity; expanding it brings TheoKit into alignment with the product-mark, not vice versa.

**What this means concretely — the moat is the CROSS-PRODUCT standardization, not any single product:**

| Product surface | Polyglot role |
|---|---|
| `create-theokit` (absorbed scaffolder) | Generates polyglot project structure (TS app + Python/Node service) in one command |
| TheoKit framework | Orchestrates polyglot services at dev / build / deploy time via `services: {}` + manifest |
| TheoCloud (deploy target) | Hosts polyglot services in production; consumes the same manifest |
| `@usetheo/sdk` (agent runtime, locked TS) | Stays TS — agents are tool-using clients of polyglot services, not parallel agent runtimes |

**The moat is NOT "TheoKit supports polyglot" — that alone is commodity (Encore.ts + Go, Nitric multi-language, JHipster matrix all do it).** The moat is that **the same contract** (Like-Vercel — [ADR-0015](./0015-services-runtime-contract-like-vercel.md)) runs across `create-theokit` + TheoKit + TheoCloud, so a developer writes once and ships across local dev / Vercel / TheoCloud without reshaping their code. **Nobody else combines polyglot + agent-product-first + a single deploy contract across scaffold → framework → cloud.**

**Concrete competitive comparison** (with corrected framing — what each lacks vs the Theo combination):

| Competitor | Polyglot? | Agent-product-first? | Single deploy contract scaffold→framework→cloud? |
|---|:---:|:---:|:---:|
| Encore.ts | ✅ (TS+Go only) | ❌ | ❌ (backend-only, no scaffold→cloud spine) |
| JHipster | ✅ (matrix) | ❌ | ❌ (no equivalent of TheoCloud; deploy is DIY) |
| Wasp | ❌ (TS-only) | ❌ | ❌ |
| Nitric | ✅ | ❌ | partial (cloud-first; not app-first) |
| Convex | ❌ (TS-only) | partial | ✅ |
| Vercel | ❌ (TS-first) | ❌ | ✅ |
| **Theo (TheoKit + create-theokit + TheoCloud)** | ✅ (Python+Node Wave 2; expandable) | ✅ | ✅ (the moat) |

**This framing implies an INVARIANT** (added below as decision invariant #4):

> Future decisions that would RELAX the cross-product contract on any single product surface destroy the moat. Example: "TheoCloud can accept a different healthcheck shape because K8s is easier that way" — rejected, because it forces the user to write target-specific code, which kills the "só trocar o server" promise. The contract is global across the product-mark or the moat doesn't exist.

## Decision Drivers

- **Owner authority** — the mission is owner-locked, not community-voted. The owner has authority to expand it. This ADR records the expansion explicitly so guardian agents (especially `framework-scope-guardian`) update their gates.
- **Coherence with code in flight** — `packages/create-theo/` already exists inside TheoKit; the absorption is partly mechanical.
- **TheoCloud strategic priority** — TheoCloud adapter is the next major milestone; the framework's runtime contract must anticipate it.
- **Avoiding JHipster's matrix trap** — 19 templates × 7 languages is unmaintainable for one team. The expansion must narrow scope, not widen it.
- **`@usetheo/sdk` premise stays locked** — the agent runtime remains in TS. Polyglot services do NOT become parallel agent runtimes.

## Considered Alternatives

| Alternative | Rejected because |
|---|---|
| Keep the 2026-05-21 mission, leave `theo-stacks` standalone | Forces two scaffolding CLIs, two npm packages, two release cadences. Owner explicitly rejected this 2026-05-27. |
| Expand to "framework for agent products in any language" (the JHipster trap) | 7+ languages = matrix of templates × modules × databases × deploy targets. Single maintainer cannot test or document this. The `theo-stacks` README itself acknowledged the maintenance cost. |
| Expand to "polyglot framework" with runtime embedding (Pyodide / WASI / GraalVM) | Massive runtime complexity, fragile interop, no production precedent at framework level. Rejected on KISS + YAGNI grounds. |
| Expand mission but defer absorption to a later release | Misses the strategic window — `theo-stacks` is being unpublished/deprecated; users need a single migration target. |
| Wave 2 launches with Python only (drop Node from Wave 1 polyglot) | Owner explicitly said Python AND Node. Node is the lowest-friction validation case because the fetch-handler shape is native. |

## Decision

**The mission is expanded to:**

> TheoKit is the framework for **agent products**. It ships three things, in this order of strategic weight:
>
> 1. The app the agent lives in — file-based routing, auth, sessions, realtime, deploy. TypeScript-first. Built around `@usetheo/sdk` (agent runtime) + `@usetheo/ui` (UI).
> 2. The scaffolding for the full project — `create-theokit` absorbs the role of the standalone `create-theo`. One CLI generates the TheoKit app PLUS optional polyglot services (Python, Node).
> 3. The polyglot services orchestration contract — `theo.config.ts > services: {}` declares external processes that ship next to the TheoKit app, validated against a **Like-Vercel runtime contract** (see [ADR-0015](./0015-services-runtime-contract-like-vercel.md)).

**Four invariants that survive the expansion (do not violate without a fresh ADR):**

1. **Multi-runtime is NEVER embedded in TheoKit core.** Polyglot services run as external processes — see [ADR-0014](./0014-services-as-external-processes.md). (This is the only "never" invariant — the others below are scope/priority decisions, not absolute prohibitions.)
2. **`@usetheo/sdk` is the priority agent runtime for Wave 2.** Python/Node services in Wave 2 are tool-providers / data-providers / job-workers, **not** parallel `Agent` runtimes. This is a **priority decision**, not a permanent prohibition — `@usetheo/sdk-py` or equivalent non-TS agent runtimes are **deferred**, not banned. A future PR shipping `@usetheo/sdk-<lang>` requires a fresh ADR with: (a) demand evidence (3+ production apps needing native agent runtime in `<lang>`, not just HTTP-tool integration), (b) preservation of invariant #4 (cross-product contract), (c) explicit conversation-history / tool-registry interop story with the TS SDK. Wave 2 stays TS-only to harden the primary surface before fragmenting maintenance.
3. **Wave 2 polyglot backends are Python + Node ONLY.** Go, .NET, Rust, Java, Ruby, PHP (which `theo-stacks` shipped) are deferred to future ADRs with demand evidence. Same gate as invariant #2 — deferred, not banned.
4. **The cross-product Like-Vercel contract is global across `create-theokit` + TheoKit + TheoCloud — not per-surface.** Any decision that relaxes the contract on a single product surface (e.g., "TheoCloud will accept a different log shape because Kubernetes makes it easier") destroys the moat. The moat is the cross-product standardization, not the individual products. See [ADR-0015](./0015-services-runtime-contract-like-vercel.md) for the contract's 6 invariants. Decisions to add a 7th invariant, or to weaken one of the 6, require BOTH this ADR AND ADR-0015 to be amended in the same PR. **This is an absolute invariant** — relaxing the cross-product contract destroys the strategic moat, unlike invariants #2/#3 which only narrow the priority surface.

**This ADR supersedes** the implicit "Next.js for agents" framing in:
- `CLAUDE.md` "Mission (locked 2026-05-21)" line (replaced by "Mission (re-locked 2026-05-27)")
- `CLAUDE.md` "Done definition for 'Next.js for agents'" section (replaced by Wave 1 / Wave 2 / Wave 3 Done definitions)
- All public copy that reads "the Next.js for agents" verbatim — those become "the framework for agent products"

## Consequences

**Positive:**

- One CLI (`create-theokit`), one npm package, one release cadence
- TheoKit becomes the answer to "I want to ship an agent product with my preferred backend language" — for the 2-language subset that matters
- Like-Vercel contract gives a single mental model across local dev / Vercel / CF Workers / TheoCloud
- `framework-scope-guardian` skill has updated gates; future PRs are evaluated against the expanded mission, not the narrow one
- The new positioning has a clean comparison answer to JHipster ("we are NOT the matrix scaffolder; we are the agent product framework with 2 backend choices") and to Encore ("we are NOT backend-only; we ship the app the agent lives in")

**Negative:**

- Documentation surface grows: every concept doc that talks about "the TheoKit app" must now also acknowledge "and its services"
- Public copy must be re-audited — "Build the app your agent lives in" stays as HERO, but BODY/DEEP DIVE need new vocabulary table entries (see CLAUDE.md Voice and Tone section, 2026-05-27 edit)
- A class of PRs that previously would have been "out of scope" (anything touching scaffolding for languages other than TS) is now in scope — requires firmer ADR gates for non-Wave-2 backends
- Existing `theo-stacks` users need a migration path; the absorption must complete cleanly or they get stranded

**Neutral:**

- The agent layer (`agents/` directory) remains on the long-term roadmap; mission expansion does NOT pull it forward
- Plugin ecosystem (ADR-0011 moderate roadmap) remains unchanged — plugins and polyglot services are orthogonal concerns

## Positioning clarification — TheoKit `server/` covers end-to-end; sidecars are OPTIONAL

A user can ship an agent product END-TO-END (auth, users, sessions, billing, admin, agent chat, jobs, crons) **using only TheoKit's `server/` directory in TypeScript**. The polyglot services capability (`services: {}`) is **OPT-IN**, not required.

**The default mental model for a TheoKit agent product:**

```
my-agent-app/
├── app/                          # Frontend (React + Vite)
└── server/                       # TS backend — covers end-to-end
    ├── routes/auth/{login,register,logout}.ts   # encrypted sessions
    ├── routes/users/{me,[id]}.ts                # CRUD users
    ├── routes/chat.ts                           # @usetheo/sdk agent endpoint
    ├── routes/billing/webhook.ts                # defineWebhook (Stripe)
    ├── actions/*.ts                             # defineAction (CSRF)
    ├── middleware.ts                            # requireAuth()
    ├── context.ts                               # ctx.user, ctx.db, ctx.session
    ├── jobs/*.ts                                # defineJob
    └── crons/*.ts                               # defineCron
```

`theo.config.ts`:

```ts
export default defineConfig({
  storage: { postgres: {...}, redis: {...} },
  services: {}  // empty — 90% of agent products live here
})
```

**When sidecars (Wave 2 `services: {}`) ENTER:**

| Scenario | TheoKit `server/` covers? | Sidecar needed? |
|---|:---:|---|
| Login + encrypted sessions | ✅ | No |
| CRUD users + admin panel | ✅ | No |
| Agent chat via `@usetheo/sdk` | ✅ | No |
| Stripe billing webhooks | ✅ | No |
| Jobs + crons | ✅ | No (Node sidecar ONLY if isolating workers operationally) |
| Bot Telegram via `@usetheo/gateway-telegram` | ✅ | No (already in TS) |
| ML inference (sentence-transformers, scikit-learn) | ⚠️ painful in TS | ✅ Python sidecar via `--backend python` |
| OCR (Tesseract) / PDF heavy parsing | ⚠️ painful in TS | ✅ Python sidecar |
| Importing legacy company API (existing Node monolith) | ❌ | ✅ Node sidecar as reverse proxy `/api/legacy/*` |
| Microservice isolation (billing separated from app) | depends | ✅ Node sidecar if operational isolation matters |

**The rule:** if the use case is comfortable in TS, use `server/`. If it requires another language's library ecosystem or operational isolation, add a sidecar. **Sidecars complement; they don't substitute.**

**`services: {}` is OPTIONAL.** A user who never touches it gets a full agent product end-to-end with the existing TheoKit primitives. The polyglot capability is the moat (cross-product contract — invariant #4), but the moat is reached BY EXTENSION — not by forcing every user to think about polyglot from day 1.

## Acknowledged risks — honest accounting of what this bet costs

The owner reviewed and accepted these risks 2026-05-27 with the framing "benefits are medium-/long-term". This ADR records them so future sessions don't relitigate the bet, but also so the team holds itself accountable to the validation signals below.

| Risk | Severity | Mitigation / signal |
|---|---|---|
| **R1 — Cross-product contract execution gap.** The moat is the SAME contract across `create-theokit` + TheoKit + TheoCloud. If execution falls short on any one surface (e.g., TheoCloud accepts a different healthcheck shape "for K8s reasons"), the moat collapses to "three products that happen to be in the same repo". | **HIGH** | Invariant #4 (above) gates this. Pre-Wave-2 spike validates the contract against 2 deploy targets (local docker-compose + Vercel) before committing Wave 2 implementation effort. ADR-0015 amendments require this ADR amended in the same PR. |
| **R2 — Wave 2 is a release disguised as a wave.** `services: {}` primitive + 2 templates + docker-compose generator + OpenAPI client gen + healthcheck poller + manifest spec + 4 ADRs to accept + theo-stacks migration is genuinely large. | MEDIUM | Pre-Wave-2 spike (1 week) validates the contract before committing the full Wave 2 work; spike result is gate for Wave 2 implementation start. |
| **R3 — TheoCloud adapter (Wave 3) and Wave 2 polyglot are mutually-dependent for the moat to deliver value.** Wave 2 ships without TheoCloud = `services: {}` is syntactic sugar over docker-compose + Vite proxy. TheoCloud ships without Wave 2 = no polyglot to deploy. Both required. | MEDIUM | Sequenced explicitly: Wave 2 uses TheoCloud-shaped local harness, so Wave 3 is a manifest translation not a re-design. Risk is calendar slippage, not architecture. |
| **R4 — Hypothetical demand for polyglot in TheoKit's current user base.** Existing TheoKit users (Wave 1) did not request polyglot. Existing `theo-stacks` users use Go/Rust/Java/Ruby/PHP — the 5 languages Wave 2 ARCHIVES. The strong demand signal for "TS app + Python service together" is anticipated, not measured. | MEDIUM | Accepted by owner as strategic bet on the Theo product-mark identity (polyglot is the moat). Validation signal: 30 days after Wave 2 ship, count `--backend python` and `--backend node` invocations via opt-in CLI telemetry; if both are zero, the bet missed (revisit framing, do NOT immediately revert). |
| **R5 — Narrowing from 7 languages (theo-stacks) to 2 (Wave 2) strands existing `create-theo` users.** Go/Rust/Java/Ruby/PHP users have no first-party migration path. | LOW-MEDIUM | Documented in [ADR-0013](./0013-theocreate-absorbed-into-create-theokit.md) — `theo-stacks` becomes read-only archive (not deleted), community can fork. No first-party support for those 5 languages absent a new ADR with demand evidence. |
| **R6 — Identity dilution to "framework that does everything".** Sequence Meteor → Sails → Adonis showed how full-stack-everything frameworks lost focus. | LOW (with mitigation) | HERO stays "Build the app your agent lives in" (CLAUDE.md Voice and Tone, post-2026-05-27). Polyglot lives in BODY/DEEP DIVE only. Vocabulary table enforces. Invariant #3 (Python+Node only) prevents matrix sprawl. |

**Risk acceptance statement (owner, 2026-05-27):**

> The risks above are acknowledged. The bet is on medium-/long-term benefits — polyglot is the Theo product-mark differential; cross-product standardization is the moat. Short-term (≤ 30 days post-Wave-2) validation signals should not trigger reversion; they should trigger learning. Reversion is a separate decision requiring a fresh ADR.

## Implementation outline (not part of this ADR's decision; for sequencing only)

```
Wave 0 (in progress): Maturation
  → storage, plugins, jobs, security — already shipping

Wave 1 (TheoKit-only): Done definition shipped today
  → npm create theokit my-app → chat UI live in 30s

Wave 2: Polyglot services + theo-stacks absorption
  → ADR-0013 (TheoCreate absorbed)
  → ADR-0014 (services as external processes)
  → ADR-0015 (Like-Vercel runtime contract)
  → services: {} primitive
  → --backend python | node flags on create-theokit
  → docker-compose harness as TheoCloud-shape proxy

Wave 3: TheoCloud adapter consumes the same manifest
  → packages/theo/src/adapters/theo-cloud.ts
  → reads .theo/services.json (same shape Wave 2 generated)
  → real (or staging) TheoCloud smoke test
```

## Related ADRs

- [ADR-0001](./0001-update-architecture-rules-to-current-module-layout.md) — module layout (unchanged by this ADR; the 11 modules don't grow)
- [ADR-0002](./0002-job-backend-interface-neutral-contract.md) — JobBackend interface (TheoCloud-shaped)
- [ADR-0008](./0008-theoplugin-is-the-canonical-sdk.md) — plugin SDK (orthogonal to polyglot services)
- [ADR-0011](./0011-moderate-plugin-roadmap-strategy.md) — plugin roadmap (orthogonal)
- [ADR-0013](./0013-theocreate-absorbed-into-create-theokit.md) — TheoCreate absorption
- [ADR-0014](./0014-services-as-external-processes.md) — services as external processes
- [ADR-0015](./0015-services-runtime-contract-like-vercel.md) — Like-Vercel runtime contract

## References

- Owner direction, 2026-05-27 conversation transcript
- `CLAUDE.md` Mission section (re-locked 2026-05-27, see commit landing this ADR)
- `theo-stacks/README.md` — current state of the absorbed sibling
- `packages/theo/src/adapters/vercel.ts:19-60` — current Vercel adapter shape (Like-Vercel reference)
