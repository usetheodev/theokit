# Edge Case Review — framework-zero-config-polish

Data: 2026-05-22
Tasks analisadas: 15 (T0.1, T1.1–T1.4, T2.1–T2.3, T3.1–T3.5, T4.1, T4.2)
Edge cases encontrados: 16 (MUST FIX: 7, SHOULD TEST: 7, DOCUMENT: 2)

## MUST FIX

### EC-1: `loadEnv` reads `.env` without file size cap
- **Task afetada:** T1.1
- **Família:** Resource / Security
- **Cenário:** Malicious or accidental huge `.env` (e.g., a 500MB file pasted by mistake, or a generated env file from CI artifact). `fs.readFileSync(path)` blocks the event loop and may OOM the CLI process.
- **Impacto:** `theokit dev` / `build` / `start` crashes with `RangeError: Invalid string length` or OOM. Worse: if attacker controls `.env` via supply-chain (e.g., a malicious template), they can crash the user's CI.
- **Fix sugerido:** Before `readFileSync`, check `fs.statSync(file).size > 1024 * 1024` (1MB cap — real `.env`s are < 10KB). If exceeded, log warn `[theokit] .env file at ${path} exceeds 1MB — skipping` and skip that file.

### EC-2: Module-level cache pollutes vitest cross-test runs
- **Task afetada:** T1.1
- **Família:** State
- **Cenário:** Vitest runs `tests/unit/load-env.test.ts` and `tests/unit/load-config-env-order.test.ts` in the SAME worker process. Test A loads fixture `.env` with `K=A`, cache stores it. Test B loads fixture B's `.env` with `K=B` — cache hit (same `cwd:mode` key after worker reuse), test B sees `K=A` from cache, test fails or worse: tests pass spuriously when they shouldn't.
- **Impacto:** Tests flaky. Worse: a real cache collision masks a bug in `loadEnv`.
- **Fix sugerido:** Export `_resetEnvCache()` helper (test-only, side-door); call in test `beforeEach`. Alternatively: include a per-process nonce in cache key (rejected — adds complexity). One-line helper is simpler.

### EC-3: `cleanOutDir` accepts absolute paths outside cwd → can wipe `/` or `$HOME`
- **Task afetada:** T2.1
- **Família:** Security / Resource
- **Cenário:** Misconfigured `theo.config.ts` with `distDir: '/'` or `distDir: '/home/user/Documents'`, or a bug in path resolution. `cleanOutDir({dir: '/'})` would attempt to `fs.rm` every entry under `/`.
- **Impacto:** **Catastrophic data loss** for the user. Single most dangerous risk in this plan.
- **Fix sugerido:** At top of `cleanOutDir`, throw if `!path.resolve(opts.dir).startsWith(path.resolve(process.cwd()))`. One guard: 3 lines.

### EC-4: T2.2 doesn't validate `distDir` is inside cwd before passing to cleanOutDir
- **Task afetada:** T2.2
- **Família:** Security / Integration
- **Cenário:** Even with EC-3 fixed, the build command passes config-derived `distDir` to `cleanOutDir`. If `theo.config.ts.distDir = '../outside'`, EC-3 guard rejects but error is opaque to the user.
- **Impacto:** Confusing crash; user doesn't know why their config is rejected.
- **Fix sugerido:** Add Zod refine in `config/schema.ts`: `distDir: z.string().refine(d => !path.isAbsolute(d), 'distDir must be relative to project root')`. One-line schema change.

### EC-5: `integrateUseTheoUI` assumes `default` export — breaks if UI plugin uses named export
- **Task afetada:** T3.2
- **Família:** Type / Integration
- **Cenário:** Phase 0 spike resolves the API shape as default export, but if `@usetheo/ui` ships `export function useTheoUI(...)` instead of `export default ...`, dynamic import gives `{ default: undefined, useTheoUI: fn }`. Calling `useTheoUIPlugin()` crashes with `TypeError: undefined is not a function`.
- **Impacto:** Hard crash with confusing stack trace; consumer sees TypeError instead of "did you install @usetheo/ui?" guidance.
- **Fix sugerido:** After `const mod = await import('@usetheo/ui/vite-plugin')`, check `typeof mod.default === 'function'`. If not, log `[theokit] @usetheo/ui/vite-plugin does not expose a default function export. TheoKit expected: \`export default function (opts) => Plugin\`.` and return `[]`. 3 lines.

### EC-6: `integrateUseTheoUI` doesn't validate return shape of UI plugin
- **Task afetada:** T3.2
- **Família:** Type / Integration
- **Cenário:** UI plugin returns `Plugin[]` array instead of single `Plugin`, OR returns `null`, OR returns a non-Plugin object. Downstream Vite throws cryptically (`config.plugins[N].apply is not a function`).
- **Impacto:** Hard crash deep in Vite internals.
- **Fix sugerido:** After calling `useTheoUIPlugin()`, type-check: `if (!result || typeof result !== 'object' || !('name' in result)) { warn(...); return []; }`. 3 lines.

### EC-7: Telegram bot uses default `loadEnv()` cwd → reads wrong `.env` when invoked from monorepo root
- **Task afetada:** T1.4
- **Família:** State
- **Cenário:** User runs `pnpm bot` from monorepo root (not from `examples/full-stack-agent/`). `loadEnv()` defaults to `process.cwd()` = monorepo root → reads monorepo's `.env` (probably empty), misses the example's `.env`. Bot fails to start with "missing OPENROUTER_API_KEY".
- **Impacto:** Bot silently broken when launched from "wrong" directory; user thinks framework auto-load is broken.
- **Fix sugerido:** In `server/telegram-bot.ts`: `import { fileURLToPath } from 'node:url'; loadEnv({ cwd: dirname(fileURLToPath(import.meta.url)) + '/..' })`. Or simpler: document that bot must be invoked from the example dir via `pnpm bot` (which sets cwd via pnpm). Pick one in the plan.

## SHOULD TEST

### EC-8: dotenv-expand circular reference `A=$B`, `B=$A`
- **Task afetada:** T1.1
- **Teste sugerido:** `test_loadEnv_dotenv_expand_circular_safe` — Given .env=`A=${B}\nB=${A}`, When loadEnv called, Then no infinite loop AND result.loaded.A is some defined string (dotenv-expand returns literals for unresolvable refs)

### EC-9: gcAgentRegistry handles dirs with mtime=0 (Docker overlay, FAT)
- **Task afetada:** T2.1
- **Teste sugerido:** `test_gcAgentRegistry_handles_zero_mtime` — Given 5 agent dirs with `utimesSync(path, 0, 0)`, When gcAgentRegistry(cap=3) called, Then it deletes 2 dirs without throwing (stable sort handles ties)

### EC-10: Plugin chain idempotency — consumer already added `@tailwindcss/vite`
- **Task afetada:** T3.3
- **Teste sugerido:** `test_vite_plugin_skips_double_tailwind` — Given consumer's `vite.config.ts` already has `tailwindcss()` in plugins, When TheoKit vite-plugin runs, Then it does NOT re-add tailwind (check via plugin name presence) AND logs "[theokit] @tailwindcss/vite already in your plugin chain — skipping auto-add"

### EC-11: cleanOutDir skip set with trailing slash variants
- **Task afetada:** T2.1
- **Teste sugerido:** `test_cleanOutDir_skip_normalization` — Given skip=['foo/', '.git', './bar'], When cleanOutDir called against dir with foo/, .git/, bar/, Then all three preserved (normalize basename via `path.basename(entry).replace(/\/$/, '')`)

### EC-12: cleanOutDir on read-only filesystem (EROFS)
- **Task afetada:** T2.1
- **Teste sugerido:** `test_cleanOutDir_handles_EROFS` — Given dir mounted read-only (mock via `vi.spyOn(fs.promises, 'rm').mockRejectedValue({code:'EROFS'})`), When cleanOutDir called, Then warning logged AND no rethrow

### EC-13: `.env` symlink pointing outside project (security boundary)
- **Task afetada:** T1.1
- **Teste sugerido:** `test_loadEnv_symlink_outside_project_documented` — Given `.env` is a symlink to `/tmp/external.env`, When loadEnv called, Then it follows the symlink AND logs `[theokit] .env at ${path} is a symlink → ${realpath}` (defensive transparency, not blocking)

### EC-14: Vitest worker isolation — two test files using same fixture cwd
- **Task afetada:** T1.1
- **Teste sugerido:** `test_loadEnv_cache_isolated_across_test_files` — Use vitest's `pool: 'forks'` config OR ensure `beforeEach` clears cache. Verify two `describe` blocks reading different fixtures don't collide. Covered by EC-2 fix; this test pins it.

## DOCUMENT

### EC-15: `.env` reload-on-watch is deferred to follow-up plan
- **Risco aceito:** Per D6, this plan ships static load only. If user edits `.env` during `theokit dev`, restart is required to pick up changes. Documented in CHANGELOG + docs/concepts/zero-config.md as a known limitation.

### EC-16: `@usetheo/ui` pre-compiled-CSS vs preset path depends on spike Q4
- **Risco aceito:** Phase 0 spike T0.1 resolves whether UI ships pre-compiled CSS OR a Tailwind preset. If pre-compiled, Phase 3 auto-Tailwind wiring is unnecessary — Phase 3 collapses. Plan documents this branch point in T0.1 acceptance criteria. Risk: if spike outcome is "pre-compiled CSS", Phase 3 scope shrinks dramatically (good) but the plan structure needs adjustment.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 1 | 0 | 0 | 1 (EC-16) |
| T1.1 | 5 | 2 (EC-1, EC-2) | 3 (EC-8, EC-13, EC-14) | 0 |
| T1.2 | 0 | 0 | 0 | 0 |
| T1.3 | 1 | 0 | 0 | 1 (EC-15) |
| T1.4 | 1 | 1 (EC-7) | 0 | 0 |
| T2.1 | 4 | 1 (EC-3) | 3 (EC-9, EC-11, EC-12) | 0 |
| T2.2 | 1 | 1 (EC-4) | 0 | 0 |
| T2.3 | 0 | 0 | 0 | 0 |
| T3.1 | 0 | 0 | 0 | 0 |
| T3.2 | 2 | 2 (EC-5, EC-6) | 0 | 0 |
| T3.3 | 1 | 0 | 1 (EC-10) | 0 |
| T3.4 | 0 | 0 | 0 | 0 |
| T3.5 | 0 | 0 | 0 | 0 |
| T4.1 | 0 | 0 | 0 | 0 |
| T4.2 | 0 | 0 | 0 | 0 |

**Veredicto:** PLANO PRECISA DE AJUSTE

**Justificativa:** 7 MUST FIX items, of which 3 are security/data-loss critical (EC-3 absolute path, EC-1 huge file, EC-4 distDir validation). The Phase 2 cleanup is the highest-blast-radius area and needs the path-safety guards baked in BEFORE any code lands. Update the plan to incorporate the 7 MUST FIX into the affected task's Deep Dives + add 7 SHOULD TEST scenarios to the BDD lists.
