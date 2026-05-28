# Audit — @theokit/plugin-cors local CI green (2026-05-27)

> **Note:** This audit captures the **local equivalent** of CI (running the same scripts the GitHub Actions workflow runs). Remote CI run on `usetheodev/theokit-plugins` requires the actual PR push (gated on plugin-cors branch + NPM_TOKEN setup per T4.2 `docs/SECRETS.md`). The local run validates the same gates the remote workflow asserts.

## Workflow assertions

`theokit-plugins/.github/workflows/ci.yml` defines 3 jobs:

| Job | Steps | Local equivalent |
|---|---|---|
| `lint-and-format` | `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm format:check` | ✅ executed below |
| `typecheck-build` | `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build` | ✅ executed below |
| `test` | `pnpm install --frozen-lockfile`, `pnpm test` | ✅ executed below |

## Local run results (2026-05-27 ~ 08:34 BRT)

```bash
cd /home/paulo/Projetos/usetheo/theokit-plugins
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test
```

| Step | Outcome | Notes |
|---|---|---|
| `pnpm typecheck` | ✅ exit 0 | `tsc --noEmit` clean across 11 files (src + tests + fixture) |
| `pnpm lint` | ✅ exit 0 | ESLint 9 flat config; `--max-warnings=0` |
| `pnpm format:check` | ✅ "All matched files use Prettier code style!" | |
| `pnpm build` | ✅ green | `tsup` produces `dist/index.{js,d.ts,js.map}` for `@theokit/plugin-cors` |
| `pnpm test` | ✅ **88 passed (88)** | 8 test files: skeleton, changeset, options, resolve-origin, build-headers, index, fixture, integration |

## Test breakdown

```
✓ tests/skeleton.test.ts         (5 tests)  — package shape, BC of scaffold
✓ tests/changeset.test.ts        (5 tests)  — initial release changeset valid
✓ tests/options.test.ts         (17 tests)  — Zod schema + W3C invalid combo (EC-8, EC-9)
✓ tests/resolve-origin.test.ts  (21 tests)  — origin matching matrix + EC-3 predicate throw + EC-5/6/7 edge cases
✓ tests/build-headers.test.ts   (14 tests)  — Vary/preflight/credentials/exposed + EC-4
✓ tests/index.test.ts           (13 tests)  — full plugin wired against mock TheoApp
✓ tests/fixture.test.ts          (5 tests)  — cors-app fixture boots; D7 cross-repo workspace
✓ tests/integration.test.ts      (8 tests)  — REAL PluginRunner from theokit/server (EC-10 verified)
```

## EC coverage verification

| EC | Status | Test reference |
|---|---|---|
| EC-1 (MUST FIX) peer-dep alignment | ✅ | `skeleton.test.ts:package_json_has_correct_shape` asserts `peerDep theokit>=0.1.0-alpha.5` |
| EC-2 (MUST FIX) cross-repo workspace | ✅ | `tests/fixture.test.ts` imports real `theokit`/`theokit/server` via link: in devDeps |
| EC-3 (MUST FIX) predicate throw | ✅ | `resolve-origin.test.ts:EC-3 — predicate exception` (2 tests: null return + warn-once) |
| EC-4 empty methods array | ✅ | `build-headers.test.ts:[EC-4]` |
| EC-5 empty string origin | ✅ | `resolve-origin.test.ts:[EC-5]` |
| EC-6 'null' literal origin | ✅ | `resolve-origin.test.ts:[EC-6]` |
| EC-7 trailing slash | ✅ | `resolve-origin.test.ts:[EC-7]` |
| EC-8 async predicate | ✅ | `options.test.ts:EC-8 — async predicate behavior` |
| EC-9 empty strings in arrays | ✅ | `options.test.ts:EC-9 — empty strings in arrays rejected` (4 tests) |
| EC-10 PluginRunner exported | ✅ | `integration.test.ts:PluginRunner is exported from theokit/server (EC-10 prereq)` |
| EC-11/12/13 (DOCUMENT) | ⏳ | Covered in T4.2 (EC-12 tarball filename) + T6.1 (EC-11 + EC-13 in ROADMAP.md) — separate tasks |

## Remote CI

When `usetheodev/theokit-plugins/main` receives the PR, the GH Actions workflow MUST re-run these 5 steps. Track the workflow URL once published:

- Repo: https://github.com/usetheodev/theokit-plugins
- Actions URL: TBD (after first push)

## Outcome

**5/5 local gates green.** Pipeline validated end-to-end. Ready to push branch + open PR.
