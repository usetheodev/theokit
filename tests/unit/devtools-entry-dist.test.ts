import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Regression: dist mode of the framework MUST ship `devtools/entry.js`.
 *
 * Why this test exists (honest history): on 2026-05-22 I claimed Phase 3 of
 * framework-zero-config-polish was "5/5 Playwright green" — but Playwright
 * boots the CLI via `npx tsx packages/theo/src/cli/index.ts dev` (SOURCE
 * mode). When the user ran `pnpm dev` from examples/full-stack-agent — which
 * resolves `theokit` via workspace symlink → `package.json#exports` → dist/
 * — the dev server immediately crashed with:
 *
 *   "Failed to resolve import 'theokit/devtools/entry' from
 *    '@theo/devtools/entry.js'. Does the file exist?"
 *
 * Root cause: `tsup.config.ts` had every subpath entry EXCEPT
 * `devtools/entry`. Vite plugin's alias for `theokit/devtools/entry`
 * pointed to `dist/devtools/entry.js` — a file that did not exist.
 *
 * This test pins the fix at the file-system level. It does NOT depend on
 * running the actual dev server (which is what should have caught it but
 * didn't, because Playwright took the source-mode shortcut).
 */

const ROOT = process.cwd()
const DIST = resolve(ROOT, 'packages/theo/dist')

describe('regression: devtools/entry must ship in dist', () => {
  it('packages/theo/dist/devtools/entry.js exists after build', () => {
    // If this fails, run `pnpm --filter=theokit build` first. If it still
    // fails after a clean build, tsup.config.ts is missing the
    // `devtools/entry` entry — the original bug from 2026-05-22.
    const distEntry = resolve(DIST, 'devtools/entry.js')
    expect(existsSync(distEntry)).toBe(true)
  })

  it('packages/theo/dist/devtools/entry.js.map exists (sourcemaps for prod debug)', () => {
    expect(existsSync(resolve(DIST, 'devtools/entry.js.map'))).toBe(true)
  })

  it('tsup.config.ts declares devtools/entry as a build entry', () => {
    // Static check — catches removal of the entry from tsup config even
    // if dist hasn't been rebuilt yet.
    const tsupConfig = readFileSync(
      resolve(ROOT, 'packages/theo/tsup.config.ts'),
      'utf-8',
    )
    expect(tsupConfig).toMatch(/['"]devtools\/entry['"]\s*:/)
  })
})
