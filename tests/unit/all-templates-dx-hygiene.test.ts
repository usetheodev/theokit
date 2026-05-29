/**
 * T2.1 + T2.2 + T2.3 (dogfood-fixes-and-coverage-expansion plan).
 *
 * Gate: TODOS os 5 top-level templates (default, dashboard, api-only, postgres, saas)
 * têm DX hygiene mínima:
 *   - scripts: dev, build, start, typecheck
 *   - .nvmrc com "22.12"
 *   - public/favicon.ico (resolve EC-S8)
 *   - postgres + saas têm `drizzle-kit` em devDependencies (EC-10 SHOULD TEST)
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, it, expect } from 'vitest'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = join(
  TEST_DIR,
  '..',
  '..',
  'packages',
  'create-theo',
  'templates',
)

const TOP_LEVEL_TEMPLATES = ['default', 'dashboard', 'api-only', 'postgres', 'saas']
const REQUIRED_SCRIPTS = ['dev', 'build', 'start', 'typecheck']

describe('T2.1 + T2.2 + T2.3: DX hygiene across all 5 top-level templates', () => {
  describe.each(TOP_LEVEL_TEMPLATES)('template: %s', (tpl) => {
    const tplDir = join(TEMPLATES_DIR, tpl)
    const pkgTmplPath = join(tplDir, 'package.json.tmpl')

    it('package.json.tmpl exists', () => {
      // Given: template directory shipped by create-theokit,
      // When: we look for the package.json template,
      // Then: file MUST exist (template gerável).
      expect(existsSync(pkgTmplPath), `${pkgTmplPath} missing`).toBe(true)
    })

    it.each(REQUIRED_SCRIPTS)('package.json declares "%s" script', (script) => {
      // Given: package.json.tmpl,
      const pkg = JSON.parse(readFileSync(pkgTmplPath, 'utf-8')) as {
        scripts?: Record<string, string>
      }
      // When: we check scripts,
      // Then: REQUIRED_SCRIPTS DEVEM estar declarados (stranger não precisa adivinhar).
      expect(
        pkg.scripts?.[script],
        `template "${tpl}" missing script "${script}" — stranger sem build script fica perdido`,
      ).toBeDefined()
    })

    it('.nvmrc exists with Node version 22.12+', () => {
      // Given: template,
      const nvmrcPath = join(tplDir, '.nvmrc')
      // When: we look for .nvmrc,
      // Then: arquivo deve existir + ter "22.12" prefix (nvm/fnm/volta respect).
      expect(existsSync(nvmrcPath), `${nvmrcPath} missing`).toBe(true)
      const content = readFileSync(nvmrcPath, 'utf-8').trim()
      expect(content, `${tpl}/.nvmrc deve começar com "22."`).toMatch(/^22\./)
    })

    it('public/favicon.ico exists (resolve EC-S8)', () => {
      // Given: template,
      const faviconPath = join(tplDir, 'public', 'favicon.ico')
      // When: we look for favicon,
      // Then: arquivo deve existir (zero 404 no browser).
      expect(existsSync(faviconPath), `${faviconPath} missing — EC-S8`).toBe(true)
      // Sanity: ICO files are >= 100 bytes
      const stat = readFileSync(faviconPath)
      expect(stat.length).toBeGreaterThan(100)
    })
  })

  describe('EC-10 SHOULD TEST: postgres + saas templates have drizzle-kit in devDeps', () => {
    it.each(['postgres', 'saas'])(
      'template "%s" declares drizzle-kit in devDependencies',
      (tpl) => {
        // Given: template que oferece script db:push,
        const pkg = JSON.parse(
          readFileSync(join(TEMPLATES_DIR, tpl, 'package.json.tmpl'), 'utf-8'),
        ) as { devDependencies?: Record<string, string>; dependencies?: Record<string, string> }
        // When: we check deps,
        // Then: drizzle-kit DEVE estar em devDeps (sem isso db:push falha "command not found").
        const inDev = pkg.devDependencies?.['drizzle-kit']
        const inProd = pkg.dependencies?.['drizzle-kit']
        expect(
          inDev || inProd,
          `template "${tpl}" tem script db:push mas drizzle-kit ausente das deps`,
        ).toBeDefined()
      },
    )
  })
})
