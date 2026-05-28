/**
 * Regression — chat surface root layouts:
 *   1. MUST NOT manually wrap `<TheoUIProvider>` — the framework
 *      auto-injects it via `theokit/vite-plugin` when @usetheo/ui is
 *      detected. Double providers reset persisted theme state.
 *   2. MUST render `<ThemeScript />` — emits an inline `<script>` that
 *      runs BEFORE hydration and sets `data-theme` / `data-mode` on
 *      `<html>` from localStorage. Without it, SSR renders the default
 *      theme and the client reads the persisted choice → hydration
 *      mismatch surfaces in ThemeSwitcher's sr-only label
 *      (e.g. "Aurora Terminal" vs "Violet Forge").
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO = resolve(__dirname, '../..')

const LAYOUTS = [
  'examples/openrouter-demo/app/layout.tsx',
  'examples/full-stack-agent/app/layout.tsx',
  'fixtures/template-default/app/layout.tsx',
  'packages/create-theo/templates/default/app/layout.tsx',
]

describe('Hydration safety — ThemeScript + no manual TheoUIProvider', () => {
  for (const layout of LAYOUTS) {
    describe(layout, () => {
      const content = readFileSync(resolve(REPO, layout), 'utf8')

      it('imports ThemeScript', () => {
        expect(content).toMatch(/\bThemeScript\b/)
      })

      it('renders <ThemeScript /> in the JSX tree', () => {
        expect(content).toMatch(/<ThemeScript\b/)
      })

      it('does NOT manually wrap <TheoUIProvider> (framework auto-injects)', () => {
        expect(content).not.toMatch(/<TheoUIProvider[\s>]/)
      })
    })
  }
})
