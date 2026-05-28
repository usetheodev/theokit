# 0011. Moderate plugin roadmap — bootstrap with `@theokit/plugin-cors`, commit 3 first-party plugins

* Status: accepted
* Date: 2026-05-27
* Deciders: [TheoKit team]
* Tags: [architecture, plugins, ecosystem, roadmap, sdk]

## Context and Problem Statement

[ADR-0008](./0008-theoplugin-is-the-canonical-sdk.md) formalized `TheoPlugin` as the canonical plugin SDK and explicitly rejected speculative ecosystem-SDK work without community demand (per CLAUDE.md macro-roadmap R0.6.5). The companion repo [`theokit-plugins`](https://github.com/usetheodev/theokit-plugins) was scaffolded as an empty monorepo (commit `035d177`) ready to receive first-party plugins when demand arrives.

The owner has decided to **bootstrap the ecosystem** with one shipping plugin instead of waiting indefinitely for an external demand signal. The question this ADR answers is **how aggressive** that bootstrap should be:

- **Aggressive** (5–7 plugins in 2 months) — contradicts R0.6.5; single-maintainer overload (~5×3 = 15 days/year minimum maintenance).
- **Moderate** (3 committed plugins: cors + sentry + i18n) — pragmatic middle ground; honors R0.6.5 for the 6 remaining candidates.
- **Conservative** (1 plugin only) — minimal risk; little ecosystem signal.

Decision: **moderate**. Ship `@theokit/plugin-cors` first (validates pipeline end-to-end), commit to `@theokit/plugin-sentry` and `@theokit/plugin-i18n` with explicit ADRs (`proposed` status) and temporal gates, demand-gate the rest.

A secondary question surfaced during the edge-case review (`docs/reviews/edge-case-plan/plugin-cors-and-roadmap-edge-cases-2026-05-27.md`): how do `theokit/` and `theokit-plugins/` cross-repo workspace links work? Decision D7 below.

## Decision Drivers

- **Owner decision (2026-05-27)** — moderate strategy chosen between conservative/moderate/aggressive
- **R0.6.5 compatibility** — 6 plugins remain demand-gated; only 3 are speculative-ish
- **Single-maintainer reality** — 3 plugins × ~3 days/year = 9 days/year total maintenance
- **Pipeline validation need** — bootstrap requires AT LEAST one real plugin shipping
- **No overpromise** — temporal gates make "moderate" measurable

## Considered Alternatives

| Alternative | Rejected because |
|---|---|
| Aggressive: ship 5-7 plugins in 2 months | ~21 days/year maintenance for a single maintainer; violates CLAUDE.md R0.6.5 explicitly; speculative |
| Conservative: ship 1 plugin only (cors) | Little ecosystem signal; community sees "single plugin" as "framework abandoned"; insufficient validation that the plugin model scales beyond one example |
| Wait for organic community demand | Already considered in ADR-0008 D1; reaffirmed by R0.6.5 for the 6 demand-gated; but pure bottom-up has not produced any community plugin in 6+ months of TheoKit existence — bootstrap signal needed |
| Build plugins inside the main `theokit` monorepo (`packages/plugin-*`) | Considered in the prior conversation; rejected because it forces shared release cadence + inflates the core repo + couples plugin lifecycle to core lifecycle |

## Decision

### D1 — Bootstrap with one plugin (`@theokit/plugin-cors`) — not three at once

`@theokit/plugin-cors` is the first plugin to ship. Sentry and i18n stay as roadmap commitments with `proposed`-status ADRs in `theokit-plugins/docs/adr/`, but no code lands in this wave.

- **Rationale:** CORS validates the entire pipeline (scaffold → develop → test → CI → release → npm) with minimal scope (~80 LOC, RFC-defined spec, zero external SDK dependency). Shipping 3 plugins simultaneously: (a) delays first release because any of the 3 can block all, (b) inflates pre-release bug surface, (c) violates "ship the smallest increment that delivers value". Sentry and i18n benefit from learning the release process via CORS before starting.
- **Consequences:**
  - ✅ First release within one sprint vs 3-4 sprints
  - ✅ Pipeline validated with minimum risk
  - ⚠️ Roadmap requires explicit temporal gates (see D4) to prevent "moderate" from silently turning into "conservative" in practice

### D4 — Committed plugins = 3 (cors + sentry + i18n); demand-gated = 6 (rest)

`theokit-plugins/ROADMAP.md` has two columns:

| Column | Members | Gate |
|---|---|---|
| **Committed** | `@theokit/plugin-cors` (shipping), `@theokit/plugin-sentry` (proposed), `@theokit/plugin-i18n` (proposed) | Temporal — see consequence below |
| **Demand-gated** | otel, resend, stripe-webhooks, clerk/auth0/workos, feature-flags, inngest/trigger-dev | 1+ production app + 3+ requests + not duplicating core (gates from ADR-0008) |

- **Rationale:** Matches owner's "moderate" choice. Three first-party plugins is enough to demonstrate the model scales while staying within single-maintainer scope (~9 days/year). The 6 demand-gated honor R0.6.5 literally.
- **Consequences:**
  - ✅ Clear external trajectory ("see roadmap")
  - ✅ Demand pressure preserved for 6 plugins (66% of catalog)
  - ⚠️ **Temporal gates (enforcement)**: `@theokit/plugin-sentry` work MUST start ≤ 2 weeks after `@theokit/plugin-cors@0.1.0` release; `@theokit/plugin-i18n` MUST start ≤ 6 weeks after. Failing these gates breaks the public promise and requires a follow-up ADR to either downgrade "moderate" to "conservative" or explain the delay

### D6 — First release is `v0.1.0`, not `v1.0.0`

`@theokit/plugin-cors` initial release = `0.1.0`. Reserve `1.0.0` for after ≥ 6 months of production usage without breaking changes.

- **Rationale:** Matches npm convention + Fastify (`@fastify/cors` started at 0.x). Communicates "API may change" honestly. Honors TheoKit core which is also in 0.x (`packages/theo/package.json:3` → `0.1.0-alpha.5`).
- **Consequences:**
  - ✅ Freedom to make breaking changes pre-1.0
  - ⚠️ Some security tools (Snyk, Renovate) treat 0.x as "unstable" — acceptable, accurate reality

### D7 — Plugin tests + fixtures use cross-repo workspace link (real `theokit` import, not stubbed)

Plugin packages in `theokit-plugins/` add `'../theokit/packages/theo'` to `pnpm-workspace.yaml`. Fixtures import `from 'theokit'` and integration tests import from `'theokit/server'` — both resolving via workspace link to the sibling-checkout TheoKit core.

This matches the sibling-checkout pattern already used by `theokit-sdk` workspace entries in TheoKit core's `pnpm-workspace.yaml` (lines 8-15).

- **Rationale:** The alternative (stubbing `theokit`'s public surface inside the plugin repo) would be circular — we'd test our own stub, not the real integration. Workspace link uses the actual `TheoApp`/`PluginContext`/`PluginRunner` types and ensures plugins break loudly if TheoKit core's public API changes. Sibling tolerance is already supported by pnpm (warns but doesn't fail when sibling is absent — same DX as `theokit-sdk`).
- **Consequences:**
  - ✅ Tests exercise the real plugin runtime
  - ✅ Fixtures are representative of real consumer usage
  - ⚠️ CI runner must checkout both repos (already the case for `theokit-sdk` — workflow pattern is reusable)
  - ⚠️ Contributors without `theokit/` cloned see pnpm warning — acceptable, same as SDK

## Consequences

### Positive

- **Bootstrap signal** — community sees a real plugin shipping + a credible roadmap
- **Validated pipeline** — every step (Changesets, GH Actions release, npm publish, peer-dep range) exercised once before the second plugin
- **Honest roadmap** — 3 committed plugins with temporal gates; 6 demand-gated with explicit gates from ADR-0008
- **Cross-repo workflow established** — D7 sets the pattern for all future plugin tests

### Negative

- **Soft commitment to 2 more plugins** — sentry + i18n are promises that must be kept within 6 weeks. Breaking the gate damages trust.
- **9 days/year maintenance** for 3 plugins as the floor. Each TheoKit major bump compounds (peer-dep range updates).

### Neutral

- **TheoKit core is unchanged** by this ADR — plugins live entirely in the `theokit-plugins/` repo. The only TheoKit core file touched by the implementation plan is `docs/concepts/plugins.md` (§3 update to reflect "1 shipping, not zero").
- **`defineTheokitModule` still rejected** (ADR-0008 D1 unchanged). The 3 committed plugins all use the existing `TheoPlugin` interface + `definePlugin` helper.

## Related ADRs

- [ADR-0008](./0008-theoplugin-is-the-canonical-sdk.md) — `TheoPlugin` is the canonical plugin SDK; rejects `defineTheokitModule`. This ADR builds on D1+D6 of 0008.
- ADR-0012 — `@theokit/plugin-sentry` (proposed; lives in `theokit-plugins/docs/adr/`)
- ADR-0013 — `@theokit/plugin-i18n` (proposed; lives in `theokit-plugins/docs/adr/`)

## References

- Plan: [`docs/plans/plugin-cors-and-roadmap-plan.md`](../plans/plugin-cors-and-roadmap-plan.md) — 7 ADRs (D1-D7), 14 tasks
- Edge-case review: [`docs/reviews/edge-case-plan/plugin-cors-and-roadmap-edge-cases-2026-05-27.md`](../reviews/edge-case-plan/plugin-cors-and-roadmap-edge-cases-2026-05-27.md) — 3 MUST FIX + 7 SHOULD TEST + 3 DOCUMENT
- `theokit-plugins` scaffold commit `035d177` — empty monorepo per ADR-0008
- CLAUDE.md macro-roadmap R0.6.5 — "Plugin ecosystem incubation — bottom-up, needs community demand signal first" (this ADR is the bootstrap exception)
- TheoKit current version: `packages/theo/package.json:3` → `0.1.0-alpha.5` (peer-dep target per D5/EC-1)
