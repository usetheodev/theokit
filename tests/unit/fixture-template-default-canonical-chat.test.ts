import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * T3.1 — Canonical chat.ts (item #4) — defineAgentTool + streamAgentRun.
 *
 * The default scaffold's chat endpoint is the FIRST file a new developer
 * customises. After item #4 it MUST (a) import the SDK Agent, (b) declare
 * at least one tool via defineAgentTool, (c) use yield* streamAgentRun to
 * adapt the SDK Run lifecycle to AgentEvent SSE, (d) dispose the agent in
 * a finally block wrapped in try/catch (EC-2 — never mask the original error).
 */

const ROOT = resolve(__dirname, '../..')
const CHAT_PATH = resolve(ROOT, 'fixtures/template-default/server/routes/chat.ts')
const PKG_PATH = resolve(ROOT, 'fixtures/template-default/package.json')

function readChat(): string {
  return readFileSync(CHAT_PATH, 'utf-8')
}

describe('fixtures/template-default canonical chat.ts (item #5)', () => {
  it('uses @usetheo/sdk indirectly via createConversationHistory (no naked Agent import needed)', () => {
    const src = readChat()
    // item #5: agent acquisition is via createConversationHistory which
    // dynamically imports the SDK. No direct `import { Agent } from '@usetheo/sdk'`
    // line in the user-facing scaffold (kept clean).
    expect(src).toMatch(/createConversationHistory/)
    expect(src).not.toMatch(/import\s+\{\s*Agent\s*\}\s+from\s+['"]@usetheo\/sdk['"]/)
  })

  it('does NOT mention "openai" anywhere (anti-stack guard)', () => {
    const src = readChat().toLowerCase()
    expect(src).not.toContain('openai')
  })

  it('imports defineAgentTool from theokit/server', () => {
    const src = readChat()
    expect(src).toMatch(/defineAgentTool/)
    expect(src).toMatch(/from\s+['"]theokit\/server['"]/)
  })

  it('declares at least one tool via defineAgentTool', () => {
    const src = readChat()
    const matches = src.match(/defineAgentTool\(/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('yield-delegates to streamAgentRun', () => {
    const src = readChat()
    expect(src).toMatch(/yield\*\s+streamAgentRun\(/)
  })

  it('item #5 — does NOT call agent.dispose() (continuity requires keeping it alive)', () => {
    const src = readChat()
    // Strip line comments before checking — the file MAY mention dispose in
    // an explanatory `// Intentionally NO agent.dispose()` comment.
    const codeOnly = src
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n')
    expect(codeOnly).not.toMatch(/agent\.dispose\(/)
  })

  it('item #5 — imports createConversationHistory from theokit/server', () => {
    const src = readChat()
    expect(src).toMatch(/createConversationHistory/)
    expect(src).toMatch(/from\s+['"]theokit\/server['"]/)
  })

  it('item #5 — passes cookieHeaders to createConversationHistory', () => {
    const src = readChat()
    expect(src).toMatch(/createConversationHistory\([\s\S]*cookieHeaders/m)
  })

  it('supports OpenRouter OR Anthropic via env vars with actionable error on missing key', () => {
    const src = readChat()
    expect(src).toMatch(/OPENROUTER_API_KEY/)
    expect(src).toMatch(/ANTHROPIC_API_KEY/)
    expect(src).toMatch(/type:\s*['"]error['"]/)
  })

  it('EC-4 — guards against non-object body before destructuring', () => {
    const src = readChat()
    const hasTypeGuard = /typeof\s+body\s*===\s*['"]object['"]/.test(src)
    const hasArrayGuard = src.includes('Array.isArray(body)')
    const hasSafeDefault = /body\s*\?\?\s*\{\s*\}/.test(src) || /body\s*&&\s*typeof/.test(src)
    expect(hasTypeGuard || hasArrayGuard || hasSafeDefault).toBe(true)
  })

  it('exports POST from defineAgentEndpoint', () => {
    const src = readChat()
    expect(src).toMatch(/export\s+const\s+POST\s*=\s*defineAgentEndpoint/)
  })

  it('LOC budget for tool-calling + dual-provider chat.ts: <= 75 lines total', () => {
    const lineCount = readChat().split('\n').length
    expect(lineCount).toBeLessThanOrEqual(75)
  })
})

describe('fixtures/template-default package.json — @usetheo/sdk dep', () => {
  it('includes @usetheo/sdk in dependencies (workspace:* for the fixture)', () => {
    expect(existsSync(PKG_PATH)).toBe(true)
    const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf-8')) as {
      dependencies?: Record<string, string>
    }
    expect(pkg.dependencies?.['@usetheo/sdk']).toBe('workspace:*')
  })
})
