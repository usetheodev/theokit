# Reference: Enforcement Cutover (warn → strict / report-only → enforce)

**Date:** 2026-05-19
**Depth:** exhaustive (default)
**Frameworks analyzed:**
- Vite — `referencias/vite/` (canonical `future` flag pattern + `'warn'` mode)
- Rails — `referencias/rails/` (ActiveSupport::Deprecation — gold standard, 6 modes + horizon + disallowed)
- Next.js — `referencias/next.js/` (codemod tooling + escape hatches + canary tag + MCP-driven upgrade)
- Astro — `referencias/astro/` (experimental→stable for CSP, NOT warn→strict — comparison point)
- TanStack Router/Start — `referencias/tanstack-router/` (migration-from-X guides as docs format)
- Fastify, Hono, Nitro, Remix, SvelteKit, tRPC — mentioned but minor signal for this topic

**TheoKit package affected:** `packages/theo/src/config/schema.ts`, `packages/theo/src/server/csrf.ts`, `packages/theo/src/server/security-headers.ts`, `packages/theo/src/client/theo-fetch.ts`, `packages/theo/src/cli/` (new `check --upgrade-readiness` command), `tests/unit/`, CHANGELOG, migration guide artifact.

**Related references:** [`server-components-rsc.md`](./server-components-rsc.md) (same doc format; that one resolves an "open question" — this one is a playbook).

---

## 1. Problem statement

- **What:** TheoKit 0.2.0 ships CSRF in `'warn'` mode and CSP in `'report-only'` mode (EC-1, EC-2 from the nextjs-maturity plan). The 0.3.0 cutover flips both defaults to `'strict'` / `'enforce'`. This is the most dangerous release on the roadmap because it (a) fails silently — no compile error, no test fail, only runtime breakage in production, (b) hits auth/login flows, (c) breaks every app with inline scripts (gtag, intercom, sentry, Plausible), and (d) breaks our own default scaffold's chat demo as-is (`useAgentStream` doesn't yet attach `X-Theo-Action: 1`). We need a documented playbook that turns the cutover from "flip a flag" into a multi-stage release process with explicit gates.
- **Current state:** `config.security.csrf` defaults to `'warn'`. `config.security.headers.cspMode` defaults to `'report-only'`. The roadmap section in `CLAUDE.md` already lists 6 pre-requisites for the cutover but has no implementation reference — this doc supplies that reference, grounded in how mature frameworks ship the same kind of change.
- **Why now:** The 0.3.0 cutover section in `CLAUDE.md` was recently expanded (commit `37974c6`) with explicit risk tiers and 6 pre-reqs. Before any of those tasks start, we need the framework-level patterns lifted from prior art so we don't reinvent (or worse, miss) the standard moves: future-flag schema, codemod tooling, escape hatches, beta channel, structured warn payload, audit CLI command.

---

## 2. Inventário completo de arquivos (mandatório)

### Vite — inventário (`referencias/vite/`)

Total raw matches across the keyword set (`deprecat | future | warn-mode | breaking | migration | codemod`): **67 files**. Filtered to source + docs touching the future-flag mechanism:

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `packages/vite/src/node/deprecations.ts` | core | 105 | ✅ | §3.1, §4.1, §6, §11 (Vite Core) |
| `packages/vite/src/node/config.ts` (FutureOptions, future-warn schema) | core | — | seletivo (lines 420-547) | §3.1, §5.1, §11 |
| `packages/vite/src/node/build.ts` (consumer of `warnFutureDeprecation`) | support | — | seletivo (grep + 20-line context) | §3.1, §11 |
| `packages/vite/src/node/server/index.ts` (consumer) | support | — | seletivo | §3.1, §11 |
| `packages/vite/src/node/server/hmr.ts` (consumer) | support | — | seletivo | §3.1, §11 |
| `packages/vite/src/node/server/pluginContainer.ts` (consumer) | support | — | seletivo | §3.1, §11 |
| `packages/vite/CHANGELOG.md` | doc | — | seletivo (BREAKING entries grep) | §4, §8, §11 |
| (outros ≈60 — testes + docs gerais + mensagens em outros módulos) | | | | §2 discarded |

### Rails — inventário (`referencias/rails/`)

Total raw matches: **451 files**. Rails is the canonical deprecation framework — virtually every file in `activesupport/lib/active_support/deprecation/` is on-topic.

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `activesupport/lib/active_support/deprecation.rb` | core | 81 | ✅ | §3.2, §5, §11 (Rails Core) |
| `activesupport/lib/active_support/deprecation/behaviors.rb` | core | 148 | ✅ | §3.2, §4.2, §5, §7.1 |
| `activesupport/lib/active_support/deprecation/reporting.rb` | core | 162 | ✅ | §3.2, §4.2, §7.2 |
| `activesupport/lib/active_support/deprecation/disallowed.rb` | core | 54 | seletivo | §3.2, §4.2, §5.3 (the "disallowed_warnings" pattern) |
| `activesupport/lib/active_support/deprecation/method_wrappers.rb` | support | 68 | seletivo | §3.2 |
| `activesupport/lib/active_support/deprecation/constant_accessor.rb` | support | 74 | seletivo | §3.2 |
| `activesupport/lib/active_support/deprecation/deprecators.rb` | support | 104 | seletivo | §3.2, §5 |
| `activesupport/lib/active_support/deprecation/proxy_wrappers.rb` | support | 189 | seletivo | §3.2 |
| `activesupport/lib/active_support/core_ext/module/deprecation.rb` | support | — | seletivo | §3.2 |
| `actioncable/app/javascript/action_cable/index_with_name_deprecation.js` | support | — | descartado parcial | §2 discarded (specific feature deprecation, not the framework) |
| `activerecord/lib/active_record/associations/deprecation.rb` | support | — | descartado parcial | §2 discarded (vertical-specific) |
| (outros ≈440 — `*deprecate` markers em todo o codebase + tests + guides) | | | | §2 discarded |

### Next.js — inventário (`referencias/next.js/`)

Total raw matches: **403 files**. Filtered to the codemod machinery + upgrade docs:

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `packages/next-codemod/bin/upgrade.ts` | core | — | seletivo (lines 1-120) | §3.3, §4.3, §5.4, §11 |
| `packages/next-codemod/bin/next-codemod.ts` | core | — | seletivo | §3.3, §11 |
| `packages/next-codemod/bin/transform.ts` | core | — | seletivo | §3.3, §11 |
| `packages/next-codemod/bin/agents-md.ts` | core | — | seletivo | §3.3, §4.4 (MCP-driven upgrade) |
| `packages/next-codemod/lib/run-jscodeshift.ts` | support | — | seletivo | §3.3 |
| `packages/next-codemod/lib/handle-package.ts` | support | — | seletivo (package manager detection) | §3.3 |
| `packages/next-codemod/transforms/*.ts` (≈25 transform files) | support | — | seletivo (sample 3: `next-async-request-api.ts`, `built-in-next-font.ts`, `metadata-to-viewport-export.ts`) | §3.3 (transform pattern) |
| `docs/01-app/02-guides/upgrading/version-15.mdx` | doc | — | ✅ (lines 1-100) | §3.3, §4.5, §8 (UnsafeUnwrappedCookies escape hatch) |
| `docs/01-app/02-guides/upgrading/version-16.mdx` | doc | — | seletivo | §3.3, §4.5, §4.6 (MCP-driven upgrades), §5.5 |
| `docs/01-app/02-guides/upgrading/codemods.mdx` | doc | — | seletivo | §3.3 |
| `docs/01-app/02-guides/upgrading/index.mdx` | doc | — | seletivo | §3.3 |
| `docs/01-app/02-guides/upgrading/version-14.mdx` | doc | — | descartado | §2 discarded (older; same patterns documented in 15/16) |
| (outros ≈380 — RFCs em PRs, evals tooling, examples) | | | | §2 discarded |

### Astro — inventário (`referencias/astro/`)

Total: **106 files** matching, but Astro's pattern is **experimental→stable**, NOT warn→strict. Included as comparison point, not template.

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `packages/astro/src/core/csp/config.ts` | core | 90+ | ✅ (lines 1-90) | §3.4 (experimental→stable), §5.6 |
| `packages/astro/src/core/csp/runtime.ts` | core | 60 | ✅ | §3.4 |
| `packages/astro/src/core/csp/common.ts` | support | — | seletivo | §3.4 |
| `packages/astro/src/runtime/server/render/csp.ts` | support | — | seletivo | §3.4 |
| `packages/astro/CHANGELOG.md` (CSP entries) | doc | — | seletivo (grep "csp\|content-security") | §3.4, §8 |
| `.changeset/improve-csp-validation-messages.md` | doc | 6 | ✅ | §3.4 |
| (outros ≈100 — fixtures, tests, docs gerais) | | | | §2 discarded |

### TanStack Router — inventário (`referencias/tanstack-router/`)

Total: **143 files**. Focus: migration-FROM documents (how docs are written when you're moving users between major versions).

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `docs/start/framework/react/migrate-from-next-js.md` | doc | — | seletivo (lines 1-50) | §3.5, §4.7, §7.3 |
| `docs/router/how-to/migrate-from-react-router.md` | doc | — | seletivo | §4.7 |
| `docs/router/installation/migrate-from-react-router.md` | doc | — | seletivo | §4.7 |
| `docs/router/installation/migrate-from-react-location.md` | doc | — | seletivo | §4.7 |
| (outros ≈140 — RSC-related from prior `to-reference RSC`, CHANGELOG entries) | | | | §2 discarded (already covered in `server-components-rsc.md` ou off-topic) |

### Other frameworks — minor signal

- **Fastify** (23 matches), **Hono** (21), **Nitro** (25): few CHANGELOG / config-deprecation mentions but no canonical deprecation machinery. Their semver discipline is strict (Fastify) but the artifact is the release notes, not source code.
- **Remix** (113): mostly RSC track on a different branch (see RSC doc). Migration patterns are similar to Next.js.
- **SvelteKit** (44): pre-1.0 had many breaking changes; their pattern is mostly CHANGELOG + release blog post.
- **tRPC** (73): canonical for "migration codemods for type API changes" but the kind of cutover is different (type-level breaks, not runtime defaults).

All five frameworks above are **noted but not deep-read** — the signal is sub-threshold for the playbook we're writing.

### Arquivos avaliados e descartados (com motivo)

| File pattern | Count | Why discarded |
|---|---|---|
| `referencias/next.js/test/**`, `__tests__/**` | ≈150 | Test files. The patterns asserted live in `*.ts` source already listed. |
| `referencias/rails/**/*_test.rb`, `**/test/**` | ≈200 | Test files. |
| `referencias/next.js/examples/**` | ≈40 | User-app demos. |
| `referencias/astro/test/**` | ≈80 | Test fixtures. |
| `referencias/astro/.changeset/*.md` (except CSP-validation) | ≈100 | Generic per-PR changelog entries, not framework patterns. |
| `referencias/vite/packages/vite/CHANGELOG.md` (specific BREAKING entries) | many | Read selectively via grep for the pattern shape; individual entries are too granular. |
| `referencias/tanstack-router/e2e/**` | ≈80 | E2E sample apps. |
| `referencias/next.js/crates/next-custom-transforms/src/transforms/lint_codemod_comments.rs` | 1 | Rust source for SWC transform — same pattern as TS codemods, less readable. |
| `referencias/next.js/evals/evals/agent-*-app-router-migration-*/EVAL.ts` | 2 | Agent eval harness for the AI-driven migration. Adjacent feature. |
| Documentation generated artifacts (`docs/*.html`, etc.) | — | Build outputs, not source. |
| **Fastify / Hono / Nitro / Remix / SvelteKit / tRPC core files** | ≈155 | Not deep-read; signal sub-threshold (see "minor signal" above). Would graduate to deep-read if a specific question required them. |

---

## 3. Prior art — deep dive por framework

### 3.1 Vite — `FutureOptions` + `'warn'` mode (the closest match to TheoKit's cutover shape)

Vite has the **closest architectural analog** to what TheoKit needs. They ship a config field `future` that the user opts into per-flag, and each flag accepts the value `'warn'` to emit deprecation warnings without changing behavior yet.

#### API pública

```ts
// referencias/vite/packages/vite/src/node/config.ts:535-547
export interface FutureOptions {
  removePluginHookHandleHotUpdate?: 'warn'
  removePluginHookSsrArgument?: 'warn'
  removeServerModuleGraph?: 'warn'
  removeServerReloadModule?: 'warn'
  removeServerPluginContainer?: 'warn'
  removeServerHot?: 'warn'
  removeServerTransformRequest?: 'warn'
  removeServerWarmupRequest?: 'warn'
  removeSsrLoadModule?: 'warn'
}

// User config:
// future: { removePluginHookHandleHotUpdate: 'warn' }
// or
// future: 'warn'  // turn on ALL warnings
```

User configures `future: { <flagName>: 'warn' }` per-flag, OR `future: 'warn'` to turn on all warnings globally. There's NO mode like `'strict'` or `'enforce'` — Vite's pattern is purely "warn-then-remove in next major" rather than "warn-then-flip-default."

#### Algoritmo interno

`packages/vite/src/node/deprecations.ts:55-97` exports `warnFutureDeprecation(config, type, extraMessage?, stacktrace = true)`:

1. **Gate** (lines 61-66): bail if `_ignoreDeprecationWarnings` global is set OR `config.future` is undefined OR `config.future[type] !== 'warn'`. So users explicitly opt-in per flag.
2. **Build message** (lines 68-78): wraps message in `picocolors.yellow`, appends a docs URL (`https://vite.dev/changes/<deprecation-code>`).
3. **Append stacktrace** (lines 80-95): walks `new Error().stack`, drops first 3 frames, filters out `node_modules/vite/dist/` frames so the user sees their own call site.
4. **Emit via `warnOnce`** (line 96): `config.logger.warnOnce(msg)` — same message only warns once per session, prevents log spam.

#### Estado mantido

- `_ignoreDeprecationWarnings: boolean` (line 42) — module-scoped flag. Toggled by `ignoreDeprecationWarnings<T>(fn: () => T): T` (lines 99-105) which wraps a callback. **Used internally** by Vite to suppress warnings when Vite itself is calling its own deprecated APIs during a transition.
- `config.future[type]` — the per-flag user opt-in value.

#### Dependências externas usadas

| Lib | Versão | Para quê | TheoKit pode adotar? |
|---|---|---|---|
| `picocolors` | `^1.x` | terminal color (yellow for warnings) | **Sim** — we already use colors in CLI output |
| (none for `warnOnce`) | — | `logger.warnOnce` is a builtin Vite Logger method | We have our own `logger.ts`; add `warnOnce` (1 frequency-counter `Set<string>`) |

#### Side effects observáveis

- Writes to `config.logger` (stderr by default).
- Reads `Error.stack` at call time (1 stack-walk per warning, gated by `warnOnce`).
- Mutates module-scoped `_ignoreDeprecationWarnings` during `ignoreDeprecationWarnings()` wrapper.

#### TODOs / FIXMEs / HACKs literais

> `// Later we could have a warnDeprecation utils when the deprecation is landed` — `referencias/vite/packages/vite/src/node/deprecations.ts:51`

Translation: even Vite admits this is the "future" half. The companion "actual breaking change shipped" warning helper does not exist yet — they'll add it when the flags graduate from `'warn'` to default-on.

#### Padrão de design

- **Pattern: Per-flag opt-in future, with structured "shall be removed in <X>" warning**
- Por que: each breaking change can be gradual-released independently; users opt into the warnings before the actual cutover, get a docs URL + call site, and only one warning per session per call site so logs stay clean.

### 3.2 Rails — `ActiveSupport::Deprecation` (gold standard, 6 modes)

Rails has the **canonical deprecation framework** that every other framework borrows ideas from. The system has 5 components: behaviors, reporting, disallowed warnings, method wrappers, proxy wrappers.

#### API pública (from the 5 core files)

```ruby
# referencias/rails/activesupport/lib/active_support/deprecation.rb:33-79
module ActiveSupport
  class Deprecation
    attr_accessor :deprecation_horizon   # version that will REMOVE the deprecated behavior

    def initialize(deprecation_horizon = "8.3", gem_name = "Rails")
      self.gem_name = gem_name
      self.deprecation_horizon = deprecation_horizon
      self.silenced = false
      self.debug = false
      @silence_counter = Concurrent::ThreadLocalVar.new(0)
      @explicitly_allowed_warnings = Concurrent::ThreadLocalVar.new(nil)
    end
  end
end

# referencias/rails/activesupport/lib/active_support/deprecation/behaviors.rb:13-54
# 6 modes:
DEFAULT_BEHAVIORS = {
  raise:   -> raises DeprecationException
  stderr:  -> $stderr.puts(message)
  log:     -> Rails.logger.warn(message)
  notify:  -> ActiveSupport::Notifications.instrument(...)   # event-bus
  silence: -> noop
  report:  -> ActiveSupport.error_reporter.report(error)     # routes to Sentry/Bugsnag/etc
}

# referencias/rails/activesupport/lib/active_support/deprecation/reporting.rb:18-29
deprecator.warn(message)  # the public emit method
deprecator.silence { ... }                  # block-scoped suppression
deprecator.allow(['some pattern'], if: cond) # block-scoped exception to disallowed_warnings
```

#### Algoritmo interno — `warn` (lines 18-29)

1. **Silenced gate** (line 19): if `silenced || @silence_counter.value > 0`, bail.
2. **Capture callstack** (line 21): `caller_locations(2)` — Ruby's stack-walk API, drops the caller's caller from the stack so the user sees THEIR call site.
3. **Build full message** (line 22 → `deprecation_message`): `"DEPRECATION WARNING: <msg> (called from <method> at <file>:<line>)"`.
4. **Route to behavior** (lines 23-27): if message matches `disallowed_warnings`, use `disallowed_behavior` (default: `:raise`). Else use `behavior` (default: `:stderr`).
5. **Each behavior** is called with `(full_message, callstack, deprecator_self)` so it has full context.

#### Algoritmo interno — `allow` (lines 89-97)

Block-scoped exception to `disallowed_warnings`. The pattern:

```ruby
deprecator.disallowed_warnings = ["something broke"]
deprecator.disallowed_behavior = :raise

# Anywhere in code:
deprecator.warn('something broke!')  # raises in CI

# But in a specific block where you can't yet migrate:
deprecator.allow ['something broke'] do
  deprecator.warn('something broke!')  # returns nil, doesn't raise
end
```

#### Estado mantido

- `@behavior` / `@disallowed_behavior` — arrays of lambdas (multi-behavior — log AND notify AND report).
- `@silence_counter` — `Concurrent::ThreadLocalVar<Integer>`. Thread-local so concurrent requests don't suppress each other.
- `@explicitly_allowed_warnings` — `Concurrent::ThreadLocalVar<Array<String|Regexp>>`. Thread-local for `allow` block-scoped exception.
- `deprecation_horizon` — string like `"8.3"`, used in `deprecated_method_warning` to emit `"<method> is deprecated and will be removed from Rails 8.3"`.

#### Dependências externas usadas

| Lib | Versão | Para quê | TheoKit pode adotar? |
|---|---|---|---|
| `concurrent-ruby` (`Concurrent::ThreadLocalVar`) | — | thread-local counters for silence/allow scopes | **N/A** — Node.js uses `AsyncLocalStorage` instead (we already have this in `work-async-storage.external` for SSR). |
| `ActiveSupport::Notifications` | — | event bus for `notify` behavior | **Avaliar** — TheoKit doesn't have an event bus; could add minimal pubsub or skip the notify behavior. |
| `ActiveSupport.error_reporter` | — | unified error reporter (Sentry adapter) | **Sim** — TheoKit's traceId + structured logger should support a `report` behavior. |

#### Side effects observáveis

- `warn` writes to `$stderr` or `Rails.logger` (per behavior).
- `notify` publishes to an in-process event bus.
- `report` writes to whatever error reporter is configured (Sentry, Bugsnag, etc.).
- All behaviors are call-time, not async/deferred.

#### TODOs / FIXMEs / HACKs literais

> `# Setting behaviors only affects deprecations that happen after boot time. Deprecation warnings raised by gems are not affected by this setting because they happen before \Rails boots up.` — `behaviors.rb:96-97`

Critical: warnings emitted DURING framework boot are not affected by user behavior config. **TheoKit has the same constraint** — config is loaded after boot, so any warning emitted before `loadConfig()` resolves cannot honor the user's `behavior` choice. Workaround: framework boot warnings always go to stderr.

#### Padrão de design

- **Pattern: Multi-behavior dispatcher with horizon + disallowed-warnings escalation**
- Por que: separates "what to do with a warning" (5 behaviors + 1 silence) from "which warnings escalate" (a sub-set goes to `disallowed_behavior` which defaults to raise). Allows CI to raise on specific warnings (e.g., "the warnings the user has not migrated yet") while keeping prod logs quiet for others. **This is the pattern that gives users the most control with the least framework intrusion.**

### 3.3 Next.js — `@next/codemod upgrade` (automated migration tool)

Next.js's approach: **the codemod tool IS the migration plan**. They publish `@next/codemod` as a separate npm package, with both per-transform scripts (`@next/codemod app-dir-runtime-config-experimental-edge ./app`) and a high-level `upgrade` command that resolves the user's current version, the target version, runs each relevant transform, and bumps deps.

#### API pública (CLI surface)

```bash
# Auto-detect current version, upgrade to latest:
npx @next/codemod@canary upgrade latest

# Run a specific transform:
npx @next/codemod next-async-request-api ./app
npx @next/codemod built-in-next-font ./pages
npx @next/codemod metadata-to-viewport-export ./app
```

#### Algoritmo interno — `upgrade` (from `bin/upgrade.ts:112-180+`)

1. **Read user's installed Next.js version** from `package.json`.
2. **Resolve target version** via `resolveSemanticRevision(revision, installedVersion)` (lines 91-110): translates `'patch' | 'minor' | 'major' | 'latest'` to npm version queries.
3. **Query npm for highest matching version** (`loadHighestNPMVersionMatching`, lines 44-63): runs `npm view <pkg>@<range> --json --field version`.
4. **Determine which transforms apply** based on `installedMajor` → `targetMajor` jump.
5. **Run each transform** via jscodeshift (`runTransform` from `bin/transform.ts`).
6. **Bump deps** in `package.json` for all `optionalNextjsPackages` that the user has installed (line 24-38 lists 13 ecosystem packages: `create-next-app`, `eslint-config-next`, `@next/bundle-analyzer`, etc.).
7. **Print end message** (`endMessage`, lines 65-81): for major 15 specifically, prompts the user to read the v15 migration guide.

#### Estado mantido

- `installedVersion: string` (semver)
- `targetVersion: string` (semver)
- Per-transform state lives in jscodeshift's AST visitor, ephemeral.

#### Dependências externas usadas

| Lib | Versão | Para quê | TheoKit pode adotar? |
|---|---|---|---|
| `jscodeshift` | `^17.x` | AST transformations on TS/JS files | **Avaliar** — jscodeshift is the canonical codemod runner; if TheoKit ships codemods, this is the lib. Heavy dep though (300+ KB). |
| `prompts` | `^2.x` | interactive prompts in CLI | **Sim** — we already use `prompts` in `create-theokit`. |
| `semver` | `^7.x` | version comparison + parsing | **Sim** — already used in `theokit check`. |
| `picocolors` | `^1.x` | CLI colors | **Sim** — already used. |

#### Side effects observáveis

- Reads `package.json` at `cwd`.
- Writes transformed source files in-place.
- Runs `npm/pnpm/yarn/bun install` to bump deps.
- Executes child processes (`execSync` for `npm view`).

#### TODOs / FIXMEs / HACKs literais

> `// The last entry will be the latest version published. But we want the highest version.` — `bin/upgrade.ts:57-58`

Subtle gotcha — `npm view <pkg>@<range>` returns versions in PUBLISH order, not version order. Next.js sorts by `compareVersions` before picking. **TheoKit's `theokit check --upgrade-readiness` will hit this same gotcha.**

#### Padrão de design

- **Pattern: Per-major codemod + version-aware upgrade orchestrator**
- Por que: keeps each transform small and testable (one file per breaking change, ~80 LOC each). Upgrade tool resolves "what runs for what version jump" mechanically. User experience is one command (`upgrade latest`), implementation is N independent codemods composed.

### 3.4 Astro — experimental→stable (NOT warn→strict — comparison point)

Astro's CSP rollout went `experimental.csp` (off by default, opt-in, no stability guarantee) → `security.csp` (stable, off by default, opt-in, semver-protected). **They do not have a warn→strict pattern** for security defaults — their CSP is opt-in, not enabled-by-default.

The relevant CHANGELOG snippet (`packages/astro/CHANGELOG.md`):

> Allows `Astro.csp` and `context.csp` to be undefined instead of throwing errors when `csp: true` is not configured. When using the experimental Content Security Policy feature in Astro 5.x, `context.csp` was always defined but would throw if `experimental.csp` was not enabled in the Astro config. For the stable version of this API in Astro 6, `context.csp` can now be undefined if CSP is not enabled and its methods will never throw.

The user-facing diff they document (CHANGELOG):

```diff
-Astro.csp.insertDirective("default-src 'self'");
+Astro.csp?.insertDirective("default-src 'self'");
```

#### API pública (the schema at the time of stabilization)

From `referencias/astro/packages/astro/src/core/csp/config.ts:43-90`:

```ts
const ALLOWED_DIRECTIVES = [
  'base-uri', 'child-src', 'connect-src', 'default-src', /* ... 22 total ... */
] as const

// Validation refuses script-src/style-src in `directives` — those go in
// dedicated `scriptDirective`/`styleDirective` fields. Why: nonce + hash
// management is more sensitive than other directives.
.superRefine((value, ctx) => {
  if (value.startsWith('script-src') || value.startsWith('style-src')) {
    ctx.addIssue({ /* error: use scriptDirective / styleDirective */ })
  }
})
```

#### Padrão de design

- **Pattern: Experimental flag (off-by-default, can break per patch) → Stable namespace (off-by-default, semver-protected)**
- Por que: lower-risk for the framework — never enabled-by-default, so no "warn → strict" risk surface. Users who opt-in accept the cost.
- **Why it doesn't apply to TheoKit's 0.3.0 cutover:** TheoKit already shipped CSRF and CSP as default-on (in `warn`/`report-only`). We can't go back to "opt-in only" without un-shipping the security baseline. The cutover IS the moment of stabilization, not optional adoption.

#### Side observation

Astro DOES have an `experimental.csp` → stable `csp` graduation pattern that's documented in CHANGELOG with explicit before/after code diff (`Astro.csp.insertDirective` → `Astro.csp?.insertDirective`). That's the SHAPE of doc TheoKit should publish for 0.3.0, even though Astro's content (opt-in→stable) is different from ours (warn→strict).

### 3.5 TanStack Router — migrate-FROM-X docs

TanStack publishes migration guides for "you're coming from X, here's how to land in TanStack." From `docs/start/framework/react/migrate-from-next-js.md`:

> This guide provides a step-by-step process to migrate a project from the Next.js App Router to **TanStack Start**. We respect the powerful features of Next.js and aim to make this transition as smooth as possible.

Structure: prerequisites → step-by-step (uninstall old, install new, refactor file conventions, swap data fetching, swap router APIs) → gotchas section.

#### Padrão de design

- **Pattern: Migration-FROM doc per source framework**
- Por que: a different audience than "you're upgrading WITHIN TheoKit between versions." But the same DOCUMENT shape — prerequisites + step-by-step diffs + gotchas — applies to within-framework migrations.
- **TheoKit application:** the 0.3.0 migration guide is structurally identical to a "migrate-from-0.2.x.md" doc. Same prereqs section (audit warn-mode logs), same step-by-step (refactor each violation site), same gotchas (inline scripts, custom fetchers).

---

## 4. Convergent patterns (todos concordam)

1. **Per-flag opt-in to future behavior** — Vite (`FutureOptions` with `'warn'` per flag, `referencias/vite/packages/vite/src/node/config.ts:535-547`) + Next.js (each codemod is opt-in via the codemod CLI, not auto-applied during npm install). **TheoKit application:** the `0.3.0` flip is global (one default change), but we can offer `config.security.csrf: 'strict' /* opt-in now */` to apps that want to test before the flip. That config slot already exists.

2. **Structured warning payload** (not just stderr text) — Rails behaviors include `notify` (event bus) + `report` (error reporter) in addition to `stderr`, so machines can consume warnings (`referencias/rails/activesupport/lib/active_support/deprecation/behaviors.rb:37-45, 49-53`). Vite's warning has docs URL + stack trace baked in (`deprecations.ts:74-95`). **TheoKit application:** the existing `csrf.warn` log line is already structured JSON — that's the convergent shape. We should add a `docsUrl` field pointing to the migration guide.

3. **`warnOnce` per call site** — Vite uses `config.logger.warnOnce(msg)` (line 96) to dedupe same message. Without this, a request loop with 1000 POSTs would emit 1000 identical warnings. **TheoKit application:** mandatory before 0.2.x ships any heavier warn payloads. Add `Set<string>`-backed `warnOnce` to our logger.

4. **Escape hatch with explicit name** — Next.js 15 introduced `UnsafeUnwrappedCookies` cast as the synchronous escape hatch for the async `cookies()` migration (`docs/01-app/02-guides/upgrading/version-15.mdx:88-100`). The cast logs a warning in dev. The name itself is a deterrent ("Unsafe...Unwrapped..." reads like a violation). **TheoKit application:** when 0.3.0 flips CSRF to strict, the escape hatch is `defineRoute({ csrf: false })` (already exists). For CSP, the escape hatch is `config.security.headers.cspMode: 'report-only'` (already exists). Name choices already follow the deterrent pattern.

5. **Codemod tooling as a separate package** — Next.js publishes `@next/codemod` as a sibling to `next`. The codemod can be run independently of the framework version (a user on Next 14 can run `@next/codemod@canary upgrade latest` to assist the jump to 15). **TheoKit application:** if we ship codemods, they go in `packages/theokit-codemod/` (or sub-command of `theokit check`). Decoupled from the framework version.

6. **Migration guide as artifact, per major** — Next.js (`docs/01-app/02-guides/upgrading/version-{N}.mdx`), TanStack (per-source migration docs), Vite (`CHANGELOG.md` with `BREAKING CHANGES` section per minor). **TheoKit application:** `docs/migrating/0.2-to-0.3.md` — this is one of the explicit gates in `CLAUDE.md` 0.3.0 pre-reqs.

7. **Beta / canary tag for cutover releases** — Next.js publishes `@canary` separately from `@latest`. Users who want to test the flip ahead of time install `next@canary`. **TheoKit application:** `theokit@0.3.0-beta.0` on `next` npm dist-tag, promote to `latest` only after one-week feedback window with zero CRITICAL bug reports. Already listed as a gate in `CLAUDE.md`.

---

## 5. Divergent patterns (trade-off real)

1. **Default-on warn vs opt-in warn**
   - **Vite:** opt-in (`future: { flag: 'warn' }`) — user must explicitly add the flag to start receiving warnings.
   - **Rails:** default-on (`ActiveSupport::Deprecation.behavior = :stderr` by default).
   - **TheoKit choice:** **default-on warn** for the cutover. Users get the warnings on the existing 0.2.x without changing config. This is what we already do for CSRF/CSP, just need to consider whether to KEEP this for future cutovers.

2. **Behavior dispatcher count**
   - **Rails:** 6 behaviors (raise/stderr/log/notify/silence/report) — full taxonomy.
   - **Vite:** 1 behavior (`logger.warnOnce`) — no dispatcher concept.
   - **Next.js:** N/A (cutover is via codemod, not warning).
   - **TheoKit choice:** **2 behaviors** for now — `stderr` (default) and `silence` (for `cspMode: 'off'` / `csrf: 'off'`). Don't replicate Rails's full set; revisit if users ask for `notify`/`report`. KISS.

3. **Codemod tooling**
   - **Next.js:** dedicated `@next/codemod` package, jscodeshift-based, AI-driven via MCP server.
   - **Vite:** none — they don't ship codemods.
   - **Astro:** none — `@astrojs/upgrade` is shell-based (just installs new versions), no AST transforms.
   - **TheoKit choice:** **NO jscodeshift codemod for 0.3.0.** Reason: the 0.3.0 cutover is config-shape stable (no `defineRoute()` API changes). Users only need to (a) add `X-Theo-Action: 1` to their fetchers OR switch to `theoFetch`, (b) audit inline scripts. Both are NOT AST-rewritable with high confidence — they need human review. A `theokit check --upgrade-readiness 0.3` LINT-style command that flags issues is the right tool, NOT a transform. Saves us a `jscodeshift` dep + a whole new package.

4. **MCP-driven upgrade (AI agent loop)**
   - **Next.js (16+):** ships a Next.js DevTools MCP server. User configures their AI coding agent's `.mcp.json` to load it, then prompts "Next Devtools, help me upgrade my app to v16" (`docs/01-app/02-guides/upgrading/version-16.mdx:12-35`).
   - **Everyone else:** N/A — Next.js is alone here.
   - **TheoKit choice:** **DEFERRED to 1.0+.** Cool but not required for 0.3.0. The migration guide + `theokit check --upgrade-readiness` covers the same workflow without the MCP dep.

5. **Disallowed warnings (CI escalation)**
   - **Rails:** `deprecator.disallowed_warnings = [pattern]` + `deprecator.disallowed_behavior = :raise` — sub-set of warnings escalate to errors in CI BEFORE the cutover (`disallowed.rb:1-54`). Users can "test the cutover" by promoting selected warnings to errors.
   - **Vite:** N/A — no analog.
   - **Next.js:** N/A — would be redundant with codemod-based migration.
   - **TheoKit choice:** **Adopt the Rails pattern.** Add `config.security.csrf.disallowed: string[]` (regex or path glob) + `config.security.csrf.disallowedBehavior: 'warn' | 'raise'` (default `'raise'`). Lets users escalate specific routes' warnings to 403 errors before the cutover, so they can validate strict mode per-route. Small surface, high value.

6. **CSP API surface granularity**
   - **Astro:** separates `script-src` / `style-src` from other directives via dedicated `scriptDirective` / `styleDirective` fields (`csp/config.ts:76-79`). Reason: nonce + hash management is more sensitive.
   - **Next.js:** no separation — all directives in one CSP string.
   - **TheoKit choice:** **Astro pattern wins.** When 0.3.0 introduces per-request nonce, `scriptDirective` becomes the natural place to express the nonce. Separates the nonced/hashed surface from plain directives. Add to `securityHeadersSchema` in 0.3.0.

---

## 6. Dependency inventory — bibliotecas comuns

Convergent libs (aparecem em 2+ frameworks doing cutover-related work):

| Lib | Frameworks que usam | Função | TheoKit decision |
|---|---|---|---|
| `picocolors` | Vite, Next.js, Astro, TanStack | CLI color output for warnings | **Já temos** (transitive via Vite). Pin direct. |
| `semver` | Next.js, Vite, everyone | Version comparison, range matching | **Já temos** via `create-theokit`. Pin direct in framework if `theokit check` needs it. |
| `prompts` | Next.js (codemod), Astro (upgrade), create-* tools | Interactive CLI prompts | **Já temos** in `create-theokit`. Available for `theokit check --upgrade-readiness` interactive mode. |
| `jscodeshift` | Next.js exclusively (for AST codemods) | jsdom-style AST transforms | **NOT adopting** (see §5.3) — saves 300+ KB dep tree. |

Convergent-but-skip:

| Lib | Frameworks que usam | Why TheoKit skips |
|---|---|---|
| `concurrent-ruby` `ThreadLocalVar` | Rails | Node.js uses `AsyncLocalStorage`; we already have this primitive in `work-async-storage.external` (Phase 4 RSC research mapped it). |
| `ActiveSupport::Notifications` | Rails | TheoKit doesn't have an in-process event bus. The `notify` behavior in Rails would be `'report'` in our case (forward to traceId/structured logger). |

TheoKit-internal helpers we already have:

| Helper | File | Useful for cutover |
|---|---|---|
| `enforceCsrf(req, mode, logger?)` | `packages/theo/src/server/csrf.ts` (Phase 5) | Already takes `mode: 'off' | 'warn' | 'strict'` — the cutover is "change default arg" |
| `applySecurityHeaders(res, config, env)` | `packages/theo/src/server/security-headers.ts` (Phase 6) | Already takes `cspMode`. Cutover: change default. |
| `extractTraceId(req)` | `packages/theo/src/server/trace-context.ts` (Phase 7) | Every warn log line carries the traceId already — no new wiring. |

---

## 7. Algorithms / data structures não-óbvios

1. **Stack-walking with framework-frame filter** (Vite `deprecations.ts:80-95`) — Vite walks `new Error().stack`, drops the first 3 frames (the deprecation helper itself), filters out `node_modules/vite/dist/` frames, joins with tree-drawing characters (`└` / `│`). Result: user sees ONLY their own call site, indented like a tree. **Complexity:** O(stack depth) per warning; gated by `warnOnce` so each call site only pays this cost once. **TheoKit application:** when we add `csrf.warn` stack traces (currently we only have method + path + reason), use this exact filtering pattern with `node_modules/theokit` as the filter.

2. **Thread-local silence counter** (Rails `reporting.rb:48-58`) — `@silence_counter` is a `Concurrent::ThreadLocalVar<Integer>`. Incremented by `begin_silence`, decremented by `end_silence`, both via `silence` block:
   ```ruby
   def silence(&block)
     begin_silence
     block.call
   ensure
     end_silence
   end
   ```
   The `ensure` guarantees decrement even if block throws. **TheoKit application:** when we add scoped silencing (e.g., a test wrapper `withCsrfSilenced(async () => { ... })`), use `AsyncLocalStorage<{ counter: number }>` instead of thread-local — Node's equivalent. Same `try { ... } finally { decrement }` shape.

3. **Per-deprecation docs URL via code prefix** (Vite `deprecations.ts:6-18`) — each `FutureOptions` flag has a parallel entry in `deprecationCode: Record<keyof FutureOptions, string>`. The URL is constructed as `https://vite.dev/changes/<code.toLowerCase()>`. **Why this matters:** the URL is determined by the flag NAME, not by the warning message. Users can grep their logs for `https://vite.dev/changes/per-environment-apis` and find every related warning across DIFFERENT messages. **TheoKit application:** when we emit `csrf.warn`, include a `code: 'csrf-strict-cutover'` field. URL is `https://theokit.dev/upgrade/csrf-strict-cutover`.

4. **Disallowed-warnings as regex array, evaluated per call** (Rails `reporting.rb:23-27`) — every warning checks `deprecation_disallowed?(message)` which scans an array of `String | Regexp` for a match. O(N) per warning where N is the disallowed list size. For tiny lists (1-10 patterns), negligible. **TheoKit application:** when 0.3.0 adds `disallowedRoutes: string[]`, evaluate via `paths.some(p => path === p || (p instanceof RegExp && p.test(path)))`. Don't over-engineer with tries unless N grows.

---

## 8. Edge cases conhecidos (com fonte)

| Edge case | How it manifests | Source | TheoKit prevention |
|---|---|---|---|
| Deprecation warnings during framework boot bypass user config | `behavior` is set in user config, but warnings emitted before `loadConfig()` resolves go to default | `referencias/rails/activesupport/lib/active_support/deprecation/behaviors.rb:96-97` ("Setting behaviors only affects deprecations that happen after boot time") | TheoKit's `csrf.warn` is emitted from `executeRoute` (request-scoped, post-boot). Safe. But framework-level warnings (e.g., if 0.3.0 emits "you're on 0.2.x config shape") MUST go to stderr default and document the limitation. |
| `npm view <pkg>@<range>` returns versions in PUBLISH order, not semver order | Codemod picks "latest" but gets an OLDER version because it was published more recently | `referencias/next.js/packages/next-codemod/bin/upgrade.ts:57-58` ("The last entry will be the latest version published. But we want the highest version.") | `theokit check --upgrade-readiness` MUST sort by `semver.compare` before picking. Lift the helper directly from Next.js. |
| Synchronous escape hatch logs warning but is opt-in via cast/import name | User unaware they're using deprecated path because the cast name doesn't deter | `referencias/next.js/docs/01-app/02-guides/upgrading/version-15.mdx:88-100` — `UnsafeUnwrappedCookies` cast | The name itself is the deterrent. TheoKit's `defineRoute({ csrf: false })` is already deterrent-shaped. Document it as "opt-out, audit before shipping" in migration guide. |
| `disallowed_warnings` matches more broadly than intended via substring | User adds `"foo"` to disallowed; matches `"foo bar"` AND `"food"` and raises on the wrong path | `referencias/rails/activesupport/lib/active_support/deprecation/disallowed.rb` (the `deprecation_disallowed?` matcher uses `include?` semantics) | TheoKit's `disallowedRoutes` should accept ONLY exact paths or `RegExp` instances — no string substring match. Document this in migration guide. |
| `warnOnce` cache key is the full message; same warning at different call sites gets deduped | User has CSRF violation at 5 different endpoints; only 1 warning printed | Inferred from Vite's `config.logger.warnOnce(msg)` behavior — single Set, message-based key | TheoKit's `warnOnce` should key by `event + method + path + reason` (the structured fields). NOT by formatted message. Each unique call site warns once. |
| Codemod overrides user formatting / loses comments | jscodeshift transforms drop trailing comments, normalize whitespace, etc. | Generic jscodeshift gotcha — see `referencias/next.js/packages/next-codemod/transforms/*.ts` for patterns that explicitly preserve comments | TheoKit's `theokit check --upgrade-readiness` is LINT-style (read + report), NOT transform-style (read + rewrite). No file modification = no formatting risk. |
| `silence` block accidentally suppresses ALL warnings in concurrent code | One request hits a `silence` block; concurrent requests' warnings are also silenced because the counter is process-global, not request-scoped | Rails solves with `Concurrent::ThreadLocalVar` (`reporting.rb:48-58`); naive `let _silenced = true; block(); _silenced = false` would break | TheoKit MUST use `AsyncLocalStorage` for scoped silencing. Plain global flag is forbidden. Reference: `work-async-storage.external` already uses this pattern in `referencias/next.js`. |
| Beta channel forks the user base — bug reports drift apart | Users on `@latest` and users on `@canary` hit different bugs; bug tracker becomes unmanageable | Inferred from Next.js practice (canary has separate issue triage; not in source code) | TheoKit's `0.3.0-beta.0` window is intentionally short (1 week) to keep the user-base fork shallow. Promote or revert quickly. |
| Inline `<script>` in app HTML is missed by static analysis | `theokit check --upgrade-readiness` scans `app/**/*.tsx`; user has inline scripts in `public/index.html` template or in `dangerouslySetInnerHTML` calls | Inferred — TheoKit's `transformIndexHtml` scans `index.html`, but `dangerouslySetInnerHTML` is unscanned | Audit must include `dangerouslySetInnerHTML` regex scan + warning. Document limitation: dynamic inline scripts (`document.createElement('script')`) cannot be detected statically. |

---

## 9. Implementation Guide

### 9.1 Arquitetura proposta

```
┌──────────────────────────────────────────────────────────────────┐
│  USER'S APP (config: 0.2.x defaults: csrf='warn', csp='report-only')│
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼ npm install theokit@0.3.0-beta.0 (next tag)
┌──────────────────────────────────────────────────────────────────┐
│  0.3.0-beta CUTOVER LAYER                                         │
│                                                                   │
│  config.security.csrf            default flips 'warn' → 'strict' │
│  config.security.headers.cspMode default flips                   │
│                                  'report-only' → 'enforce'       │
│  config.security.headers          + scriptDirective field (new)  │
│                                  + nonce wiring (Phase 6 follow) │
│                                                                   │
│  Migration guide artifact:  docs/migrating/0.2-to-0.3.md         │
│  Migration CLI:             theokit check --upgrade-readiness 0.3│
│  Hot fix needed FIRST:      useAgentStream sends X-Theo-Action   │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼ npm dist-tag move 0.3.0-beta → 0.3.0 latest
┌──────────────────────────────────────────────────────────────────┐
│  STABLE 0.3.0                                                     │
│  Same defaults; warn-mode and report-only still available as     │
│  opt-out (back-compat for stragglers).                            │
└──────────────────────────────────────────────────────────────────┘
```

### 9.2 Files to create / modify

```
packages/theo/src/server/csrf.ts                — change DEFAULT_MODE from 'warn' to 'strict' (1 line)
packages/theo/src/server/security-headers.ts    — change default cspMode to 'enforce' + scriptDirective
                                                  field + nonce-prefix support (50-100 LOC change)
packages/theo/src/config/schema.ts              — add disallowedRoutes + disallowedBehavior fields
                                                  on securitySchema (15 LOC)
packages/theo/src/client/use-agent-stream.ts    — attach X-Theo-Action: 1 to fetch init (BLOCKER, 5 LOC)
packages/theo/src/server/logger.ts              — add warnOnce helper (Set<string>) (15 LOC)
packages/theo/src/cli/check.ts                  — add --upgrade-readiness 0.3 flag (NEW, ~200 LOC)
docs/migrating/0.2-to-0.3.md                    — migration guide artifact (NEW, ~300 lines markdown)
tests/unit/csrf-cutover.test.ts                 — defaults flipped, disallowed escalation, warnOnce (NEW)
tests/unit/security-headers-nonce.test.ts       — nonce roundtrips, scriptDirective separation (NEW)
tests/e2e/template-default.spec.ts              — update existing spec: chat POST now has X-Theo-Action
fixtures/template-default/                       — same fixture; no script tag changes needed (uses
                                                  Tailwind, not inline gtag)
scripts/dogfood-smoke.sh                         — new check #48: 0.3.0 readiness gates
```

### 9.3 Public API surface (TypeScript)

```ts
// packages/theo/src/config/schema.ts — additions

export const securityHeadersSchema = z.object({
  csp: z.union([z.string(), z.literal(false)]).optional(),
  cspMode: z.enum(['enforce', 'report-only', 'off']).default('enforce'),  // ← was 'report-only'
  scriptDirective: z.string().optional(),       // ← NEW (Astro-inspired separation)
  styleDirective: z.string().optional(),         // ← NEW
  hsts: z.union([z.string(), z.literal(false)]).optional(),
  frameOptions: z.enum(['DENY', 'SAMEORIGIN']).default('DENY'),
  contentTypeOptions: z.literal('nosniff').default('nosniff'),
  referrerPolicy: z.string().default('strict-origin-when-cross-origin'),
})

export const securitySchema = z.object({
  csrf: z.enum(['off', 'warn', 'strict']).default('strict'),   // ← was 'warn'
  /** Routes whose csrf.warn should escalate to 403 in CI (Rails disallowed-pattern). */
  disallowedRoutes: z.array(z.union([z.string(), z.instanceof(RegExp)])).default([]),
  /** Behavior for routes in disallowedRoutes when in 'warn' mode. */
  disallowedBehavior: z.enum(['warn', 'raise']).default('raise'),
  headers: securityHeadersSchema.optional(),
})

// packages/theo/src/server/logger.ts — addition

const _warnOnceSeen = new Set<string>()
export function warnOnce(key: string, payload: Record<string, unknown>): void {
  if (_warnOnceSeen.has(key)) return
  _warnOnceSeen.add(key)
  console.warn(JSON.stringify({ ...payload, warnOnce: true }))
}

// packages/theo/src/cli/check.ts — addition

export function runUpgradeReadiness(targetVersion: '0.3'): Promise<{
  status: 'ready' | 'has-violations'
  violations: Array<{
    file: string
    line: number
    rule: 'csrf-missing-header' | 'inline-script' | 'unsafe-csp-source'
    message: string
    fix: string  // suggested code snippet
  }>
}>
```

### 9.4 Dependências a adotar

| Package | Version | Justification |
|---|---|---|
| (none — all helpers in-house) | — | The cutover doesn't require new deps. We have `picocolors`, `semver`, `prompts`, `zod` already. `theokit check --upgrade-readiness` uses `acorn` (already vite-transitive) for the AST scan, NOT `jscodeshift`. |

### 9.5 Test strategy

- **Unit tests** (`tests/unit/csrf-cutover.test.ts`):
  - `csrf default flipped from 'warn' to 'strict'` — config defaults match new shape
  - `csrf 'warn' still works as opt-out` — backward compat preserved
  - `disallowedRoutes match exact path` — pattern matching
  - `disallowedRoutes match RegExp` — RegExp accepted
  - `disallowedBehavior 'raise' returns 403 in warn mode` — escalation works
  - `warnOnce dedupes by structured key`
- **Unit tests** (`tests/unit/security-headers-nonce.test.ts`):
  - `cspMode default flipped from 'report-only' to 'enforce'`
  - `scriptDirective separated from main directive list`
  - `nonce per-request emitted in both header and inline script tags`
  - `cspMode 'report-only' still works as opt-out`
- **Integration** (`tests/integration/cutover-pipeline.test.ts`):
  - End-to-end: POST without `X-Theo-Action` returns 403 in 0.3.0 default
  - End-to-end: POST with `X-Theo-Action: 1` passes
  - End-to-end: route with `csrf: false` opt-out still accepts POST
- **Fixture & Playwright** (`tests/e2e/template-default.spec.ts` — update existing):
  - Chat composer now sends the header (after `useAgentStream` fix)
  - Zero `csrf.warn` log lines in stderr during the spec run (assert dev server log)
  - Response headers include `Content-Security-Policy` (no longer report-only)
- **Migration guide test** — markdown linter on `docs/migrating/0.2-to-0.3.md` to ensure all sections present.

### 9.6 Phases of rollout

1. **Phase 1 — BLOCKING hotfix** (~30 min): fix `useAgentStream` to attach `X-Theo-Action: 1`. Ship as 0.2.1 patch. Without this, our own scaffold breaks in 0.3.0.
2. **Phase 2 — Helpers** (~1 day): `warnOnce` helper, structured payload with `code` field + `docsUrl`, `theokit check --upgrade-readiness` CLI command (lint-only, no transform).
3. **Phase 3 — Migration guide** (~1 day): write `docs/migrating/0.2-to-0.3.md`. Includes grep commands to audit warn-mode logs, before/after code snippets, escape hatches, opt-out paths.
4. **Phase 4 — Nonce machinery** (1-2 days, high risk): per-request nonce threaded through SSR HTML emitter to every `<script>` site. New `scriptDirective` config slot accepts the nonce token.
5. **Phase 5 — `disallowedRoutes` escalation** (~half day): config field + matcher + 403 dispatch in `executeRoute`.
6. **Phase 6 — Wait for warn-mode telemetry** (4-6 weeks calendar time): users on 0.2.x bump to 0.2.1 (with the `useAgentStream` fix), audit their warn logs.
7. **Phase 7 — Beta release** (~1 week feedback): `theokit@0.3.0-beta.0` on `next` npm tag. Flip the defaults. Solicit feedback in a pinned issue.
8. **Phase 8 — Promote to latest** (~1 day): if zero CRITICAL bug reports, `npm dist-tag add theokit@0.3.0 latest`. CHANGELOG `[Unreleased]` carries a header-level **BREAKING** banner.

### 9.7 Acceptance criteria

- [ ] `useAgentStream` attaches `X-Theo-Action: 1` on non-GET requests
- [ ] `warnOnce` helper exported from `packages/theo/src/server/logger.ts`
- [ ] `csrf.warn` payload includes `code: 'csrf-strict-cutover'` + `docsUrl`
- [ ] `theokit check --upgrade-readiness 0.3` scans app/server source, reports violations with file:line + suggested fix
- [ ] Migration guide at `docs/migrating/0.2-to-0.3.md` exists and references all 6 0.3.0 pre-reqs from CLAUDE.md
- [ ] Per-request nonce threaded through SSR HTML; Playwright spec asserts `<script nonce=...>` matches CSP `nonce-...`
- [ ] `disallowedRoutes` + `disallowedBehavior` config slots accept + match correctly
- [ ] Beta on `next` dist-tag has been live for >= 7 days with zero CRITICAL bug reports
- [ ] `tsc --noEmit` clean, `vitest run` green, Playwright suite green
- [ ] Dogfood check #48 added
- [ ] CHANGELOG `[Unreleased]` includes header **BREAKING** banner

### 9.8 Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| User on custom auth flow (not `theoFetch`) gets 403 on login after upgrade | High | Migration guide includes audit script: `grep -rn "fetch\b.*method.*POST" src/ \| xargs grep -L "X-Theo-Action"`. `theokit check --upgrade-readiness 0.3` flags these too. |
| App with gtag / intercom / Plausible breaks silently | Critical | Migration guide includes "inline script audit" section. `theokit check --upgrade-readiness` scans `app/**/*.tsx`, `public/index.html`, and `dangerouslySetInnerHTML` for `<script>` tags. |
| SSR hydration nonce wiring has an edge case bug (re-introduces hydration bug from Phase 1) | Medium | Playwright spec asserts `<script nonce=...>` matches header `nonce-...` on every SSR page. Block 0.3.0 release if any Playwright spec fails. |
| User skips warn-mode telemetry window, upgrades directly | High | `theokit check --upgrade-readiness 0.3` runs at upgrade time. Show big warning if user is moving 0.2.x → 0.3.x with violations present. |
| Our own scaffold default's chat demo returns 403 on first send | Critical | **Phase 1 BLOCKING fix** — useAgentStream attaches header in 0.2.1. Validate via existing Playwright spec asserting zero `csrf.warn` log lines. |
| Codemod-style transform introduces unintended formatting changes | N/A | We are NOT shipping a codemod (lint-only). Risk doesn't apply. |
| Beta channel forks user feedback drift | Low | Beta window is 1 week max. Forced promote-or-revert decision. |

---

## 10. Open questions

1. **Should warn payload include suggested code snippet?** — Vite emits docs URL only. Next.js emits suggested codemod command. Rails emits `(called from <method> at <file>:<line>)`. We could emit `suggested_fix: "Add X-Theo-Action: '1' header or use theoFetch"`. **Trade-off:** larger payload, but greppable + actionable. Default to **yes** unless payload size becomes an issue.

2. **Per-request nonce: framework-emitted or user-emitted?** — Open question: does the framework `ctx.nonce` get auto-injected into every `<script>` site (Vite/React-style), or does the user pass `ctx.nonce` explicitly to their SSR helpers (Astro-style with `Astro.csp.insertDirective`)? **Recommendation:** auto-injection for the SSR hydration data script (framework controls), explicit for user-authored inline scripts (user controls). Document the boundary.

3. **`disallowedRoutes` semantics — exact match only, or include glob support?** — Rails uses substring/regex with documented gotcha. Next.js doesn't have an analog. **Recommendation:** start with exact string OR `RegExp` instance. No glob library. If users complain, add minimatch in 0.4.0.

4. **Should `theokit check --upgrade-readiness 0.3` exit non-zero in CI?** — If yes, CI breaks on every PR until violations are fixed. If no, the tool is purely informational and easy to skip. **Recommendation:** exit non-zero by default. Add `--allow-warnings` flag to override in CI. This is Rails's `disallowed_warnings` pattern transplanted to a CLI surface.

5. **Sunset timeline for 'warn' / 'report-only' opt-out?** — 0.3.0 keeps the old modes as opt-out (backward compat for stragglers). When do we remove them entirely? Vite's pattern: next major (1.0). Rails's pattern: next "deprecation horizon" version (e.g., 8.3 in their case). **Recommendation:** keep through 0.4.x; remove in 1.0 alongside other API stabilization.

---

## 11. Referências citadas (todos os arquivos do inventário)

### Vite (`referencias/vite/`)

#### Core (deep read in full)
- `packages/vite/src/node/deprecations.ts:1-105` — `warnFutureDeprecation`, `isFutureDeprecationEnabled`, `ignoreDeprecationWarnings`, deprecation code → docs URL map; §3.1, §4.1, §4.3, §6, §7.1, §7.3, §8

#### Support (selective read)
- `packages/vite/src/node/config.ts:420-547` — `FutureOptions` schema, `experimental`/`future`/`legacy` config field separation; §3.1, §5.1, §5.6
- `packages/vite/src/node/build.ts` — consumer of `warnFutureDeprecation`; §3.1
- `packages/vite/src/node/server/index.ts` — consumer; §3.1
- `packages/vite/src/node/server/hmr.ts` — consumer; §3.1
- `packages/vite/src/node/server/pluginContainer.ts` — consumer; §3.1
- `packages/vite/CHANGELOG.md` — BREAKING CHANGES sections, deprecation rollout entries (selective grep); §4, §8

### Rails (`referencias/rails/`)

#### Core (deep read in full)
- `activesupport/lib/active_support/deprecation.rb:1-81` — `Deprecation` class entry, `deprecation_horizon`, singleton + per-gem instances; §3.2, §5
- `activesupport/lib/active_support/deprecation/behaviors.rb:1-148` — 6-behavior dispatcher, `DEFAULT_BEHAVIORS` lambdas; §3.2, §4.2, §5.2, §7.1
- `activesupport/lib/active_support/deprecation/reporting.rb:1-162` — `warn`, `silence`, `allow`, callstack extraction, `deprecation_message` formatter; §3.2, §4.2, §7.2, §8

#### Support (selective read)
- `activesupport/lib/active_support/deprecation/disallowed.rb:1-54` — `disallowed_warnings` matcher; §3.2, §5.5, §7.4
- `activesupport/lib/active_support/deprecation/method_wrappers.rb:1-68` — `deprecate_methods` macro; §3.2
- `activesupport/lib/active_support/deprecation/constant_accessor.rb:1-74` — deprecated constant proxy; §3.2
- `activesupport/lib/active_support/deprecation/deprecators.rb:1-104` — multi-deprecator registry (one per gem); §3.2, §5
- `activesupport/lib/active_support/deprecation/proxy_wrappers.rb:1-189` — deprecated-object/method proxies; §3.2
- `activesupport/lib/active_support/core_ext/module/deprecation.rb` — Ruby module-level `deprecate` macro; §3.2

### Next.js (`referencias/next.js/`)

#### Core (selective)
- `packages/next-codemod/bin/upgrade.ts:1-120` — version resolution, codemod orchestration, `optionalNextjsPackages` list, `resolveSemanticRevision`, `loadHighestNPMVersionMatching`; §3.3, §4.5, §7 (npm view sort gotcha), §8
- `packages/next-codemod/bin/next-codemod.ts` — CLI entry; §3.3
- `packages/next-codemod/bin/transform.ts` — jscodeshift runner wrapper; §3.3
- `packages/next-codemod/bin/agents-md.ts` — agents-md/MCP integration scaffold; §3.3, §4.4

#### Support
- `packages/next-codemod/lib/run-jscodeshift.ts` — internal jscodeshift driver; §3.3
- `packages/next-codemod/lib/handle-package.ts` — package-manager detection (pnpm/npm/yarn/bun); §3.3
- `packages/next-codemod/transforms/next-async-request-api.ts` — sample transform (selective); §3.3
- `packages/next-codemod/transforms/built-in-next-font.ts` — sample transform (selective); §3.3
- `packages/next-codemod/transforms/metadata-to-viewport-export.ts` — sample transform (selective); §3.3
- `packages/next-codemod/README.md:1-9` — short overview; §3.3

#### Doc
- `docs/01-app/02-guides/upgrading/version-15.mdx:1-100` — async request APIs migration, `UnsafeUnwrappedCookies` escape hatch documentation, codemod usage; §3.3, §4.4, §8
- `docs/01-app/02-guides/upgrading/version-16.mdx:1-199` — Turbopack-by-default migration, MCP-driven upgrade, `--webpack` opt-out, `experimental.turbopack` → top-level `turbopack` migration; §3.3, §4.4, §4.5, §5.5
- `docs/01-app/02-guides/upgrading/codemods.mdx` — full codemod catalog; §3.3
- `docs/01-app/02-guides/upgrading/index.mdx` — upgrade landing page; §3.3

### Astro (`referencias/astro/`)

#### Core
- `packages/astro/src/core/csp/config.ts:1-90` — Zod schema for CSP directives, `scriptDirective`/`styleDirective` separation, allowed-directives whitelist; §3.4, §5.6
- `packages/astro/src/core/csp/runtime.ts:1-60` — `deduplicateDirectiveValues`, `pushDirective` runtime; §3.4

#### Support
- `packages/astro/src/core/csp/common.ts` — shared types/constants; §3.4
- `packages/astro/src/runtime/server/render/csp.ts` — runtime CSP attachment to render; §3.4

#### Doc
- `.changeset/improve-csp-validation-messages.md:1-6` — example of a patch-level CSP improvement; §3.4
- `packages/astro/CHANGELOG.md` — selective grep for CSP rollout (experimental→stable migration text + before/after diffs); §3.4, §8

### TanStack Router (`referencias/tanstack-router/`)

#### Doc
- `docs/start/framework/react/migrate-from-next-js.md` — migration-FROM doc structure; §3.5, §4.7, §7.3
- `docs/router/how-to/migrate-from-react-router.md` — same shape; §4.7
- `docs/router/installation/migrate-from-react-router.md` — same shape; §4.7
- `docs/router/installation/migrate-from-react-location.md` — same shape; §4.7

### URLs externas

- `https://vite.dev/changes/<deprecation-code>` — Vite's pattern of per-deprecation docs URL; referenced in `deprecations.ts:74`
- `https://nextjs.org/docs/canary/app/building-your-application/upgrading/version-15` — Next.js migration guide URL pattern; referenced in `bin/upgrade.ts:77`
- `https://modelcontextprotocol.io` — MCP protocol Next.js uses for DevTools-driven upgrades; referenced in `version-16.mdx:12`

---

## Verdict

**The 0.3.0 cutover is a playbook execution, not a flag flip.** The prior art gives us a clear recipe:

1. **Vite's per-flag opt-in `'warn'` mode + structured payload + docs URL + `warnOnce`** is the warning mechanism shape.
2. **Rails's `disallowed_warnings` + `disallowed_behavior`** is the in-app escalation mechanism we add for CI gating before the cutover.
3. **Next.js's codemod tool is NOT the right shape for us** — our changes are config-shape stable, so a lint-only `theokit check --upgrade-readiness 0.3` is the right tool, not a jscodeshift transform.
4. **Astro's `scriptDirective`/`styleDirective` separation** is the API surface we add when Phase 4 nonce machinery lands.
5. **Next.js's `UnsafeUnwrappedCookies` deterrent-named cast pattern** validates that `defineRoute({ csrf: false })` + `cspMode: 'report-only'` are well-shaped escape hatches.
6. **Every framework that pulled off a cutover gracefully ran a beta channel first.** TheoKit's `0.3.0-beta.0` on `next` tag is non-negotiable.

The implementation cost (2-3 sprints + 4-6 weeks of warn-mode telemetry) is real but bounded. The risk of skipping any of the 8 phases above is asymmetrically larger than the cost of doing them all. The 6 pre-reqs in `CLAUDE.md` 0.3.0 are now backed by concrete prior art — anyone re-litigating that timeline has to argue against the file:line evidence in this doc.

Next concrete action: ship the `useAgentStream` hotfix in 0.2.1 (Phase 1 BLOCKING). 30 minutes of work. Without it, every subsequent step is theatre.
