# Reference: Framework Zero-Config Integration

**Date:** 2026-05-22
**Depth:** exhaustive
**Frameworks analyzed:**
- Next.js 15.x (`referencias/next.js/`, monorepo packages: `next`, `next-env`)
- Astro 5.x (`referencias/astro/`, monorepo packages: `astro`, `integrations/react`, `integrations/tailwind` — deprecated)
- Nuxt 4.x (`referencias/nuxt/`, monorepo packages: `nuxt`, `kit`, `schema`, `vite`)
- Vite 7.x (`referencias/vite/`, base bundler used by Astro/Nuxt/SvelteKit/TheoKit)
- SvelteKit 2.x (`referencias/sveltekit/`)
- Remix 2.x (`referencias/remix/` — minimal env handling, mostly delegates)

**TheoKit package affected:**
- `packages/theo/src/config/load-config.ts` (env auto-load)
- `packages/theo/src/vite-plugin/index.ts` (Tailwind/PostCSS auto-config)
- `packages/theo/src/cli/commands/build.ts` + `dev.ts` (state cleanup)
- `packages/theo/src/server/define-agent-tool.ts` (plugin auto-config — `@usetheo/ui` integration)
- `packages/create-theo/templates/default/` (downstream effect: cleaner scaffolds)

**Related references:**
- [`devtools.md`](devtools.md) — Vite plugin auto-injection pattern (already in TheoKit)
- [`server-components-rsc.md`](server-components-rsc.md) — `@vitejs/plugin-rsc` pattern (auto-config precedent)

---

## 1. Problem statement

**What:** TheoKit ships 5 framework-level polish bugs surfaced by item #6 (`examples/full-stack-agent`) end-to-end testing on 2026-05-22:

1. **TheoUI styling broken out of the box** — copying `tailwind.config.ts` + `postcss.config.js` from `fixtures/template-default/` was required. A consumer who runs `npm create theokit my-app && pnpm dev` and adds `import { Button } from '@usetheo/ui'` to a page sees unstyled output. The `@usetheo/ui` package wires Tailwind classes into its components but TheoKit's Vite plugin does not configure PostCSS with the `tailwindcss` plugin when `@usetheo/ui` is detected in the dependency graph.

2. **`.env` not auto-loaded into `process.env` for server code** — the example needed a hand-rolled `server/_env.ts` shim that runs `readFileSync('.env')` + manual `process.env[k] = v` before `server/routes/chat.ts` reads `process.env.OPENROUTER_API_KEY`. Vite loads `.env` only into `import.meta.env` (for the client bundle) — `process.env` for server code is empty unless the consumer ships their own dotenv loader.

3. **Agent registry cruft accumulates without cleanup** — 52+ orphan `.theokit/agents/<id>/` directories piled up in the example workspace. TheoKit has no equivalent of `next clean`, no LRU cleanup, no GC mechanism. Long-lived dev sessions slowly waste disk.

4. **OpenRouter model slug rot is in framework defaults** — the default `MODEL_ID` constant inside `server/routes/chat.ts` referenced `anthropic/claude-3.5-sonnet` (deprecated by OpenRouter). Defaults shipped in fixtures/templates rot. This needs to be an **opt-out test fixture** problem, not a framework-default problem — but the underlying pattern is plugin defaults should be declared in one place and resolved at runtime.

5. **`@usetheo/ui` is not auto-configured as a Vite plugin** — adding `@usetheo/ui` to dependencies should be enough; the consumer should not need to wire Tailwind config + PostCSS config + content globs. This is the **integration auto-configuration** problem that Astro solved with `defineIntegration` and Nuxt solved with `defineNuxtModule`.

**Current state:**
- `packages/theo/src/config/load-config.ts` does NOT load `.env` files — only loads `theo.config.ts` via dynamic import.
- `packages/theo/src/vite-plugin/index.ts` does NOT detect `@usetheo/ui` or configure Tailwind/PostCSS.
- `packages/theo/src/cli/commands/build.ts` does NOT clean `.theo/` or `.theokit/` directories — relies on overwrite.
- `packages/theo/src/cli/commands/dev.ts` does NOT clean orphan agent registries.
- No `definePlugin` API for `@usetheo/ui` to wire itself.

**Why now:** Item #6 (`example-full-stack-agent`) shipped successfully but exposed these gaps. A new TheoKit user hitting `pnpm create theokit my-app && pnpm dev` with a TheoUI component will see broken styles. This kills the "Build the app your agent lives in" first-impression promise. Closing these 5 gaps is the precondition for declaring 0.3.0 ship-ready for indie devs.

---

## 2. Inventário completo de arquivos (mandatório)

### Next.js — inventário

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `packages/next-env/index.ts` | core | 180 | ✅ | §3.1, §6, §8 |
| `packages/next/src/build/index.ts` (env+clean blocks) | core | excerpt 1121-1130, 3936 | seletivo | §3.1, §7 |
| `packages/next/src/lib/find-config.ts` | core | 101 | ✅ | §3.1, §6 |
| `packages/next/src/build/webpack/config/blocks/css/plugins.ts` | core | 246 | ✅ | §3.1, §4, §7 |
| `packages/next/src/build/webpack/config/blocks/css/index.ts` | support | n/a | seletivo (only imports) | §3.1 |
| `packages/next/src/server/next-server.ts` (env reload block) | support | n/a | seletivo | §3.1 |
| `packages/next/src/cli/next-build.ts` | support | n/a | seletivo (CLI entry) | §3.1 |
| `packages/next/src/cli/next-dev.ts` | support | n/a | seletivo (CLI entry) | §3.1 |
| `packages/next/src/server/config-shared.ts` | doc | n/a | seletivo (postcss type) | §3.1 |

### Astro — inventário

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `packages/astro/src/env/env-loader.ts` | core | 101 | ✅ | §3.2, §4 |
| `packages/astro/src/core/fs/index.ts` | core | 93 | ✅ | §3.2, §7 |
| `packages/astro/src/core/build/static-build.ts` (emptyDir) | core | excerpt 118 | seletivo | §3.2, §7 |
| `packages/astro/src/types/public/integrations.ts` | core | excerpt 416-423 | seletivo | §3.2, §5, §6 |
| `packages/integrations/react/src/index.ts` | core | 200+ | ✅ (canonical pattern) | §3.2, §5, §7 |
| `packages/astro/src/core/viteUtils.ts` | support | n/a | seletivo (postcss config) | §3.2 |
| `packages/astro/src/core/create-vite.ts` | support | n/a | seletivo | §3.2 |
| `packages/integrations/tailwind/README.md` | doc | 39 | ✅ | §3.2, §5 (DEPRECATED) |

### Nuxt — inventário

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `packages/kit/src/loader/config.ts` | core | 175 | ✅ | §3.3 |
| `packages/kit/src/module/define.ts` | core | 165 | ✅ | §3.3, §5, §6, §7 |
| `packages/nuxt/src/core/cache.ts` | core | 338 | ✅ | §3.3, §7 (LRU pattern) |
| `packages/kit/src/module/install.ts` | support | n/a | seletivo | §3.3 |
| `packages/kit/src/index.ts` | doc | n/a | seletivo (re-exports) | §3.3 |

### Vite — inventário

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `packages/vite/src/node/env.ts` | core | 117 | ✅ | §3.4, §4 |
| `packages/vite/src/node/plugins/css.ts` (postcss block) | core | excerpt 1925-1979 + 1518 | seletivo | §3.4, §4, §6 |
| `packages/vite/src/node/plugins/forwardConsole.ts` | doc | n/a | seletivo (apply: serve example) | §3.4 |

### SvelteKit — inventário

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `packages/kit/src/exports/vite/utils.js` (get_env) | core | excerpt 60-77 | seletivo | §3.5 |
| `packages/kit/src/exports/vite/index.js` | support | n/a | seletivo | §3.5 |

### Remix — inventário

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| (Remix does NOT ship env auto-load — consumer wires dotenv manually) | — | — | n/a | §3.6 |

### Arquivos avaliados e descartados (com motivo)

| File | Why discarded |
|---|---|
| `packages/next/test/development/basic/tailwind-jit.test.ts` | Test of feature, not feature impl |
| `packages/next/test/e2e/postcss-config-*` (3 files) | E2E tests of behavior, not source — already covered by §8 edge cases |
| `packages/next/examples/with-*/tailwind.config.ts` (9 files) | Example projects, not framework source |
| `packages/astro/test/fixtures/middleware-tailwind/` | Test fixture, not source |
| `packages/astro/test/fixtures/tailwindcss/` | Test fixture, not source |
| `packages/astro/e2e/fixtures/tailwindcss/` | E2E fixture, not source |
| `packages/nuxt/scripts/release.ts`, `scripts/_utils.ts`, `scripts/update-changelog.ts` | Maintainer tooling, not framework runtime |
| `packages/nuxt/test/*.test.ts` (bundle, matrix, server-components, basic, external-vue-resolution) | Tests, not source |
| `packages/sveltekit/.../runtime/server/cookie.spec.js` | Spec file, not source |
| `packages/sveltekit/.../core/sync/write_ambient.js` | Tangential — writes `$env/*` virtual modules, not env loading |
| `packages/sveltekit/.../utils/fork.js` | IPC utility, only references `process.env` via `child_process.fork` env arg |

---

## 3. Prior art — deep dive por framework

### 3.1 Next.js — version 15.x

#### API pública (env loading)

```ts
// packages/next-env/index.ts:114
export function loadEnvConfig(
  dir: string,
  dev?: boolean,
  log: Log = console,
  forceReload = false,
  onReload?: (envFilePath: string) => void
): LoadedEnvFiles
```

#### Algoritmo interno (env loading, prosa)

1. **Cache check** (`next-env/index.ts:114-130`): module-level `combinedEnv`, `cachedLoadedEnvFiles`, `previousLoadedEnvFiles`. If already loaded and `!forceReload`, return cached.
2. **File order** (`next-env/index.ts:135-148`): `.env.{dev|production}.local`, `.env.local` (skipped if mode=test), `.env.{mode}`, `.env`. Priority = first-found-wins (top wins).
3. **Parse + expand**: each file → `dotenv.parse()`; then `dotenv-expand` resolves `${VAR}` references within the merged set. Process.env vars stay untouched by expansion.
4. **`replaceProcessEnv` mutation**: walks new `combinedEnv`, sets `process.env[key] = value`. Then walks `previousLoadedEnvFiles` and `delete process.env[key]` for keys that **disappeared** between reloads — but only if key doesn't start with `__NEXT_PRIVATE`.
5. **Set `__NEXT_PROCESSED_ENV='true'` sentinel** — prevents downstream double-load.
6. **Telemetry/log**: prints `info  - Loaded env from /path/.env.local`.

#### Estado mantido

- Module-level `combinedEnv: Record<string, string> | undefined` — final merged env.
- `cachedLoadedEnvFiles: LoadedEnvFiles` — files loaded this cycle.
- `previousLoadedEnvFiles: LoadedEnvFiles` — for delete-key diff on reload.
- `process.env.__NEXT_PROCESSED_ENV = 'true'` — sentinel.

#### Dependências externas usadas

| Lib | Versão | Para quê | TheoKit pode adotar? |
|---|---|---|---|
| `dotenv` | (vendored in `next/dist/compiled/dotenv`) | `.env` file parsing | **Adotar direto** (12kb gzip, RFC-stable format) |
| `dotenv-expand` | (vendored) | `${VAR}` reference expansion within `.env` | **Adotar** se TheoKit suportar variable expansion (Vite/SvelteKit já adotam) |

#### Side effects observáveis

- Mutates `process.env` directly (adds new keys, removes keys that disappeared between reloads).
- Calls `onReload(envFilePath)` callback per file loaded — used by dev server to invalidate module cache.
- Module-level cache survives across `require()` calls.

#### TODOs / FIXMEs / HACKs literais

> No TODOs/FIXMEs in `next-env/index.ts`. The code is mature.

#### Padrão de design

- **Pattern: Module-level singleton cache + idempotent mutator function**
- **Pattern: Reload-with-diff** — re-reading `.env` deletes keys that vanished, preserving fresh state.

#### API pública (postcss/css)

```ts
// packages/next/src/build/webpack/config/blocks/css/plugins.ts:116
export async function getPostCssPlugins(
  dir: string,
  supportedBrowsers: string[] | undefined,
  disablePostcssPresetEnv: boolean = false,
  useLightningcss: boolean = false
): Promise<import('postcss').AcceptedPlugin[]>
```

#### Algoritmo interno (postcss/css)

1. **`findConfig(dir, 'postcss')`** (`find-config.ts:34-100`): walks up filesystem looking for `package.json` `postcss` key first, then `.postcssrc.json`, `postcss.config.{js,mjs,cjs}`, etc.
2. **No config found** (`plugins.ts:127-133`): inject default plugins — `postcss-flexbugs-fixes` + `postcss-preset-env` with `browsers: ['defaults']`, `autoprefixer: { flexbox: 'no-2009' }`, `stage: 3`. Tailwind is **NOT** in the default plugins — Next.js expects the user to opt in by creating `postcss.config.js` with `tailwindcss: {}`.
3. **Config found**: validate `plugins` key exists. Reject function-style configs (`plugins.ts:135-140`). Walk plugins, lazy-load each via `createLazyPostCssPlugin`.
4. **Ignored plugins** (`plugins.ts:26-43`): hard-blocks `postcss-modules-*` (Next.js auto-configures CSS modules itself).

#### Padrão de design (postcss)

- **Pattern: Config probe + default fallback**
- **Pattern: Lazy plugin loading** — `createLazyPostCssPlugin` defers `require()` until plugin is actually used.

#### Algoritmo interno (`.next/` cleanup)

1. (`build/index.ts:1121-1130`): `if (config.cleanDistDir && !isGenerateMode)` → `recursiveDeleteSyncWithAsyncRetries(distDir, /^(cache|dev|lock|trace)/)`.
2. **Allowlist-preserve**: regex matches files/dirs to **keep** during clean. Everything else in `.next/` is deleted. Preserved: `cache/` (Turbopack/Webpack persistent cache), `dev/` (dev artifacts), lock files, `trace` (telemetry).
3. **Default**: `config.cleanDistDir` defaults to `true` — every `next build` cleans by default.

#### Padrão de design (state cleanup)

- **Pattern: Allowlist-preserve cleanup** — delete everything except the named exceptions.
- **Pattern: Cleanup-on-build, not cleanup-on-dev** — dev server reuses cache; only build wipes it.

---

### 3.2 Astro — version 5.x

#### API pública (env loading)

```ts
// packages/astro/src/env/env-loader.ts:87
export const createEnvLoader = (options: EnvLoaderOptions) => ({
  get: () => loaded,            // returns full env
  getPrivateEnv: () => privateEnv, // returns secret-tier env
})
```

#### Algoritmo interno (env loading)

1. **Delegates to Vite**: `loadEnv(mode, config.vite.envDir ?? fileURLToPath(config.root), '')` — Astro uses Vite's `loadEnv` as the source-of-truth file loader (3rd-arg `''` = no prefix filter, all keys loaded).
2. **Public/private tier separation** (`env-loader.ts:31-69`): walks all keys, classifies:
   - `secret` keys from `config.env.schema` → always private (regardless of envPrefix).
   - keys matching `envPrefix` (default `PUBLIC_`) → public (handled by Vite's normal `import.meta.env.PUBLIC_*` injection).
   - rest → private (`JSON.stringify`d, fed into `process.env`-like server bundle).
3. **Refresh on every get**: `get()` re-runs `getEnv()` — Astro re-checks `process.env` in case integrations mutated it between bootstrap and runtime.

#### Padrão de design (Astro env)

- **Pattern: Three-tier env model** — public (client-visible), private (server-only), secret (schema-declared).
- **Pattern: Delegate file loading, own classification** — Vite owns the dotenv-expand mechanics; Astro layers the public/private/secret semantic on top.

#### API pública (Astro integration)

```ts
// packages/astro/src/types/public/integrations.ts:416-423
export interface AstroIntegration {
  name: string;
  hooks: {
    'astro:config:setup'?: (ctx: SetupContext) => void | Promise<void>;
    'astro:config:done'?: (ctx: DoneContext) => void | Promise<void>;
    // ... 10+ other lifecycle hooks
  };
}
```

#### Algoritmo interno (integration — `@astrojs/react` as canonical example)

1. **Detect runtime** (`integrations/react/src/index.ts:166-170`): on integration init, check React major version. Throw if unsupported.
2. **`astro:config:setup` hook** (`integrations/react/src/index.ts:175-187`):
   - `addRenderer(getRenderer(versionConfig))` — registers JSX renderer with Astro core.
   - `updateConfig({ vite: getViteConfiguration(...) })` — **injects Vite plugins into the consumer's resolved Vite config without the consumer wiring anything**. This is the load-bearing primitive.
   - `injectScript('before-hydration', preamble)` — adds runtime scripts at known lifecycle points.
3. **`astro:config:done` hook** (`integrations/react/src/index.ts:188-199`):
   - Lints user config for ambiguity (e.g., warns if 2+ JSX renderers active without `include`/`exclude`).

#### Estado mantido (integration)

- `IntegrationHooks` registry inside Astro's core — keyed by integration name.
- Each integration is a closure capturing its `ReactIntegrationOptions`.

#### Padrão de design (integration)

- **Pattern: Hook-based lifecycle with config-mutating API** — integrations don't generate config files; they mutate the live config object at known lifecycle points.
- **Pattern: Integration is closure** — `export default function (options) { return { name, hooks } }` — options captured in closure, hooks see them via lexical scope.

#### Algoritmo interno (state cleanup)

1. (`core/build/static-build.ts:118`): `emptyDir(settings.config.outDir, new Set('.git'))` — at build start.
2. **`emptyDir`** (`core/fs/index.ts:23-45`): `fs.readdirSync(dir)`, for each file: skip if in skip-set, else `fs.rmSync(p, { recursive: true, force: true, maxRetries: 3 })`.
3. **Skiplist**: hardcoded `'.git'` only. Astro's `outDir` is the consumer's published output (default `dist/`).

#### Padrão de design (Astro cleanup)

- **Pattern: Skiplist-empty (opposite of Next.js's allowlist-preserve)** — Astro wipes everything except `.git`. Next.js keeps cache/dev/lock/trace.
- **Difference**: Astro's `outDir` is the **publish target** (no cache lives there). Next.js's `.next/` is **build cache + publish target combined** — must preserve cache.

#### Tailwind integration (DEPRECATED — historical reference)

`packages/integrations/tailwind/README.md:1-7`:
> ⚠️ This integration is deprecated. Tailwind CSS now offers a Vite plugin which is the preferred way to use Tailwind 4 in Astro.

**Historical Astro pattern (pre-v5)**: `@astrojs/tailwind` integration ran in `astro:config:setup`, called `updateConfig({ vite: { plugins: [tailwindcss()] } })`, and generated a default `tailwind.config.mjs` if missing.

**Current Astro pattern (v5)**: consumer adds `@tailwindcss/vite` plugin directly to `astro.config.mjs` `vite.plugins`. Tailwind owns its own Vite plugin.

---

### 3.3 Nuxt — version 4.x

#### API pública (config + env loading)

```ts
// packages/kit/src/loader/config.ts:28
export async function loadNuxtConfig(opts: LoadNuxtConfigOptions): Promise<NuxtOptions>
```

#### Algoritmo interno (config + env loading)

1. **Layer discovery** (`loader/config.ts:29-35`): glob `layers/*` directories — Nuxt supports inheriting config from `layers/foo/`, `layers/bar/`. Each layer can be a partial Nuxt project.
2. **Dotenv via c12** (`loader/config.ts:38-43`): `await setupDotenv({ cwd, ...opts.dotenv })` — delegates to `unjs/c12` package's `setupDotenv` (which wraps `dotenv` + `dotenv-expand` internally).
3. **Config load via c12** (`loader/config.ts:47-58`): `loadConfig({ name: 'nuxt', configFile: 'nuxt.config', rcFile: '.nuxtrc', ... })` — c12 finds, parses, and merges:
   - `nuxt.config.{ts,js,mjs}` from `cwd`
   - Layers from `_extends` key
   - `.nuxtrc` rc-file (TOML-like)
   - Inline `opts.overrides`
4. **Merger strategy** (`loader/config.ts:21-26`): custom `createDefu` — arrays **concat** instead of replace (unusual; reflects Nuxt's "additive plugins" mental model).
5. **Default `buildDir` resolution** (`loader/config.ts:78-81`): if `.nuxt` exists at root, use `node_modules/.cache/nuxt/.nuxt` — **builds default to package-local cache dir, not project root**. Anti-pollution.

#### Padrão de design (Nuxt config)

- **Pattern: Layered config via c12** — Nuxt outsources the load+merge pipeline to a single specialist package (c12).
- **Pattern: Build dir in `node_modules/.cache/`** — defaults to cache-local, not project-local. Avoids polluting consumer's repo with build artifacts.

#### API pública (Nuxt module — `defineNuxtModule`)

```ts
// packages/kit/src/module/define.ts:13
export function defineNuxtModule<TOptions extends ModuleOptions>(
  definition: ModuleDefinition<TOptions>
): NuxtModule<TOptions, TOptions, false>
```

#### Algoritmo interno (module setup)

1. **Wrap definition** (`module/define.ts:44-49`): if `definition` is a function, treat as `{ setup: function }`. Then merge with `{ meta: {} }` default.
2. **`getOptions(inline, nuxt)`** (`module/define.ts:54-76`): resolves options in priority:
   - `inlineOptions` (passed via `nuxt.config.modules: [['my-module', { foo: 1 }]]`)
   - `nuxt.options[configKey]` (top-level `nuxt.config.myModule: { foo: 1 }`)
   - `module.defaults` (callable or object)
   - Apply schema if `module.schema` declared.
3. **Duplicate-install guard** (`module/define.ts:91-99`): `nuxt.options._requiredModules[uniqueKey]` — prevents same module installing twice.
4. **Compatibility check** (`module/define.ts:101-114`): `checkNuxtCompatibility(meta.compatibility, nuxt)` — module declares `compatibility: { nuxt: '>=4' }`, kit checks at install time. Behavior: warn or throw based on `experimental.enforceModuleCompatibility`.
5. **Hooks auto-registered** (`module/define.ts:120-122`): `module.hooks` → `nuxt.hooks.addHooks(module.hooks)` automatically.
6. **Setup called with resolved opts** (`module/define.ts:130`): `module.setup?.call(null, _options, nuxt)`.
7. **Performance tracking** (`module/define.ts:126-141`): wraps setup in `nuxt._perf?.startPhase`. Warns if setup > 5000ms.

#### Padrão de design (Nuxt module)

- **Pattern: Options resolution by precedence** — inline > consumer config > module defaults > schema.
- **Pattern: Duplicate-install idempotency** — `_requiredModules` registry.
- **Pattern: Compatibility manifest enforced at install** — module declares peer-version requirements; kit verifies.

#### Algoritmo interno (cache cleanup — `cleanupCaches`)

1. (`core/cache.ts:96-113`): `glob('*/*.tar', '*/*.buildid', { cwd: getCacheDir(nuxt) })` — list all cached tarballs + buildId files.
2. **LRU policy** (`core/cache.ts:102-109`): if `caches.length >= 10`, sort by mtime ascending, `unlink` the oldest `(N - 10)` entries.
3. **`getCacheDir`** (`core/cache.ts:326-337`): default `<workspaceDir>/node_modules/.cache/nuxt/builds` — falls back to first existing `modulesDir` if `workspaceDir/node_modules` doesn't exist.
4. **What's cached**: full Vue client + server builds tarred via `nanotar`. Cache key = `ohash(layers + config + source files)`.

#### Padrão de design (Nuxt cleanup)

- **Pattern: LRU with hard cap (10)** — keep N most-recent, delete older. No time-based expiry.
- **Pattern: Content-addressed cache** — cache key = stable hash of inputs; cache miss = no false-positive reuse.
- **Pattern: Cache lives in `node_modules/.cache/<framework>/`** — Nuxt's strong opinion: framework state belongs in node_modules cache, not project root.

#### Dependências externas usadas

| Lib | Versão | Para quê | TheoKit pode adotar? |
|---|---|---|---|
| `c12` | unjs ecosystem | Config loading + .env + layer merging | **Avaliar** — heavyweight (also pulls `confbox`, `pkg-types`, `rc9`). For TheoKit's narrower scope, `dotenv` + custom loader may be lighter. |
| `unjs/dotenv` (via c12) | bundled | `.env` parsing | **Adotar via direct dependency** |
| `defu` | unjs | Deep-merge with array concat | **Adotar** if TheoKit needs deep-merge config |
| `ohash` | unjs | Content-stable hashing | **Adotar** for content-addressed agent registry cache |
| `nanotar` | unjs | Tarball read/write for cache | **Não adotar** — TheoKit doesn't cache build artifacts. |

---

### 3.4 Vite — version 7.x (base layer used by all the above)

#### API pública (env loading)

```ts
// packages/vite/src/node/env.ts:28
export function loadEnv(
  mode: string,
  envDir: string | false,
  prefixes: string | string[] = 'VITE_'
): Record<string, string>
```

#### Algoritmo interno (Vite env loading)

1. **`getEnvFilesForMode(mode, envDir)`** (`env.ts:12-26`): generates 4 paths — `.env`, `.env.local`, `.env.{mode}`, `.env.{mode}.local`.
2. **Parse each file** (`env.ts:48-57`): uses **Node's built-in `node:util.parseEnv`** (experimental but stable in Node 22.12+). Falls through for missing files (allows FIFOs for 1Password integration).
3. **NODE_ENV/BROWSER capture** (`env.ts:62-71`): if `.env` sets `NODE_ENV`, store in `process.env.VITE_USER_NODE_ENV` (Vite-namespaced). Same for `BROWSER`, `BROWSER_ARGS` env vars.
4. **`dotenv-expand` reference expansion** (`env.ts:75-76`): clones `process.env` into local var, expands `${X}` references within `parsed`. **Does NOT pollute global `process.env`** (this is the key Vite design choice).
5. **Prefix filter** (`env.ts:79-83`): only keys starting with `prefixes` (default `VITE_`) survive into return value.
6. **process.env override** (`env.ts:87-91`): real `process.env.VITE_*` (inline-provided) overrides `.env`-loaded values.

#### Padrão de design (Vite env)

- **Pattern: Client-only env exposure** — Vite's loadEnv returns ONLY `VITE_*`-prefixed vars. Server-only code that wants `.env` must read `process.env` directly OR call `loadEnv(mode, envDir, '')` with empty prefix.
- **Critical gap (TheoKit-relevant)**: Vite does NOT auto-populate `process.env` for server code. SvelteKit, Astro, Nuxt all add their own `.env → process.env` mutation layer ON TOP of Vite's `loadEnv`. **TheoKit is missing this layer.**

#### Algoritmo interno (PostCSS detection)

1. (`plugins/css.ts:1930-1979`): `resolvePostcssConfig(config)`.
2. **Inline config check** (`plugins/css.ts:1939-1947`): if `vite.config.css.postcss` is an object literal, use it directly.
3. **Filesystem search** (`plugins/css.ts:1948-1965`): otherwise, `postcssrc({}, searchPath, { stopDir: workspaceRoot })` from `postcss-load-config` package. Searches `postcss.config.*`, `.postcssrc`, `package.json#postcss` from `config.root` up to workspace root.
4. **Cache via WeakMap** (`plugins/css.ts:282-285, 1933-1937`): `postcssConfigCache.set(config, result)` — config object as key, result Promise as value. Idempotent across multiple compile passes.
5. **Warm cache** (`plugins/css.ts:308-313`): `resolvePostcssConfig(config).catch(()=>{})` fires at plugin construction time, not first CSS compile — primes the cache.

#### Padrão de design (Vite postcss)

- **Pattern: Inline-or-search precedence** — inline config wins; otherwise walk filesystem.
- **Pattern: WeakMap-keyed cache** — config object identity as cache key, naturally invalidated when config rebuilt.

#### Dependências externas usadas

| Lib | Versão | Para quê | TheoKit pode adotar? |
|---|---|---|---|
| `dotenv-expand` | ^11 | `${VAR}` reference expansion | **Sim** — same lib Next.js uses. |
| `postcss-load-config` | ^6 | Walk filesystem for `postcss.config.*` | **Sim, indirect via Vite** — TheoKit already runs Vite, so this is already in the dep tree. |
| `node:util.parseEnv` | Node 22.12+ | Parse `.env` file format | **Sim, IF we mandate Node 22.12+** (TheoKit already requires Node 22.12+ per item #3 T4.1 preflight). |
| `picocolors` | ^1 | Terminal colors | Already a TheoKit dep |

---

### 3.5 SvelteKit — version 2.x

#### API pública (env loading)

```js
// packages/kit/src/exports/vite/utils.js:69
export function get_env(env_config, mode) {
  const env = loadEnv(mode, env_config.dir, ''); // empty prefix = all keys
  return {
    public: filter_env(env, public_prefix, private_prefix),
    private: filter_env(env, private_prefix, public_prefix)
  };
}
```

#### Algoritmo interno (SvelteKit env)

1. **Delegate to Vite** (`vite/utils.js:71`): `loadEnv(mode, env_config.dir, '')` with empty prefix to get ALL keys.
2. **Two-tier filter** (`vite/utils.js:73-76`):
   - public = keys starting with `publicPrefix` (default `PUBLIC_`), excluding `privatePrefix`.
   - private = keys starting with `privatePrefix` (default empty `''`), excluding `publicPrefix`.
3. **Virtual modules** (separate file `core/sync/write_ambient.js`): generates `$env/static/public`, `$env/static/private`, `$env/dynamic/public`, `$env/dynamic/private` virtual modules that resolve to the filtered envs at compile/runtime.

#### Padrão de design (SvelteKit env)

- **Pattern: Two-tier with virtual modules** — typed `$env/*` imports replace `process.env.*` access in user code.
- **Pattern: Identical Vite delegation as Astro** — both frameworks treat Vite's loadEnv as the file loader, then layer their own classification.

---

### 3.6 Remix — version 2.x

#### Algoritmo interno (Remix env loading)

**Remix does NOT auto-load `.env`.** Consumers wire `dotenv/config` in their server entry (e.g., `server.js`) manually, or use `remix-development-tools` for dev-time loading. The framework intentionally does not own this layer.

#### Padrão de design (Remix env)

- **Pattern: Delegate to consumer / ecosystem** — Remix's philosophy is "stay close to web standards". `.env` is not a web standard, so framework doesn't enforce it.
- **Trade-off**: Less zero-config than peers, but ZERO surprise — what you see is what you get.

---

## 4. Convergent patterns (todos concordam)

1. **All frameworks except Remix auto-load `.env` files into `process.env` for server code.** Next.js (`next-env/index.ts:114`), Astro (`env-loader.ts:77` via Vite), Nuxt (`loader/config.ts:38-43` via c12), SvelteKit (`vite/utils.js:69-77` via Vite). **TheoKit must adopt this — it's the universal pattern.**

2. **All frameworks use `dotenv` + `dotenv-expand` (or vendored equivalent).** Even SvelteKit and Astro that "delegate to Vite" — Vite uses `dotenv-expand` (`vite/env.ts:5`). Adopting this lib is non-controversial.

3. **`.env` file priority is always: `.env.{mode}.local` > `.env.local` > `.env.{mode}` > `.env`.** Verified in Next.js (`next-env/index.ts:135-148`), Vite (`vite/env.ts:18-22`), and the same order propagates to Astro/SvelteKit/Nuxt via their Vite delegation.

4. **Plugin/integration/module registration is hook-based, not file-mutation.** Astro (`AstroIntegration.hooks`), Nuxt (`defineNuxtModule.setup`), and Vite plugins (`apply: 'serve'|'build'` + `configResolved`) all let the integration MUTATE config at known lifecycle points — never edit consumer's filesystem.

5. **All frameworks have a known cache dir convention.** Next.js `.next/cache/`, Astro `node_modules/.astro/`, Nuxt `node_modules/.cache/nuxt/builds/`, Vite `node_modules/.vite/`. **Common convention: `node_modules/.cache/<framework>/` is the modern choice (Nuxt 4, Vite). Project-root `.next/` is the legacy Next.js choice.**

6. **Build cleanup happens at build start, not at build end.** Next.js (`build/index.ts:1121`), Astro (`core/build/static-build.ts:118`) both clean the output dir BEFORE running the build, not after. Rationale: incremental rebuilds need the previous output around until the new one succeeds.

7. **`postcss-load-config` is the de-facto standard for PostCSS config discovery.** Both Vite (`plugins/css.ts:5`) and Next.js (via its own `find-config.ts`) implement the same protocol — search for `postcss.config.*` or `package.json#postcss` or `.postcssrc.*`.

---

## 5. Divergent patterns (trade-off real)

1. **Env-loading delegation strategy**
   - Next.js: owns the entire pipeline in `next-env/index.ts` — no Vite delegation (uses Webpack natively).
   - Astro / SvelteKit: delegate file loading to `Vite.loadEnv`, layer public/private/secret classification on top.
   - Nuxt: delegates entirely to `c12` (which wraps dotenv).
   - **TheoKit choice:** **Direct dependency on `dotenv` + `dotenv-expand`** — same as Next.js. Reason: TheoKit's Vite plugin runs at consumer's `vite.config.ts`, but TheoKit's CLI commands (`theokit dev`, `theokit build`, `theokit start`) need env loaded BEFORE Vite spins up. Going through Vite's `loadEnv` creates a chicken-and-egg problem. Also, c12 is heavyweight for our narrower scope.

2. **State cleanup philosophy**
   - Next.js: **allowlist-preserve** — wipe `.next/` except `cache/`, `dev/`, `lock`, `trace`. Pragmatic — preserves expensive caches.
   - Astro: **skiplist-empty** — wipe `dist/` except `.git`. Pragmatic — `dist/` is publish-only, no cache lives there.
   - Nuxt: **LRU with hard cap (10)** — keep 10 most-recent tarred builds in `node_modules/.cache/nuxt/builds/`. Best for long-lived dev sessions.
   - **TheoKit choice:** **Hybrid by directory** —
     - `.theo/` (build output) → Astro pattern (empty on `theokit build` start, skip `.git`).
     - `.theokit/agents/<id>/` (runtime agent registry) → Nuxt LRU pattern (keep N most-recent, mtime-sorted). Default N = 100 (configurable).
     - Reason: build output is publish-target; agent registries are runtime cache. Different lifecycles, different policies.

3. **Plugin auto-configuration philosophy**
   - Astro / Nuxt: **integration APIs** (`AstroIntegration`, `defineNuxtModule`) — consumer adds 1 line to config, integration wires the rest (PostCSS, Vite plugins, hooks, etc.).
   - Next.js: **no integration API** — consumer must edit `next.config.js`, `postcss.config.js`, `tailwind.config.js` themselves. Next.js does inject default PostCSS plugins (`plugins.ts:127-133`) but **Tailwind is NOT auto-detected** — consumer must opt in via their `postcss.config.js`.
   - Modern Tailwind 4: **plugin-side auto-config** — `@tailwindcss/vite` is just a Vite plugin; consumer adds it to `vite.plugins`. No framework integration needed. Tailwind owns its own surface.
   - **TheoKit choice:** **Plugin-side auto-config (Tailwind 4 / @vitejs/plugin-rsc pattern)** — `@usetheo/ui` ships its own Vite plugin (`@usetheo/ui/vite-plugin` or sub-export). When the user adds `@usetheo/ui` to dependencies, TheoKit's vite-plugin AUTO-DETECTS the dep and AUTO-ADDS the `@usetheo/ui` Vite plugin to the resolved Vite config. Consumer touches nothing. Reason: matches Astro's "consumer adds integration, framework wires Vite" outcome, but without inventing a new TheoKit integration API.

4. **`tailwindcss` auto-detection scope**
   - Next.js: never auto-detects Tailwind. User must add it to `postcss.config.js`.
   - Astro v5: deprecated `@astrojs/tailwind` — user adds `@tailwindcss/vite` to `astro.config.mjs` `vite.plugins`.
   - Vue/Vite: pure Vite — user adds `@tailwindcss/vite` to `vite.config.ts`.
   - **TheoKit choice:** **Auto-detect `@usetheo/ui` in `package.json` dependencies, auto-add `@tailwindcss/vite` and `@usetheo/ui/vite-plugin` to resolved Vite config.** Reason: `@usetheo/ui` ALWAYS uses Tailwind classes. If the consumer pulled in `@usetheo/ui`, they want Tailwind. Period. Auto-add is safe.

5. **`.env` exposure to bundles**
   - Next.js: Server env via `process.env` (Node-bundle), `NEXT_PUBLIC_*` via Webpack DefinePlugin (client bundle).
   - Vite/Astro/SvelteKit: client env via `import.meta.env.VITE_*`, server via `process.env` directly (if loaded into process.env).
   - **TheoKit choice:** **Vite pattern for client (`import.meta.env.THEO_PUBLIC_*`) + Next.js pattern for server (`process.env.*`).** Reason: matches existing TheoKit `envPrefix: 'THEO_PUBLIC_'` (already in `config/schema.ts`). The missing piece is **`.env → process.env` mutation for server code**.

---

## 6. Dependency inventory — bibliotecas comuns

Convergent libs (aparecem em 2+ frameworks):

| Lib | Frameworks que usam | Função | TheoKit decision |
|---|---|---|---|
| `dotenv` | Next.js (vendored), Vite-via-Node-parseEnv, Nuxt-via-c12, SvelteKit-via-Vite | `.env` file parsing | **Adotar direto** — 5kb gzip, RFC-stable, ubiquitous. Avoids depending on Vite's loadEnv (chicken-and-egg with TheoKit CLI startup). |
| `dotenv-expand` | Next.js (vendored), Vite (`env.ts:5`) | `${VAR}` reference expansion | **Adotar** — required to support `.env` with cross-refs (very common in real apps for `DATABASE_URL=postgresql://$DB_USER:$DB_PASS@host`). |
| `postcss-load-config` | Vite (`plugins/css.ts:5`) | Walk filesystem for `postcss.config.*` | **Adotar via Vite indirect** — TheoKit's vite-plugin already runs inside Vite. We extend Vite's config, we don't replace it. |
| `find-up` / equivalent | Next.js (`find-config.ts:16`, via compiled bundle) | Walk up directory tree for config file | **Adotar** — needed for finding `postcss.config.*`, `tailwind.config.*`, etc. when auto-configuring. Tiny (1kb), zero deps. |
| `defu` | Nuxt (`loader/config.ts:9, 21-26`) | Deep merge with array concat | **NÃO adotar** — TheoKit already has `deepMerge` in `config/load-config.ts` per Onda 21 §22.7. No need to swap. |
| `ohash` | Nuxt (`core/cache.ts:6`) | Content-stable hashing | **Avaliar** for content-addressed agent registry — currently TheoKit uses raw UUIDs. Content-hashing would give automatic dedupe. Defer to follow-up. |

Lighter-than-expected paths:

- **Don't use c12** — too heavyweight for our narrower scope (loadConfig + setupDotenv + layer merging). We already have layer-equivalent via `theo.config.{NODE_ENV}.ts` per Onda 21.

---

## 7. Algorithms / data structures não-óbvios

- **Reload-with-diff env mutation** (Next.js `next-env/index.ts` `replaceProcessEnv`): when `.env` is re-read (file watcher fires), the function not only ADDS new keys to `process.env`, it also DELETES keys that DISAPPEARED between reads. Naive merge would leak stale keys forever. Complexity: O(prev + new). **TheoKit should adopt this — dev sessions long enough to edit `.env` are common.**

- **LRU-by-mtime with hard cap** (Nuxt `core/cache.ts:96-113`): `glob('*.tar')`, `Promise.all(stat(f))` to get mtime, sort ascending, slice off first `(N - cap)` and `unlink`. Complexity: O(F log F) once per build. Falls back gracefully on stat errors via `.catch(() => 0)`. **TheoKit should adopt for `.theokit/agents/` GC.**

- **WeakMap-keyed config cache** (Vite `plugins/css.ts:282`): `postcssConfigCache: WeakMap<ResolvedConfig, Result>`. Using the config object identity as cache key means rebuilds (new config) naturally invalidate; no manual TTL. **TheoKit's vite-plugin can adopt this for any per-resolved-config computation.**

- **Lazy plugin loader** (Next.js `plugins.ts:45-60`): `createLazyPostCssPlugin` returns a plugin object whose `(...args)` invocation lazily `require()`s the actual plugin. Saves boot time when plugins are conditional. **Marginal TheoKit benefit — defer.**

- **`replaceProcessEnv` `__NEXT_PRIVATE` guard** (Next.js `next-env/index.ts` — implicit in delete loop): keys prefixed `__NEXT_PRIVATE` are preserved across reload diffs. TheoKit equivalent: preserve keys starting with `__THEOKIT_PRIVATE` or `THEOKIT_INTERNAL_`.

---

## 8. Edge cases conhecidos (com fonte)

| Edge case | Como manifesta | Onde foi corrigido | Como devemos prevenir |
|---|---|---|---|
| `.env` re-read leaves stale keys | User removes `OPENROUTER_API_KEY` from `.env`, restarts dev, but `process.env.OPENROUTER_API_KEY` still has old value (Node caches process.env across require). | Next.js `next-env/index.ts` `replaceProcessEnv` delete-keys-not-in-source logic | Adopt the same diff-and-delete pattern. |
| FIFO `.env` (1Password / SOPS integration) | User pipes `.env` from `op inject` — file is a named pipe, not a regular file. Naive `fs.statSync(file).isFile()` returns false → file skipped. | Vite `env.ts:51-52` `!stat.isFile() && !stat.isFIFO()` exception | Same guard. |
| `NODE_ENV` set in `.env` shadows mode detection | User has `NODE_ENV=production` in `.env`, runs `npm run dev` → `process.env.NODE_ENV='production'`, Vite mode='development' → mismatch causes build errors. | Vite `env.ts:62-64` — stashes parsed NODE_ENV in `VITE_USER_NODE_ENV` instead of overwriting `process.env.NODE_ENV` | TheoKit should adopt same — never let `.env`-set NODE_ENV override CLI-set NODE_ENV. |
| `.env` with `${VAR}` reference but `VAR` is set in real process.env | `DATABASE_URL=postgres://$USER:$PASS@host` where `USER` is shell-env, not `.env`-defined. Naive parse would treat `$USER` literal. | Vite `env.ts:75-76` — clones `process.env` into `processEnv`, passes to `dotenv-expand` so refs see real env. | Same — pass real process.env into dotenv-expand. |
| Tailwind classes inside `@usetheo/ui` package not picked up | Tailwind scans only consumer's `app/`, `src/`, etc. classes inside `node_modules/@usetheo/ui` are NEVER scanned → all UI components render unstyled. | Tailwind 4 plugin convention: package ships its own pre-compiled CSS layer + `@source` directives. | `@usetheo/ui` must ship pre-compiled CSS OR a Tailwind preset that adds `@usetheo/ui/dist/**` to content sources. Confirm during impl. |
| Build output dir is a symlink to non-existent target | Astro `outDir: /tmp/symlink → /missing/`. `emptyDir` would error. | Astro `core/fs/index.ts:24` — `if (!fs.existsSync(dir)) return undefined` | Same guard. |
| Build output dir contains a file Astro doesn't own (e.g., `.git/`, CI artifacts) | User has `.gitkeep` or CI-deposited file in `dist/`. Build cleanup blows it away. | Astro `core/build/static-build.ts:118` `emptyDir(outDir, new Set('.git'))` — skip set | TheoKit `.theo/` cleanup: skip `.git`, `.gitkeep`, any path starting with `.git`. |
| LRU cleanup races with concurrent build | Two `nuxt build` invocations run in parallel — both list 10 caches, both delete the oldest. Result: only 8 caches survive. | Nuxt does NOT lock — accepts the race (cache is regenerable). | TheoKit agent-registry GC: same posture. Lockless. Lose-an-agent-cache is recoverable. |
| Plugin auto-config conflicts with consumer's manual config | User adds `@usetheo/ui` AND has their own `tailwind.config.ts` that conflicts. | Astro `astro:config:done` lints for ambiguity (`react/index.ts:188-199` — warns about multiple JSX renderers). | TheoKit vite-plugin: detect existing `tailwind.config.{ts,js,mjs}` BEFORE injecting Tailwind plugin. If exists, log "Using your tailwind.config — extend with `@usetheo/ui/preset` for component styling". If not, generate minimal default. |
| `process.env.__NEXT_PROCESSED_ENV` set in CI clobbers fresh load | CI re-runs build in same process (rare but happens in monorepo). Without the sentinel, Next.js would skip env load. | Next.js `next-env/index.ts` — `forceReload: true` arg ignores sentinel. | TheoKit: provide `loadEnv({ forceReload: true })` for tests + CI. |
| Tailwind v3 vs v4 conflict | Consumer has v3 installed; `@usetheo/ui` shipped expecting v4. | Tailwind 4 deprecation: `@astrojs/tailwind` README warns. | `@usetheo/ui/vite-plugin` does `require.resolve('tailwindcss/package.json')` — reads version, peerDep range check, throw with actionable message if mismatch. |

---

## 9. Implementation Guide

### 9.1 Arquitetura proposta

```
                ┌──────────────────────────────────┐
                │  Consumer's repo                 │
                │                                  │
                │  package.json:                   │
                │    "dependencies": {              │
                │      "@usetheo/ui": "^1"         │
                │      "@usetheo/sdk": "^1"        │
                │    }                             │
                │  .env                            │
                │  theo.config.ts                  │
                └──────────────┬───────────────────┘
                               │
                               ▼
        ┌─────────────────────────────────────────────────┐
        │  theokit CLI (dev|build|start)                  │
        │  ┌───────────────────────────────────────────┐  │
        │  │  1. loadEnv({cwd, mode})                  │  │  ← NEW
        │  │       → process.env populated             │  │
        │  └───────────────────────────────────────────┘  │
        │  ┌───────────────────────────────────────────┐  │
        │  │  2. (if build) cleanOutDir({.theo, skip}) │  │  ← NEW
        │  │  3. (if dev) gcAgentRegistry({.theokit})  │  │  ← NEW
        │  └───────────────────────────────────────────┘  │
        │  ┌───────────────────────────────────────────┐  │
        │  │  4. invokeVite({ config: theoVitePlugin })│  │
        │  └─────────────┬─────────────────────────────┘  │
        └────────────────┼─────────────────────────────────┘
                         ▼
        ┌─────────────────────────────────────────────────┐
        │  theo-vite-plugin                               │
        │  ┌──────────────────────────────────────────┐   │
        │  │  configResolved(viteConfig)              │   │
        │  │   ├─ detectPackage('@usetheo/ui')        │   │  ← NEW
        │  │   ├─ detectPackage('tailwindcss')        │   │  ← NEW
        │  │   ├─ if ui detected:                     │   │
        │  │   │   ├─ ensure tailwindcss available    │   │
        │  │   │   ├─ inject @tailwindcss/vite plugin │   │
        │  │   │   └─ inject @usetheo/ui/vite-plugin  │   │
        │  │   └─ else: no-op                         │   │
        │  └──────────────────────────────────────────┘   │
        └─────────────────────────────────────────────────┘
                         │
                         ▼
                 ┌──────────────┐
                 │   Vite dev   │
                 │  /   build   │
                 └──────────────┘
```

### 9.2 Files to create

```
packages/theo/src/config/load-env.ts             — NEW. Adopts Next.js's loadEnvConfig.
packages/theo/src/config/load-env-types.ts        — NEW. LoadedEnvFiles, EnvLoadResult interfaces.
packages/theo/src/cli/lib/cleanup.ts              — NEW. cleanOutDir + gcAgentRegistry helpers.
packages/theo/src/vite-plugin/auto-detect.ts      — NEW. detectPackage(name, cwd) → boolean.
packages/theo/src/vite-plugin/integrate-ui.ts     — NEW. wireUseTheoUI(viteConfig, opts).
tests/unit/load-env.test.ts                       — NEW. 10+ scenarios (priority, expand, reload-diff, NODE_ENV guard, FIFO).
tests/unit/cleanup.test.ts                        — NEW. 6+ scenarios (empty dir, skip .git, LRU cap, race, symlink).
tests/unit/vite-plugin-auto-detect.test.ts        — NEW. 4+ scenarios (detect @usetheo/ui, missing, version-range-check).
tests/integration/zero-config-tailwind.test.ts    — NEW. Real fixture: `pnpm create-theokit my-app && add @usetheo/ui && pnpm dev → check class .bg-primary applied.`
tests/fixtures/zero-config/                       — NEW. Reproducible fixture project.

packages/theo/src/config/load-config.ts           — EDIT. Call loadEnv before applyDefaults.
packages/theo/src/cli/commands/build.ts           — EDIT. Call cleanOutDir before invokeViteBuild.
packages/theo/src/cli/commands/dev.ts             — EDIT. Call gcAgentRegistry on startup.
packages/theo/src/cli/commands/start.ts           — EDIT. Call loadEnv before resolveSsrEntry.
packages/theo/src/vite-plugin/index.ts            — EDIT. Add configResolved hook to call wireUseTheoUI.
packages/theo/package.json                         — EDIT. Add deps: dotenv, dotenv-expand, find-up.
packages/create-theo/templates/default/.env.example — VERIFY. Already exists per Onda 1.
examples/full-stack-agent/server/_env.ts           — DELETE. Replaced by framework auto-load.
examples/full-stack-agent/tailwind.config.ts       — KEEP (consumer-customized).
examples/full-stack-agent/postcss.config.js        — DELETE. Auto-injected via @usetheo/ui detection.

packages/ui (cross-repo: theokit-ui)               — REQUIRES upstream change:
  packages/ui/src/vite-plugin.ts                   — NEW. Exposes default fn ({ tailwind?: 'auto'|'off' }).
  packages/ui/package.json exports './vite-plugin' — NEW.
  packages/ui/src/preset.ts                         — NEW. Tailwind preset with content globs + theme.
  packages/ui/package.json exports './preset'       — NEW.
```

### 9.3 Public API surface (TypeScript)

```ts
// packages/theo/src/config/load-env.ts
export interface LoadEnvOptions {
  /** Project root. Default: process.cwd() */
  cwd?: string;
  /** Mode ('development' | 'production' | 'test'). Default: process.env.NODE_ENV ?? 'development' */
  mode?: string;
  /** Bypass module-level cache. Default: false */
  forceReload?: boolean;
}

export interface LoadEnvResult {
  /** Map of all keys loaded into process.env */
  loaded: Record<string, string>;
  /** Files that were actually read (in priority order) */
  loadedFromFiles: string[];
}

export function loadEnv(options?: LoadEnvOptions): LoadEnvResult;

// packages/theo/src/cli/lib/cleanup.ts
export interface CleanOutDirOptions {
  /** Path to wipe */
  dir: string;
  /** File/dir names (not paths) to preserve. Default: ['.git', '.gitkeep'] */
  skip?: string[];
}
export function cleanOutDir(opts: CleanOutDirOptions): Promise<void>;

export interface GcAgentRegistryOptions {
  /** Path to .theokit/agents/ */
  dir: string;
  /** Max agents to keep (mtime-sorted). Default: 100 */
  maxAgents?: number;
}
export function gcAgentRegistry(opts: GcAgentRegistryOptions): Promise<{ deleted: number; kept: number }>;

// packages/theo/src/vite-plugin/auto-detect.ts
export function detectPackage(packageName: string, cwd: string): {
  installed: boolean;
  version?: string;
  resolvedPath?: string;
};

// packages/theo/src/vite-plugin/integrate-ui.ts
import type { Plugin, ResolvedConfig } from 'vite';
export interface IntegrateUiOptions {
  /** Auto-add Tailwind v4 plugin. Default: true if @usetheo/ui detected */
  tailwind?: boolean | 'auto';
  /** Override @usetheo/ui plugin entry. Default: '@usetheo/ui/vite-plugin' */
  uiPluginEntry?: string;
}
export function integrateUseTheoUI(
  resolvedConfig: ResolvedConfig,
  opts?: IntegrateUiOptions
): Promise<Plugin[]>; // returns plugins to add via Vite's chain
```

### 9.4 Dependências a adotar

| Package | Version | Justification |
|---|---|---|
| `dotenv` | `^16` | `.env` file parsing. Same lib Next.js vendors. 5kb gzip, zero deps. |
| `dotenv-expand` | `^11` | `${VAR}` reference expansion. Required for real `.env`s with cross-refs. Same lib Vite uses. |
| `find-up` | `^7` | Walk-up filesystem for `package.json` (to confirm dependency presence). Tiny, ESM-only — fits TheoKit's `"type": "module"`. |

(`@tailwindcss/vite` and `@usetheo/ui` are NOT TheoKit framework dependencies — they are consumer-side. TheoKit's vite-plugin only `require.resolve()`s them when present.)

### 9.5 Test strategy

- **Unit:**
  - `tests/unit/load-env.test.ts` — 10+ BDD scenarios:
    - Happy: `.env` with `KEY=value` → `process.env.KEY === 'value'`.
    - Priority: `.env.local` overrides `.env`.
    - Mode: `.env.production` only loaded when mode=production.
    - Expand: `BASE=hi`, `GREETING=${BASE}-world` → `GREETING === 'hi-world'`.
    - Cross-ref to process.env: `process.env.SHELL_VAR` referenced in `.env` resolves correctly.
    - Reload diff: remove key from `.env`, re-load with `forceReload: true` → `process.env.KEY` is `undefined`.
    - NODE_ENV guard: `NODE_ENV` in `.env` stashed in `__THEOKIT_USER_NODE_ENV`, real NODE_ENV unchanged.
    - FIFO: pipe with `KEY=value` resolves (skip if test env doesn't support mkfifo).
    - Missing file: `.env` not present → no-op, no throw.
    - `__THEOKIT_PRIVATE` keys: survive reload diff.
  - `tests/unit/cleanup.test.ts` — 6+ scenarios (cleanOutDir):
    - Happy: dir with files → all wiped.
    - Skip set: `.git/` survives.
    - Symlink: non-existent target → no throw.
    - LRU cap: 12 agent dirs, cap=10 → 2 oldest deleted.
    - Race: concurrent invocations don't crash.
    - Permission error: read-only file logs warn, continues.
  - `tests/unit/vite-plugin-auto-detect.test.ts` — 4+ scenarios:
    - `@usetheo/ui` in package.json → detected.
    - Missing → `installed: false`.
    - Version pulled from resolved package.json.
    - Workspace symlink (pnpm) → resolved correctly.

- **Integration:**
  - `tests/integration/zero-config-tailwind.test.ts` — real Vite + fixture:
    - Boot fixture project with `@usetheo/ui` in deps but NO `tailwind.config` / `postcss.config`.
    - Run `vite build`.
    - Assert built CSS contains `.bg-primary { background-color: ... }` (proves Tailwind ran).
    - Assert HTML contains `<button class="bg-primary ...">` (proves UI components emit Tailwind classes).

- **Fixture:**
  - `tests/fixtures/zero-config/` — minimal app:
    - `package.json` with `@usetheo/ui` workspace dep.
    - `app/page.tsx` importing `Button` from `@usetheo/ui`.
    - `index.html`, `theo.config.ts` — nothing more. **No tailwind.config, no postcss.config.**

- **Playwright (cross-feature):**
  - Reuse `examples/full-stack-agent/` after deleting `tailwind.config.ts` and `postcss.config.js`. Run the existing 5-spec E2E suite. **All 5 must pass post-deletion.**

### 9.6 Phases of rollout

**Phase 1 — Env auto-load (unblocks polish bug #2 → most user-facing)**
- T1.1 `loadEnv` impl + 10 unit tests (RED→GREEN)
- T1.2 Wire `loadEnv` into `cli/commands/dev.ts`, `build.ts`, `start.ts` BEFORE Vite boots
- T1.3 Wire `loadEnv` into `config/load-config.ts` so env-based config values resolve correctly
- T1.4 Delete `examples/full-stack-agent/server/_env.ts` shim; verify Playwright 5/5 still GREEN
- Target: ≤4h dev time

**Phase 2 — State cleanup (unblocks polish bug #3)**
- T2.1 `cleanOutDir` impl + 6 unit tests
- T2.2 `gcAgentRegistry` impl with LRU + 5 unit tests
- T2.3 Wire `cleanOutDir` into `cli/commands/build.ts` (Astro-pattern, skip `.git`)
- T2.4 Wire `gcAgentRegistry` into `cli/commands/dev.ts` startup (Nuxt-pattern, cap=100, log if deleted > 0)
- Target: ≤4h dev time

**Phase 3 — UI plugin auto-config (unblocks polish bug #1 + #5; LARGEST scope — touches cross-repo)**
- T3.1 (cross-repo) `@usetheo/ui` ships `./vite-plugin` and `./preset` subpath exports
- T3.2 `detectPackage` impl + 4 unit tests
- T3.3 `integrateUseTheoUI` impl: `configResolved` hook reads consumer's Vite config, returns array of plugins to add
- T3.4 Wire `integrateUseTheoUI` into `vite-plugin/index.ts` `configResolved`
- T3.5 Integration test against fixture proves Tailwind works WITHOUT consumer-side `tailwind.config.ts` / `postcss.config.js`
- T3.6 Delete `examples/full-stack-agent/tailwind.config.ts` + `postcss.config.js`; verify Playwright still GREEN
- Target: ≤2 days (cross-repo coordination)

**Phase 4 — Hardening + Dogfood**
- T4.1 Add `theokit check --upgrade-readiness` flag that warns if consumer has manual `tailwind.config` + `@usetheo/ui` (might conflict)
- T4.2 README "Zero-config" section in `docs/concepts/`
- T4.3 `/dogfood full` → health ≥ 80, zero plan-caused regressions
- Target: ≤4h

### 9.7 Acceptance criteria

- [ ] `npm create theokit my-app && cd my-app && pnpm dev` → works WITHOUT user creating `.env`-loader shim. If user adds `.env` with `OPENROUTER_API_KEY=...`, `process.env.OPENROUTER_API_KEY` is set in server code.
- [ ] `npm create theokit my-app && pnpm add @usetheo/ui && pnpm dev` → TheoUI components render styled WITHOUT user touching `tailwind.config.ts` or `postcss.config.js`.
- [ ] `theokit dev` startup logs "Cleaned N stale agent registries (>100 day-old)" when applicable.
- [ ] `theokit build` empties `.theo/` except `.git/` and `.gitkeep`.
- [ ] `examples/full-stack-agent/` can DELETE `tailwind.config.ts`, `postcss.config.js`, `server/_env.ts` — and Playwright 5/5 still GREEN.
- [ ] tsc --noEmit clean
- [ ] vitest run green (new tests + existing 1974)
- [ ] `/dogfood full` health ≥ 80

### 9.8 Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `dotenv` adds 5kb to CLI bundle | low | Accept — env loading is the universal pattern. |
| `@usetheo/ui` ships breaking change to its `./vite-plugin` export between TheoKit versions | medium | Peer-dep range check at `detectPackage` time; throw actionable error if mismatch. |
| Consumer has manual `tailwind.config.ts` AND `@usetheo/ui` → our auto-add conflicts | medium | At `configResolved`, detect existing `tailwind.config.*` via `find-up`. If exists, log "Using your tailwind config — extend with `import preset from '@usetheo/ui/preset'`". Don't auto-inject Tailwind plugin (consumer is in control). |
| Long-running dev session has 1000+ orphan agent registries → GC takes seconds | low | Default cap=100; `glob` + `Promise.all(stat)` is O(n) — for 1000 files, ~50ms. Acceptable on startup. |
| `.env` reload doesn't pick up new file during dev | medium | Phase 4 follow-up: file watcher → `loadEnv({ forceReload: true })`. Defer to follow-up plan. |
| Symlink-based pnpm workspace → `find-up` resolves to monorepo root, not project root | medium | Use `fs.realpathSync(cwd)` before walking. Or accept the resolution. |

---

## 10. Open questions

1. **Should `theokit dev` watch `.env` and auto-reload on change?** — Next.js does (via `next-server.ts` env block). Cost: file watcher + handler. Benefit: dev UX. Defer to follow-up — Phase 1 ships static load only.

2. **Should `gcAgentRegistry` run on EVERY `theokit dev` boot, or only when N > cap?** — Nuxt only runs LRU when count > 10. Probably same: skip if `count <= maxAgents`. Confirm during impl.

3. **`@usetheo/ui/vite-plugin` API shape — what does it return?** — Need cross-repo sync with the UI repo before Phase 3. The plugin probably wraps `@tailwindcss/vite` + adds content sources from `@usetheo/ui/dist/**`. Confirm via spike.

4. **Does `@usetheo/ui` ship pre-compiled CSS (zero-Tailwind path) OR Tailwind preset (consumer-Tailwind path) OR both?** — If pre-compiled, no auto-Tailwind needed at all. If preset, our auto-config is necessary. Decision lives in UI repo, drives the TheoKit plan shape.

5. **`THEO_PUBLIC_` prefix vs `THEOKIT_PUBLIC_`** — current schema uses `THEO_PUBLIC_`. Naming carried over from the pre-rename era. Audit and align before Phase 1 ships (renames in env-prefix affect all consumers).

---

## 11. Referências citadas (todos os arquivos do inventário)

### Next.js (15.x)

#### Core
- `packages/next-env/index.ts:1-180` — `loadEnvConfig` + `processEnv` replacement; module-level cache; sentinel; dotenv + dotenv-expand integration. §3.1 (algorithm), §6, §8 (edge cases for reload-diff, FIFO, NODE_ENV)
- `packages/next/src/lib/find-config.ts:1-100` — `findConfig<T>(dir, key)` walk-up filesystem for `package.json[key]`, `.{key}rc.json`, `{key}.config.{js,mjs,cjs}`. ESM-aware via `package.json#type`. §3.1
- `packages/next/src/build/webpack/config/blocks/css/plugins.ts:1-246` — `getPostCssPlugins(dir, ...)`; default plugins (postcss-flexbugs-fixes + postcss-preset-env); ignored plugins regex; lazy plugin loader. §3.1, §4, §7
- `packages/next/src/build/index.ts:1121-1130` — `recursiveDeleteSyncWithAsyncRetries(distDir, /^(cache|dev|lock|trace)/)` — allowlist-preserve cleanup. §3.1, §7
- `packages/next/src/build/index.ts:3936` — `fs.rm(outdir, { recursive, force })` for export dir. §3.1

#### Support
- `packages/next/src/build/webpack/config/blocks/css/index.ts` — entrypoint that imports `getPostCssPlugins`. §3.1
- `packages/next/src/server/next-server.ts` (env reload block) — dev-server env hot-reload hook. §3.1 (referenced)
- `packages/next/src/cli/next-build.ts`, `next-dev.ts` — CLI entries, call `loadEnvConfig` before main. §3.1

#### Doc / config
- `packages/next/src/server/config-shared.ts` — type definitions for `next.config.js` shape including `cleanDistDir: boolean` default true. §3.1

---

### Astro (5.x)

#### Core
- `packages/astro/src/env/env-loader.ts:1-101` — `createEnvLoader(options)`, `getEnv`, `getPrivateEnv`. Delegates file load to `Vite.loadEnv`; layers public/private/secret classification. §3.2, §4
- `packages/astro/src/core/fs/index.ts:1-93` — `removeEmptyDirs`, `emptyDir(dir, skip)`, `fixWinEPERMSync` (Windows EPERM retry). §3.2, §7
- `packages/astro/src/core/build/static-build.ts:9, 118` — `emptyDir(outDir, new Set('.git'))` at build start. §3.2, §7
- `packages/astro/src/types/public/integrations.ts:336-337, 416-423` — `AstroIntegration { name, hooks }` interface. §3.2, §5, §6
- `packages/integrations/react/src/index.ts:1-200` — canonical integration: `addRenderer`, `updateConfig({ vite: ... })`, `injectScript`, `astro:config:setup`, `astro:config:done`. §3.2, §5, §7

#### Support
- `packages/astro/src/core/viteUtils.ts` — Astro's Vite config builder; surfaces postcss config. §3.2
- `packages/astro/src/core/create-vite.ts` — entry that wires integrations into Vite config. §3.2

#### Doc
- `packages/integrations/tailwind/README.md:1-39` — **DEPRECATED** — historical Astro Tailwind integration; modern pattern is `@tailwindcss/vite` direct. §3.2, §5

---

### Nuxt (4.x)

#### Core
- `packages/kit/src/loader/config.ts:1-175` — `loadNuxtConfig(opts)`: layer discovery → `setupDotenv` (c12) → `loadConfig` (c12) → `applyDefaults` (untyped) → buildDir resolves to `node_modules/.cache/nuxt/.nuxt`. §3.3
- `packages/kit/src/module/define.ts:1-165` — `defineNuxtModule`: opts resolution (inline > config[key] > defaults > schema), duplicate-install guard, compatibility check, hook auto-register, perf tracking. §3.3, §5, §6, §7
- `packages/nuxt/src/core/cache.ts:1-338` — `getVueHash`, `restoreCachedBuildId`, `cleanupCaches` (LRU cap=10), `getCacheDir` → `node_modules/.cache/nuxt/builds`. Content-addressed via `ohash`. §3.3, §7

#### Support
- `packages/kit/src/module/install.ts` — module install path (loads module file, calls `normalizedModule(opts, nuxt)`). §3.3
- `packages/kit/src/index.ts` — re-exports `defineNuxtModule`, `setupDotenv`, etc. §3.3

---

### Vite (7.x)

#### Core
- `packages/vite/src/node/env.ts:1-117` — `loadEnv(mode, envDir, prefixes)`: `getEnvFilesForMode` (4 files), `node:util.parseEnv`, dotenv-expand on a clone of process.env (no global mutation), prefix filter. NODE_ENV/BROWSER capture. §3.4, §4
- `packages/vite/src/node/plugins/css.ts:5` — `import postcssrc from 'postcss-load-config'`. §3.4
- `packages/vite/src/node/plugins/css.ts:282-285` — `postcssConfigCache: WeakMap<ResolvedConfig, ...>`. §3.4, §7
- `packages/vite/src/node/plugins/css.ts:1925-1979` — `resolvePostcssConfig(config)`: inline-or-search, cache, error wrapping. §3.4, §6
- `packages/vite/src/node/plugins/css.ts:1518` — call-site of `resolvePostcssConfig` during CSS compile. §3.4

#### Doc
- `packages/vite/src/node/plugins/forwardConsole.ts` — example of `apply: 'serve'`-only Vite plugin (dev-only). §3.4 (referenced)

---

### SvelteKit (2.x)

#### Core
- `packages/kit/src/exports/vite/utils.js:2, 69-77` — `get_env(env_config, mode)` delegates to `Vite.loadEnv`, splits into `public`/`private` via prefix filter. §3.5

#### Support
- `packages/kit/src/exports/vite/index.js` — kit-vite plugin orchestrator that calls `get_env`. §3.5
- `packages/kit/src/core/sync/write_ambient.js` — generates `$env/static/*` virtual modules from filtered env. §3.5 (referenced)

---

### Remix (2.x)

(No env-loading source file — pattern is documented behavior, not code. §3.6 describes the philosophical choice; nothing to anchor in `referencias/remix/`.)

---

### URLs externas

- https://docs.astro.build/en/guides/styling/#tailwind — Astro 5 docs on Tailwind migration to `@tailwindcss/vite`. §3.2
- https://nextjs.org/docs/messages/postcss-ignored-plugin — Next.js documented error link from `plugins.ts:38-41`. §8 (referenced)
- https://nextjs.org/docs/messages/postcss-shape — same. §8 (referenced)
- https://github.com/nodejs/node/issues/31710 — Node Windows pathToFileURL bug Next.js works around in `find-config.ts:71`. §3.1

---
