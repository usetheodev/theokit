import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { execSync } from 'node:child_process'

/**
 * T9.1 — Template HTML validator
 *
 * Walks every `index.html` under templates/fixtures/examples and asserts the
 * entry-client script is wired. The Vite plugin auto-injects it now (T2.1),
 * but committing a script-less template is still a code smell — Vite users
 * who run `vite build` without the plugin would ship a dead HTML.
 *
 * This test is a tripwire: any new template/fixture must include the script
 * tag explicitly (the plugin will dedupe it, so duplicates are harmless).
 *
 * Excludes:
 *   - `**\/.theo/**`        build artifacts (generated client output)
 *   - `**\/node_modules/**` deps
 *   - `**\/dist/**`         build output
 */

const ENTRY_CLIENT_URL = '/@theo/entry-client'
const REPO_ROOT = resolve(__dirname, '../..')

function listIndexHtmlFiles(): string[] {
  // Use git ls-files to skip ignored output. Falls back to find if not in a repo.
  const stdout = execSync(
    `git ls-files '*/index.html' 'index.html' 2>/dev/null || find . -name index.html -type f -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.theo/*'`,
    { cwd: REPO_ROOT, encoding: 'utf-8' },
  )
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => {
      // Keep only files under templates/, fixtures/, examples/
      return (
        line.includes('packages/create-theo/templates/') ||
        line.startsWith('fixtures/') ||
        line.startsWith('examples/')
      )
    })
    .filter((line) => {
      // Exclude generated build output
      return !line.includes('.theo/') && !line.includes('node_modules/') && !line.includes('/dist/')
    })
    .map((line) => resolve(REPO_ROOT, line))
}

describe('T9.1 — every shipped index.html wires the entry-client script', () => {
  const files = listIndexHtmlFiles()

  it('Given the repo, When listing tracked index.html files, Then sanity-check the count', () => {
    // We have 20 source index.html files as of 2026-05-18. The audit found 4
    // missing the script tag (now fixed). If the count drops below 15 the
    // glob is probably broken; if it spikes the test should still pass per-file.
    expect(files.length).toBeGreaterThanOrEqual(15)
  })

  it.each(
    (() => {
      const list = listIndexHtmlFiles()
      // Each entry becomes its own test case with the relative path as label.
      return list.map((absPath) => ({
        label: relative(REPO_ROOT, absPath),
        absPath,
      }))
    })(),
  )(
    'Given $label, When read, Then it includes the entry-client script',
    ({ absPath }) => {
      const html = readFileSync(absPath, 'utf-8')
      expect(html).toContain(ENTRY_CLIENT_URL)
    },
  )

  it('Given any future index.html, When the template ships, Then a </body> tag exists for safe injection', () => {
    // The Vite plugin's injectEntryClient() falls back to appending at EOF
    // when there's no </body>, but emits a warning. Templates we ship should
    // not trigger that warning — they should have <body>…</body>.
    for (const absPath of files) {
      const html = readFileSync(absPath, 'utf-8')
      const hasBodyClose = /<\/body\s*>/i.test(html)
      expect(hasBodyClose, `${relative(REPO_ROOT, absPath)} is missing </body>`).toBe(true)
    }
  })
})
