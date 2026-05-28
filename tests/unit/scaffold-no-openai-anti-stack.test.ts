import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * T2.3 — Anti-stack lint gate.
 *
 * The locked stack assumption (memory: project-stack-deps) says TheoKit's
 * default scaffold ALWAYS wires `@usetheo/sdk`, never a raw provider SDK
 * (OpenAI/Anthropic/etc). This test greps the two canonical chat.ts files
 * for any mention of `openai` (case-insensitive). If found, the test fails
 * and the offending file lists the locked stack as a non-option.
 *
 * Both files must reference `@usetheo/sdk Agent` — the SDK is the canonical
 * provider router; raw SDKs go in DEEP DIVE docs as alternatives, never in
 * the scaffold.
 */

const ROOT = resolve(__dirname, '../..')

const FILES_TO_SCAN = [
  'fixtures/template-default/server/routes/chat.ts',
  'packages/create-theo/templates/default/server/routes/chat.ts',
] as const

describe('scaffold anti-stack lint — no raw OpenAI in default chat.ts', () => {
  it('declares exactly 2 files to scan (defends against missing file in array)', () => {
    expect(FILES_TO_SCAN.length).toBe(2)
  })

  for (const relativePath of FILES_TO_SCAN) {
    const absPath = resolve(ROOT, relativePath)

    it(`${relativePath} exists`, () => {
      expect(existsSync(absPath)).toBe(true)
    })

    it(`${relativePath} does NOT contain 'openai' (case-insensitive)`, () => {
      const content = readFileSync(absPath, 'utf-8').toLowerCase()
      expect(
        content,
        `${relativePath} must not reference 'openai' (locked stack: @usetheo/sdk)`,
      ).not.toContain('openai')
    })

    it(`${relativePath} uses @usetheo/sdk (directly OR indirectly via createConversationHistory)`, () => {
      const content = readFileSync(absPath, 'utf-8')
      // Item #3 / #4 imported Agent directly. Item #5 routes via
      // createConversationHistory (which dynamically imports the SDK).
      // Either path proves the locked stack — accept both.
      const directImport = /import\s+\{\s*Agent\s*\}\s+from\s+['"]@usetheo\/sdk['"]/.test(content)
      const indirectViaTheokit = /createConversationHistory|defineAgentTool|streamAgentRun/.test(
        content,
      )
      expect(directImport || indirectViaTheokit).toBe(true)
    })
  }
})
