/**
 * Regression — @usetheo/ui v0.6.3 renamed `Message` → `UIMessage` and
 * replaced `content: string` with `parts: UIMessagePart[]`. The old API
 * shape compiled silently (TS treated the missing export as `any` in the
 * import) but threw at runtime:
 *   Cannot read properties of undefined (reading 'map')
 * deep inside ChatMessage's `message.parts.map(...)`.
 *
 * This test pins the migration across every chat surface we ship:
 *   • examples/openrouter-demo (THE official demo)
 *   • examples/full-stack-agent (full showcase)
 *   • fixtures/template-default (Playwright + dogfood fixture)
 *   • packages/create-theo/templates/default (npx create-theokit output)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO = resolve(__dirname, '../..')

const SURFACES = [
  'examples/openrouter-demo/app/page.tsx',
  'examples/full-stack-agent/app/page.tsx',
  'fixtures/template-default/app/page.tsx',
  'packages/create-theo/templates/default/app/page.tsx',
]

describe('UIMessage migration regression (@usetheo/ui v0.6.3)', () => {
  for (const surface of SURFACES) {
    describe(surface, () => {
      const content = readFileSync(resolve(REPO, surface), 'utf8')

      it('imports UIMessage (not the removed Message alias)', () => {
        expect(content).toMatch(/\btype UIMessage\b/)
        // The removed alias must NOT come back as a top-level import.
        // (ChatMessage component name is allowed — it's a different symbol.)
        expect(content).not.toMatch(/\btype Message\b/)
      })

      it('constructs message objects with parts[] (not content: string)', () => {
        // The runtime crash signature: message.parts.map(...) on undefined.
        // Constructing `{ content: '...' }` would re-introduce the bug.
        expect(content).toMatch(/parts:\s*\[\s*\{\s*type:\s*['"]text['"]/)
        expect(content).not.toMatch(/const message:\s*Message\b/)
      })
    })
  }
})
