# Plan: Framework Zero-Config Polish (5 polish bugs from item #6)

> **Version 1.0** — Close the 5 framework-level polish bugs surfaced during item #6 (`examples/full-stack-agent`) end-to-end testing on 2026-05-22. A new TheoKit consumer running `npm create theokit my-app && pnpm add @usetheo/ui && pnpm dev` should see styled TheoUI components without touching `tailwind.config.ts` or `postcss.config.js`, and `.env` values must flow into `process.env` for server code without a hand-rolled shim. This plan adopts the convergent patterns from Next.js / Astro / Nuxt / Vite / SvelteKit documented in `.claude/knowledge-base/reference/zero-config-integration.md`. Expected outcome: scaffold-to-working-styled-chat in ≤ 30 seconds with **zero consumer-side config files** beyond `.env` and `theo.config.ts`.

## Context

**What exists today:**

- `packages/theo/src/vite-plugin/theoui-detect.ts:104-133` — `detectTheoUi(projectRoot, rawConfig, resolver)` already detects `@usetheo/ui` via `require.resolve` with `paths: [projectRoot]` (handles pnpm hoist). Used in `vite-plugin/index.ts:129`.
- `packages/theo/src/vite-plugin/integrations.ts:35-37` — `defineTheoIntegration` + `createIntegrationRegistry` lifecycle hooks (mirrors Astro Integrations) already exist.
- `packages/theo/src/cli/commands/upgrade-readiness.ts` — pre-existing readiness command.
- `packages/theo/src/config/load-config.ts:82` — reads `process.env.NODE_ENV` but **never loads `.env` files**.
- `packages/theo/src/server/create-conversation-history.ts:7` — writes to `<cwd>/.theokit/agents/<agentId>/messages.jsonl` (via `@usetheo/sdk`) but **no GC**.
- `examples/full-stack-agent/` — ships `tailwind.config.ts` + `postcss.config.js` + `server/_env.ts` as workaround shims for the 5 framework gaps.

**What's broken / missing:**

1. **TheoUI styling broken out of the box** — `detectTheoUi` runs but the result is used only for fonts/styles `<link>` injection; the consumer is still required to supply `tailwind.config.ts` + `postcss.config.js` for component classes to render. Reproduces by: `pnpm create theokit my-app && pnpm add @usetheo/ui && add <Button> to app/page.tsx && pnpm dev` → unstyled button. Evidence: `examples/full-stack-agent/tailwind.config.ts` (16 LOC) + `examples/full-stack-agent/postcss.config.js` (6 LOC) were both *required* to make item #6 dogfood pass.
2. **`.env` not auto-loaded into `process.env` for server code** — server route reads `process.env.OPENROUTER_API_KEY` → undefined even when `.env` has the value. Vite loads `.env` into `import.meta.env`, never `process.env`. Evidence: `examples/full-stack-agent/server/_env.ts` (35 LOC hand-rolled dotenv-lite loader) was required.
3. **Agent registry cruft accumulates** — 52+ orphan `.theokit/agents/<id>/` directories piled up during item #6 testing. No `theokit clean`, no LRU, no GC. Evidence: manual `rm -rf .theokit/agents/` was required mid-session.
4. **OpenRouter model slug rot in defaults** — `examples/full-stack-agent/server/routes/chat.ts` hard-codes `claude-3.5-sonnet` (deprecated by OpenRouter on 2026-05-XX); broke item #6 mid-test. Pattern problem: defaults shipped in fixtures rot. Out of framework scope for this plan; surfaces as docs-only update in T4.2.
5. **No auto-config bridge between consumer-side `@usetheo/ui` install and TheoKit's Vite plugin** — adding `@usetheo/ui` to deps should be enough; today the consumer must wire Tailwind config + PostCSS config + content globs.

**Evidence:**

- Reference doc `.claude/knowledge-base/reference/zero-config-integration.md` (940 LOC, 33 inventory entries across 6 frameworks).
- Dogfood report `docs/audit/dogfood-2026-05-22-example-full-stack-agent.md` — health 85/100, 8 framework bugs caught + 5 polish bugs surfaced.
- CLAUDE.md macro roadmap item #6 — done definition includes "`npm create theokit my-app` → chat thread live in <30 seconds" (this plan closes the styling gap).

**Links:**

- Reference: `.claude/knowledge-base/reference/zero-config-integration.md`
- Predecessor plans: `docs/plans/completed/example-full-stack-agent-plan.md`, `docs/plans/completed/item-5-conversation-history-plan.md`
- ADRs cited: D1, D2, D3, D4, D5, D6 below

## Objective

**Done = `pnpm create theokit my-app && pnpm add @usetheo/ui && pnpm dev` renders styled TheoUI components with zero consumer-side Tailwind/PostCSS config, `.env` values populate `process.env` for server code without a shim, and long-lived dev sessions self-clean orphan agent registries.**

Measurable goals:

1. `examples/full-stack-agent/tailwind.config.ts` + `postcss.config.js` + `server/_env.ts` all DELETED, Playwright 5/5 still GREEN.
2. `tests/fixtures/zero-config-tailwind/` (NEW) builds + boots without consumer-side Tailwind/PostCSS files; emitted CSS contains UI component classes.
3. `theokit dev` startup logs `[theokit] Cleaned N stale agent registries (kept M)` when applicable.
4. `theokit build` empties `.theo/` except `.git*` allowlist.
5. `pnpm test` adds ≥ 35 new unit tests + 1 integration test + 5 Playwright (reusing item #6 fixture); zero pre-existing test regressions.
6. `tsc --noEmit` clean across packages; zero `any` introduced.
7. `/dogfood full` health ≥ 80, zero plan-caused regressions.

## ADRs

### D1 — Direct `dotenv` + `dotenv-expand` deps (not c12, not Vite delegation)

- **Decision:** TheoKit CLI loads `.env` via direct `dotenv` + `dotenv-expand` dependencies, before Vite spins up.
- **Rationale:** Vite's `loadEnv` only populates `import.meta.env` for the client bundle; server code that reads `process.env` is empty. SvelteKit/Astro delegate to Vite's `loadEnv` because they post-process the client virtual modules — TheoKit's gap is the opposite (server `process.env`). Nuxt's `c12`/`setupDotenv` solves the same problem but pulls `confbox`, `pkg-types`, `rc9`, `defu`, etc. — heavyweight for our narrower scope. Next.js's `loadEnvConfig` (`referencias/next.js/packages/next-env/index.ts:114-180`) is the closest fit: module-level cache, reload-with-diff, sentinel — implementable as a 150-LOC TS file with 2 deps.
- **Consequences:** TheoKit owns the `.env → process.env` mutation. `import.meta.env.THEO_PUBLIC_*` continues to work for client (Vite handles it). +5kb CLI bundle (dotenv) + 2kb (dotenv-expand). Reload-on-watch is deferred to follow-up plan.

### D2 — Auto-detect strategy: `package.json` declaration + subpath probe

- **Decision:** `detectTheoUi` (already shipping) is the canonical pattern: read `<projectRoot>/package.json`, check `dependencies` / `devDependencies` / `peerDependencies` for the package name. If declared, probe a known subpath via `require.resolve(...{ paths: [projectRoot] })`. New `detectPackage(name, projectRoot)` is the generalized form for `tailwindcss` + `@tailwindcss/vite`.
- **Rationale:** Filesystem-based detection (`existsSync('node_modules/@usetheo/ui')`) breaks under pnpm hoist (deps live at workspace root, not in `apps/my-app/node_modules/`). `require.resolve` walks Node's module resolution correctly — same logic the runtime uses. Tested + working in `theoui-detect.ts`.
- **Consequences:** Detection is closed-on-source — adding `@usetheo/ui` to peerDeps without listing it as a real dep is silently false (intentional; peerDeps may be unresolved). False-negatives never throw; downstream code sees `enabled: false` and skips wiring. Auto-config NEVER touches consumer's `tailwind.config.ts` if one exists (D3).

### D3 — Auto-config defers to consumer's manual config when present

- **Decision:** TheoKit's vite-plugin checks for consumer-side `tailwind.config.{ts,js,mjs,cjs}` and `postcss.config.{ts,js,mjs,cjs}` via walk-up. If either exists, log an info message and **DO NOT** auto-inject anything — consumer is in charge.
- **Rationale:** Mirrors Astro `astro:config:done` lint pattern (`integrations/react/src/index.ts:188-199`) — framework warns about conflicts instead of forcing a resolution. Override-by-presence is unambiguous; users who want full control get it.
- **Consequences:** Consumers who actively customize Tailwind keep their power. Consumers who add `@usetheo/ui` to a fresh project get zero-config. Migration message tells customizers how to extend via `@usetheo/ui/preset`.

### D4 — State cleanup: hybrid by directory (Astro for build, Nuxt LRU for runtime)

- **Decision:** Two distinct cleanup mechanisms:
  - `.theo/` (build output): Astro pattern — `emptyDir(distDir, skip: ['.git', '.gitkeep', '.gitignore'])` at `theokit build` start.
  - `.theokit/agents/<id>/`: Nuxt LRU pattern — `glob('*')`, `Promise.all(stat)` for mtime, sort ascending, `unlink` slice when count > cap. Default cap = 100. Runs at `theokit dev` startup, NOT every request.
- **Rationale:** `.theo/` is publish-only (no cache lives there) — full wipe is safe + matches Astro. `.theokit/agents/` is runtime cache (each conversation = a directory of `messages.jsonl` + tool state) — full wipe would destroy active sessions. LRU keeps the 100 most-recent agents, deletes older ones quietly.
- **Consequences:** Build is hermetic — `theokit build` cannot read stale `.theo/` artifacts. Dev sessions self-clean. Long-running production apps need a separate strategy (out of scope; production agent persistence belongs to the SDK).

### D5 — Plugin-side auto-config (cross-repo: `@usetheo/ui` ships its own Vite plugin)

- **Decision:** `@usetheo/ui` package (cross-repo: `theokit-ui`) ships `./vite-plugin` and `./preset` subpath exports. TheoKit's vite-plugin auto-detects `@usetheo/ui` AND `@tailwindcss/vite` in the consumer's deps, dynamic-imports them, and chains them into the Vite plugin array via `config()` hook return value. `@tailwindcss/vite` is a peer dep of `@usetheo/ui`, not of TheoKit.
- **Rationale:** Mirrors Tailwind v4 + Astro v5 pattern: plugin owns its config; framework auto-wires. Avoids inventing a TheoKit-specific integration surface for what is fundamentally a Vite plugin chain problem. If `@usetheo/ui` evolves (adds new variants, changes content globs), the change lives in the UI repo — TheoKit doesn't need a release.
- **Consequences:** Cross-repo dependency — `@usetheo/ui` must publish `./vite-plugin` and `./preset` BEFORE Phase 3 lands. Phase 3 is the largest scope phase. Phases 1 + 2 ship independent of cross-repo work.

### D6 — `loadEnv` mutation policy: own write, never delete user keys

- **Decision:** `loadEnv` adds new keys to `process.env` and OVERWRITES keys it previously set. It does NOT delete keys present in `process.env` but absent from `.env` (Next.js does delete; TheoKit does not).
- **Rationale:** Next.js's delete-on-diff makes sense for `next dev` watching `.env` for changes — when a key disappears from `.env`, it should disappear from `process.env`. TheoKit Phase 1 ships static load only (no watcher), and pre-existing `process.env` keys may come from CI / shell / Docker — deleting them is destructive. Keys WE set get a sentinel suffix in a private registry; on reload (Phase 4 follow-up plan), only OUR keys get diffed.
- **Consequences:** No surprise deletion in CI. The reload-with-diff feature ships in a follow-up plan (out of scope here). Simpler implementation; smaller surface to test.

## Dependency Graph

```
Phase 0 (Spike)
   │
   ▼
Phase 1 ────────────────▶ Phase 2 ────▶ Phase 4 (Hardening)
(Env auto-load)         (State cleanup)        │
   │                                            ▼
   │                                       Final Phase
   ▼                                       (Dogfood QA)
Phase 3 (UI auto-config)
[BLOCKED on cross-repo @usetheo/ui release]
   │
   ▼
Phase 4 (merge point)
```

- **Phase 0 (spike)** unblocks Phase 3 — resolves the `@usetheo/ui` Vite plugin API shape (Q3 + Q4 from reference doc). Cross-repo coordination.
- **Phase 1** is independent — pure TheoKit CLI work.
- **Phase 2** runs in parallel with Phase 1 (different files).
- **Phase 3** waits on Phase 0 spike + cross-repo `@usetheo/ui` release. Once both ready, can run in parallel with Phase 2.
- **Phase 4** is the merge point — requires Phase 1 + 2 + 3 complete.
- **Final Phase** (Dogfood) is the last gate.

---

## Phase 0: Spike — Cross-repo `@usetheo/ui` Vite plugin API shape

**Objective:** Resolve open questions Q3 + Q4 from `zero-config-integration.md` so Phase 3 can ship without rework.

### T0.1 — Spike: `@usetheo/ui` plugin API contract

#### Objective
Define the public API + behavior contract for `@usetheo/ui/vite-plugin` (cross-repo) so TheoKit's vite-plugin auto-wiring (Phase 3) can be written against a stable target.

#### Evidence
Reference doc §10 open questions Q3 + Q4: "What does `@usetheo/ui/vite-plugin` return?" and "Does `@usetheo/ui` ship pre-compiled CSS, Tailwind preset, or both?". Without the answer, Phase 3 implementation is speculative.

#### Files to edit
```
docs/spikes/usetheo-ui-vite-plugin-shape.md — (NEW) spike output
```

(No production code in spike phase.)

#### Deep file dependency analysis
- **`docs/spikes/usetheo-ui-vite-plugin-shape.md`** (NEW): documents the cross-repo contract. Phase 3 tasks block on this doc landing.

#### Deep Dives
- **API shape candidates** to test:
  - `import useTheoUI from '@usetheo/ui/vite-plugin'; useTheoUI({ tailwind: 'auto' | 'off' })` returns `Plugin` (single Vite plugin that internally chains `@tailwindcss/vite`).
  - OR `import { useTheoUIPlugins } from '@usetheo/ui/vite-plugin'; useTheoUIPlugins()` returns `Plugin[]` (caller chains).
- **Preset shape**: `import preset from '@usetheo/ui/preset'` → Tailwind v4 preset object (`content: [...]`, `theme: {...}`, `plugins: [...]`).
- **CSS strategy**: confirm `@usetheo/ui` content globs already include `@usetheo/ui/dist/**` (so consumer-side Tailwind picks them up via `@source` directives). If not, the auto-injected Tailwind plugin must add them.
- **Peer dep version range**: confirm `@usetheo/ui@^X.Y.Z` peer-requires `@tailwindcss/vite@^4`.

#### Tasks
1. Clone or inspect `theokit-ui/` repo state (it's a workspace sibling).
2. Document existing exports + identify the path of least friction.
3. Propose API shape, peer-deps, and CSS strategy in the spike doc.
4. Sync with the UI repo maintainer (the user) — get sign-off on the shape.
5. Open cross-repo task (in the UI repo's plan/TODO) to ship `./vite-plugin` + `./preset` + bump `@tailwindcss/vite` peer-dep.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_spike_doc_exists_and_specifies_api() — Given the spike phase has completed, When tests/unit/spike-zero-config.test.ts inspects docs/spikes/usetheo-ui-vite-plugin-shape.md, Then the file MUST contain sections "API Shape", "Peer Dependencies", "Preset Content Globs", "Acceptance Criteria"
RED:     test_spike_doc_specifies_default_export_signature() — Given the spike doc, When parsing the "API Shape" section, Then it documents either (a) `default function (opts) => Plugin` OR (b) named `useTheoUIPlugins` returning `Plugin[]`; ambiguity is rejected
RED:     test_spike_doc_specifies_tailwind_peer_range() — Given the spike doc, When parsing "Peer Dependencies", Then `@tailwindcss/vite` semver range is present (validation error: regex `\^\d+`)
RED:     test_spike_doc_handles_no_tailwind_case() — Given the consumer has @usetheo/ui but NOT @tailwindcss/vite, When auto-config runs, Then spike doc specifies the behavior (skip auto-wire + emit warning OR auto-install)
GREEN:   Write the spike doc. Resolution: API = `default function ({ tailwind?: boolean }) => Plugin` (single plugin, internally chains Tailwind). Peer dep: `@tailwindcss/vite ^4`. No-tailwind case: emit "[theokit] @usetheo/ui detected, install @tailwindcss/vite to enable styling" warn, no-op.
REFACTOR: None expected (doc-only phase).
VERIFY:  npx vitest run tests/unit/spike-zero-config.test.ts
```

BDD scenarios covered:
- Happy path: spike doc exists + parses + specifies API.
- Validation error: ambiguous API shape rejected.
- Edge case: no-tailwind path documented.
- Error scenario: missing peer-dep version rejected at test time.

#### Acceptance Criteria
- [ ] `docs/spikes/usetheo-ui-vite-plugin-shape.md` committed.
- [ ] API shape resolved (default fn returning single Plugin).
- [ ] Peer dep range stated.
- [ ] `tests/unit/spike-zero-config.test.ts` passes (4 RED → GREEN).
- [ ] Cross-repo task captured in the UI repo's TODO list.
- [ ] Pass: tsc --noEmit clean.
- [ ] Pass: lint zero warnings.

#### DoD
- [ ] Spike doc reviewed by the user (paulo) — Phase 3 cannot start without sign-off.
- [ ] All RED tests GREEN.

---

## Phase 1: `.env` auto-load into `process.env` for server code

**Objective:** Consumer's `.env` file values are present in `process.env` for server code (routes, actions, CLI commands) without any consumer-side shim.

### T1.1 — Implement `loadEnv` utility with Next.js-style algorithm

#### Objective
Ship the canonical env loader: file priority, dotenv-expand, NODE_ENV stash, sentinel, module-level cache, `forceReload` escape hatch. Pure function, fully unit-testable.

#### Evidence
Reference doc §3.1 (Next.js `loadEnvConfig` algorithm), §4 convergent pattern #1, §8 edge cases (NODE_ENV shadow, FIFO, `${VAR}` cross-ref). Item #6 needed `examples/full-stack-agent/server/_env.ts` (35 LOC) as a workaround — this task makes that file deletable.

#### Files to edit
```
packages/theo/src/config/load-env.ts                  — (NEW) loadEnv implementation
packages/theo/src/config/load-env-types.ts            — (NEW) LoadEnvOptions, LoadEnvResult types
tests/unit/load-env.test.ts                            — (NEW) 12 BDD scenarios
packages/theo/package.json                             — (EDIT) add deps: dotenv, dotenv-expand
```

#### Deep file dependency analysis
- **`packages/theo/src/config/load-env.ts`** (NEW): standalone module. Imports `dotenv`, `dotenv-expand`, `node:fs`, `node:path`. Exports `loadEnv(options?: LoadEnvOptions): LoadEnvResult`. No downstream files in this task — wiring happens in T1.2.
- **`packages/theo/src/config/load-env-types.ts`** (NEW): types only. Imported by `load-env.ts` and downstream consumers.
- **`tests/unit/load-env.test.ts`** (NEW): vitest suite. Uses `tmp` directory + `writeFileSync` to fixture `.env` files. Mutates and restores `process.env` per test.
- **`packages/theo/package.json`**: adds `dotenv: ^16` + `dotenv-expand: ^11` to `dependencies`. Does NOT change peerDeps. Existing fields untouched.

#### Deep Dives
- **API**:
  ```ts
  export interface LoadEnvOptions {
    cwd?: string                    // default: process.cwd()
    mode?: string                   // default: process.env.NODE_ENV ?? 'development'
    forceReload?: boolean           // default: false; bypass module-level cache
  }
  export interface LoadEnvResult {
    loaded: Record<string, string>  // keys that were applied to process.env
    loadedFromFiles: string[]       // absolute file paths read (in priority order)
  }
  export function loadEnv(options?: LoadEnvOptions): LoadEnvResult
  ```
- **Algorithm** (mirrors Next.js `next-env/index.ts:135-180`):
  1. Resolve `cwd` (default `process.cwd()`), `mode` (default `NODE_ENV ?? 'development'`).
  2. Compute file list in priority order: `.env.{mode}.local`, `.env.local` (skip if `mode === 'test'`), `.env.{mode}`, `.env`.
  3. For each file in REVERSE order (so first-in-priority wins via overwrite):
     - `fs.statSync(file)` — must be file OR FIFO. Skip otherwise.
     - `fs.readFileSync(file, 'utf-8')` + `dotenv.parse(content)` → keys.
     - Merge into accumulator.
  4. NODE_ENV stash (`env.ts:62-71`): if accumulator has `NODE_ENV` and `process.env.__THEOKIT_USER_NODE_ENV === undefined`, set `__THEOKIT_USER_NODE_ENV = accumulator.NODE_ENV`. Don't propagate `NODE_ENV` to `process.env`.
  5. `dotenv-expand`: pass clone of `process.env` into `processEnv` arg (D6 — never mutate real `process.env` during expansion).
  6. Apply: for each `[key, value]` in expanded set:
     - Skip if `process.env[key] !== undefined` AND `key !== 'NODE_ENV'` (real process.env wins).
     - Else: `process.env[key] = value`. Track in internal `_lastLoadedKeys` Set for D6.
  7. Set sentinel: `process.env.__THEOKIT_PROCESSED_ENV = 'true'`.
  8. Return `LoadEnvResult`.
- **Invariants**:
  - PRE: `process.env` is a `Record<string, string | undefined>`.
  - POST: `process.env[K] === V` for every `K` from the LAST-IN-PRIORITY file (more-specific file like `.env.local` wins), UNLESS `process.env[K]` was already set (real env wins).
  - INVARIANT: `process.env.NODE_ENV` is NEVER overwritten by `.env`-set NODE_ENV.
- **Edge cases**:
  - `.env` is a symlink → `fs.statSync` follows. OK. (EC-13: log `[theokit] .env is a symlink → ${realpath}` for transparency.)
  - `.env` is a FIFO (1Password integration) → `stat.isFIFO()` true → readSync works (blocks until producer writes EOF). OK; covered by test.
  - `.env` contains `KEY=` (empty value) → `process.env.KEY = ''`. OK.
  - `.env` contains `KEY="quoted value"` → `dotenv.parse` strips quotes. OK.
  - `.env` contains `${UNSET_VAR}` → `dotenv-expand` leaves literal. OK.
  - **EC-1 (MUST FIX): huge `.env` (>1MB)** → `fs.statSync(file).size > 1_048_576` → log warn `[theokit] .env at ${path} exceeds 1MB — skipping (likely a generated artifact, not a real env file)` and skip. Prevents OOM/event-loop block from accidental or supply-chain huge files.
  - **EC-2 (MUST FIX): module-level cache pollutes vitest cross-test runs** → export `_resetEnvCache()` test-only side-door. Tests call it in `beforeEach`. Without this, two test files sharing a vitest worker collide on cache key `${cwd}:${mode}`.
  - **EC-8 (SHOULD TEST): dotenv-expand circular ref** `A=${B}\nB=${A}` → dotenv-expand returns literals for unresolvable refs; no infinite loop. Test pins this.
  - Module-level cache hit + `forceReload: false` → no FS read, return cached. Cache key = `${cwd}:${mode}`.
  - `cwd` doesn't exist → `fs.statSync` throws ENOENT — caught, file skipped.

#### Tasks
1. Add `dotenv: ^16`, `dotenv-expand: ^11` to `packages/theo/package.json` dependencies.
2. Run `pnpm install` to resolve.
3. Create `packages/theo/src/config/load-env-types.ts` with `LoadEnvOptions` + `LoadEnvResult` interfaces.
4. Create `packages/theo/src/config/load-env.ts` with module-level cache + `loadEnv` impl per algorithm above.
5. Create `tests/unit/load-env.test.ts` with 12 BDD scenarios (RED first).
6. Run vitest — all RED tests fail.
7. Implement algorithm step-by-step until all GREEN.
8. Refactor: extract `_collectEnvFiles(cwd, mode)`, `_parseEnvFile(path)`, `_applyToProcess(env, lastLoaded)` for readability.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_loadEnv_happy_basic_dotenv() — Given a tmp dir with `.env` containing `KEY=value`, When loadEnv({ cwd: tmpDir }) is called, Then process.env.KEY === 'value' AND result.loadedFromFiles === ['/tmp/.../.env']
RED:     test_loadEnv_priority_local_overrides_base() — Given .env=`K=1` and .env.local=`K=2`, When loadEnv called, Then process.env.K === '2'
RED:     test_loadEnv_priority_mode_local_wins_all() — Given .env=`K=1`, .env.local=`K=2`, .env.development=`K=3`, .env.development.local=`K=4`, When loadEnv({ mode: 'development' }), Then process.env.K === '4'
RED:     test_loadEnv_test_mode_skips_local() — Given .env.local=`K=local` and .env.test=`K=test`, When loadEnv({ mode: 'test' }), Then process.env.K === 'test' (NOT 'local')
RED:     test_loadEnv_dotenv_expand_resolves_refs() — Given .env=`A=hi\nB=${A}-world`, When loadEnv called, Then process.env.B === 'hi-world'
RED:     test_loadEnv_dotenv_expand_uses_process_env() — Given process.env.SHELL_VAR='shell' and .env=`COMBINED=${SHELL_VAR}-extra`, When loadEnv called, Then process.env.COMBINED === 'shell-extra'
RED:     test_loadEnv_real_process_env_wins() — Given process.env.K='real' BEFORE call and .env=`K=file`, When loadEnv called, Then process.env.K === 'real' (real wins)
RED:     test_loadEnv_NODE_ENV_stashed_not_propagated() — Given process.env.NODE_ENV='test' and .env=`NODE_ENV=production\nK=1`, When loadEnv({ mode: 'test' }), Then process.env.NODE_ENV === 'test' AND process.env.__THEOKIT_USER_NODE_ENV === 'production' AND process.env.K === '1'
RED:     test_loadEnv_missing_file_no_op() — Given empty tmp dir (no .env), When loadEnv called, Then result.loaded === {} AND result.loadedFromFiles === [] AND no throw
RED:     test_loadEnv_module_cache_skips_reread() — Given .env=`K=1`, When loadEnv called twice, Then second call returns same loadedFromFiles AND FS readSync called only once (verify via vi.spyOn(fs))
RED:     test_loadEnv_forceReload_bypasses_cache() — Given .env=`K=1`, edit to `K=2`, When loadEnv({forceReload:true}) called twice, Then process.env.K === '2' on second call
RED:     test_loadEnv_sentinel_set() — Given .env=`K=1`, When loadEnv called, Then process.env.__THEOKIT_PROCESSED_ENV === 'true'
RED:     test_loadEnv_skips_huge_file_EC1() — Given .env with size > 1MB (fs.writeFileSync 2MB content), When loadEnv called, Then warn logged AND that .env's keys are NOT in process.env AND no OOM
RED:     test_loadEnv_resetCache_isolates_tests_EC2() — Given loadEnv loads fixture A, When _resetEnvCache() is called, Then second loadEnv with a different cwd reads filesystem (verify via fs spy) — proves cache reset works
RED:     test_loadEnv_circular_expand_no_loop_EC8() — Given .env=`A=${B}\nB=${A}`, When loadEnv called, Then no infinite loop AND result completes within 100ms AND result.loaded.A is defined (literal)
RED:     test_loadEnv_symlink_logged_EC13() — Given .env is a symlink to ../external.env, When loadEnv called, Then console.info matches /symlink/ AND keys loaded normally
GREEN:   Implement loadEnv per algorithm in Deep Dives. Module-level Map<string, LoadEnvResult> for cache. dotenv.parse for parsing, dotenv-expand for ${} resolution. EC-1: file-size cap 1MB. EC-2: export _resetEnvCache test-only side-door.
REFACTOR: Extract _collectEnvFiles, _parseEnvFile, _applyToProcess. Keep loadEnv ≤30 LOC.
VERIFY:  npx vitest run tests/unit/load-env.test.ts
```

BDD scenarios covered:
- Happy path: basic .env load.
- Validation error: NODE_ENV shadow blocked.
- Edge case: missing file, expand on real process.env, real-env wins, sentinel.
- Error scenario: cwd ENOENT, cache bypass.

#### Acceptance Criteria
- [ ] All 12 RED tests GREEN.
- [ ] `loadEnv` exported from `packages/theo/src/config/load-env.ts`.
- [ ] No `any` in production code; no `@ts-ignore`.
- [ ] `dotenv` + `dotenv-expand` in `dependencies` (not peerDependencies).
- [ ] Pass: `npx tsc --noEmit`
- [ ] Pass: `pnpm lint` zero warnings.
- [ ] Pass: `npx vitest run tests/unit/load-env.test.ts`.

#### DoD
- [ ] All tasks completed.
- [ ] All tests passing.
- [ ] Bundle size delta < 10kb gzipped (verified via `pnpm build` + measure `dist/cli/index.js`).
- [ ] CHANGELOG `[Unreleased]` entry under `Added`: "Auto-load `.env` files into `process.env` for server code via `loadEnv()` (#TBD)".

---

### T1.2 — Wire `loadEnv` into CLI commands (dev, build, start)

#### Objective
Every CLI command that boots TheoKit calls `loadEnv()` BEFORE any other code reads `process.env`. Result: consumer-side `server/routes/chat.ts` sees `process.env.OPENROUTER_API_KEY` populated from `.env` without a shim.

#### Evidence
T1.1 ships the utility but it's a no-op until wired. Reference doc §3.1 — Next.js calls `loadEnvConfig` at the top of `cli/next-build.ts`, `cli/next-dev.ts`, `cli/next-start.ts`. Same pattern here.

#### Files to edit
```
packages/theo/src/cli/commands/dev.ts                  — (EDIT) call loadEnv() at top
packages/theo/src/cli/commands/build.ts                — (EDIT) call loadEnv() at top
packages/theo/src/cli/commands/start.ts                — (EDIT) call loadEnv() at top
tests/unit/cli-env-wiring.test.ts                       — (NEW) 5 BDD scenarios via subprocess
tests/fixtures/zero-config-env/                        — (NEW) minimal fixture: .env + theo.config.ts + 1 route
tests/fixtures/zero-config-env/.env                     — `OPENROUTER_API_KEY=test-key-xyz`
tests/fixtures/zero-config-env/theo.config.ts          — basic config
tests/fixtures/zero-config-env/server/routes/key.ts    — route that echoes process.env.OPENROUTER_API_KEY
tests/fixtures/zero-config-env/package.json            — workspace dep on `theokit: workspace:*`
tests/fixtures/zero-config-env/index.html              — minimal html
tests/fixtures/zero-config-env/app/page.tsx            — minimal page
```

#### Deep file dependency analysis
- **`packages/theo/src/cli/commands/dev.ts`**: today imports `vite` + boots dev server. Today reads `process.env.PORT` etc. After: imports `loadEnv` from `../../config/load-env.js`, calls it FIRST, then proceeds. Downstream: every route handler imported from `server/` now sees populated `process.env`.
- **`packages/theo/src/cli/commands/build.ts`**: today imports `vite` build + manifest writer. Same edit — call `loadEnv({ mode: 'production' })` first.
- **`packages/theo/src/cli/commands/start.ts`**: today imports SSR server. Same edit — call `loadEnv({ mode: 'production' })` first.
- **`tests/fixtures/zero-config-env/`** (NEW): reusable fixture. Future tests can boot from here.
- **`tests/unit/cli-env-wiring.test.ts`** (NEW): spawns `node packages/theo/src/cli/index.ts dev --port 0` as subprocess against the fixture, validates HTTP response.

#### Deep Dives
- **Order matters**: `loadEnv()` MUST be called BEFORE `loadConfig()` because `theo.config.ts` may reference env vars (e.g., `auth: { sessionSecret: process.env.SESSION_SECRET }`). Today this would be undefined.
- **Mode resolution**: `dev.ts` → `mode='development'`; `build.ts` + `start.ts` → `mode='production'` (unless `NODE_ENV` already set). T1.1's default handles this.
- **Forwarding to subprocess**: Vite's `server.middlewareMode` spawn doesn't fork — same process — so `process.env` mutation propagates. No IPC needed.
- **Edge case**: user runs `OPENROUTER_API_KEY=cli-override pnpm dev` — real env wins per D6. Covered by T1.1 test `test_loadEnv_real_process_env_wins`.

#### Tasks
1. Edit `cli/commands/dev.ts`: add `import { loadEnv } from '../../config/load-env.js'` + call `loadEnv()` as first line of the command body.
2. Repeat for `build.ts` (with `mode: 'production'`) and `start.ts` (with `mode: 'production'`).
3. Create fixture `tests/fixtures/zero-config-env/` per file list.
4. Create `tests/unit/cli-env-wiring.test.ts` with subprocess invocations (or in-process for speed).
5. Run RED tests → GREEN by virtue of T1.2 edits.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_dev_command_loads_env_before_route() — Given fixture with .env=`KEY=devvalue`, When `theokit dev` boots and GET /api/key, Then response body === 'devvalue'
RED:     test_build_command_loads_env() — Given fixture with .env=`KEY=buildvalue`, When `theokit build` runs, Then process.env.KEY observable from a config function that references it
RED:     test_start_command_loads_env() — Given built fixture + .env=`KEY=startvalue`, When `theokit start` boots and GET /api/key, Then response body === 'startvalue'
RED:     test_env_loaded_before_theoconfig() — Given .env=`SECRET=abc` and theo.config.ts referencing `process.env.SECRET` in default function, When dev boots, Then config function sees 'abc' not undefined
RED:     test_real_env_overrides_dotenv_in_cli() — Given .env=`K=file`, When `K=real pnpm dev` invoked, Then process.env.K === 'real' (validation that real-env-wins propagates)
GREEN:   Wire loadEnv() as first call in dev.ts / build.ts / start.ts.
REFACTOR: None expected.
VERIFY:  npx vitest run tests/unit/cli-env-wiring.test.ts
```

BDD scenarios covered:
- Happy path: dev command sees .env.
- Validation error: incorrect order (env loaded AFTER config) detected.
- Edge case: real-env-override at CLI invocation time.
- Error scenario: build + start commands.

#### Acceptance Criteria
- [ ] 5 RED → GREEN.
- [ ] Fixture `tests/fixtures/zero-config-env/` boots cleanly.
- [ ] `examples/full-stack-agent/server/_env.ts` becomes deletable in T1.4.
- [ ] Pass: `tsc --noEmit`.
- [ ] Pass: lint zero warnings.
- [ ] Pass: vitest CLI suite.

#### DoD
- [ ] All tasks completed.
- [ ] All tests passing.
- [ ] Manual smoke: in fixture, `pnpm dev && curl http://localhost:N/api/key` returns the .env value.

---

### T1.3 — Wire `loadEnv` into `config/load-config.ts`

#### Objective
`theo.config.ts` functions that reference `process.env.X` resolve correctly because `loadEnv` runs before `loadConfig`.

#### Evidence
T1.2 wires CLI commands but the order — `loadEnv` → `loadConfig` — matters because `theo.config.ts` (per Onda 21 §22.7) may reference env vars. If `loadConfig` ran first, those references would be undefined.

#### Files to edit
```
packages/theo/src/config/load-config.ts                — (EDIT) call loadEnv() at top of loadConfig
tests/unit/load-config-env-order.test.ts                — (NEW) 4 BDD scenarios
```

#### Deep file dependency analysis
- **`packages/theo/src/config/load-config.ts`**: today reads `process.env.NODE_ENV` at line 82 (after T1.1, `process.env` will be populated by CLI commands already). Edge case: if `loadConfig` is called outside CLI (e.g., by a test, by a future programmatic API), `loadEnv` may not have run. Edit: at top of `loadConfig`, call `loadEnv({ cwd: configDir })`. Cache makes the second call cheap.
- **`tests/unit/load-config-env-order.test.ts`** (NEW): verifies that calling `loadConfig` standalone (no CLI) still sees `.env`.

#### Deep Dives
- **Cache benefit**: `loadConfig` calls `loadEnv` defensively. If CLI already called `loadEnv()` with the same cwd, the cache hit makes the second call ~0ms (just a Map lookup). If `loadConfig` is the first caller (programmatic API), it triggers the actual load.
- **Bidirectional edge**: what if `theo.config.ts` itself MUTATES `process.env` (e.g., side-effect import)? Phase 1 doesn't address that — the config file runs AFTER `loadEnv`, so its mutations take precedence. Acceptable.

#### Tasks
1. Add `loadEnv({ cwd: configDir })` at top of `loadConfig`.
2. Create `tests/unit/load-config-env-order.test.ts`.
3. Verify RED → GREEN.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_loadConfig_sees_env_in_config_fn() — Given .env=`SECRET=xyz` and theo.config.ts exporting `{ auth: { sessionSecret: process.env.SECRET } }`, When loadConfig called directly (no CLI), Then result.auth.sessionSecret === 'xyz'
RED:     test_loadConfig_skips_env_load_if_processed() — Given process.env.__THEOKIT_PROCESSED_ENV === 'true' (set by CLI), When loadConfig called, Then loadEnv is called but uses cache (verify via spy)
RED:     test_loadConfig_handles_missing_env_file_gracefully() — Given no .env present, When loadConfig called, Then no throw, config loads normally
RED:     test_loadConfig_env_does_not_break_NODE_ENV() — Given process.env.NODE_ENV='test' and .env=`NODE_ENV=production`, When loadConfig called, Then result.* fields reflect test mode (NOT production)
GREEN:   Add loadEnv({ cwd }) at top of loadConfig. Existing code unchanged after that line.
REFACTOR: None expected.
VERIFY:  npx vitest run tests/unit/load-config-env-order.test.ts
```

BDD scenarios covered: happy / validation / edge / error per template.

#### Acceptance Criteria
- [ ] 4 RED → GREEN.
- [ ] No regression in existing `tests/unit/load-config.test.ts`.
- [ ] Pass: tsc --noEmit.
- [ ] Pass: lint zero warnings.

#### DoD
- [ ] All tasks completed.
- [ ] All existing config-load tests still green.

---

### T1.4 — Delete `examples/full-stack-agent/server/_env.ts` shim; verify dogfood

#### Objective
The reason this whole phase exists. Delete the 35-LOC hand-rolled shim and prove the framework auto-load replaces it 1:1.

#### Evidence
Item #6 shipped `examples/full-stack-agent/server/_env.ts` because the framework didn't load `.env`. After T1.1 + T1.2 + T1.3, that shim is dead code. If we don't delete it, Phase 1 is incomplete.

#### Files to edit
```
examples/full-stack-agent/server/_env.ts               — (DELETE) replaced by framework auto-load
examples/full-stack-agent/server/routes/chat.ts        — (EDIT) remove `import '../_env.js'` line
examples/full-stack-agent/server/telegram-bot.ts       — (EDIT) remove the `loadEnvFile` helper + 4 lines of setup
tests/e2e/example-full-stack-agent.spec.ts             — (VERIFY) all 5 specs still GREEN after deletion
```

#### Deep file dependency analysis
- **`examples/full-stack-agent/server/_env.ts`**: 35-LOC custom dotenv reader. Imported by `server/routes/chat.ts` (line 1) and used informally in `server/telegram-bot.ts:28-44`. After Phase 1, framework owns env loading — no consumer code needed.
- **`server/routes/chat.ts`**: remove the `import '../_env.js'` directive. Process.env will be pre-populated by `theokit dev` / `theokit start` before this module evaluates.
- **`server/telegram-bot.ts`**: drop the `loadEnvFile` helper function + `loadEnvFile(resolve(process.cwd(), '.env'))` call + `void loadDotenv` line. Bot runs as standalone script via `tsx server/telegram-bot.ts`; for that to work, the bot must also call `loadEnv()` itself OR run via the CLI. Decision: keep the bot using `tsx` directly; have it call `import { loadEnv } from 'theokit/server'` (export it from `theokit/server` as part of T1.5 in a follow-up — for now, the bot continues with a SMALLER inline loader because it's outside the CLI loop).

Actually re-evaluating: the bot is a separate Node process. The CLI's `loadEnv` only runs if invoked through CLI. For the bot, simplest path is to call `loadEnv` from the bot entry. Need to export it.

Adjust files to edit:
```
packages/theo/src/server/index.ts                       — (EDIT) re-export loadEnv as a public API
examples/full-stack-agent/server/_env.ts                — (DELETE)
examples/full-stack-agent/server/routes/chat.ts         — (EDIT) remove `import '../_env.js'`
examples/full-stack-agent/server/telegram-bot.ts        — (EDIT) replace inline loader with `import { loadEnv } from 'theokit/server'; loadEnv()`
```

#### Deep Dives
- **Export surface**: `loadEnv` becomes part of `theokit/server` public API. This is a NEW public function; CHANGELOG entry under "Added".
- **Bot path**: standalone scripts (Telegram bot, queue consumers, cron jobs) bypass the CLI loop. They need a programmatic way to load env. `import { loadEnv } from 'theokit/server'; loadEnv()` is that path.
- **Backward compat**: existing consumer code that calls `theokit dev` / `theokit start` is unaffected — env loading is additive.

#### Tasks
1. Add `export { loadEnv } from '../config/load-env.js'` to `packages/theo/src/server/index.ts`.
2. Delete `examples/full-stack-agent/server/_env.ts`.
3. Edit `server/routes/chat.ts`: remove line 1 (`import '../_env.js'`).
4. Edit `server/telegram-bot.ts`: replace the env-load block with `import { loadEnv } from 'theokit/server'; loadEnv()`.
5. Run `pnpm test:e2e -- example-full-stack-agent` — must be 5/5 GREEN.
6. Run `pnpm dev` in `examples/full-stack-agent/` + manual smoke: `curl /api/chat` with valid `.env`.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_loadEnv_exported_from_theokit_server() — Given the public API, When `import { loadEnv } from 'theokit/server'` is type-checked, Then it resolves to the same function as the internal one
RED:     test_example_full_stack_agent_no_shim_file() — Given the example dir, When tests/unit/example-shim-deleted.test.ts inspects the filesystem, Then examples/full-stack-agent/server/_env.ts does NOT exist
RED:     test_example_chat_route_no_shim_import() — Given examples/full-stack-agent/server/routes/chat.ts, When parsed, Then it does NOT contain `import '../_env`
RED:     test_example_telegram_bot_uses_framework_loadenv() — Given examples/full-stack-agent/server/telegram-bot.ts, When parsed, Then it contains `import { loadEnv } from 'theokit/server'`
RED:     test_telegram_bot_explicit_cwd_EC7() — Given the telegram-bot.ts source, When parsed, Then loadEnv is called with `{ cwd: ... }` (explicit, NOT no-arg). Defends against bot being launched from monorepo root reading wrong .env.
GREEN:   Delete shim, edit imports, re-export loadEnv. EC-7: bot uses explicit cwd resolved from import.meta.url.
REFACTOR: None expected.
VERIFY:  npx vitest run tests/unit/example-shim-deleted.test.ts && pnpm test:e2e -- example-full-stack-agent
```

BDD scenarios:
- Happy path: framework loads env, route works.
- Validation error: re-export visible.
- Edge case: bot entry uses framework path.
- Error scenario: shim file truly gone.

#### Acceptance Criteria
- [ ] `_env.ts` deleted.
- [ ] Playwright 5/5 GREEN for `example-full-stack-agent.spec.ts`.
- [ ] Manual smoke OK.
- [ ] CHANGELOG entry under Added: "Export `loadEnv` from `theokit/server` for standalone scripts (#TBD)".

#### DoD
- [ ] All tasks completed.
- [ ] All tests passing (existing 1974+ unit + Playwright 5/5 for example).
- [ ] Zero TypeScript errors.

---

## Phase 2: State cleanup (`.theo/` build dir + `.theokit/agents/` runtime)

**Objective:** `theokit build` cleans `.theo/` before each build (Astro pattern). `theokit dev` self-cleans orphan agent registries (Nuxt LRU pattern, cap=100).

### T2.1 — Implement `cleanOutDir` + `gcAgentRegistry` utilities

#### Objective
Two pure functions, fully unit-testable, covering both cleanup patterns from reference doc §3.2 + §3.3.

#### Evidence
Reference doc §3.2 (Astro `emptyDir`), §3.3 (Nuxt `cleanupCaches`), §5 divergent pattern #2. Item #6 dogfood needed manual `rm -rf` mid-session — 52+ orphan agent registries.

#### Files to edit
```
packages/theo/src/cli/lib/cleanup.ts                    — (NEW) cleanOutDir + gcAgentRegistry
packages/theo/src/cli/lib/cleanup-types.ts              — (NEW) options + return types
tests/unit/cleanup.test.ts                              — (NEW) 11 BDD scenarios
```

#### Deep file dependency analysis
- **`packages/theo/src/cli/lib/cleanup.ts`** (NEW): standalone module. Uses `node:fs/promises`, `node:path`. No downstream files in this task.
- **`packages/theo/src/cli/lib/cleanup-types.ts`** (NEW): types only.
- **`tests/unit/cleanup.test.ts`** (NEW): uses `tmp` dir + `mkdirSync` to build fake structures.

#### Deep Dives
- **`cleanOutDir(opts: CleanOutDirOptions): Promise<{ deleted: number; kept: number }>`** — Astro pattern.
  - `opts.dir: string` (absolute).
  - `opts.skip?: string[]` — default `['.git', '.gitkeep', '.gitignore']`. Matched by basename.
  - Algorithm: `fs.readdir(dir)`; for each entry, if `skip.includes(name)` → keep. Else `fs.rm(path, { recursive: true, force: true, maxRetries: 3 })`.
  - Symlink → `fs.lstat`, if symlink + target missing → ignore.
  - Dir doesn't exist → return `{ deleted: 0, kept: 0 }`, no throw.
- **`gcAgentRegistry(opts: GcAgentRegistryOptions): Promise<{ deleted: number; kept: number }>`** — Nuxt LRU pattern.
  - `opts.dir: string` (absolute, typically `<cwd>/.theokit/agents/`).
  - `opts.maxAgents?: number` — default 100.
  - Algorithm: `fs.readdir(dir, { withFileTypes: true })`; filter only directories; `Promise.all(stat(d))` to get mtime; sort ascending by mtime; slice off first `(N - maxAgents)`; `fs.rm(path, { recursive, force })`.
  - If `N <= maxAgents` → return `{ deleted: 0, kept: N }` (skip).
  - Dir doesn't exist → return `{ deleted: 0, kept: 0 }`, no throw.
- **Invariants**:
  - PRE: `dir` is a directory or doesn't exist.
  - POST (cleanOutDir): all entries removed except `skip` set.
  - POST (gcAgentRegistry): `count <= maxAgents`.
  - INVARIANT: Lockless — concurrent calls accepted (last-write wins; cache loss is recoverable per D4).
  - **EC-3 (MUST FIX — CRITICAL): path safety guard**. At top of `cleanOutDir`, resolve both `opts.dir` and `process.cwd()` to absolute paths. Throw if `resolvedDir === resolvedCwd` OR `!resolvedDir.startsWith(resolvedCwd + path.sep)`. Single guard prevents catastrophic data loss from misconfigured `distDir: '/'` or `distDir: '.'`. Three lines of code.
  - **EC-9 (SHOULD TEST): mtime=0 (Docker/FAT)**. `gcAgentRegistry` stable-sorts ties → no crash on uniform mtime.
  - **EC-11 (SHOULD TEST): skip list normalization**. Strip trailing `/` from entries before set check.
  - **EC-12 (SHOULD TEST): EROFS read-only FS**. `fs.rm` rejects with code EROFS — caught, warn logged, continue.

#### Tasks
1. Create types in `cleanup-types.ts`.
2. Create `cleanup.ts` with two exported functions.
3. Create `tests/unit/cleanup.test.ts` with 11 BDD scenarios (RED first).
4. Implement until GREEN.
5. Refactor: extract shared `_rmRecursive(path)` helper.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_cleanOutDir_happy_wipes_all() — Given tmp dir with 5 files, When cleanOutDir({dir}) called, Then dir is empty AND result.deleted === 5
RED:     test_cleanOutDir_preserves_git() — Given tmp dir with .git/, .gitkeep, foo.txt, When cleanOutDir({dir}) called, Then .git/ and .gitkeep remain AND foo.txt gone
RED:     test_cleanOutDir_custom_skip_list() — Given tmp dir with foo.txt, bar.txt, When cleanOutDir({dir, skip:['foo.txt']}) called, Then foo.txt remains AND bar.txt gone
RED:     test_cleanOutDir_missing_dir_no_throw() — Given non-existent path, When cleanOutDir({dir}) called, Then no throw AND result === {deleted:0, kept:0}
RED:     test_cleanOutDir_symlink_to_missing_target() — Given tmp dir with broken symlink, When cleanOutDir called, Then no throw AND symlink removed
RED:     test_cleanOutDir_handles_permission_error() — Given tmp dir with read-only file (chmod 0444), When cleanOutDir called, Then warning logged AND result.kept >= 1
RED:     test_gcAgentRegistry_happy_under_cap() — Given dir with 5 agent dirs and maxAgents=100, When gcAgentRegistry called, Then result === {deleted:0, kept:5}
RED:     test_gcAgentRegistry_LRU_over_cap() — Given dir with 12 agent dirs (varying mtime), maxAgents=10, When gcAgentRegistry called, Then result.deleted === 2 AND the 2 oldest by mtime are removed AND the 10 newest remain
RED:     test_gcAgentRegistry_ignores_files() — Given dir with mix of files + dirs, When gcAgentRegistry called, Then only directories considered for deletion (files ignored)
RED:     test_gcAgentRegistry_missing_dir_no_throw() — Given non-existent path, When called, Then no throw AND result === {deleted:0, kept:0}
RED:     test_gcAgentRegistry_concurrent_calls_safe() — Given dir with 12 dirs, maxAgents=10, When gcAgentRegistry called twice concurrently, Then both complete without crash AND final count <= 10
RED:     test_cleanOutDir_rejects_absolute_outside_cwd_EC3() — Given dir='/etc' (absolute, outside cwd), When cleanOutDir({dir}) called, Then throws Error matching /must be inside cwd/ AND nothing is deleted (verify by spy)
RED:     test_cleanOutDir_rejects_dir_equals_cwd_EC3() — Given dir=process.cwd(), When cleanOutDir called, Then throws Error AND no fs.rm calls
RED:     test_gcAgentRegistry_handles_zero_mtime_EC9() — Given 5 agent dirs with utimesSync(path, 0, 0), When gcAgentRegistry({maxAgents:3}) called, Then deletes 2 dirs without throwing
RED:     test_cleanOutDir_skip_trailing_slash_normalized_EC11() — Given skip=['foo/', '.git'], When cleanOutDir against dir with foo/, .git/, bar/, Then foo/ and .git/ preserved, bar/ removed
RED:     test_cleanOutDir_handles_EROFS_EC12() — Given fs.rm rejects with {code:'EROFS'}, When cleanOutDir called, Then warn logged AND no rethrow
GREEN:   Implement cleanOutDir + gcAgentRegistry per algorithm. EC-3 path safety guard at top of cleanOutDir.
REFACTOR: Extract _rmRecursive helper if duplication arises.
VERIFY:  npx vitest run tests/unit/cleanup.test.ts
```

BDD scenarios:
- Happy path: wipe / LRU.
- Validation error: custom skip list.
- Edge case: missing dir, symlink, files ignored.
- Error scenario: permission, concurrent race.

#### Acceptance Criteria
- [ ] 11 RED → GREEN.
- [ ] `cleanOutDir` + `gcAgentRegistry` exported.
- [ ] Pass: tsc --noEmit, lint, vitest.

#### DoD
- [ ] All tasks completed.
- [ ] All tests passing.

---

### T2.2 — Wire `cleanOutDir` into `theokit build`

#### Objective
`theokit build` cleans `.theo/` at start, preserving `.git*`.

#### Evidence
Astro does this at `core/build/static-build.ts:118`. Today TheoKit overwrites without cleaning → stale manifests possible.

#### Files to edit
```
packages/theo/src/cli/commands/build.ts                — (EDIT) call cleanOutDir before invokeVite
tests/unit/build-cleans-dist.test.ts                    — (NEW) 4 BDD scenarios
```

#### Deep file dependency analysis
- **`cli/commands/build.ts`**: today's flow is `loadConfig() → invokeVite() → writeManifest()`. Insert `cleanOutDir({dir: distDir})` between `loadConfig()` and `invokeVite()`. `distDir` comes from config (default `.theo`).

#### Deep Dives
- **Why before invokeVite, not after?** Astro rationale (reference §3.2): incremental rebuild needs previous output around until new build SUCCEEDS. If build fails mid-way, partial old output is preserved. Wiping at start makes the build hermetic — every run starts from empty state.
- **EC-4 (MUST FIX): `distDir` Zod refine**. Edit `packages/theo/src/config/schema.ts`: `distDir: z.string().default('.theo').refine(d => !path.isAbsolute(d) && !d.startsWith('..'), { message: 'distDir must be a relative path inside the project root (e.g., ".theo")' })`. Defense-in-depth — EC-3's runtime guard in `cleanOutDir` will still throw, but Zod validation gives a clearer error AT CONFIG LOAD TIME instead of at build start.

#### Tasks
1. Edit `cli/commands/build.ts`: import `cleanOutDir`, call after `loadConfig()`.
2. Create `tests/unit/build-cleans-dist.test.ts`.
3. Run RED → GREEN.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_build_wipes_dist_before_run() — Given fixture with .theo/stale.txt pre-existing, When `theokit build` runs, Then .theo/stale.txt is gone AND .theo/manifest.json (new) exists
RED:     test_build_preserves_git_in_dist() — Given fixture with .theo/.gitkeep pre-existing, When build runs, Then .gitkeep survives
RED:     test_build_missing_dist_creates_then_populates() — Given no .theo/ dir, When build runs, Then .theo/ is created AND populated
RED:     test_build_failure_leaves_clean_state() — Given a deliberately broken fixture (invalid theo.config.ts), When build fails, Then .theo/ is still wiped (no partial old artifacts)
RED:     test_schema_rejects_absolute_distDir_EC4() — Given theo.config.ts with `distDir: '/etc'`, When loadConfig runs, Then Zod rejects with message matching /must be a relative path/
RED:     test_schema_rejects_parent_distDir_EC4() — Given theo.config.ts with `distDir: '../outside'`, When loadConfig runs, Then Zod rejects with same message
GREEN:   Call cleanOutDir({dir: distDir}) before invokeVite in build.ts. EC-4: add Zod refine to distDir field in schema.ts.
REFACTOR: None expected.
VERIFY:  npx vitest run tests/unit/build-cleans-dist.test.ts
```

BDD scenarios per template.

#### Acceptance Criteria
- [ ] 4 RED → GREEN.
- [ ] No regression in `tests/integration/build-pipeline.test.ts` if present.
- [ ] Pass: tsc, lint, vitest.

#### DoD
- [ ] All tasks completed.
- [ ] All tests passing.

---

### T2.3 — Wire `gcAgentRegistry` into `theokit dev` startup

#### Objective
`theokit dev` boot logs `[theokit] Cleaned N stale agent registries (kept M)` when N > 0. Default cap 100.

#### Evidence
Item #6 dogfood: 52+ orphan agent dirs accumulated. Reference doc §3.3 Nuxt LRU pattern (`core/cache.ts:96-113`).

#### Files to edit
```
packages/theo/src/cli/commands/dev.ts                   — (EDIT) call gcAgentRegistry on startup
packages/theo/src/config/schema.ts                       — (EDIT) add `agents?: { maxRegistries?: number }` to config schema (Zod)
tests/unit/dev-agent-gc.test.ts                          — (NEW) 4 BDD scenarios
```

#### Deep file dependency analysis
- **`cli/commands/dev.ts`**: after `loadConfig()`, call `gcAgentRegistry({dir: resolve(cwd, '.theokit/agents'), maxAgents: config.agents?.maxRegistries ?? 100})`. Log result if `deleted > 0`.
- **`config/schema.ts`**: add `agents` block to Zod schema. Optional; default 100.

#### Deep Dives
- **Config knob**: `theo.config.ts > agents.maxRegistries: number` (default 100). Why expose? Some apps may have higher legitimate agent count (multi-tenant SaaS). Allow override.
- **Run timing**: BEFORE Vite spins up — startup-only, never per-request. Cheap (≤50ms for 1000 agents per reference §7).
- **Silent on `deleted === 0`** — no log noise on fresh installs.

#### Tasks
1. Edit `config/schema.ts` Zod block: add `agents: z.object({ maxRegistries: z.number().int().positive().default(100) }).optional()`.
2. Edit `cli/commands/dev.ts`: import + call `gcAgentRegistry` after `loadConfig()`.
3. Create `tests/unit/dev-agent-gc.test.ts`.
4. Run RED → GREEN.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_dev_gc_runs_at_startup() — Given .theokit/agents/ with 120 dirs (varying mtime) and config default, When dev boots, Then 20 oldest dirs removed AND startup log includes "Cleaned 20"
RED:     test_dev_gc_respects_config_cap() — Given 50 agent dirs and config `agents.maxRegistries=20`, When dev boots, Then 30 removed
RED:     test_dev_gc_silent_when_under_cap() — Given 10 agent dirs (cap=100), When dev boots, Then no "Cleaned" log line emitted
RED:     test_dev_gc_handles_missing_dir() — Given no .theokit/agents/, When dev boots, Then no throw AND no log
GREEN:   Wire gcAgentRegistry + log + schema field.
REFACTOR: None expected.
VERIFY:  npx vitest run tests/unit/dev-agent-gc.test.ts
```

BDD scenarios per template.

#### Acceptance Criteria
- [ ] 4 RED → GREEN.
- [ ] Schema `agents.maxRegistries` accepted by Zod with default 100.
- [ ] Pass: tsc, lint, vitest.

#### DoD
- [ ] All tasks completed.
- [ ] All existing config-schema tests still green.

---

## Phase 3: TheoUI auto-config (Tailwind/PostCSS via plugin-side wiring)

**Objective:** `pnpm add @usetheo/ui` + `pnpm dev` → TheoUI components render styled without consumer-side `tailwind.config.ts` or `postcss.config.js`.

> **BLOCKED on Phase 0 spike + cross-repo `@usetheo/ui` release** with `./vite-plugin` and `./preset` subpath exports.

### T3.1 — Implement `detectPackage(name, cwd)` generalized detector

#### Objective
Generalize the `theoui-detect.ts` pattern into a reusable `detectPackage(name, cwd)` that returns `{ installed, version?, resolvedPath? }`. Used by T3.2 to detect `@tailwindcss/vite` + `@usetheo/ui`.

#### Evidence
`packages/theo/src/vite-plugin/theoui-detect.ts:104-133` is specific to `@usetheo/ui`. Phase 3 needs the same probe for `@tailwindcss/vite` (peer dep of `@usetheo/ui`). Refactor first, wire second.

#### Files to edit
```
packages/theo/src/vite-plugin/auto-detect.ts            — (NEW) detectPackage generalized
packages/theo/src/vite-plugin/auto-detect-types.ts      — (NEW) DetectResult type
packages/theo/src/vite-plugin/theoui-detect.ts          — (EDIT) call detectPackage internally; preserve existing API
tests/unit/auto-detect.test.ts                          — (NEW) 6 BDD scenarios
```

#### Deep file dependency analysis
- **`auto-detect.ts`** (NEW): exports `detectPackage(name: string, cwd: string): DetectResult`. Uses `createRequire(import.meta.url)` + `require.resolve` with `paths: [cwd]`. Reads resolved `package.json` for version.
- **`theoui-detect.ts`** (EDIT): keeps public `detectTheoUi` API. Internally calls `detectPackage('@usetheo/ui', projectRoot)`. Net change: ~30 LOC removed, ~3 LOC added.
- **All downstream of `detectTheoUi`**: unchanged contract.

#### Deep Dives
- **API**:
  ```ts
  export interface DetectResult {
    installed: boolean
    version?: string
    resolvedPath?: string  // absolute path to resolved package.json or main entry
  }
  export function detectPackage(name: string, cwd: string): DetectResult
  ```
- **Algorithm**:
  1. Try `<cwd>/package.json` declaration check (same `isDeclaredInPackageJson` pattern from `theoui-detect.ts:83-102`).
  2. If declared, probe `require.resolve('<name>/package.json', { paths: [cwd] })` — if succeeds, read JSON, extract `version`.
  3. If not declared, return `{ installed: false }`.
- **Edge case**: package exports doesn't list `./package.json`. Fallback: probe a known subpath (`./styles.css` for ui, `./index.mjs` for tailwind/vite) and extract version from a different source. For T3.1 simplicity: try `./package.json` first, fall back to probing common subpaths. If all fail → `{installed: false}` (consumer hits the warning path).

#### Tasks
1. Create `auto-detect-types.ts`.
2. Create `auto-detect.ts` with `detectPackage` impl.
3. Refactor `theoui-detect.ts` to use `detectPackage` internally.
4. Verify ALL existing `tests/unit/theoui-detect.test.ts` still pass (no API change).
5. Create `tests/unit/auto-detect.test.ts`.
6. Run RED → GREEN.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_detectPackage_happy_returns_version() — Given fixture project with @usetheo/ui in deps + resolvable, When detectPackage('@usetheo/ui', cwd) called, Then result.installed === true AND result.version matches /^\d+\.\d+\.\d+/
RED:     test_detectPackage_not_declared() — Given fixture without @usetheo/ui in package.json, When called, Then result.installed === false
RED:     test_detectPackage_declared_but_unresolvable() — Given fixture with @usetheo/ui in deps but node_modules empty, When called, Then result.installed === false
RED:     test_detectPackage_handles_tailwind_vite() — Given fixture with @tailwindcss/vite in deps, When detectPackage('@tailwindcss/vite', cwd) called, Then result.installed === true
RED:     test_detectPackage_pnpm_hoist_resolves() — Given monorepo layout (deps at workspace root, app in apps/x/), When detectPackage from apps/x/, Then result.installed === true (resolves via Node walk-up)
RED:     test_detectPackage_invalid_name_safe() — Given invalid name '@nonexistent/garbage', When called, Then result.installed === false (no throw)
GREEN:   Implement detectPackage. Refactor theoui-detect to use it.
REFACTOR: After refactor, theoui-detect.ts should be ≤50 LOC.
VERIFY:  npx vitest run tests/unit/auto-detect.test.ts tests/unit/theoui-detect.test.ts
```

BDD scenarios per template.

#### Acceptance Criteria
- [ ] 6 new RED → GREEN.
- [ ] Existing `theoui-detect.test.ts` still passes.
- [ ] No `any`, no `@ts-ignore`.
- [ ] Pass: tsc, lint, vitest.

#### DoD
- [ ] All tasks completed.
- [ ] All tests passing.
- [ ] `theoui-detect.ts` line count reduced (refactor wins).

---

### T3.2 — Implement `integrateUseTheoUI(viteConfig)` auto-config

#### Objective
The load-bearing piece. When `@usetheo/ui` is detected, return Vite plugins to chain: `@tailwindcss/vite` + `@usetheo/ui/vite-plugin`. When `@usetheo/ui` is absent, no-op.

#### Evidence
Reference doc §3.2 (Astro `updateConfig({vite: ...})` pattern), §5 divergent #3 (plugin-side auto-config wins over framework-side).

#### Files to edit
```
packages/theo/src/vite-plugin/integrate-ui.ts            — (NEW) integrateUseTheoUI fn
tests/unit/integrate-ui.test.ts                           — (NEW) 7 BDD scenarios
```

#### Deep file dependency analysis
- **`integrate-ui.ts`** (NEW): exports `integrateUseTheoUI(cwd: string, opts?: IntegrateUiOptions): Promise<Plugin[]>`. Uses `detectPackage` (T3.1). Dynamic-imports `@usetheo/ui/vite-plugin` + `@tailwindcss/vite` via `await import(name)` so they're zero-cost when not installed.
- **`tests/unit/integrate-ui.test.ts`** (NEW): uses Vitest's `vi.mock()` to stub dynamic imports.

#### Deep Dives
- **API**:
  ```ts
  export interface IntegrateUiOptions {
    /** Override: `false` disables auto-config even if @usetheo/ui detected */
    enabled?: boolean
    /** Existing tailwind.config detector path (for D3 deferral) */
    consumerTailwindConfig?: string | undefined
    /** Existing postcss.config detector path (for D3 deferral) */
    consumerPostcssConfig?: string | undefined
  }
  export async function integrateUseTheoUI(cwd: string, opts?: IntegrateUiOptions): Promise<Plugin[]>
  ```
- **Algorithm** (D3 + D5):
  1. If `opts?.enabled === false` → return `[]`.
  2. `detectPackage('@usetheo/ui', cwd)` — if not installed, return `[]`.
  3. If `opts?.consumerTailwindConfig || opts?.consumerPostcssConfig` set → log `[theokit] Detected your tailwind.config / postcss.config. Skipping auto-config. Extend with @usetheo/ui/preset to apply UI theme.` and return `[]`. D3 — consumer-in-control wins.
  4. `detectPackage('@tailwindcss/vite', cwd)` — if not installed:
     - Log `[theokit] @usetheo/ui detected but @tailwindcss/vite is not installed. Run \`pnpm add -D @tailwindcss/vite\` to enable styling.`
     - Return `[]`.
  5. Both present → dynamic-import both:
     ```ts
     const { default: tailwindcssPlugin } = await import('@tailwindcss/vite')
     const { default: useTheoUIPlugin } = await import('@usetheo/ui/vite-plugin')
     return [tailwindcssPlugin(), useTheoUIPlugin()]
     ```
- **Invariants**:
  - PRE: `cwd` exists.
  - POST: returns Vite Plugin array OR empty array. Never throws.
  - INVARIANT: dynamic imports happen only when needed (zero cost in absence).
- **EC-5 (MUST FIX): default-export validation**. After `const mod = await import('@usetheo/ui/vite-plugin')`, check `typeof mod.default === 'function'`. If not, log `[theokit] @usetheo/ui/vite-plugin does not expose a default-export function. Expected shape: \`export default function (opts) => Plugin\`. Got: ${typeof mod.default}.` and return `[]`. Same guard for `@tailwindcss/vite`. Three lines per plugin.
- **EC-6 (MUST FIX): return-shape validation**. After calling `useTheoUIPlugin()`, verify result is a Vite Plugin (truthy object with at least a `name: string` field). If not (array, null, non-Plugin), log error and return `[]`. Prevents cryptic crashes inside Vite's `config.plugins[N].apply is not a function`.

#### Tasks
1. Create `integrate-ui.ts` per algorithm.
2. Create `tests/unit/integrate-ui.test.ts` with mocked dynamic imports.
3. Run RED → GREEN.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_integrateUi_happy_returns_two_plugins() — Given cwd with @usetheo/ui + @tailwindcss/vite both installed, When integrateUseTheoUI(cwd) called, Then result.length === 2 AND first is tailwind, second is ui
RED:     test_integrateUi_no_ui_returns_empty() — Given cwd without @usetheo/ui, When called, Then result === []
RED:     test_integrateUi_no_tailwind_warns_returns_empty() — Given @usetheo/ui present but @tailwindcss/vite missing, When called, Then a warn log is emitted AND result === []
RED:     test_integrateUi_disabled_explicit() — Given @usetheo/ui present, When integrateUseTheoUI(cwd, {enabled: false}) called, Then result === []
RED:     test_integrateUi_consumer_tailwind_config_defers() — Given @usetheo/ui present + consumerTailwindConfig === '/path/to/tailwind.config.ts', When called, Then info log emitted AND result === []
RED:     test_integrateUi_consumer_postcss_config_defers() — Given @usetheo/ui present + consumerPostcssConfig set, When called, Then info log emitted AND result === []
RED:     test_integrateUi_dynamic_import_failure() — Given @usetheo/ui declared but @usetheo/ui/vite-plugin subpath unresolvable, When called, Then warn logged AND result === [] (no throw)
RED:     test_integrateUi_ui_plugin_missing_default_export_EC5() — Given @usetheo/ui/vite-plugin exists but has no default export (e.g., named-only), When integrateUseTheoUI called, Then warn logged matching /does not expose a default-export function/ AND result === []
RED:     test_integrateUi_tailwind_missing_default_export_EC5() — Given @tailwindcss/vite exists but mod.default is not a function, When called, Then warn logged AND result === []
RED:     test_integrateUi_ui_plugin_returns_array_EC6() — Given useTheoUIPlugin() returns Plugin[] instead of Plugin, When called, Then error logged matching /unexpected shape/ AND result === []
RED:     test_integrateUi_ui_plugin_returns_null_EC6() — Given useTheoUIPlugin() returns null, When called, Then error logged AND result === []
GREEN:   Implement integrateUseTheoUI per algorithm. EC-5: type-check mod.default before invocation. EC-6: shape-check return value.
REFACTOR: None expected.
VERIFY:  npx vitest run tests/unit/integrate-ui.test.ts
```

BDD scenarios per template.

#### Acceptance Criteria
- [ ] 7 RED → GREEN.
- [ ] Logs are clear + actionable.
- [ ] No `any`.
- [ ] Pass: tsc, lint, vitest.

#### DoD
- [ ] All tasks completed.
- [ ] All tests passing.

---

### T3.3 — Wire `integrateUseTheoUI` into `vite-plugin/index.ts` config hook

#### Objective
TheoKit's Vite plugin auto-chains the UI plugins at the right lifecycle point so consumer's `vite.config.ts` (or implicit Vite config inside `theokit dev`) gets them without consumer action.

#### Evidence
T3.2 ships the utility; this task wires it. Reference §3.2 Astro `updateConfig({vite: { plugins: ... }})` pattern from `integrations/react/src/index.ts:175-187`.

#### Files to edit
```
packages/theo/src/vite-plugin/index.ts                  — (EDIT) call integrateUseTheoUI in config()/configResolved hook, return plugins array
tests/integration/vite-plugin-ui-wiring.test.ts          — (NEW) 4 scenarios with real Vite invocation
```

#### Deep file dependency analysis
- **`vite-plugin/index.ts`**: today's `config()` hook returns Vite config (alias, envPrefix). After: in `configResolved` or via a separate child plugin, call `integrateUseTheoUI(projectRoot, { consumerTailwindConfig: detect(), consumerPostcssConfig: detect() })`. Returned plugins must be chained into Vite's plugin array. Vite allows this via `config()` returning `{ plugins: [...newPlugins] }`.
- **Consumer config detection**: also detect `tailwind.config.{ts,js,mjs,cjs}` and `postcss.config.{ts,js,mjs,cjs}` via `find-up` from cwd (D3 deferral).

#### Deep Dives
- **Vite plugin chaining API**: Vite supports returning `{ plugins: [...] }` from a plugin's `config()` hook. The returned plugins get merged into Vite's plugin chain. This is the cleanest way to inject downstream plugins.
- **Lifecycle**: must happen BEFORE Vite resolves config (so the injected plugins participate). `config()` hook fires before `configResolved`. Use `config()`.
- **find-up for consumer configs**: use the new `find-up` dep (added in T1.1 if not already). Walk up from cwd looking for tailwind/postcss config file names.

#### Tasks
1. Add `find-up: ^7` to `packages/theo/package.json` dependencies if not already added by T1.1.
2. Edit `vite-plugin/index.ts`: add `consumerTailwindConfig`, `consumerPostcssConfig` detection (cheap; just `findUp`).
3. Call `integrateUseTheoUI(projectRoot, { consumerTailwindConfig, consumerPostcssConfig })` inside `config()` hook.
4. Return `{ ...existingConfig, plugins: [...uiPlugins] }`.
5. Create `tests/integration/vite-plugin-ui-wiring.test.ts` using real Vite invocation against fixture.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_vite_plugin_chains_tailwind_when_ui_present() — Given fixture with @usetheo/ui installed, When Vite createServer({ plugins: [theoPlugin()] }), Then resolved plugins include `@tailwindcss/vite` and `@usetheo/ui/vite-plugin` by name
RED:     test_vite_plugin_no_chain_when_ui_absent() — Given fixture without @usetheo/ui, When createServer, Then resolved plugins do NOT include tailwind
RED:     test_vite_plugin_defers_to_consumer_tailwind_config() — Given fixture with @usetheo/ui + a manually-created tailwind.config.ts, When createServer, Then NO auto-chain happens AND a console.info matches /detected your tailwind.config/i
RED:     test_vite_plugin_warns_when_tailwind_missing() — Given fixture with @usetheo/ui but no @tailwindcss/vite, When createServer, Then console.warn matches /@tailwindcss\/vite is not installed/
RED:     test_vite_plugin_idempotent_skip_double_tailwind_EC10() — Given consumer's vite.config.ts already has `tailwindcss()` in plugins (by name), When TheoKit vite-plugin runs, Then TheoKit does NOT re-add tailwind AND info log matches /already in your plugin chain/
GREEN:   Edit vite-plugin/index.ts to call integrateUseTheoUI inside config() and return chained plugins. EC-10: before adding, check `viteConfig.plugins` for existing plugin with name matching `@tailwindcss/vite`; skip if found.
REFACTOR: None expected.
VERIFY:  npx vitest run tests/integration/vite-plugin-ui-wiring.test.ts
```

BDD scenarios per template.

#### Acceptance Criteria
- [ ] 4 RED → GREEN.
- [ ] No regression in `tests/integration/vite-plugin*.test.ts`.
- [ ] Pass: tsc, lint, vitest.

#### DoD
- [ ] All tasks completed.
- [ ] All existing vite-plugin tests still green.

---

### T3.4 — Create fixture `zero-config-tailwind/` proving end-to-end

#### Objective
A reproducible fixture project with `@usetheo/ui` in deps but ZERO consumer-side Tailwind/PostCSS files. Vite build emits CSS with UI component classes.

#### Evidence
Skill rule #12: "Every framework feature MUST have a fixture project in tests/fixtures/". This fixture is the proof.

#### Files to edit
```
tests/fixtures/zero-config-tailwind/package.json         — (NEW) deps: theokit + @usetheo/ui + @tailwindcss/vite
tests/fixtures/zero-config-tailwind/theo.config.ts        — (NEW) minimal
tests/fixtures/zero-config-tailwind/index.html            — (NEW)
tests/fixtures/zero-config-tailwind/app/page.tsx          — (NEW) imports Button from @usetheo/ui
tests/fixtures/zero-config-tailwind/server/routes/health.ts — (NEW) minimal
tests/integration/zero-config-tailwind.test.ts            — (NEW) build the fixture, inspect emitted CSS
```

#### Deep file dependency analysis
- All fixture files (NEW): minimal app importing `Button` from `@usetheo/ui`. NO `tailwind.config.ts`, NO `postcss.config.js`.
- Integration test: runs `vite build` against fixture, reads `.theo/client/assets/index-*.css`, asserts known UI class (e.g., `.bg-primary` or `.theoui-button`) is present.

#### Deep Dives
- **Why integration not unit**: this proves the entire chain — detect → chain plugins → tailwind scans @usetheo/ui content globs → emits CSS. Unit tests alone can't validate the full pipeline.
- **Edge case**: fixture's `@usetheo/ui` resolution may need a manual `workspace:*` to point at the local UI repo (or pnpm overrides). Will be configured per the spike outcome.

#### Tasks
1. Create fixture skeleton.
2. Create integration test.
3. Run RED → GREEN (depends on T3.3 wiring).

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_fixture_builds_without_consumer_config() — Given fixture with NO tailwind.config / postcss.config, When `theokit build` runs, Then build succeeds AND .theo/client/assets/index-*.css exists
RED:     test_fixture_emitted_css_contains_ui_class() — Given fixture build output, When reading the CSS file, Then it contains at least one @usetheo/ui-specific class selector (e.g., one matching /[.]theoui-/ or /[.]bg-primary/)
RED:     test_fixture_html_contains_styled_button() — Given fixture + index.html, When build runs + serves, Then the rendered HTML contains a button with the expected tailwind class string
RED:     test_fixture_with_consumer_tailwind_skips_auto() — Given fixture variant WITH a hand-rolled tailwind.config.ts, When build runs, Then no auto-injection occurs AND build still succeeds (consumer is in control)
GREEN:   Build the fixture + integration test. Resolution comes from T3.3 wiring being correct.
REFACTOR: None expected.
VERIFY:  npx vitest run tests/integration/zero-config-tailwind.test.ts
```

BDD scenarios per template.

#### Acceptance Criteria
- [ ] 4 RED → GREEN.
- [ ] Fixture committed.
- [ ] CHANGELOG entry under Added: "Auto-configure `@tailwindcss/vite` + `@usetheo/ui/vite-plugin` when `@usetheo/ui` is detected".

#### DoD
- [ ] All tasks completed.
- [ ] Fixture buildable + integration test green.

---

### T3.5 — Delete `examples/full-stack-agent/tailwind.config.ts` + `postcss.config.js`; verify

#### Objective
The proof. After Phase 3, the example doesn't need those files. Delete + verify Playwright 5/5 still green.

#### Evidence
The whole point of Phase 3 — eliminate consumer-side Tailwind/PostCSS config files for the canonical example.

#### Files to edit
```
examples/full-stack-agent/tailwind.config.ts             — (DELETE)
examples/full-stack-agent/postcss.config.js              — (DELETE)
tests/unit/example-tailwind-files-deleted.test.ts        — (NEW) static check
```

#### Deep file dependency analysis
- **Two file deletions**. No code edits beyond that.
- **`example-tailwind-files-deleted.test.ts`** (NEW): static check that those two files don't exist (regression prevention).

#### Deep Dives
- **Pre-flight**: T3.4 fixture must be green first. If the framework wiring is incomplete, deleting these files in the example breaks the demo.
- **Verification**: re-run the existing 5 Playwright specs in `tests/e2e/example-full-stack-agent.spec.ts`. All 5 must still be GREEN.

#### Tasks
1. Verify T3.4 GREEN.
2. Delete the two files.
3. Run Playwright suite.
4. Create static-check test.

(Also for T1.4 — EC-7 fix:)
- Edit `examples/full-stack-agent/server/telegram-bot.ts`: explicit cwd: `import { dirname } from 'node:path'; import { fileURLToPath } from 'node:url'; const __dirname = dirname(fileURLToPath(import.meta.url)); loadEnv({ cwd: resolve(__dirname, '..') })`. Prevents the "bot launched from wrong dir reads wrong .env" failure.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_tailwind_config_deleted() — Given example dir, When the test inspects FS, Then tailwind.config.ts does NOT exist
RED:     test_postcss_config_deleted() — Given example dir, When the test inspects FS, Then postcss.config.js does NOT exist
RED:     test_example_chat_renders_styled() — Given dev server boot + Playwright, When user opens / and types a message, Then ChatComposer renders with expected background color computed via DOM `getComputedStyle` (must be non-default)
RED:     test_example_button_has_ui_classes() — Given Playwright at /, When inspecting any rendered button, Then className contains an @usetheo/ui-emitted class
GREEN:   Delete the two files. T3.3 wiring carries the load.
REFACTOR: None expected.
VERIFY:  npx vitest run tests/unit/example-tailwind-files-deleted.test.ts && pnpm test:e2e -- example-full-stack-agent
```

BDD scenarios per template.

#### Acceptance Criteria
- [ ] Both files deleted.
- [ ] Playwright 5/5 GREEN.
- [ ] Manual smoke: chat renders styled.

#### DoD
- [ ] All tasks completed.
- [ ] All tests passing.

---

## Phase 4: Hardening + Docs

**Objective:** Document the new zero-config flow, add `theokit check` hints, ensure changelog tells the story.

### T4.1 — Add `theokit check` hints for upgrade readiness

#### Objective
`theokit check` (the existing `upgrade-readiness.ts` CLI command) scans for: (a) consumer-side `tailwind.config.ts` + `@usetheo/ui` in deps → suggest migration to preset; (b) hand-rolled `.env` loader → suggest deletion.

#### Evidence
`packages/theo/src/cli/commands/upgrade-readiness.ts` already exists per code inventory. Phase 4 extends it to flag the new zero-config opportunities.

#### Files to edit
```
packages/theo/src/cli/commands/upgrade-readiness.ts      — (EDIT) add 2 new checks
tests/unit/upgrade-readiness-zero-config.test.ts          — (NEW) 4 BDD scenarios
```

#### Deep file dependency analysis
- **`upgrade-readiness.ts`**: today reports CSRF + CSP migration hints. Add: detect `tailwind.config.*` co-existing with `@usetheo/ui` declared → suggest extending via preset. Detect hand-rolled `_env.ts` or `import 'dotenv/config'` in `server/**` → suggest deletion.

#### Deep Dives
- **Hint shape**: existing API of upgrade-readiness emits structured hints. Add 2 entries to the registry.
- **False-positive guard**: don't over-suggest. Only fire when @usetheo/ui IS declared AND consumer's tailwind config doesn't import the preset (substring search for `@usetheo/ui/preset`).

#### Tasks
1. Edit `upgrade-readiness.ts` to add the 2 checks.
2. Create test.
3. Run RED → GREEN.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_upgrade_hint_for_consumer_tailwind() — Given consumer with @usetheo/ui + tailwind.config.ts NOT importing preset, When `theokit check --upgrade-readiness` runs, Then output mentions "@usetheo/ui/preset"
RED:     test_upgrade_no_hint_when_preset_already_used() — Given tailwind.config.ts containing `import preset from '@usetheo/ui/preset'`, When check runs, Then no hint emitted
RED:     test_upgrade_hint_for_handrolled_dotenv() — Given server/ containing a file with `dotenv` or manual `.env` read, When check runs, Then hint mentions "loadEnv from theokit/server"
RED:     test_upgrade_no_hint_without_ui() — Given consumer without @usetheo/ui, When check runs, Then tailwind hint does not fire
GREEN:   Add 2 checks to upgrade-readiness.
REFACTOR: None expected.
VERIFY:  npx vitest run tests/unit/upgrade-readiness-zero-config.test.ts
```

BDD scenarios per template.

#### Acceptance Criteria
- [ ] 4 RED → GREEN.
- [ ] Pass: tsc, lint, vitest.

#### DoD
- [ ] All tasks completed.
- [ ] All tests passing.

---

### T4.2 — Documentation: "Zero-config" concept doc + CHANGELOG

#### Objective
Tell the story. New section in docs explaining the zero-config flow + CHANGELOG entries.

#### Evidence
Skill rule: docs-community lead — every framework feature gets a docs entry.

#### Files to edit
```
docs/concepts/zero-config.md                              — (NEW) explainer doc
CHANGELOG.md                                              — (EDIT) [Unreleased] entries
README.md                                                  — (EDIT) HERO copy "wired" claim is now actually true; add 1 line to "What You Get"
```

#### Deep file dependency analysis
- **`docs/concepts/zero-config.md`** (NEW): explains the 5 polish bug fixes. What it covers; what it leaves to the consumer.
- **`CHANGELOG.md`**: add 4 entries under `[Unreleased] > Added`:
  - `Auto-load .env files into process.env via loadEnv() (theokit/server) — works in CLI commands and standalone scripts (#TBD)`
  - `Auto-configure @tailwindcss/vite + @usetheo/ui/vite-plugin when @usetheo/ui is declared in package.json (#TBD)`
  - `Auto-cleanup .theo/ build directory at theokit build start (#TBD)`
  - `LRU cleanup of .theokit/agents/ at theokit dev startup (default cap: 100; configurable via agents.maxRegistries) (#TBD)`
- **`README.md`**: 1-line addition to "What You Get" section: "Zero-config Tailwind — add @usetheo/ui to your deps, ship styled."

#### Deep Dives
- **Voice**: per CLAUDE.md voice & tone — HERO/BODY = aspirational, DEEP DIVE = technical. README addition is BODY (outcome-first). docs/concepts/zero-config.md is DEEP DIVE (full technical detail).

#### Tasks
1. Write `docs/concepts/zero-config.md` (~150 lines).
2. Add CHANGELOG entries.
3. Edit README "What You Get" section.

#### TDD + BDD (⛔ OBRIGATÓRIO — BLOQUEANTE)

```
RED:     test_docs_zero_config_exists() — Given the docs tree, When tests/unit/docs-zero-config-exists.test.ts inspects, Then docs/concepts/zero-config.md exists AND contains sections "Env auto-load", "Tailwind auto-config", "State cleanup"
RED:     test_changelog_has_4_new_entries() — Given CHANGELOG.md, When parsing [Unreleased], Then it contains 4 specific feature lines (loadEnv, tailwind auto, build cleanup, agent GC)
RED:     test_readme_mentions_zero_config() — Given README.md, When parsed, Then "What You Get" section mentions "zero-config" or "auto" + "@usetheo/ui"
RED:     test_docs_no_banned_terms_in_hero() — Given README HERO + docs/concepts/zero-config.md top, When parsed, Then banned terms (per CLAUDE.md: blazing fast, robust, etc.) are NOT present
GREEN:   Write docs + changelog + readme edit.
REFACTOR: None expected.
VERIFY:  npx vitest run tests/unit/docs-zero-config-exists.test.ts
```

BDD scenarios per template.

#### Acceptance Criteria
- [ ] 4 RED → GREEN.
- [ ] `docs/concepts/zero-config.md` ≥ 100 LOC technical content.
- [ ] CHANGELOG has 4 new entries with `(#TBD)` placeholder for issue numbers.
- [ ] README addition passes voice/tone lint.

#### DoD
- [ ] All tasks completed.
- [ ] All tests passing.

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | Polish bug #1: TheoUI styling broken out of the box | T3.1, T3.2, T3.3, T3.4, T3.5 | Auto-detect `@usetheo/ui`, auto-chain `@tailwindcss/vite` + `@usetheo/ui/vite-plugin` into Vite plugin array via TheoKit vite-plugin's `config()` hook. Fixture proves zero-config. |
| 2 | Polish bug #2: `.env` not auto-loaded for server code | T1.1, T1.2, T1.3, T1.4 | New `loadEnv` utility (Next.js-style algorithm). Wired into CLI commands and `loadConfig`. Re-exported from `theokit/server` for standalone scripts. Example shim deleted. |
| 3 | Polish bug #3: Agent registry cruft accumulates | T2.1, T2.3 | Nuxt-LRU `gcAgentRegistry`. Runs at `theokit dev` startup. Default cap 100, configurable via `agents.maxRegistries`. |
| 4 | Polish bug #4: OpenRouter slug rot | (not framework — docs-only) | Out of scope for framework changes. T4.2 docs the recommended fix path: pin in env, not in code. |
| 5 | Polish bug #5: `@usetheo/ui` not auto-configured as Vite plugin | T0.1, T3.1, T3.2, T3.3 | Cross-repo spike resolves API shape. TheoKit auto-chains. Plugin-side ownership (D5). |
| 6 | `.theo/` cleanup at build | T2.1, T2.2 | Astro-pattern `cleanOutDir`. Skip `.git*`. |
| 7 | Documentation of new zero-config flow | T4.2 | `docs/concepts/zero-config.md` + CHANGELOG + README edit. |
| 8 | Upgrade-readiness hints for migration | T4.1 | 2 new hints in `theokit check`. |
| 9 | `tests/fixtures/zero-config-env/` (env auto-load proof) | T1.2 | Reusable fixture. |
| 10 | `tests/fixtures/zero-config-tailwind/` (UI auto-config proof) | T3.4 | Integration test boots fixture, validates CSS output. |

**Coverage: 10/10 gaps covered (100%)**

(Polish bug #4 falls under "documented out-of-scope" per coverage matrix — addressed via T4.2 docs, not via code change.)

## Edge Case Coverage (from `docs/reviews/edge-case-plan/framework-zero-config-polish-edge-cases-2026-05-22.md`)

| EC | Severity | Task | Mitigation in plan |
|---|---|---|---|
| EC-1 | MUST FIX | T1.1 | File-size cap 1MB + `test_loadEnv_skips_huge_file_EC1` |
| EC-2 | MUST FIX | T1.1 | `_resetEnvCache` test-side-door + `test_loadEnv_resetCache_isolates_tests_EC2` |
| EC-3 | MUST FIX (CRITICAL) | T2.1 | Path safety guard in `cleanOutDir` + 2 RED tests |
| EC-4 | MUST FIX | T2.2 | Zod refine on `distDir` + 2 RED tests |
| EC-5 | MUST FIX | T3.2 | Default-export type check + 2 RED tests |
| EC-6 | MUST FIX | T3.2 | Return-shape validation + 2 RED tests |
| EC-7 | MUST FIX | T1.4 | Telegram bot explicit `cwd` in `loadEnv` call + RED test |
| EC-8 | SHOULD TEST | T1.1 | `test_loadEnv_circular_expand_no_loop_EC8` |
| EC-9 | SHOULD TEST | T2.1 | `test_gcAgentRegistry_handles_zero_mtime_EC9` |
| EC-10 | SHOULD TEST | T3.3 | `test_vite_plugin_idempotent_skip_double_tailwind_EC10` |
| EC-11 | SHOULD TEST | T2.1 | `test_cleanOutDir_skip_trailing_slash_normalized_EC11` |
| EC-12 | SHOULD TEST | T2.1 | `test_cleanOutDir_handles_EROFS_EC12` |
| EC-13 | SHOULD TEST | T1.1 | `test_loadEnv_symlink_logged_EC13` |
| EC-14 | SHOULD TEST | T1.1 | covered by EC-2 fix + isolation test |
| EC-15 | DOCUMENT | T1.3 | CHANGELOG + docs/concepts/zero-config.md — reload-on-watch deferred |
| EC-16 | DOCUMENT | T0.1 | Spike acceptance criterion — branch point documented |

**Edge case coverage: 16/16 (100%) — all MUST FIX baked into RED tests + Deep Dives.**

## Global Definition of Done

- [ ] All phases (0, 1, 2, 3, 4) completed.
- [ ] All tests passing — unit (≥ 1974 baseline + ≥ 35 new = 2009+), integration (existing + 2 new), Playwright 5/5 for example-full-stack-agent, type tests via `expectTypeOf`.
- [ ] Zero TypeScript errors: `pnpm typecheck` clean.
- [ ] Zero lint warnings: `pnpm lint` clean.
- [ ] Backward compatibility preserved: every test that existed before the plan still passes.
- [ ] Code-audit checks passing across modified packages.
- [ ] **Plan-specific criteria:**
  - [ ] `examples/full-stack-agent/tailwind.config.ts` DELETED.
  - [ ] `examples/full-stack-agent/postcss.config.js` DELETED.
  - [ ] `examples/full-stack-agent/server/_env.ts` DELETED.
  - [ ] `examples/full-stack-agent/server/routes/chat.ts` does NOT contain `import '../_env'`.
  - [ ] `examples/full-stack-agent/server/telegram-bot.ts` uses `import { loadEnv } from 'theokit/server'`.
  - [ ] `theokit/server` exports `loadEnv`.
  - [ ] `theokit.config.ts.agents.maxRegistries` accepted by Zod schema.
  - [ ] `tests/fixtures/zero-config-tailwind/` builds + emits expected CSS.
  - [ ] `tests/fixtures/zero-config-env/` boots and serves env values.
- [ ] **Dogfood QA PASS** — `/dogfood full` health score >= 80, zero CRITICAL issues caused by this plan.
- [ ] **Fixture proof** — both new fixtures committed and verified in CI.

## Final Phase: Dogfood QA (MANDATORY)

> This phase runs AFTER all implementation phases (0, 1, 2, 3, 4) are complete. The plan is NOT done until dogfood passes.

**Objective:** Validate that the implemented changes work as a real user would experience them, not just as unit tests assert.

### Execution

Run `/dogfood full`. Always full. No shortcuts.

### Acceptance Criteria

- [ ] Health score >= 80/100 (raising baseline from item #6's 85 — we should NOT regress; new features should ADD coverage).
- [ ] Zero CRITICAL issues introduced by this plan's changes.
- [ ] Zero HIGH issues in commands/features modified by this plan (`theokit dev`, `theokit build`, `theokit start`, `theokit check`, vite-plugin config hook, theokit/server `loadEnv` export).
- [ ] Phase 22 (cross-validation features) regressions: 0.
- [ ] `npm create theokit my-app && cd my-app && pnpm add @usetheo/ui && pnpm dev` boots + renders styled UI without any consumer-side Tailwind/PostCSS file. Verified manually + as Playwright spec.
- [ ] Any pre-existing issues documented (not caused by this plan).

### If Dogfood Fails

1. Identify which issues are caused by this plan's changes vs pre-existing.
2. Fix all plan-caused CRITICAL and HIGH issues before declaring the plan complete.
3. Re-run `/dogfood full` to confirm fixes.
4. Pre-existing issues are logged but do NOT block plan completion.
