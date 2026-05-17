/**
 * T4.1 — `--bare` transformation.
 *
 * Applied AFTER the default template is copied. Removes:
 *   - `@usetheo/ui` from `package.json` dependencies
 *   - `app/page.tsx` agent-surface content (replaces with Hello Theo)
 *   - `server/routes/chat.ts` (mock chat — depends on TheoUI events)
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

export function applyBareTransform(
  targetDir: string,
  options: BareTransformOptions = {},
): void {
  if (options._testForceError) {
    throw new Error(`Forced transform failure: ${options._testForceError}`)
  }

  // 1. Remove @usetheo/ui from package.json deps
  const pkgPath = join(targetDir, 'package.json')
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    if (pkg.dependencies && '@usetheo/ui' in pkg.dependencies) {
      delete pkg.dependencies['@usetheo/ui']
    }
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
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
}
