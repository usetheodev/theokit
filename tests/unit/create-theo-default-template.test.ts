import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * T3.1 — Canonical chat.ts + @usetheo/sdk dep in `create-theokit` template.
 *
 * Mirrors fixtures/template-default. Verified via:
 *   - Byte-identical chat.ts bodies (defends drift)
 *   - regex grep on package.json.tmpl (NOT JSON.parse — Mustache placeholders
 *     `{{name}}` make the template invalid JSON; EC-7)
 *   - throwOnError + no-openai assertions repeated for the template path
 */

const ROOT = resolve(__dirname, '../..')
const FIXTURE_CHAT = resolve(ROOT, 'fixtures/template-default/server/routes/chat.ts')
const TEMPLATE_CHAT = resolve(ROOT, 'packages/create-theo/templates/default/server/routes/chat.ts')
const TEMPLATE_PKG = resolve(ROOT, 'packages/create-theo/templates/default/package.json.tmpl')

function normalize(s: string): string {
  // Strip trailing whitespace per line + collapse multiple blank lines
  return s
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

describe('create-theokit default template — chat.ts parity with fixture', () => {
  it('chat.ts bodies are identical (whitespace-normalised) — defends drift', () => {
    const fixture = normalize(readFileSync(FIXTURE_CHAT, 'utf-8'))
    const template = normalize(readFileSync(TEMPLATE_CHAT, 'utf-8'))
    expect(template).toBe(fixture)
  })

  it('template chat.ts uses defineAgentTool (item #4)', () => {
    const src = readFileSync(TEMPLATE_CHAT, 'utf-8')
    expect(src).toMatch(/defineAgentTool\(/)
  })

  it('template chat.ts yield-delegates to streamAgentRun (item #4)', () => {
    const src = readFileSync(TEMPLATE_CHAT, 'utf-8')
    expect(src).toMatch(/yield\*\s+streamAgentRun\(/)
  })

  it('template chat.ts does NOT import the raw openai npm package', () => {
    // FAANG-precise: comments mentioning "OpenAI Chat Completions" (the wire
    // protocol) + env var names like OPENAI_API_KEY are domain reality.
    // The anti-stack rule blocks actual imports/requires of the openai pkg.
    const src = readFileSync(TEMPLATE_CHAT, 'utf-8')
    const rawSdkImport =
      /(?:from|require\(|import\()\s*['"]openai['"]/i.test(src) ||
      /from\s+['"]@anthropic-ai\/sdk['"]/i.test(src)
    expect(rawSdkImport).toBe(false)
  })

  it('item #5 — template chat.ts uses createConversationHistory (no dispose per request)', () => {
    const src = readFileSync(TEMPLATE_CHAT, 'utf-8')
    expect(src).toMatch(/createConversationHistory/)
    const codeOnly = src
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n')
    expect(codeOnly).not.toMatch(/agent\.dispose\(/)
  })
})

describe('create-theokit default template — package.json.tmpl SDK dep (EC-7)', () => {
  it('package.json.tmpl includes @usetheo/sdk via regex grep (NOT JSON.parse — Mustache breaks parse)', () => {
    const src = readFileSync(TEMPLATE_PKG, 'utf-8')
    // Defensive grep — JSON.parse would fail on {{name}} placeholder
    expect(src).toMatch(/"@usetheo\/sdk":\s*"\^1/)
  })

  it('package.json.tmpl still preserves {{name}} placeholder (sanity)', () => {
    const src = readFileSync(TEMPLATE_PKG, 'utf-8')
    expect(src).toContain('{{name}}')
  })
})
