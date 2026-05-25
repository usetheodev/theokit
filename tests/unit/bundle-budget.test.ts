import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { buildTemplateDefaultOnce } from '../integration/_helpers/build-template-default.js'

/**
 * Bundle budget gate — security-hardening plan acceptance criterion.
 *
 * Plan requirement: "Bundle budget ≤ 350 KB gzipped for `template-default`".
 * The security primitives are all server-side; this gate proves they
 * don't accidentally leak into the client bundle.
 *
 * Strategy:
 *   - Build `fixtures/template-default` in production mode.
 *   - Locate the main client bundle (`assets/index-*.js`).
 *   - Gzip it; assert size <= 350 * 1024 bytes.
 *
 * If the budget is breached, future commits get a fail-fast signal
 * rather than the silent regression that historically bit CSS-in-JS
 * adoptions and devtools tree-shake bugs.
 */

const FIXTURE = resolve(__dirname, '../../fixtures/template-default')
const BUDGET_BYTES = 350 * 1024

describe('Bundle budget — template-default <= 350 KB gzipped', () => {
  beforeAll(() => {
    // Shared mutex-guarded build to avoid clobbering another concurrent test
    // (e.g. devtools-treeshake) writing to the same .theo/ directory.
    buildTemplateDefaultOnce()
  }, 200_000)

  it('main client bundle gzipped is under 350 KB (security primitives must not leak)', () => {
    const assets = resolve(FIXTURE, '.theo/client/assets')
    expect(existsSync(assets)).toBe(true)

    // The Vite build emits `index-<hash>.js` as the main client bundle.
    const candidates = readdirSync(assets).filter(
      (f) => /^index-.*\.js$/.test(f) && statSync(join(assets, f)).isFile(),
    )
    expect(candidates.length).toBeGreaterThan(0)

    // Take the largest candidate (defensive — multiple variants would be a bug)
    const bundlePath = candidates
      .map((f) => ({ f, size: statSync(join(assets, f)).size }))
      .sort((a, b) => b.size - a.size)[0].f
    const raw = readFileSync(join(assets, bundlePath))
    const gzipped = gzipSync(raw, { level: 9 })

    console.log(
      `[bundle-budget] ${bundlePath}  raw=${raw.length}B  gzip=${gzipped.length}B  budget=${BUDGET_BYTES}B`,
    )
    expect(gzipped.length).toBeLessThanOrEqual(BUDGET_BYTES)
  })

  it('security-primitive modules are NOT present in the client bundle (server-only invariant)', () => {
    // Read every JS chunk under .theo/client/assets and assert that none
    // mention the names of the security primitives we added. These are
    // server-only by design; their leaking into the client would be a
    // boundary violation AND inflate the bundle.
    const SERVER_ONLY_NAMES = [
      'CSP_REPORT_PATH', // csp-report.ts internals
      'generateBackupCodes',
      'generateTotp', // any of the auth-totp internals shouldn't ship to the browser
      'discoverOidcProvider',
      'rotateIfNeeded',
    ]
    const assets = resolve(FIXTURE, '.theo/client/assets')
    const jsFiles = readdirSync(assets).filter((f) => f.endsWith('.js'))
    const bundleText = jsFiles.map((f) => readFileSync(join(assets, f), 'utf8')).join('\n')

    for (const name of SERVER_ONLY_NAMES) {
      expect(bundleText, `Server-only symbol "${name}" leaked into client bundle`).not.toContain(
        name,
      )
    }
  })
})
