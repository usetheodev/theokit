import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * T2.3 — Anti-stack lint gate (FAANG-precise).
 *
 * The locked stack assumption (memory: project-stack-deps) says TheoKit's
 * default scaffold ALWAYS wires `@usetheo/sdk`, never a raw provider SDK
 * (OpenAI/Anthropic/etc).
 *
 * Precision: this gate checks for actual IMPORTS of the `openai` npm package
 * (or `@anthropic-ai/sdk`, etc), NOT casual mentions. The wire protocol IS
 * OpenAI Chat Completions (universal — implemented by OpenRouter, Groq,
 * Together, Mistral, etc); explaining that in docstrings is correct domain
 * documentation and must not trip the gate.
 *
 * Forbidden patterns (raw SDK imports):
 *   - `from 'openai'` / `from "openai"`
 *   - `require('openai')` / `require("openai")`
 *   - `import('openai')` / `import("openai")`
 *
 * Allowed patterns:
 *   - Comments mentioning "OpenAI Chat Completions" (the wire protocol)
 *   - Env var names like `OPENAI_API_KEY` (one of the resolution priorities)
 *   - String literals like `'openai'` as provider name (Strategy registry)
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

    it(`${relativePath} does NOT import the raw 'openai' npm package`, () => {
      const content = readFileSync(absPath, 'utf-8')
      // Match: from 'openai', from "openai", require('openai'), require("openai"),
      // import('openai'), import("openai"). Allows comments + env var names +
      // provider-name string literals (which are domain reality).
      const rawSdkImport =
        /(?:from|require\(|import\()\s*['"]openai['"]/i.test(content) ||
        /from\s+['"]@anthropic-ai\/sdk['"]/i.test(content)
      expect(
        rawSdkImport,
        `${relativePath} must not import raw provider SDKs (locked stack: @usetheo/sdk via createConversationHistory)`,
      ).toBe(false)
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
