/* eslint-disable security/detect-non-literal-fs-filename --
 * Scaffold transform. Mutates files inside the freshly-created target
 * directory whose absolute path is the function input. No HTTP input.
 */
/**
 * T4.1 — `--bare` transformation.
 *
 * Applied AFTER the default template is copied. Removes:
 *   - `@usetheo/ui` from `package.json` dependencies (TheoUI bundled components)
 *   - `@usetheo/sdk` from `package.json` dependencies (agent SDK — see below)
 *   - `app/page.tsx` agent-surface content (replaces with Hello Theo)
 *   - `server/routes/chat.ts` (mock chat — depends on SDK + TheoUI events)
 *   - `tailwind.config.ts` + `postcss.config.js` (Tailwind toolchain — only
 *     needed by the @usetheo/ui-driven default surface)
 *   - tailwind* + postcss* from devDependencies (toolchain cleanup)
 *
 * Why SDK removal is in --bare:
 *   `@usetheo/sdk` is not yet on the public npm registry (operator-deferred
 *   publish per macro roadmap item #3). A user running `npx create-theokit`
 *   without `--bare` hits `npm install` → 404. The `--bare` path produces a
 *   scaffold that ALWAYS works without registry dependencies — Hello Theo
 *   with a clean structure to grow into.
 *
 * EC-4: callers MUST wrap this in try/catch + `rmSync` rollback so a partial
 * transform never leaves the target dir in a broken state.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const HELLO_PAGE = `export default function Page() {
  return <h1>Hello Theo</h1>
}
`

export interface BareTransformOptions {
  /** Test-only — force a synthetic write failure to validate rollback path. */
  _testForceError?: string
}

export function applyBareTransform(targetDir: string, options: BareTransformOptions = {}): void {
  if (options._testForceError) {
    throw new Error(`Forced transform failure: ${options._testForceError}`)
  }

  // 1. Remove @usetheo/ui + @usetheo/sdk + tailwind toolchain from deps
  const pkgPath = join(targetDir, 'package.json')
  if (existsSync(pkgPath)) {
    interface PartialPackageJson {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      [key: string]: unknown
    }
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as PartialPackageJson
    if (pkg.dependencies) {
      delete pkg.dependencies['@usetheo/ui']
      // Drop SDK — operator-deferred npm publish (macro roadmap item #3).
      // Without removal, `npm install` hits 404 for any consumer outside
      // the workspace.
      delete pkg.dependencies['@usetheo/sdk']
      // lucide-react ships with the TheoUI surface; --bare doesn't render
      // any icons so it's safe to drop.
      delete pkg.dependencies['lucide-react']
    }
    if (pkg.devDependencies) {
      // Tailwind toolchain is only needed by the @usetheo/ui-driven default
      // surface. --bare ships unstyled Hello Theo; no Tailwind required.
      delete pkg.devDependencies.tailwindcss
      delete pkg.devDependencies['tailwindcss-animate']
      delete pkg.devDependencies.postcss
      delete pkg.devDependencies.autoprefixer
    }
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  }

  // 2. Replace app/page.tsx with Hello Theo
  const pagePath = join(targetDir, 'app/page.tsx')
  if (existsSync(pagePath)) {
    writeFileSync(pagePath, HELLO_PAGE)
  }

  // 3. Remove mock chat route (depends on AgentEvent type and TheoUI deps)
  const chatPath = join(targetDir, 'server/routes/chat.ts')
  if (existsSync(chatPath)) {
    unlinkSync(chatPath)
  }

  // 4. Remove tailwind + postcss config files (toolchain dropped from devDeps)
  const tailwindCfg = join(targetDir, 'tailwind.config.ts')
  if (existsSync(tailwindCfg)) {
    unlinkSync(tailwindCfg)
  }
  const postcssCfg = join(targetDir, 'postcss.config.js')
  if (existsSync(postcssCfg)) {
    unlinkSync(postcssCfg)
  }
}
